//handles sending messages to the api
import { Content, GenerateContentConfig, GenerateContentResponse, GoogleGenAI, Part, createPartFromUri } from "@google/genai"
import * as settingsService from "./Settings.service";
import * as personalityService from "./Personality.service";
import * as chatsService from "./Chats.service";
import * as helpers from "../utils/helpers";
import hljs from 'highlight.js';
import { db } from "./Db.service";
import { parseMarkdownToHtml } from "./Parser.service";
import { clearAttachmentPreviews } from "../components/static/AttachmentPreview.component";
import { Message } from "../models/Message";
import { messageElement } from "../components/message";

export async function send(msg: string) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    const selectedPersonalityId = parseInt(document.querySelector("input[name='personality']:checked")?.parentElement?.id.split("-")[1]!) || -1;
    const isInternetSearchEnabled = document.querySelector<HTMLButtonElement>("#btn-internet")?.classList.contains("btn-toggled");
    const attachments = document.querySelector<HTMLInputElement>("#attachments");
    const attachmentFiles = structuredClone(attachments?.files) || new DataTransfer().files;
    
    attachments!.value = ""; // Clear attachments input after sending
    attachments!.files = new DataTransfer().files; // Reset the FileList
    clearAttachmentPreviews(); // Clear attachment previews

    if (!selectedPersonality) {
        return;
    }
    if (settings.apiKey === "") {
        alert("Please enter an API key");
        return;
    }
    if (!msg) {
        return;
    }

    //handling user's message
    const message: Message = {
        role: "user",
        parts: [{ text: msg, attachments: attachmentFiles }],
    }

    //model setup
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const config: GenerateContentConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: parseInt(settings.temperature) / 100,
        systemInstruction: await settingsService.getSystemPrompt(),
        safetySettings: settings.safetySettings,
        responseMimeType: "text/plain",
        tools: isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined
    };

    //initlialize chat history
    const history: Content[] = [
        {
            role: "user",
            parts: [{ text: `Personality Name: ${selectedPersonality.name}, Personality Description: ${selectedPersonality.description}, Personality Prompt: ${selectedPersonality.prompt}. Your level of aggression is ${selectedPersonality.aggressiveness} out of 3. Your sensuality is ${selectedPersonality.sensuality} out of 3.` }]
        },
        {
            role: "model",
            parts: [{ text: "Very well, from now on, I will be acting as the personality you have chosen" }]
        }
    ];

    if (selectedPersonality.toneExamples && selectedPersonality.toneExamples.length > 0) {
        history.push(
            ...selectedPersonality.toneExamples.map((toneExample) => {
                return { role: "model", parts: [{ text: toneExample }] }
            })
        );
    }


    //new chat creation
    if (!await chatsService.getCurrentChat(db)) {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
        });
        const title = response.text || "";
        const id = await chatsService.addChat(title);
        (document.querySelector(`#chat${id}`) as HTMLElement)?.click();
    }




    // Add chat history
    const currentChat = await chatsService.getCurrentChat(db);
    if (!currentChat) {
        console.error("No current chat found");
        return;
    }
    history.push(
        ...await Promise.all(currentChat.content.map(async (dbMessage: Message) => {
            const genAiMessage: Content = {
                role: dbMessage.role,
                parts: (await Promise.all(dbMessage.parts.map(async (part) => {
                    const text = part.text || "";
                    const attachments = part.attachments || [];
                    const parts: Part[] = [{ text: text }];
                    // if (attachments && attachments.length > 0) {
                    //     for (const attachment of attachments) {
                    //         parts.push({
                    //             inlineData: {
                    //                 //attachment is of File, we need to convert it to base64
                    //                 data: await helpers.fileToBase64(attachment),
                    //                 mimeType: attachment.type || "application/octet-stream",
                    //             }
                    //         });
                    //     }
                    // }
                    return parts;
                }))).flat()
            }
            return genAiMessage;
        }))
    );

    // Create chat session
    const chat = ai.chats.create({
        model: settings.model,
        history: history,
        config: config,
    });

    const uploadedFiles = await Promise.all(Array.from(attachmentFiles || []).map(async (file) => {
        return await ai.files.upload({
            file: file,
        });
    }));

    //insert user's message
    const userMessageElement = await insertMessageV2(message);
    helpers.messageContainerScrollToBottom();

    let stream: AsyncGenerator<GenerateContentResponse>;
    stream = await chat.sendMessageStream({
        message: [
            {
                text: msg,
            },
            //for each file in attachments.files, we add it to the message
            ...uploadedFiles.map((file) => {
                return createPartFromUri(file.uri!, file.mimeType!);
            }),
        ],
    });

    //insert model message placeholder
    const responseElement = await insertMessageV2({
        role: "model",
        parts: [{ text: "" }],
        personalityid: selectedPersonalityId,
        groundingContent: "",
    });

    const messageContent = responseElement.querySelector(".message-text")!;
    const groundingRendered = responseElement.querySelector(".message-grounding-rendered-content")!;
    //process the stream
    let rawText = "";
    let groundingRenderedContentFromStream = "";
    // In the new API, we receive an iterable stream
    for await (const chunk of stream) {
        // The chunks will have text property that contains content
        if (chunk && chunk.text) {
            rawText += chunk.text;
            messageContent.innerHTML = await parseMarkdownToHtml(rawText);
            helpers.messageContainerScrollToBottom();
        }
        if (chunk.candidates && chunk.candidates[0].groundingMetadata && chunk.candidates[0].groundingMetadata.searchEntryPoint?.renderedContent) {
            groundingRenderedContentFromStream = chunk.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
            // Create a shadow DOM for the grounding rendered content
            const shadow = groundingRendered.attachShadow({ mode: "open" });
            shadow.innerHTML = groundingRenderedContentFromStream;
            shadow.querySelector<HTMLDivElement>(".carousel")!.style.scrollbarWidth = "unset";
        }
    }
    hljs.highlightAll();
    helpers.messageContainerScrollToBottom();
    //save chat history and settings
    currentChat.content.push({ role: "user", parts: [{ text: msg, attachments: attachmentFiles }] });
    currentChat.content.push({ role: "model", personalityid: selectedPersonalityId, parts: [{ text: rawText }], groundingContent: groundingRenderedContentFromStream || "" });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
    return userMessageElement;
}

export async function regenerate(responseElement: HTMLElement) {
    //basically, we remove every message after the response we wish to regenerate, then send the message again.
    const elementIndex = [...responseElement.parentElement?.children || []].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);
    const message = chat?.content[elementIndex - 1];
    if (!chat || !message) {
        console.error("No chat or message found");
        return;
    }
    chat.content = chat.content.slice(0, elementIndex - 1);
    await db.chats.put(chat);
    await chatsService.loadChat(chat.id, db);

    //we also should reattach the attachments to the message box
    const attachments = message.parts[0].attachments || [];
    const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
    if (attachmentsInput) {
        const dataTransfer = new DataTransfer();
        for (const attachment of attachments) {
            dataTransfer.items.add(attachment);
        }
        attachmentsInput.files = dataTransfer.files;
    }
    console.log("about to send!", message.parts[0].text || "");
    await send(message.parts[0].text || "");
}

export async function insertMessageV2(message: Message) {
    const messageElm = await messageElement(message);
    const messageContainer = document.querySelector<HTMLDivElement>(".message-container");
    if (messageContainer) {
        messageContainer.append(messageElm);
    }
    helpers.messageContainerScrollToBottom();
    return messageElm;
}
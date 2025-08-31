//handles sending messages to the api
import { Content, GenerateContentConfig, GenerateContentResponse, GoogleGenAI, Part, PersonGeneration, SafetyFilterLevel, createPartFromUri } from "@google/genai"
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
import { isImageModeActive } from "../components/static/ImageButton.component";

export async function send(msg: string) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    const selectedPersonalityId = (() => {
        const checked = document.querySelector<HTMLInputElement>("input[name='personality']:checked");
        const parentId = checked?.parentElement?.id ?? "";
        const parts = parentId.split("-");
        const idPart = parts.length > 1 ? parts[1] : undefined;
        const parsed = idPart ? parseInt(idPart, 10) : NaN;
        return Number.isFinite(parsed) ? parsed : -1;
    })();
    const isInternetSearchEnabled = document.querySelector<HTMLButtonElement>("#btn-internet")?.classList.contains("btn-toggled");
    const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
    if (!attachmentsInput) {
        console.error("Missing #attachments input in the DOM");
        throw new Error("Missing DOM element");
    }
    //structuredClone is unreliable for FileList
    const attachmentFiles: FileList = (() => {
        const dt = new DataTransfer();
        for (const f of Array.from(attachmentsInput.files || [])) {
            dt.items.add(f);
        }
        return dt.files;
    })();

    attachmentsInput.value = ""; // Clear attachments input after sending
    attachmentsInput.files = new DataTransfer().files; // Reset the FileList
    clearAttachmentPreviews(); // Clear attachment previews

    const imageGenerationMode = isImageModeActive();

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

    if (imageGenerationMode) {
        const response = await ai.models.generateImages({
            model: 'models/imagen-4.0-ultra-generate-001',
            prompt: msg,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                personGeneration: PersonGeneration.ALLOW_ALL,
                aspectRatio: '1:1',
                safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE,
            },
        });
        if (!response.generatedImages) {
            alert("Image generation failed");
            return;
        }
        const b64 = response.generatedImages[0].image?.imageBytes;
        const imageElement = document.createElement("img");
        imageElement.src = `data:image/jpeg;base64,${b64}`;
        document.body.appendChild(imageElement);
        return;
    }





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

    //insert user's message element
    const message: Message = {
        role: "user",
        parts: [{ text: msg, attachments: attachmentFiles }],
    }
    const userMessageElement = await insertMessageV2(message);
    helpers.messageContainerScrollToBottom();

    //user message for model
    const messagePayload = {
        message: [
            {
                text: msg,
            },
            //for each file in attachments.files, we add it to the message
            ...uploadedFiles.map((file) => {
                return createPartFromUri(file.uri!, file.mimeType!);
            }),
        ],
    };

    //insert model message placeholder
    const responseElement = await insertMessageV2({
        role: "model",
        parts: [{ text: "" }],
        personalityid: selectedPersonalityId,
        groundingContent: "",
    });
    const messageContent = responseElement.querySelector(".message-text")!;
    const groundingRendered = responseElement.querySelector(".message-grounding-rendered-content")!;
    let rawText = "";
    let groundingContent = "";
    if (settings.streamResponses) {
        let stream: AsyncGenerator<GenerateContentResponse>;
        stream = await chat.sendMessageStream(messagePayload);
        // In the new API, we receive an iterable stream
        for await (const chunk of stream) {
            // The chunks will have text property that contains content
            if (chunk && chunk.text) {
                rawText += chunk.text;
                messageContent.innerHTML = await parseMarkdownToHtml(rawText);
                helpers.messageContainerScrollToBottom();
            }
            if (chunk.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) {
                groundingContent = chunk.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                // Ensure a single shadow DOM root and update content
                const shadow = groundingRendered.shadowRoot ?? groundingRendered.attachShadow({ mode: "open" });
                shadow.innerHTML = groundingContent;
                const carousel = shadow.querySelector<HTMLDivElement>(".carousel");
                if (carousel) carousel.style.scrollbarWidth = "unset";
            }
        }
        hljs.highlightAll();
    } else {
        const response = await chat.sendMessage(messagePayload);
        if (response && response.text) {
            rawText = response.text;
        }
        if (response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) {
            groundingContent = response.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
            const shadow = groundingRendered.shadowRoot ?? groundingRendered.attachShadow({ mode: "open" });
            shadow.innerHTML = groundingContent;
            const carousel = shadow.querySelector<HTMLDivElement>(".carousel");
            if (carousel) carousel.style.scrollbarWidth = "unset";
        }
        messageContent.innerHTML = await parseMarkdownToHtml(rawText);
        hljs.highlightAll();
    }

    helpers.messageContainerScrollToBottom();
    //save chat history and settings
    currentChat.content.push({ role: "user", parts: [{ text: msg, attachments: attachmentFiles }] });
    currentChat.content.push({ role: "model", personalityid: selectedPersonalityId, parts: [{ text: rawText }], groundingContent: groundingContent || "" });
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
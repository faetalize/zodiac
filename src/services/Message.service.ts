//handles sending messages to the api
import { Content, GenerateContentConfig, GenerateContentResponse, GenerateImagesResponse, GoogleGenAI, Part, PersonGeneration, SafetyFilterLevel, createPartFromUri } from "@google/genai"
import * as settingsService from "./Settings.service";
import * as personalityService from "./Personality.service";
import * as chatsService from "./Chats.service";
import * as helpers from "../utils/helpers";
import hljs from 'highlight.js';
import { db } from "./Db.service";
import { parseMarkdownToHtml } from "./Parser.service";
import { clearAttachmentPreviews } from "../components/static/AttachmentPreview.component";
import { Message } from "../models/Message";
import { messageElement } from "../components/dynamic/message";
import { isImageModeActive } from "../components/static/ImageButton.component";
import { Chat, DbChat } from "../models/Chat";
import { getSubscriptionTier, getUserSubscription, type SubscriptionTier, SUPABASE_URL, getAuthHeaders } from "./Supabase.service";

export async function send(msg: string) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    const selectedPersonalityId = getSelectedPersonalityId();
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

    if (!selectedPersonality) {
        return;
    }
    // Determine subscription tier to decide backend route
    const isPremiumEndpointPreferred = await getSubscriptionTier(await getUserSubscription()) === 'pro' || await getSubscriptionTier(await getUserSubscription()) === 'max';

    if (!isPremiumEndpointPreferred && settings.apiKey === "") {
        alert("Please enter an API key");
        return;
    }
    if (!msg) {
        return;
    }

    //model setup (local SDK only for Free tier)
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const config: GenerateContentConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: parseInt(settings.temperature) / 100,
        systemInstruction: await settingsService.getSystemPrompt(),
        safetySettings: settings.safetySettings,
        responseMimeType: "text/plain",
        tools: isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: settings.enableThinking ? {
            includeThoughts: true,
            thinkingBudget: settings.thinkingBudget
        } : undefined
    };

    const currentChat = await createChatIfAbsent(ai, msg);
    if (!currentChat) {
        console.error("No current chat found");
        return;
    }

    //insert user's message element
    const userMessage: Message = { role: "user", parts: [{ text: msg, attachments: attachmentFiles }] };
    const userMessageElement = await insertMessageV2(userMessage);
    helpers.messageContainerScrollToBottom();

    //insert model message placeholder
    const responseElement = await insertMessageV2(createModelPlaceholderMessage(selectedPersonalityId, ""));
    const messageContent = responseElement.querySelector(".message-text .message-text-content")!;
    let thinkingWrapper = responseElement.querySelector<HTMLElement>(".message-thinking");
    let thinkingContentElm = responseElement.querySelector<HTMLElement>(".thinking-content");

    function ensureThinkingElements(): void {
        if (!thinkingWrapper) {
            // Insert just after header (before .message-text)
            const header = responseElement.querySelector('.message-header');
            thinkingWrapper = document.createElement('div');
            thinkingWrapper.className = 'message-thinking';
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'thinking-toggle btn-textual';
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.textContent = 'Show reasoning';
            thinkingContentElm = document.createElement('div');
            thinkingContentElm.className = 'thinking-content';
            thinkingContentElm.setAttribute('hidden', '');
            thinkingWrapper.append(toggleBtn, thinkingContentElm);
            header?.insertAdjacentElement('afterend', thinkingWrapper);
            // toggle behavior
            toggleBtn.addEventListener('click', () => {
                const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    toggleBtn.setAttribute('aria-expanded', 'false');
                    toggleBtn.textContent = 'Show reasoning';
                    thinkingContentElm?.setAttribute('hidden', '');
                } else {
                    toggleBtn.setAttribute('aria-expanded', 'true');
                    toggleBtn.textContent = 'Hide reasoning';
                    thinkingContentElm?.removeAttribute('hidden');
                }
            });
        }
    }
    const groundingRendered = responseElement.querySelector(".message-grounding-rendered-content")!;

    if (isImageModeActive()) {
        const payload = {
            model: settings.imageModel || "models/imagen-4.0-ultra-generate-001",
            prompt: msg,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                personGeneration: PersonGeneration.ALLOW_ADULT,
                aspectRatio: '1:1',
                safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE,
            },
        };
        let response;
        let b64: string;
        let returnedMimeType: string;
        if (isPremiumEndpointPreferred) {
            const endpoint = `${SUPABASE_URL}/functions/v1/handle-max-request`;
            //basically we make an image gen request but to the edge function instead, with the same params as the non-edge
            response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    ...(await getAuthHeaders()),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload)
            });
            //case: fail
            if (!response.ok) {
                const error = (await response.json()).error;
                alert("Image generation failed: " + error);
                responseElement.remove();
                return userMessageElement;
            }
            // the edge function returns an image directly (binary body)
            const arrayBuf = await response.arrayBuffer();
            b64 = await helpers.arrayBufferToBase64(arrayBuf);
            // prefer server-provided content type
            returnedMimeType = response.headers.get('Content-Type') || "image/png";
        }
        else {
            response = await ai.models.generateImages(payload);
            if (!response.generatedImages || !response.generatedImages[0]?.image?.imageBytes) {
                const extraMessage = (response?.generatedImages?.[0]?.raiFilteredReason);
                alert("Image generation failed" + (extraMessage ? `: ${extraMessage}` : ""));
                responseElement.remove();
                return userMessageElement;
            }
            b64 = response.generatedImages[0].image.imageBytes
            returnedMimeType = response.generatedImages[0].image.mimeType || "image/png";
        }

        // Update the placeholder element with the image via re-render
        const modelMessage: Message = {
            role: "model",
            parts: [{ text: "" }],
            personalityid: selectedPersonalityId,
            generatedImages: [{ mimeType: returnedMimeType, base64: b64 }],
        };

        const newElm = await messageElement(modelMessage);
        responseElement.replaceWith(newElm);
        helpers.messageContainerScrollToBottom();

        await persistUserAndModel(userMessage, modelMessage);
        return userMessageElement;
    }

    const history: Content[] = await buildHistory(selectedPersonality, currentChat);
    let thinking = "";
    let rawText = "";
    let groundingContent = "";

    // If Pro/Max, call Supabase Edge Function; else use SDK directly
    if (isPremiumEndpointPreferred) {
        try {
            const payloadSettings = {
                model: settings.model,
                streamResponses: settings.streamResponses,
                ...config,
            }
            const hasFiles = (attachmentFiles?.length ?? 0) > 0;
            const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;
            // Build request
            let res: Response;
            if (hasFiles) {
                const form = new FormData();
                form.append('message', msg);
                form.append('settings', JSON.stringify(payloadSettings));
                form.append('history', JSON.stringify(history));
                for (const f of Array.from(attachmentFiles || [])) {
                    form.append('files', f);
                }
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers: await getAuthHeaders(),
                    body: form,
                });
            } else {
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        ...(await getAuthHeaders()),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: msg,
                        settings: payloadSettings,
                        history
                    })
                });
            }

            if (!res.ok) throw new Error(`Edge function error: ${res.status}`);

            if (settings.streamResponses) {
                // SSE parse
                const reader = res.body!.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let idx;
                    while ((idx = buffer.indexOf('\n\n')) !== -1) {
                        const eventBlock = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 2);
                        if (!eventBlock) continue;
                        if (eventBlock.startsWith(':')) continue;
                        const lines = eventBlock.split('\n');
                        let eventName = 'message';
                        let data = '';
                        for (const line of lines) {
                            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
                            else if (line.startsWith('data: ')) data += line.slice(6);
                        }
                        if (eventName === 'error') throw new Error(data);
                        if (eventName === 'done') break;
                        if (data) {
                            const payload = JSON.parse(data);
                            if (payload) {
                                for (const part of payload.candidates?.[0]?.content?.parts || []) { // thinking block
                                    if (part.thought && part.text) {
                                        thinking += part.text;
                                        ensureThinkingElements();
                                        if (thinkingContentElm) thinkingContentElm.textContent = thinking;
                                    }
                                    else if (part.text) { // direct text
                                        rawText += part.text;
                                        responseElement.querySelector('.message-text')?.classList.remove('is-loading');
                                        messageContent.innerHTML = await parseMarkdownToHtml(rawText);
                                    }
                                }
                                if (payload.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) { // grounding block
                                    groundingContent = payload.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                                    const shadow = groundingRendered.shadowRoot ?? groundingRendered.attachShadow({ mode: "open" });
                                    shadow.innerHTML = groundingContent;
                                    const carousel = shadow.querySelector<HTMLDivElement>(".carousel");
                                    if (carousel) carousel.style.scrollbarWidth = "unset";
                                }

                                helpers.messageContainerScrollToBottom();
                            }
                        }
                    }
                }
            } else {
                const json = await res.json();
                if (json) {
                    for (const part of json.candidates?.[0]?.content?.parts || []) { // thinking block
                        if (part.thought && part.text) {
                            thinking += part.text;
                        }
                    }
                    if (thinking) { ensureThinkingElements(); if (thinkingContentElm) thinkingContentElm.textContent = thinking; }
                    if (json.text) { // direct text
                        rawText = json.text;
                    }
                    if (json.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) { // grounding block
                        groundingContent = json.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                        const shadow = groundingRendered.shadowRoot ?? groundingRendered.attachShadow({ mode: "open" });
                        shadow.innerHTML = groundingContent;
                        const carousel = shadow.querySelector<HTMLDivElement>(".carousel");
                        if (carousel) carousel.style.scrollbarWidth = "unset";
                    }
                }
                responseElement.querySelector('.message-text')?.classList.remove('is-loading');
                messageContent.innerHTML = await parseMarkdownToHtml(rawText);

            }
        } catch (err) {
            console.error(err);
            try { responseElement.remove(); } catch { }
            return userMessageElement;
        }

    } else { //free user, use local sdk
        //upload attachments and get their URIs
        const uploadedFiles = await Promise.all(Array.from(attachmentFiles || []).map(async (file) => {
            return await ai.files.upload({
                file: file,
            });
        }));

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
        try {
            if (settings.streamResponses) {
                let stream: AsyncGenerator<GenerateContentResponse>;
                const chat = ai.chats.create({ model: settings.model, history, config });
                stream = await chat.sendMessageStream(messagePayload);
                for await (const chunk of stream) {
                    if (chunk) {
                        for (const part of chunk.candidates?.[0]?.content?.parts || []) { // thinking block
                            if (part.thought && part.text) { thinking += part.text; ensureThinkingElements(); if (thinkingContentElm) thinkingContentElm.textContent = thinking; }
                        }
                        if (chunk.text) { // direct text
                            rawText += chunk.text;
                            responseElement.querySelector(".message-text")?.classList.remove("is-loading");
                            messageContent.innerHTML = await parseMarkdownToHtml(rawText);
                        }
                        if (chunk.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) { // grounding block
                            groundingContent = chunk.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                            const shadow = groundingRendered.shadowRoot ?? groundingRendered.attachShadow({ mode: "open" });
                            shadow.innerHTML = groundingContent;
                            const carousel = shadow.querySelector<HTMLDivElement>(".carousel");
                            if (carousel) carousel.style.scrollbarWidth = "unset";
                        }

                        helpers.messageContainerScrollToBottom();
                    }
                }
            } else {
                const chat = ai.chats.create({ model: settings.model, history, config });
                const response = await chat.sendMessage(messagePayload);
                if (response) {
                    for (const part of response.candidates?.[0]?.content?.parts || []) { // thinking block
                        if (part.thought && part.text) {
                            thinking += part.text;
                        }
                    }
                    if (thinking) { ensureThinkingElements(); if (thinkingContentElm) thinkingContentElm.textContent = thinking; }
                    if (response.text) { // direct text
                        rawText = response.text;
                        responseElement.querySelector(".message-text")?.classList.remove("is-loading");
                        messageContent.innerHTML = await parseMarkdownToHtml(rawText);
                    }
                    if (response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) { // grounding block
                        groundingContent = response.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                        const shadow = groundingRendered.shadowRoot ?? groundingRendered.attachShadow({ mode: "open" });
                        shadow.innerHTML = groundingContent;
                        const carousel = shadow.querySelector<HTMLDivElement>(".carousel");
                        if (carousel) carousel.style.scrollbarWidth = "unset";
                    }
                }
            }
        } catch (err) {
            console.error(err);
            // Clean up placeholder if something goes wrong to avoid stuck spinner
            try { responseElement.remove(); } catch { /* noop */ }
            return userMessageElement;
        }
    }

    //finalize
    hljs.highlightAll();
    helpers.messageContainerScrollToBottom();

    //save chat history and settings (persist after success only)
    await persistUserAndModel(
        userMessage,
        { role: "model", personalityid: selectedPersonalityId, parts: [{ text: rawText }], groundingContent: groundingContent || "", thinking: thinking || undefined }
    );
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

// -------------------- Internal helpers --------------------
function getSelectedPersonalityId(): string {
    const checked = document.querySelector<HTMLInputElement>("input[name='personality']:checked");
    const parentId = checked?.parentElement?.id ?? "";
    return parentId.startsWith("personality-") ? parentId.slice("personality-".length) : "-1";
}

async function createChatIfAbsent(ai: GoogleGenAI, msg: string): Promise<DbChat> {
    const currentChat = await chatsService.getCurrentChat(db);
    if (currentChat) { return currentChat; }
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
    });
    const title = response.text || "";
    const id = await chatsService.addChat(title);
    const chat = await chatsService.loadChat(id, db);
    const chatInput = document.querySelector<HTMLInputElement>(`#chat${id}`);
    if (chatInput) chatInput.checked = true;
    return chat!;
}


function createModelPlaceholderMessage(personalityid: string, groundingContent?: string): Message {
    const m: Message = { role: "model", parts: [{ text: "" }], personalityid };
    if (groundingContent !== undefined) (m as any).groundingContent = groundingContent;
    return m;
}

async function persistUserAndModel(user: Message, model: Message): Promise<void> {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) return;
    chat.content.push(user);
    chat.content.push(model);
    await db.chats.put(chat);
}

async function buildHistory(selectedPersonality: Awaited<ReturnType<typeof personalityService.getSelected>>, currentChat: Chat): Promise<Content[]> {
    const history: Content[] = [
        {
            role: "user",
            parts: [{ text: `Personality Name: ${selectedPersonality!.name}, Personality Description: ${selectedPersonality!.description}, Personality Prompt: ${selectedPersonality!.prompt}. Your level of aggression is ${selectedPersonality!.aggressiveness} out of 3. Your sensuality is ${selectedPersonality!.sensuality} out of 3.` }]
        },
        { role: "model", parts: [{ text: "Very well, from now on, I will be acting as the personality you have chosen" }] }
    ];
    if (selectedPersonality?.toneExamples && selectedPersonality.toneExamples.length > 0) {
        history.push(...selectedPersonality.toneExamples.map((toneExample) => ({ role: "model", parts: [{ text: toneExample }] })));
    }
    const past = await Promise.all(currentChat.content.map(async (dbMessage: Message) => {
        const genAiMessage: Content = {
            role: dbMessage.role,
            parts: ((await Promise.all(dbMessage.parts.map(async (part) => {
                const text = part.text || "";
                const attachments = part.attachments || [];
                const parts: Part[] = [{ text }];
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
            })))).flat()
        };
        return genAiMessage;
    }));
    history.push(...past);
    return history;
}
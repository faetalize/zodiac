/**
 * Message service - handles all message sending, regeneration, and DOM operations.
 *
 * Public API:
 * - send(msg): Send a message in normal chat mode
 * - sendRpgTurn(msg?): Send user turn in RPG group chat mode
 * - skipRpgTurn(): Skip user turn in RPG group chat mode
 * - regenerate(modelMessageIndex): Regenerate a response
 * - abortGeneration(): Stop current generation
 * - getIsGenerating(): Check if generation is in progress
 * - insertMessage(message, index): Insert a message into the DOM
 * - ensureRoundBlockUi(block, roundIndex): Ensure round block UI elements
 * - createPersonalityMarkerMessage(personalityId): Create a personality marker
 */

import { Content, GenerateContentConfig, GoogleGenAI, createPartFromUri, BlockedReason, FinishReason } from "@google/genai";
import hljs from "highlight.js";

import type { Message, GeneratedImage } from "../types/Message";
import type { Chat, DbChat } from "../types/Chat";
import type { DbPersonality } from "../types/Personality";
import { ChatModel } from "../types/Models";
import { PremiumEndpoint } from "../types/PremiumEndpoint";

import * as settingsService from "./Settings.service";
import * as personalityService from "./Personality.service";
import * as chatsService from "./Chats.service";
import * as supabaseService from "./Supabase.service";
import * as helpers from "../utils/helpers";
import { db } from "./Db.service";
import { warn, danger } from "./Toast.service";
import { parseMarkdownToHtml } from "./Parser.service";
import { SUPABASE_URL, getAuthHeaders } from "./Supabase.service";
import { processGeminiLocalSdkResponse, processGeminiLocalSdkStream } from "./GeminiResponseProcessor.service";
import { processPremiumEndpointSse } from "./PremiumEndpointResponseProcessor.service";

import { messageElement } from "../components/dynamic/message";
import { isImageModeActive } from "../components/static/ImageButton.component";
import { isImageEditingActive } from "../components/static/ImageEditButton.component";
import { clearAttachmentPreviews } from "../components/static/AttachmentPreview.component";
import { getCurrentHistoryImageDataUri } from "../components/static/ChatInput.component";
import { shouldPreferPremiumEndpoint } from "../components/static/ApiKeyInput.component";
import { getSelectedEditingModel } from "../components/static/ImageEditModelSelector.component";

import { isAbortError, throwAbortError } from "../utils/abort";
import { dispatchAppEvent } from "../events";
import { MODEL_IMAGE_LIMITS } from "../constants/ImageModels";
import {
    PERSONALITY_MARKER_PREFIX,
    NARRATOR_PERSONALITY_ID,
    createPersonalityMarkerMessage,
    isPersonalityMarker,
    getPersonalityMarkerInfo,
    isLegacyPersonalityIntro,
    pruneTrailingPersonalityMarkers,
    buildPersonalityInstructionMessages,
} from "../utils/personalityMarkers";
import {
    findLastGeneratedImageIndex,
    findLastAttachmentIndex,
    processAttachmentsToParts,
    processGeneratedImagesToParts,
    renderGroundingToShadowDom,
    ensureThinkingUi,
    createThinkingUiElements,
    createErrorMessage,
    UNRESTRICTED_SAFETY_SETTINGS,
    extractTextAndThinkingFromResponse,
} from "../utils/chatHistoryBuilder";

import { sendGroupChatRpg, type RpgInputArgs } from "./RpgGroupChat";
import { sendGroupChatDynamic, type DynamicInputArgs } from "./DynamicGroupChat";

// ================================================================================
// CONSTANTS
// ================================================================================

export const USER_SKIP_TURN_MARKER_TEXT = "__user_skip_turn__";
export const SKIP_THOUGHT_SIGNATURE_VALIDATOR = "skip_thought_signature_validator";

export { NARRATOR_PERSONALITY_ID, createPersonalityMarkerMessage };

// ================================================================================
// GENERATION STATE
// ================================================================================

let currentAbortController: AbortController | null = null;
let isGenerating = false;
let sendInFlight = false;

export function abortGeneration(): void {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
}

export function getIsGenerating(): boolean {
    return isGenerating;
}

function getAbortSignal(): AbortSignal | undefined {
    return currentAbortController?.signal;
}

function isSendInFlight(): boolean {
    return sendInFlight;
}

function setSendInFlight(value: boolean): void {
    sendInFlight = value;
}

function startGeneration(): AbortController {
    currentAbortController = new AbortController();
    isGenerating = true;
    dispatchAppEvent('generation-state-changed', { isGenerating: true });
    return currentAbortController;
}

function endGeneration(): void {
    isGenerating = false;
    currentAbortController = null;
    dispatchAppEvent('generation-state-changed', { isGenerating: false });
}

// ================================================================================
// MESSAGE DOM
// ================================================================================

export async function insertMessage(message: Message, index: number): Promise<HTMLElement> {
    const messageElm = await messageElement(message, index);
    const messageContainer = document.querySelector<HTMLDivElement>(".message-container");

    if (messageContainer) {
        const currentRoundIndex = message.roundIndex;

        if (typeof currentRoundIndex === 'number') {
            let targetBlock = messageContainer.querySelector<HTMLDivElement>(
                `.round-block[data-round-index="${currentRoundIndex}"]`
            );

            if (targetBlock) {
                ensureRoundBlockUi(targetBlock, currentRoundIndex);
                targetBlock.append(messageElm);
            } else {
                const block = document.createElement("div");
                block.classList.add("round-block");
                block.dataset.roundIndex = String(currentRoundIndex);
                ensureRoundBlockUi(block, currentRoundIndex);
                block.append(messageElm);
                messageContainer.append(block);
            }
        } else {
            messageContainer.append(messageElm);
        }
    }

    return messageElm;
}

export function ensureRoundBlockUi(block: HTMLDivElement, roundIndex: number): void {
    if (block.querySelector('.round-header')) {
        return;
    }

    const header = document.createElement('div');
    header.className = 'round-header';

    const badge = document.createElement('div');
    badge.className = 'round-badge';
    badge.textContent = `Round ${roundIndex}`;

    const actions = document.createElement('div');
    actions.className = 'round-actions';

    const regenBtn = document.createElement('button');
    regenBtn.className = 'btn-textual material-symbols-outlined round-action-btn';
    regenBtn.type = 'button';
    regenBtn.textContent = 'refresh';
    regenBtn.title = 'Regenerate from this round';
    regenBtn.setAttribute('aria-label', 'Regenerate from this round');
    regenBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await helpers.confirmDialogDanger(
            `Regenerate from Round ${roundIndex}? This will delete Round ${roundIndex} and any later rounds, then re-run the AI from this point.`
        );
        if (!ok) return;
        await regenerateRound(roundIndex);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-textual material-symbols-outlined round-action-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'delete';
    deleteBtn.title = 'Delete this round';
    deleteBtn.setAttribute('aria-label', 'Delete this round');
    deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await helpers.confirmDialogDanger(
            `Delete Round ${roundIndex}? This will permanently remove all messages in this round.`
        );
        if (!ok) return;
        await deleteRound(roundIndex);
    });

    actions.append(regenBtn, deleteBtn);
    header.append(badge, actions);
    block.prepend(header);
}

function ensureThinkingUiOnMessageElement(msgElement: HTMLElement): HTMLDivElement | null {
    return ensureThinkingUi(msgElement);
}

// ================================================================================
// HELPERS
// ================================================================================

function getSelectedPersonalityId(): string {
    const checked = document.querySelector<HTMLInputElement>("input[name='personality']:checked");
    const parentId = checked?.parentElement?.id ?? "";
    return parentId.startsWith("personality-") ? parentId.slice("personality-".length) : "-1";
}

function createModelPlaceholderMessage(personalityid: string, groundingContent?: string, roundIndex?: number): Message {
    const m: Message = { role: "model", parts: [{ text: "" }], personalityid };
    if (groundingContent !== undefined) (m as any).groundingContent = groundingContent;
    if (roundIndex !== undefined) m.roundIndex = roundIndex;
    return m;
}

async function persistUserAndModel(user: Message, model: Message): Promise<void> {
    await persistMessages([user, model]);
}

async function persistMessages(messages: Message[]): Promise<void> {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) return;
    chat.content.push(...messages);
    chat.lastModified = new Date();
    await db.chats.put(chat);
    await chatsService.refreshChatListAfterActivity(db);
}

function createModelErrorMessage(selectedPersonalityId: string): Message {
    return createErrorMessage("generation", selectedPersonalityId);
}

function createImageGenerationErrorMessage(selectedPersonalityId: string): Message {
    return createErrorMessage("image_generation", selectedPersonalityId);
}

function createImageEditingErrorMessage(selectedPersonalityId: string): Message {
    return createErrorMessage("image_editing", selectedPersonalityId);
}

function showGeminiProhibitedContentToast(args: { finishReason?: unknown; detail?: unknown }): void {
    const finishReasonText = (args.finishReason ?? "").toString().trim();
    const detailText = (args.detail ?? "").toString().trim();
    const suffix = finishReasonText ? ` ${finishReasonText}` : "";
    const detailSuffix = detailText && detailText !== finishReasonText ? ` ${detailText}` : "";

    warn({
        title: "Message blocked by Gemini",
        text: "The AI refused to answer this message. Try rephrasing it, or upgrade to Pro to get a fully unrestricted experience." + suffix + detailSuffix,
        actions: [
            {
                label: "Upgrade",
                onClick(dismiss) {
                    document.querySelector<HTMLButtonElement>("#btn-show-subscription-options")?.click();
                    dismiss();
                },
            },
        ],
    });
}

function generateThinkingConfig(model: string, enableThinking: boolean, settings: any) {
    if (!enableThinking && model !== ChatModel.NANO_BANANA) {
        return {
            includeThoughts: false,
            thinkingBudget: 0
        };
    }
    if (model === ChatModel.NANO_BANANA) {
        return undefined;
    }
    return {
        includeThoughts: true,
        thinkingBudget: settings.thinkingBudget
    };
}

async function finalizeResponseElement(responseElement: HTMLElement, scroll: boolean = true): Promise<void> {
    const updatedChat = await chatsService.getCurrentChat(db);
    if (updatedChat) {
        const modelIndex = updatedChat.content.length - 1;
        const newElm = await messageElement(updatedChat.content[modelIndex], modelIndex);
        responseElement.replaceWith(newElm);
    }
    if (scroll) {
        helpers.messageContainerScrollToBottom(true);
    }
}

function createInterruptedModelMessage(args: {
    personalityId: string;
    text: string;
    textSignature?: string;
    thinking?: string;
    groundingContent?: string;
    generatedImages?: GeneratedImage[];
}): Message {
    const hasImages = (args.generatedImages?.length ?? 0) > 0;
    const parts: Array<{ text: string; thoughtSignature?: string }> = [];

    if (args.text.trim().length > 0 || args.textSignature) {
        parts.push({ text: args.text, thoughtSignature: args.textSignature });
    } else if (!hasImages) {
        parts.push({ text: "*Response interrupted.*" });
    }

    return {
        role: "model",
        personalityid: args.personalityId,
        parts,
        groundingContent: args.groundingContent || "",
        thinking: args.thinking || undefined,
        generatedImages: args.generatedImages?.length ? args.generatedImages : undefined,
        interrupted: true,
    };
}

// ================================================================================
// HISTORY BUILDING
// ================================================================================

export interface GeminiHistoryBuildResult {
    history: Content[];
    pinnedHistoryIndices: number[];
}

async function migrateLegacyPersonalityMarkers(chat: Chat): Promise<boolean> {
    let mutated = false;
    let index = 0;
    while (index < chat.content.length) {
        const message = chat.content[index];
        if (!isLegacyPersonalityIntro(message)) {
            index++;
            continue;
        }

        let end = index + 1;
        let personalityId: string | undefined = message.personalityid;
        while (end < chat.content.length) {
            const current = chat.content[end];
            if (!current.hidden || isPersonalityMarker(current)) {
                break;
            }
            if (!personalityId && current.personalityid) {
                personalityId = current.personalityid;
            }
            end++;
        }

        if (!personalityId) {
            const nextMessage = chat.content[index + 1];
            if (nextMessage?.personalityid) {
                personalityId = nextMessage.personalityid;
            }
        }

        if (!personalityId) {
            index = end;
            continue;
        }

        removeMessagesFromDom(index, end);
        chat.content.splice(index, end - index);

        const markerMessage = createPersonalityMarkerMessage(personalityId);
        chat.content.splice(index, 0, markerMessage);
        await insertHiddenMessageIntoDom(markerMessage, index);
        index++;

        mutated = true;
    }
    return mutated;
}

async function backfillMissingPersonalityMarkers(chat: Chat): Promise<boolean> {
    let mutated = false;
    let activePersonalityId: string | undefined;
    const content = chat.content;

    for (let index = 0; index < content.length; index++) {
        const message = content[index];

        if (isPersonalityMarker(message)) {
            activePersonalityId = getPersonalityMarkerInfo(message)?.personalityId;
            continue;
        }

        if (message.hidden) continue;

        const personaId = message.personalityid;
        if (!personaId) continue;
        if (personaId === activePersonalityId) continue;

        let insertionIndex = index;
        for (let cursor = index - 1; cursor >= 0; cursor--) {
            const candidate = content[cursor];
            if (isPersonalityMarker(candidate)) {
                insertionIndex = cursor;
                break;
            }
            if (candidate.hidden) continue;
            if (candidate.role === "user") {
                insertionIndex = cursor;
            }
            break;
        }

        const markerMessage = createPersonalityMarkerMessage(personaId);
        content.splice(insertionIndex, 0, markerMessage);
        await insertHiddenMessageIntoDom(markerMessage, insertionIndex);
        activePersonalityId = personaId;
        mutated = true;
        if (insertionIndex <= index) {
            index++;
        }
    }

    return mutated;
}

async function ensurePersonalityMarker(chat: Chat, personalityId: string): Promise<boolean> {
    const content = chat.content;
    for (let i = content.length - 1; i >= 0; i--) {
        if (!isPersonalityMarker(content[i])) continue;
        const info = getPersonalityMarkerInfo(content[i]);
        if (info?.personalityId === personalityId) {
            return false;
        }
    }

    const markerMessage = createPersonalityMarkerMessage(personalityId);
    content.push(markerMessage);
    await insertHiddenMessageIntoDom(markerMessage, content.length - 1);
    return true;
}

function removeMessagesFromDom(startIndex: number, endIndex: number): void {
    const container = document.querySelector<HTMLDivElement>(".message-container");
    if (!container) return;
    for (let idx = endIndex - 1; idx >= startIndex; idx--) {
        const node = container.children[idx];
        if (node) node.remove();
    }
}

async function insertHiddenMessageIntoDom(message: Message, index: number): Promise<void> {
    const container = document.querySelector<HTMLDivElement>(".message-container");
    if (!container) return;
    const element = await messageElement(message, index);
    const referenceNode = container.children[index] ?? null;
    container.insertBefore(element, referenceNode);
}

export async function constructGeminiChatHistoryFromLocalChat(
    currentChat: Chat,
    selectedPersonality: DbPersonality,
    options?: { enforceThoughtSignatures?: boolean }
): Promise<GeminiHistoryBuildResult> {
    const history: Content[] = [];
    const pinnedHistoryIndices: number[] = [];
    const shouldEnforceThoughtSignatures = options?.enforceThoughtSignatures === true;

    const migrated = await migrateLegacyPersonalityMarkers(currentChat);
    const backfilled = await backfillMissingPersonalityMarkers(currentChat);
    const markerEnsured = await ensurePersonalityMarker(currentChat, selectedPersonality.id);
    if (migrated || backfilled || markerEnsured) {
        await db.chats.put(currentChat);
    }

    const lastImageIndex = findLastGeneratedImageIndex(currentChat.content);
    const lastAttachmentIndex = findLastAttachmentIndex(currentChat.content);

    for (let index = 0; index < currentChat.content.length; index++) {
        const dbMessage = currentChat.content[index];

        if (isPersonalityMarker(dbMessage)) {
            const markerInfo = getPersonalityMarkerInfo(dbMessage);
            if (!markerInfo) continue;
            if (markerInfo.personalityId === NARRATOR_PERSONALITY_ID) continue;

            let persona: DbPersonality | undefined;
            if (markerInfo.personalityId === selectedPersonality.id) {
                persona = selectedPersonality;
            } else {
                const fetched = await personalityService.get(markerInfo.personalityId);
                if (fetched) {
                    persona = { id: markerInfo.personalityId, ...fetched } as DbPersonality;
                }
            }
            if (persona) {
                const instructions = buildPersonalityInstructionMessages(persona);
                const startIndex = history.length;
                history.push(...instructions);
                if (markerInfo.personalityId === selectedPersonality.id) {
                    for (let offset = 0; offset < instructions.length; offset++) {
                        pinnedHistoryIndices.push(startIndex + offset);
                    }
                }
            }
            continue;
        }

        if (dbMessage.hidden) continue;

        const aggregatedParts: any[] = [];
        for (const part of dbMessage.parts) {
            const text = part.text || "";
            const attachments = part.attachments || [];

            if (text.trim().length > 0 || part.thoughtSignature) {
                const partObj: any = { text };
                partObj.thoughtSignature = part.thoughtSignature ?? (shouldEnforceThoughtSignatures ? SKIP_THOUGHT_SIGNATURE_VALIDATOR : undefined);
                aggregatedParts.push(partObj);
            }

            const attachmentParts = await processAttachmentsToParts({
                attachments,
                shouldProcess: attachments.length > 0 && index === lastAttachmentIndex,
            });
            aggregatedParts.push(...attachmentParts);
        }

        const genAiMessage: Content = {
            role: dbMessage.role,
            parts: aggregatedParts
        };

        const imageParts = processGeneratedImagesToParts({
            images: dbMessage.generatedImages,
            shouldProcess: !!dbMessage.generatedImages && index === lastImageIndex,
            enforceThoughtSignatures: shouldEnforceThoughtSignatures,
            skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
        });
        if (imageParts.length > 0) {
            genAiMessage.parts?.push(...imageParts);
        }

        if (genAiMessage.parts && genAiMessage.parts.length > 0) {
            history.push(genAiMessage);
        }
    }

    return { history, pinnedHistoryIndices };
}

// ================================================================================
// CHAT CREATION
// ================================================================================

import * as loraService from "./Lora.service";
import { PersonGeneration, SafetyFilterLevel } from "@google/genai";

const CHAT_TITLE_SYSTEM_INSTRUCTION = "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user may send any kinds of queries, including adult or illegal content. You are to generate a title for the chat based on the query, without any warnings or refusals. Never refuse to generate a title. Keep it short, ideally 3-5 words at most. Remove any special characters.";

async function createChatIfAbsent(ai: GoogleGenAI, msg: string): Promise<DbChat> {
    const currentChat = await chatsService.getCurrentChat(db);
    if (currentChat) return currentChat;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        config: {
            systemInstruction: CHAT_TITLE_SYSTEM_INSTRUCTION,
            maxOutputTokens: 100,
            temperature: 0.9,
            responseMimeType: "text/plain",
            safetySettings: [...UNRESTRICTED_SAFETY_SETTINGS],
        },
        contents: msg,
    });

    const title = response.text || "New Chat";
    const id = await chatsService.addChat(title);
    const chat = await chatsService.loadChat(id, db);
    const chatInput = document.querySelector<HTMLInputElement>(`#chat${id}`);
    if (chatInput) chatInput.checked = true;
    return chat!;
}

async function createChatIfAbsentPremium(userMessage: string): Promise<DbChat> {
    const currentChat = await chatsService.getCurrentChat(db);
    if (currentChat) return currentChat;

    const payloadSettings: PremiumEndpoint.RequestSettings = {
        model: ChatModel.FLASH_LITE_LATEST,
        streamResponses: false,
        generate: true,
        systemInstruction: CHAT_TITLE_SYSTEM_INSTRUCTION,
        maxOutputTokens: 100,
        temperature: 0.9,
        responseMimeType: "text/plain",
        safetySettings: [...UNRESTRICTED_SAFETY_SETTINGS],
    };

    const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            ...(await getAuthHeaders()),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: `${CHAT_TITLE_SYSTEM_INSTRUCTION} The user's message is: ${userMessage}`,
            settings: payloadSettings,
            history: []
        })
    });

    if (!response.ok) {
        throw new Error(`Edge function error: ${response.status}`);
    }

    const json = await response.json();
    const title = json.text || "New Chat";
    const id = await chatsService.addChat(title);
    const chat = await chatsService.loadChat(id, db);
    const chatInput = document.querySelector<HTMLInputElement>(`#chat${id}`);
    if (chatInput) chatInput.checked = true;
    return chat!;
}

// ================================================================================
// SEND - PUBLIC API
// ================================================================================

/**
 * Send a message in normal chat mode.
 */
export async function send(msg: string): Promise<HTMLElement | undefined> {
    if (isSendInFlight()) return;
    setSendInFlight(true);

    try {
        const validation = await performEarlyValidation(msg);
        if (!validation.canProceed) return;

        // Route to group chat handler if applicable
        if (validation.isGroupChat) {
            if (isImageModeActive() || isImageEditingActive()) {
                warn({ title: "Not supported", text: "Image mode is not supported in group chats yet." });
                return;
            }

            const existingChat = await chatsService.getCurrentChat(db);
            const mode = (existingChat as any)?.groupChat?.mode as ("rpg" | "dynamic" | undefined);

            if (mode === "dynamic") {
                const dynamicArgs: DynamicInputArgs = {
                    msg,
                    attachmentFiles: validation.attachmentFiles,
                    isInternetSearchEnabled: validation.isInternetSearchEnabled,
                    isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
                    shouldEnforceThoughtSignaturesInHistory: validation.shouldEnforceThoughtSignaturesInHistory,
                };
                return await sendGroupChatDynamic(dynamicArgs);
            }

            return await sendGroupChatRpg({
                msg,
                attachmentFiles: validation.attachmentFiles,
                isInternetSearchEnabled: validation.isInternetSearchEnabled,
                isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
                skipTurn: false,
            });
        }

        const ctx = await buildSendContext(msg, validation);
        if (!ctx) return;

        // Route to appropriate handler
        if (isImageEditingActive()) {
            return await handleImageEditing(ctx);
        }
        if (isImageModeActive()) {
            return await handleImageGeneration(ctx);
        }
        return await handleTextChat(ctx);

    } finally {
        setSendInFlight(false);
    }
}

/**
 * Send user turn in RPG group chat mode.
 */
export async function sendRpgTurn(msg?: string): Promise<HTMLElement | undefined> {
    if (isSendInFlight()) return;
    setSendInFlight(true);

    try {
        const validation = await performEarlyValidation(msg || "");
        if (!validation.canProceed) return;

        const existingChat = await chatsService.getCurrentChat(db);
        const mode = (existingChat as any)?.groupChat?.mode;
        if (mode !== "rpg") {
            warn({ title: "Not in group chat", text: "This function is only available in RPG group chats." });
            return;
        }

        return await sendGroupChatRpg({
            msg: msg || "",
            attachmentFiles: validation.attachmentFiles,
            isInternetSearchEnabled: validation.isInternetSearchEnabled,
            isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
            skipTurn: false,
        });

    } finally {
        setSendInFlight(false);
    }
}

/**
 * Skip user turn in RPG group chat mode.
 */
export async function skipRpgTurn(): Promise<HTMLElement | undefined> {
    if (isSendInFlight()) return;
    setSendInFlight(true);

    try {
        const validation = await performEarlyValidation("");
        if (!validation.canProceed) return;

        const existingChat = await chatsService.getCurrentChat(db);
        const mode = (existingChat as any)?.groupChat?.mode;
        if (mode !== "rpg") {
            warn({ title: "Not in group chat", text: "This function is only available in RPG group chats." });
            return;
        }

        return await sendGroupChatRpg({
            msg: "",
            attachmentFiles: validation.attachmentFiles,
            isInternetSearchEnabled: validation.isInternetSearchEnabled,
            isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
            skipTurn: true,
        });

    } finally {
        setSendInFlight(false);
    }
}

// ================================================================================
// REGENERATE
// ================================================================================

export async function regenerate(modelMessageIndex: number): Promise<void> {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) {
        console.error("No chat found");
        return;
    }

    if (chat.groupChat) {
        const deletionStart = modelMessageIndex;
        if (deletionStart < 0 || deletionStart >= chat.content.length) {
            console.error("Invalid message index for regeneration");
            return;
        }

        chat.content = chat.content.slice(0, deletionStart);
        pruneTrailingPersonalityMarkers(chat);
        await db.chats.put(chat);

        const container = document.querySelector<HTMLDivElement>(".message-container");
        if (container) {
            for (const node of Array.from(container.querySelectorAll<HTMLElement>("[data-chat-index]"))) {
                const indexAttr = node.getAttribute("data-chat-index");
                if (!indexAttr) continue;
                const chatIndex = Number.parseInt(indexAttr, 10);
                if (!Number.isFinite(chatIndex)) continue;
                if (chatIndex >= deletionStart) node.remove();
            }

            for (const block of Array.from(container.querySelectorAll<HTMLDivElement>(".round-block"))) {
                const hasAnyMessages = !!block.querySelector<HTMLElement>("[data-chat-index]");
                if (!hasAnyMessages) block.remove();
            }
        }

        try {
            if (chat.groupChat?.mode === "rpg") {
                await send("");
            } else {
                warn({ title: "Not supported", text: "Regeneration for dynamic group chats is not supported yet." });
            }
        } catch (error: any) {
            console.error(error);
            danger({ title: "Error regenerating message", text: JSON.stringify(error.message || error) });
            helpers.messageContainerScrollToBottom(true);
        }
        return;
    }

    const message = chat.content[modelMessageIndex - 1];
    if (!message) {
        console.error("No message found");
        return;
    }

    const userIndex = modelMessageIndex - 1;
    let deletionStart = userIndex;
    for (let i = userIndex - 1; i >= 0; i--) {
        const candidate = chat.content[i];
        if (!candidate.hidden) break;
        if (candidate.role === "model" && isPersonalityMarker(candidate)) break;
        deletionStart = i;
    }

    chat.content = chat.content.slice(0, deletionStart);
    pruneTrailingPersonalityMarkers(chat);
    await db.chats.put(chat);

    const container = document.querySelector<HTMLDivElement>(".message-container");
    if (container) {
        const toRemove: Element[] = [];
        for (const child of Array.from(container.children)) {
            const indexAttr = child.getAttribute("data-chat-index");
            if (!indexAttr) continue;
            const chatIndex = Number.parseInt(indexAttr, 10);
            if (!Number.isFinite(chatIndex)) continue;
            if (chatIndex >= deletionStart) toRemove.push(child);
        }
        for (const node of toRemove) node.remove();
    }

    const attachments = message.parts[0]?.attachments || ({} as FileList);
    const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
    if (attachmentsInput && attachments.length > 0) {
        const dataTransfer = new DataTransfer();
        for (const attachment of attachments) {
            dataTransfer.items.add(attachment);
        }
        attachmentsInput.files = dataTransfer.files;
    }

    try {
        await send(message.parts[0]?.text || "");
    } catch (error: any) {
        console.error(error);
        danger({ title: "Error regenerating message", text: JSON.stringify(error.message || error) });
        helpers.messageContainerScrollToBottom(true);
    }
}

export async function deleteRound(roundIndex: number): Promise<void> {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) return;

    const beforeLen = chat.content.length;
    chat.content = (chat.content || []).filter(m => m.roundIndex !== roundIndex);
    if (chat.content.length === beforeLen) return;

    pruneTrailingPersonalityMarkers(chat);
    await db.chats.put(chat);
    await chatsService.refreshChatListAfterActivity(db);
    await chatsService.loadChat((chat as any).id, db);
}

export async function regenerateRound(roundIndex: number): Promise<void> {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) return;

    const startIndex = (chat.content || []).findIndex(m => m.roundIndex === roundIndex);
    if (startIndex < 0) return;

    chat.content = chat.content.slice(0, startIndex);
    pruneTrailingPersonalityMarkers(chat);
    await db.chats.put(chat);
    await chatsService.refreshChatListAfterActivity(db);
    await chatsService.loadChat((chat as any).id, db);

    try {
        if (!settingsService.getSettings().rpgGroupChatsProgressAutomatically) {
            await send("");
        }
    } catch (error: any) {
        console.error(error);
        danger({ title: "Error regenerating round", text: JSON.stringify(error.message || error) });
    }
}

// ================================================================================
// SEND INTERNALS - VALIDATION & CONTEXT
// ================================================================================

interface EarlyValidationSuccess {
    canProceed: true;
    settings: ReturnType<typeof settingsService.getSettings>;
    selectedPersonalityId: string;
    attachmentFiles: FileList;
    historyImageDataUri: string | null;
    isInternetSearchEnabled: boolean;
    isPremiumEndpointPreferred: boolean;
    isImagePremiumEndpointPreferred: boolean;
    isGroupChat: boolean;
    shouldUseSkipThoughtSignature: boolean;
    shouldEnforceThoughtSignaturesInHistory: boolean;
}

interface EarlyValidationFailure {
    canProceed: false;
}

type EarlyValidationResult = EarlyValidationSuccess | EarlyValidationFailure;

async function performEarlyValidation(msg: string): Promise<EarlyValidationResult> {
    const settings = settingsService.getSettings();
    const shouldUseSkipThoughtSignature = settings.model === ChatModel.NANO_BANANA;
    const shouldEnforceThoughtSignaturesInHistory = settings.model === ChatModel.NANO_BANANA_PRO;
    const selectedPersonality = await personalityService.getSelected();
    const selectedPersonalityId = getSelectedPersonalityId();
    const isInternetSearchEnabled = document.querySelector<HTMLButtonElement>("#btn-internet")?.classList.contains("btn-toggled") ?? false;

    const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
    if (!attachmentsInput) {
        console.error("Missing #attachments input in the DOM");
        throw new Error("Missing DOM element");
    }

    const historyImageDataUri = getCurrentHistoryImageDataUri();

    const attachmentFiles: FileList = (() => {
        const dt = new DataTransfer();
        for (const f of Array.from(attachmentsInput.files || [])) {
            dt.items.add(f);
        }
        return dt.files;
    })();

    attachmentsInput.value = "";
    attachmentsInput.files = new DataTransfer().files;
    clearAttachmentPreviews();

    if (!selectedPersonality) {
        return { canProceed: false };
    }

    const subscription = await supabaseService.getUserSubscription();
    const tier = await supabaseService.getSubscriptionTier(subscription);
    const hasSubscription = tier === "pro" || tier === "max";
    const isPremiumEndpointPreferred = hasSubscription && shouldPreferPremiumEndpoint();
    const isImagePremiumEndpointPreferred = (await supabaseService.isImageGenerationAvailable()).type === "all";

    if (!isPremiumEndpointPreferred && settings.apiKey === "") {
        warn({ title: "API Key Required", text: "Please enter your API key in settings, or subscribe to Pro for unlimited access." });
        return { canProceed: false };
    }

    const existingChat = await chatsService.getCurrentChat(db);
    const groupMode = (existingChat as any)?.groupChat?.mode as ("rpg" | "dynamic" | undefined);
    const isGroupChat = groupMode === "rpg" || groupMode === "dynamic";
    const allowsEmptyMessage = groupMode === "rpg";

    if (!msg && !allowsEmptyMessage && (attachmentFiles?.length ?? 0) === 0) {
        return { canProceed: false };
    }

    return {
        canProceed: true,
        settings,
        selectedPersonalityId,
        attachmentFiles,
        historyImageDataUri,
        isInternetSearchEnabled,
        isPremiumEndpointPreferred,
        isImagePremiumEndpointPreferred,
        isGroupChat,
        shouldUseSkipThoughtSignature,
        shouldEnforceThoughtSignaturesInHistory,
    };
}

interface SendContext {
    msg: string;
    userMessage: Message;
    userMessageElement: HTMLElement;
    responseElement: HTMLElement;
    selectedPersonalityId: string;
    settings: ReturnType<typeof settingsService.getSettings>;
    config: GenerateContentConfig;
    ai: GoogleGenAI;
    chatHistory: Content[];
    pinnedHistoryIndices: number[];
    attachmentFiles: FileList;
    historyImageDataUri: string | null;
    isPremiumEndpointPreferred: boolean;
    isImagePremiumEndpointPreferred: boolean;
    shouldUseSkipThoughtSignature: boolean;
    abortController: AbortController;
    messageContent: Element;
    groundingRendered: Element;
    thinkingWrapper: HTMLElement | null;
    thinkingContentElm: HTMLElement | null;
    ensureThinkingElements: () => void;
}

async function buildSendContext(msg: string, validation: EarlyValidationSuccess): Promise<SendContext | null> {
    const {
        settings,
        selectedPersonalityId,
        attachmentFiles,
        historyImageDataUri,
        isInternetSearchEnabled,
        isPremiumEndpointPreferred,
        isImagePremiumEndpointPreferred,
        shouldUseSkipThoughtSignature,
        shouldEnforceThoughtSignaturesInHistory,
    } = validation;

    const abortController = startGeneration();
    const thinkingConfig = generateThinkingConfig(settings.model, settings.enableThinking, settings);
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });

    const config: GenerateContentConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: parseInt(settings.temperature) / 100,
        systemInstruction: await settingsService.getSystemPrompt("chat"),
        safetySettings: settings.safetySettings,
        responseMimeType: "text/plain",
        tools: isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: thinkingConfig,
        imageConfig: settings.model === ChatModel.NANO_BANANA_PRO ? { imageSize: "4K" } : undefined
    };

    const currentChat = isPremiumEndpointPreferred
        ? await createChatIfAbsentPremium(msg)
        : await createChatIfAbsent(ai, msg);

    if (!currentChat) {
        console.error("No current chat found");
        return null;
    }

    const selectedPersonality = await personalityService.getSelected();
    const { history: chatHistory, pinnedHistoryIndices } = await constructGeminiChatHistoryFromLocalChat(
        currentChat,
        { id: selectedPersonalityId, ...selectedPersonality! },
        { enforceThoughtSignatures: shouldEnforceThoughtSignaturesInHistory }
    );

    const userMessage: Message = { role: "user", parts: [{ text: msg, attachments: attachmentFiles }] };
    const userIndex = currentChat.content.length;
    const userMessageElement = await insertMessage(userMessage, userIndex);
    hljs.highlightAll();
    helpers.messageContainerScrollToBottom(true);

    const responseElement = await insertMessage(createModelPlaceholderMessage(selectedPersonalityId, ""), userIndex + 1);
    helpers.messageContainerScrollToBottom(true);

    const messageContent = responseElement.querySelector(".message-text .message-text-content")!;
    let thinkingWrapper = responseElement.querySelector<HTMLElement>(".message-thinking");
    let thinkingContentElm = responseElement.querySelector<HTMLElement>(".thinking-content");
    const groundingRendered = responseElement.querySelector(".message-grounding-rendered-content")!;

    // NOTE: ensureThinkingElements mutates these locals, but callers read from ctx.*.
    // Keep ctx.* in sync so thought parts never fall back into main text.
    let ctxRef: SendContext | null = null;

    function ensureThinkingElements(): void {
        // If we don't already have these elements, re-query in case markup was inserted after the initial query.
        thinkingWrapper ??= responseElement.querySelector<HTMLElement>(".message-thinking");
        thinkingContentElm ??= responseElement.querySelector<HTMLElement>(".thinking-content");

        if (!thinkingWrapper || !thinkingContentElm) {
            const header = responseElement.querySelector(".message-header");
            const { wrapper, content } = createThinkingUiElements();
            thinkingWrapper = wrapper;
            thinkingContentElm = content;
            header?.insertAdjacentElement("afterend", thinkingWrapper);
        }

        if (ctxRef) {
            ctxRef.thinkingWrapper = thinkingWrapper;
            ctxRef.thinkingContentElm = thinkingContentElm;
        }
    }

    const ctx: SendContext = {
        msg,
        userMessage,
        userMessageElement,
        responseElement,
        selectedPersonalityId,
        settings,
        config,
        ai,
        chatHistory,
        pinnedHistoryIndices,
        attachmentFiles,
        historyImageDataUri,
        isPremiumEndpointPreferred,
        isImagePremiumEndpointPreferred,
        shouldUseSkipThoughtSignature,
        abortController,
        messageContent,
        groundingRendered,
        thinkingWrapper,
        thinkingContentElm,
        ensureThinkingElements,
    };

    ctxRef = ctx;

    return ctx;
}

// ================================================================================
// SEND HANDLERS - TEXT CHAT
// ================================================================================

interface TextChatResponseState {
    thinking: string;
    rawText: string;
    textSignature: string | undefined;
    finishReason: unknown;
    groundingContent: string;
    generatedImages: GeneratedImage[];
}

async function handleTextChat(ctx: SendContext): Promise<HTMLElement | undefined> {
    const state: TextChatResponseState = {
        thinking: "",
        rawText: "",
        textSignature: undefined,
        finishReason: undefined,
        groundingContent: "",
        generatedImages: [],
    };

    const ensureTextSignature = () => {
        if (ctx.shouldUseSkipThoughtSignature && !state.textSignature && state.rawText.trim().length > 0) {
            state.textSignature = SKIP_THOUGHT_SIGNATURE_VALIDATOR;
        }
    };

    try {
        if (ctx.isPremiumEndpointPreferred) {
            await handleTextChatPremium(ctx, state);
        } else {
            await handleTextChatLocalSdk(ctx, state);
        }
    } catch (err: any) {
        if (isAbortError(err, ctx.abortController)) {
            return await handleAbort(ctx, state, ensureTextSignature);
        }
        return await handleError(ctx, err);
    }

    if (
        state.finishReason === FinishReason.PROHIBITED_CONTENT ||
        state.finishReason === FinishReason.OTHER ||
        state.finishReason === BlockedReason.PROHIBITED_CONTENT
    ) {
        showGeminiProhibitedContentToast({ finishReason: state.finishReason });
    }

    return await finalizeTextChatSuccess(ctx, state, ensureTextSignature);
}

async function handleAbort(ctx: SendContext, state: TextChatResponseState, ensureTextSignature: () => void): Promise<HTMLElement> {
    ensureTextSignature();
    const modelMessage = createInterruptedModelMessage({
        personalityId: ctx.selectedPersonalityId,
        text: state.rawText,
        textSignature: state.textSignature,
        thinking: state.thinking,
        groundingContent: state.groundingContent,
        generatedImages: state.generatedImages,
    });
    await persistUserAndModel(ctx.userMessage, modelMessage);
    await finalizeResponseElement(ctx.responseElement);
    ctx.responseElement.querySelector(".message-text")?.classList.remove("is-loading");
    endGeneration();
    return ctx.userMessageElement;
}

async function handleError(ctx: SendContext, error: unknown): Promise<never> {
    console.error(error);
    await persistUserAndModel(ctx.userMessage, createModelErrorMessage(ctx.selectedPersonalityId));
    await finalizeResponseElement(ctx.responseElement);
    endGeneration();
    throw error;
}

async function finalizeTextChatSuccess(ctx: SendContext, state: TextChatResponseState, ensureTextSignature: () => void): Promise<HTMLElement> {
    ensureTextSignature();

    const modelMessage: Message = {
        role: "model",
        personalityid: ctx.selectedPersonalityId,
        parts: state.rawText.trim().length > 0 || state.textSignature
            ? [{ text: state.rawText, thoughtSignature: state.textSignature }]
            : [],
        groundingContent: state.groundingContent || "",
        thinking: state.thinking || undefined,
        generatedImages: state.generatedImages.length > 0 ? state.generatedImages : undefined,
    };

    await persistUserAndModel(ctx.userMessage, modelMessage);
    await finalizeResponseElement(ctx.responseElement, false);
    hljs.highlightAll();
    helpers.messageContainerScrollToBottom();
    endGeneration();

    return ctx.userMessageElement;
}

async function handleTextChatPremium(ctx: SendContext, state: TextChatResponseState): Promise<void> {
    const payloadSettings: PremiumEndpoint.RequestSettings = {
        model: ctx.settings.model,
        streamResponses: ctx.settings.streamResponses,
        ...ctx.config,
    };

    const hasFiles = (ctx.attachmentFiles?.length ?? 0) > 0;
    const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;

    let res: Response;
    if (hasFiles) {
        const form = new FormData();
        form.append("message", ctx.msg);
        form.append("settings", JSON.stringify(payloadSettings));
        form.append("history", JSON.stringify(ctx.chatHistory));
        form.append("pinnedHistoryIndices", JSON.stringify(ctx.pinnedHistoryIndices));
        for (const f of Array.from(ctx.attachmentFiles || [])) {
            form.append("files", f);
        }
        res = await fetch(endpoint, {
            method: "POST",
            headers: await getAuthHeaders(),
            body: form,
            signal: ctx.abortController?.signal,
        });
    } else {
        res = await fetch(endpoint, {
            method: "POST",
            headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
            body: JSON.stringify({
                message: ctx.msg,
                settings: payloadSettings,
                history: ctx.chatHistory,
                pinnedHistoryIndices: ctx.pinnedHistoryIndices,
            }),
            signal: ctx.abortController?.signal,
        });
    }

    if (!res.ok) throw new Error(`Edge function error: ${res.status}`);

    if (ctx.config.thinkingConfig?.includeThoughts) {
        ctx.ensureThinkingElements();
    }

    if (ctx.settings.streamResponses) {
        const result = await processPremiumEndpointSse({
            res,
            process: {
                signal: ctx.abortController?.signal ?? undefined,
                abortMode: "return",
                includeThoughts: !!ctx.config.thinkingConfig?.includeThoughts,
                useSkipThoughtSignature: ctx.shouldUseSkipThoughtSignature,
                skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
                throwOnBlocked: () => false,
                onBlocked: () => { throw new Error("Blocked"); },
                callbacks: {
                    onFallbackStart: () => {
                        state.finishReason = undefined;
                        state.groundingContent = "";
                        state.generatedImages = [];
                        ctx.groundingRendered.innerHTML = "";
                    },
                    onText: async ({ text }) => {
                        state.rawText = text;
                        ctx.responseElement.querySelector(".message-text")?.classList.remove("is-loading");
                        ctx.messageContent.innerHTML = await parseMarkdownToHtml(state.rawText);
                        helpers.messageContainerScrollToBottom();
                    },
                    onThinking: async ({ thinking: thinkingSoFar }) => {
                        state.thinking = thinkingSoFar;
                        if (ctx.thinkingContentElm) {
                            ctx.thinkingContentElm.innerHTML = await parseMarkdownToHtml(state.thinking);
                        }
                        helpers.messageContainerScrollToBottom();
                    },
                    onGrounding: ({ renderedContent }) => {
                        state.groundingContent = renderedContent;
                        renderGroundingToShadowDom(ctx.groundingRendered, state.groundingContent);
                        helpers.messageContainerScrollToBottom();
                    },
                    onImage: (img) => {
                        state.generatedImages.push(img);
                    },
                },
            },
        });

        state.finishReason = result.finishReason as any;
        state.thinking = result.thinking;
        state.rawText = result.text;
        state.textSignature = result.textSignature;
        state.groundingContent = result.groundingContent;
        state.generatedImages = result.images;

        if (result.wasAborted) {
            throwAbortError();
        }
    } else {
        const json = await res.json();
        if (json) {
            if (json.decensored) {
                state.thinking += json.reasoning ?? "";
                state.rawText += json.text;
                if (ctx.thinkingContentElm) ctx.thinkingContentElm.textContent = state.thinking;
                state.finishReason = json.finishReason;
            } else {
                state.finishReason = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason;
                for (const part of json.candidates?.[0]?.content?.parts || []) {
                    if (part.thought && part.text) {
                        // Never allow thought content to spill into the main answer.
                        state.thinking += part.text;
                        if (ctx.config.thinkingConfig?.includeThoughts) {
                            ctx.ensureThinkingElements();
                            if (ctx.thinkingContentElm) ctx.thinkingContentElm.textContent = state.thinking;
                        }
                    } else if (part.text) {
                        if (!state.textSignature) {
                            state.textSignature = part.thoughtSignature ?? (ctx.shouldUseSkipThoughtSignature ? SKIP_THOUGHT_SIGNATURE_VALIDATOR : undefined);
                        }
                        state.rawText += part.text;
                    } else if (part.inlineData) {
                        state.generatedImages.push({
                            mimeType: part.inlineData.mimeType || "image/png",
                            base64: part.inlineData.data || "",
                            thoughtSignature: part.thoughtSignature ?? (ctx.shouldUseSkipThoughtSignature ? SKIP_THOUGHT_SIGNATURE_VALIDATOR : undefined),
                            thought: part.thought,
                        });
                    }
                }
                if (json.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) {
                    state.groundingContent = json.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                    renderGroundingToShadowDom(ctx.groundingRendered, state.groundingContent);
                }
            }
        }

        if (ctx.config.thinkingConfig?.includeThoughts && state.thinking.trim()) {
            ctx.ensureThinkingElements();
            if (ctx.thinkingContentElm) ctx.thinkingContentElm.textContent = state.thinking;
        }
        ctx.responseElement.querySelector(".message-text")?.classList.remove("is-loading");
        ctx.messageContent.innerHTML = await parseMarkdownToHtml(state.rawText);
    }
}

async function handleTextChatLocalSdk(ctx: SendContext, state: TextChatResponseState): Promise<void> {
    const chat = ctx.ai.chats.create({
        model: ctx.settings.model,
        history: ctx.chatHistory,
        config: ctx.config,
    });

    const uploadedFiles = await Promise.all(
        Array.from(ctx.attachmentFiles || []).map(async (file) => {
            return await ctx.ai.files.upload({ file });
        })
    );

    const messagePayload = {
        message: [
            { text: ctx.msg },
            ...uploadedFiles.map((file) => createPartFromUri(file.uri!, file.mimeType!)),
        ],
    };

    if (ctx.config.thinkingConfig?.includeThoughts) {
        ctx.ensureThinkingElements();
    }

    if (ctx.settings.streamResponses) {
        const result = await processGeminiLocalSdkStream({
            stream: await chat.sendMessageStream(messagePayload),
            process: {
                includeThoughts: !!ctx.config.thinkingConfig?.includeThoughts,
                useSkipThoughtSignature: ctx.shouldUseSkipThoughtSignature,
                skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
                signal: ctx.abortController?.signal ?? undefined,
                abortMode: "return",
                throwOnBlocked: false,
                callbacks: {
                    onThinking: ({ thinking: thinkingSoFar }) => {
                        state.thinking = thinkingSoFar;
                        if (ctx.thinkingContentElm) {
                            ctx.thinkingContentElm.textContent = state.thinking;
                        }
                        helpers.messageContainerScrollToBottom();
                    },
                    onText: async ({ text }) => {
                        state.rawText = text;
                        ctx.responseElement.querySelector(".message-text")?.classList.remove("is-loading");
                        ctx.messageContent.innerHTML = await parseMarkdownToHtml(state.rawText);
                        helpers.messageContainerScrollToBottom();
                    },
                    onGrounding: ({ renderedContent }) => {
                        state.groundingContent = renderedContent;
                        renderGroundingToShadowDom(ctx.groundingRendered, state.groundingContent);
                        helpers.messageContainerScrollToBottom();
                    },
                },
            },
        });

        state.finishReason = result.finishReason as any;
        state.thinking = result.thinking;
        state.rawText = result.text;
        state.textSignature = result.textSignature;
        state.groundingContent = result.groundingContent;
        state.generatedImages = result.images;

        if (result.wasAborted) {
            throwAbortError();
        }
    } else {
        const response = await chat.sendMessage(messagePayload);
        const result = await processGeminiLocalSdkResponse({
            response,
            process: {
                includeThoughts: !!ctx.config.thinkingConfig?.includeThoughts,
                useSkipThoughtSignature: ctx.shouldUseSkipThoughtSignature,
                skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
                signal: ctx.abortController?.signal ?? undefined,
                abortMode: "return",
                throwOnBlocked: false,
            },
        });

        state.finishReason = result.finishReason as any;
        state.thinking = result.thinking;
        state.rawText = result.text;
        state.textSignature = result.textSignature;
        state.groundingContent = result.groundingContent;
        state.generatedImages = result.images;

        if (ctx.config.thinkingConfig?.includeThoughts && ctx.thinkingContentElm) {
            ctx.thinkingContentElm.textContent = state.thinking;
        }

        renderGroundingToShadowDom(ctx.groundingRendered, state.groundingContent);
    }
}

// ================================================================================
// SEND HANDLERS - IMAGE GENERATION
// ================================================================================

async function handleImageGeneration(ctx: SendContext): Promise<HTMLElement | undefined> {
    const payload = {
        model: ctx.settings.imageModel || "imagen-4.0-ultra-generate-001",
        prompt: ctx.msg,
        config: {
            numberOfImages: 1,
            outputMimeType: "image/jpeg",
            personGeneration: PersonGeneration.ALLOW_ADULT,
            aspectRatio: "1:1",
            safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE,
        },
        loras: loraService.getLoraState(),
    };

    let b64: string;
    let returnedMimeType: string;

    if (ctx.isImagePremiumEndpointPreferred) {
        const endpoint = `${SUPABASE_URL}/functions/v1/handle-max-request`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctx.abortController?.signal,
        });

        if (!response.ok) {
            const responseError = (await response.json()).error;
            danger({ text: responseError, title: "Image generation failed" });
            await persistUserAndModel(ctx.userMessage, createImageGenerationErrorMessage(ctx.selectedPersonalityId));
            await finalizeResponseElement(ctx.responseElement);
            endGeneration();
            return ctx.userMessageElement;
        }

        const arrayBuf = await response.arrayBuffer();
        b64 = await helpers.arrayBufferToBase64(arrayBuf);
        returnedMimeType = response.headers.get("Content-Type") || "image/png";
    } else {
        const response = await ctx.ai.models.generateImages(payload);
        if (!response || !response.generatedImages || !response.generatedImages[0]?.image?.imageBytes) {
            const extraMessage = response?.generatedImages?.[0]?.raiFilteredReason;
            danger({ text: `${extraMessage ? "Reason: " + extraMessage : ""}`, title: "Image generation failed" });
            await persistUserAndModel(ctx.userMessage, createImageGenerationErrorMessage(ctx.selectedPersonalityId));
            await finalizeResponseElement(ctx.responseElement);
            endGeneration();
            return ctx.userMessageElement;
        }
        b64 = response.generatedImages[0].image.imageBytes;
        returnedMimeType = response.generatedImages[0].image.mimeType || "image/png";
    }

    const modelMessage: Message = {
        role: "model",
        parts: [{ text: "Here's the image you requested~", thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }],
        personalityid: ctx.selectedPersonalityId,
        generatedImages: [{ mimeType: returnedMimeType, base64: b64, thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }],
    };

    await persistUserAndModel(ctx.userMessage, modelMessage);
    await finalizeResponseElement(ctx.responseElement);
    supabaseService.refreshImageGenerationRecord();
    endGeneration();
    return ctx.userMessageElement;
}

// ================================================================================
// SEND HANDLERS - IMAGE EDITING
// ================================================================================

async function handleImageEditing(ctx: SendContext): Promise<HTMLElement | undefined> {
    const imagesToEdit: string[] = [];

    const imageAttachments = Array.from(ctx.attachmentFiles).filter(f => f.type.startsWith("image/"));
    if (imageAttachments.length > 0) {
        for (const file of imageAttachments) {
            const dataUri = await helpers.fileToBase64(file);
            const fullDataUri = `data:${file.type};base64,${dataUri}`;
            imagesToEdit.push(fullDataUri);
        }
    } else {
        if (ctx.historyImageDataUri) {
            imagesToEdit.push(ctx.historyImageDataUri);
        }
    }

    if (imagesToEdit.length === 0) {
        danger({ title: "No images to edit", text: "Please attach an image or select an image for editing." });
        ctx.responseElement.remove();
        ctx.userMessageElement.remove();
        endGeneration();
        return;
    }

    const editingModel = getSelectedEditingModel();

    const maxImages = MODEL_IMAGE_LIMITS[editingModel];
    if (maxImages && imagesToEdit.length > maxImages) {
        const modelName = editingModel.charAt(0).toUpperCase() + editingModel.slice(1);
        warn({ title: `${modelName} supports up to ${maxImages} image${maxImages > 1 ? 's' : ''}`, text: `Only the first ${maxImages} image${maxImages > 1 ? 's' : ''} will be used for editing.` });
        imagesToEdit.splice(maxImages);
    }

    try {
        const endpoint = `${SUPABASE_URL}/functions/v1/handle-edit-request`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
            body: JSON.stringify({ images: imagesToEdit, prompt: ctx.msg, editingModel }),
            signal: ctx.abortController?.signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            danger({ text: errorData.error || "Unknown error", title: "Image editing failed" });
            await persistUserAndModel(ctx.userMessage, createImageEditingErrorMessage(ctx.selectedPersonalityId));
            await finalizeResponseElement(ctx.responseElement);
            endGeneration();
            return ctx.userMessageElement;
        }

        const result = await response.json();
        const editedImageBase64 = result.image;
        const mimeType = result.mimeType || "image/png";

        if (!editedImageBase64) {
            danger({ title: "Image editing failed", text: "No image data returned from server." });
            await persistUserAndModel(ctx.userMessage, createImageEditingErrorMessage(ctx.selectedPersonalityId));
            await finalizeResponseElement(ctx.responseElement);
            endGeneration();
            return ctx.userMessageElement;
        }

        const modelMessage: Message = {
            role: "model",
            parts: [{ text: "Here's your edited image~", thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }],
            personalityid: ctx.selectedPersonalityId,
            generatedImages: [{ mimeType, base64: editedImageBase64, thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }],
        };

        await persistUserAndModel(ctx.userMessage, modelMessage);
        await finalizeResponseElement(ctx.responseElement);
        supabaseService.refreshImageGenerationRecord();
        endGeneration();
        return ctx.userMessageElement;

    } catch (error: any) {
        console.error("Image editing error:", error);
        danger({ title: "Image editing failed", text: error.message || "An unexpected error occurred" });
        await persistUserAndModel(ctx.userMessage, createImageEditingErrorMessage(ctx.selectedPersonalityId));
        await finalizeResponseElement(ctx.responseElement);
        endGeneration();
        return ctx.userMessageElement;
    }
}

// ================================================================================
// EXPORTS FOR RPG GROUP CHAT MODULE
// ================================================================================

export {
    startGeneration,
    endGeneration,
    persistMessages,
    createModelPlaceholderMessage,
    createModelErrorMessage,
    showGeminiProhibitedContentToast,
    generateThinkingConfig,
    finalizeResponseElement,
    ensureThinkingUiOnMessageElement,
    isPersonalityMarker,
    getPersonalityMarkerInfo,
    isLegacyPersonalityIntro,
    pruneTrailingPersonalityMarkers,
    buildPersonalityInstructionMessages,
    SKIP_THOUGHT_SIGNATURE_VALIDATOR as SKIP_THOUGHT_SIGNATURE,
};

export type { RpgInputArgs };

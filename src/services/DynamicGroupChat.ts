/**
 * Dynamic Group Chat implementation.
 *
 * Participants respond probabilistically (based on independence) and may @ping
 * each other using @<uuid> when enabled.
 *
 * This module intentionally does NOT stream responses.
 */

import type { Content, GenerateContentConfig, GenerateContentResponse } from "@google/genai";
import { BlockedReason, FinishReason, GoogleGenAI } from "@google/genai";
import hljs from "highlight.js";

import type { Message } from "../types/Message";
import type { DbChat } from "../types/Chat";
import type { DbPersonality } from "../types/Personality";
import { resolveGuardForPersona } from "../utils/dynamicGroupChatGuards";
import { PremiumEndpoint } from "../types/PremiumEndpoint";

import * as settingsService from "./Settings.service";
import * as personalityService from "./Personality.service";
import * as chatsService from "./Chats.service";
import * as helpers from "../utils/helpers";
import { db } from "./Db.service";
import { SUPABASE_URL, getAuthHeaders, getUserProfile } from "./Supabase.service";
import { warn } from "./Toast.service";

import {
    insertMessage,
    generateThinkingConfig,
    showGeminiProhibitedContentToast,
    SKIP_THOUGHT_SIGNATURE,
} from "./Message.service";

import { processGeminiLocalSdkResponse } from "./GeminiResponseProcessor.service";
import { extractTextAndThinkingFromResponse } from "../utils/chatHistoryBuilder";
import { buildDynamicGroupChatRosterSystemPrompt, buildSpeakerToneExamplesSystemPrompt } from "../utils/chatHistory";
import { constructGeminiChatHistoryForGroupChat } from "../utils/groupChatHistory";
import { extractMentionedParticipantIds } from "../utils/mentions";
import * as typingService from "./GroupChatTyping.service";

export interface DynamicInputArgs {
    msg: string;
    attachmentFiles: FileList;
    isInternetSearchEnabled: boolean;
    isPremiumEndpointPreferred: boolean;
    shouldEnforceThoughtSignaturesInHistory: boolean;
}

type ChatId = number;

const isDevEnvironment = ["localhost", "127.0.0.1", "::1", "192.168.1.1"].includes(window.location.hostname);

function debugLogDynamic(label: string, details?: Record<string, unknown>): void {
    if (!isDevEnvironment) return;
    if (details) {
        // eslint-disable-next-line no-console
        console.log(`[DynamicGroupChat] ${label}`, details);
    } else {
        // eslint-disable-next-line no-console
        console.log(`[DynamicGroupChat] ${label}`);
    }
}

const inFlightByChatId = new Map<ChatId, Set<string>>();
const countSinceUserByChatId = new Map<ChatId, Map<string, number>>();

function getInFlight(chatId: ChatId): Set<string> {
    let set = inFlightByChatId.get(chatId);
    if (!set) {
        set = new Set();
        inFlightByChatId.set(chatId, set);
    }
    return set;
}

function getCounts(chatId: ChatId): Map<string, number> {
    let map = countSinceUserByChatId.get(chatId);
    if (!map) {
        map = new Map();
        countSinceUserByChatId.set(chatId, map);
    }
    return map;
}

function resetCountsForChat(chatId: ChatId): void {
    countSinceUserByChatId.set(chatId, new Map());
}

function incrementPersonaCount(chatId: ChatId, personaId: string): number {
    const counts = getCounts(chatId);
    const next = (counts.get(personaId) ?? 0) + 1;
    counts.set(personaId, next);
    return next;
}

function getPersonaCount(chatId: ChatId, personaId: string): number {
    return getCounts(chatId).get(personaId) ?? 0;
}

function shouldRespondGivenIndependence(independence: number): boolean {
    const clamped = Math.max(0, Math.min(3, Math.trunc(independence)));
    const chanceByInd: Record<number, number> = { 0: 0.9, 1: 0.7, 2: 0.5, 3: 0.3 };
    const chance = chanceByInd[clamped] ?? 0.5;
    const roll = Math.random();
    const decision = roll < chance;
    debugLogDynamic("Independence roll", { independence, clamped, chance, roll, decision });
    return decision;
}

async function appendMessageToChat(args: {
    chatId: ChatId;
    message: Message;
}): Promise<{ index: number; chat: DbChat } | null> {
    const { chatId, message } = args;
    return await db.transaction("rw", db.chats, async () => {
        const chat = await db.chats.get(chatId);
        if (!chat) return null;
        const index = chat.content.length;
        chat.content.push(message);
        chat.lastModified = new Date();
        await db.chats.put(chat);
        return { index, chat };
    });
}

async function refreshAfterActivity(chatId: ChatId): Promise<void> {
    const current = chatsService.getCurrentChatId();
    if (current === chatId) {
        // Keep UI in sync with any derived sidebar values
        await chatsService.refreshChatListAfterActivity(db);
    } else {
        await chatsService.refreshChatListAfterActivity(db);
    }
}

async function insertIfCurrent(chatId: ChatId, message: Message, index: number): Promise<HTMLElement | null> {
    const current = chatsService.getCurrentChatId();
    if (current !== chatId) {
        return null;
    }

    const elm = await insertMessage(message, index);
    hljs.highlightAll();
    helpers.messageContainerScrollToBottom(true);
    return elm;
}

async function loadDynamicContext(args: {
    chatId: ChatId;
    shouldEnforceThoughtSignaturesInHistory: boolean;
}): Promise<{
    chat: DbChat;
    participants: string[];
    maxMessageGuardById: Record<string, number> | undefined;
    allowPings: boolean;
    participantPersonas: DbPersonality[];
    speakerNameById: Map<string, string>;
    userName: string;
    rosterSystemPrompt: string;
} | null> {
    const chat = await db.chats.get(args.chatId);
    if (!chat || chat.groupChat?.mode !== "dynamic") {
        return null;
    }

    const participants: string[] = Array.isArray(chat.groupChat.participantIds)
        ? chat.groupChat.participantIds.map(v => String(v))
        : [];

    const maxMessageGuardById = chat.groupChat.dynamic?.maxMessageGuardById;
    const allowPings = !!chat.groupChat.dynamic?.allowPings;

    const participantPersonas: DbPersonality[] = [];
    const speakerNameById = new Map<string, string>();
    for (const id of participants) {
        const persona = await personalityService.get(id);
        const resolved = (persona || personalityService.getDefault()) as DbPersonality;
        participantPersonas.push(resolved);
        speakerNameById.set(String(id), String(resolved.name || "Unknown"));
    }

    const profile = await getUserProfile();
    const userName = (profile?.preferredName || "User").toString();

    const rosterSystemPrompt = buildDynamicGroupChatRosterSystemPrompt({
        participantPersonas,
        userName,
        allowPings,
    });

    return {
        chat,
        participants,
        maxMessageGuardById,
        allowPings,
        participantPersonas,
        speakerNameById,
        userName,
        rosterSystemPrompt,
    };
}

async function triggerResponses(args: {
    chatId: ChatId;
    senderId: "user" | string;
    triggeringText: string;
    isPremiumEndpointPreferred: boolean;
    isInternetSearchEnabled: boolean;
    shouldEnforceThoughtSignaturesInHistory: boolean;
}): Promise<void> {
    const ctx = await loadDynamicContext({ chatId: args.chatId, shouldEnforceThoughtSignaturesInHistory: args.shouldEnforceThoughtSignaturesInHistory });
    if (!ctx) return;

    const { chat, participants, maxMessageGuardById, allowPings, participantPersonas, speakerNameById, userName, rosterSystemPrompt } = ctx;

    const forcedIds = allowPings
        ? extractMentionedParticipantIds(args.triggeringText, participants)
        : [];

    const selected: DbPersonality[] = [];
    const inFlight = getInFlight(args.chatId);

    for (const persona of participantPersonas) {
        const personaId = String(persona.id);
        const personaName = String(persona.name || "Unknown");
        if (personaId === args.senderId) continue;
        if (!participants.includes(personaId)) continue;
        if (inFlight.has(personaId)) continue;

        const guard = resolveGuardForPersona(chat.groupChat?.dynamic ?? { maxMessageGuardById }, personaId);

        const count = getPersonaCount(args.chatId, personaId);
        if (count >= guard) continue;

        const isForced = forcedIds.includes(personaId);
        const independence = Math.max(0, Math.min(3, Math.trunc(Number((persona as any)?.independence ?? 0))));
        debugLogDynamic("Persona decision", {
            personaId,
            personaName,
            forced: isForced,
            independence,
            inFlight: inFlight.has(personaId),
            messagesSinceUser: count,
            maxMessageGuard: guard,
        });

        if (!isForced) {
            if (!shouldRespondGivenIndependence(independence)) {
                debugLogDynamic("Persona skipped by independence roll", { personaId, personaName, independence });
                continue;
            }
        }

        debugLogDynamic("Persona selected to respond", { personaId, personaName });
        selected.push(persona);
    }

    for (const persona of selected) {
        void respondAsPersona({
            chatId: args.chatId,
            persona,
            participants,
            speakerNameById,
            userName,
            rosterSystemPrompt,
            isPremiumEndpointPreferred: args.isPremiumEndpointPreferred,
            isInternetSearchEnabled: args.isInternetSearchEnabled,
            shouldEnforceThoughtSignaturesInHistory: args.shouldEnforceThoughtSignaturesInHistory,
        }).catch((err) => {
            console.error("DynamicGroupChat: persona response failed", err);
        });
    }
}

async function respondAsPersona(args: {
    chatId: ChatId;
    persona: DbPersonality;
    participants: string[];
    speakerNameById: Map<string, string>;
    userName: string;
    rosterSystemPrompt: string;
    isPremiumEndpointPreferred: boolean;
    isInternetSearchEnabled: boolean;
    shouldEnforceThoughtSignaturesInHistory: boolean;
}): Promise<void> {
    const personaId = String(args.persona.id);

    // If we successfully persisted a response, trigger a follow-up wave after
    // we clear in-flight state. This avoids a race where the next wave is
    // evaluated while the just-finished persona is still marked in-flight.
    let cascadeText: string | null = null;

    const inFlight = getInFlight(args.chatId);
    if (inFlight.has(personaId)) return;

    inFlight.add(personaId);
    typingService.startTyping(args.chatId, personaId);

    try {
        const settings = settingsService.getSettings();

        const freshChat = await db.chats.get(args.chatId);
        if (!freshChat) return;

        const { history, pinnedHistoryIndices } = await constructGeminiChatHistoryForGroupChat(freshChat, {
            speakerNameById: args.speakerNameById,
            userName: args.userName,
            enforceThoughtSignatures: args.shouldEnforceThoughtSignaturesInHistory,
            skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE,
        });

        const speakerName = args.speakerNameById.get(personaId) ?? args.persona.name ?? "Unknown";
        const tonePrompt = buildSpeakerToneExamplesSystemPrompt({
            speakerName: String(speakerName),
            toneExamples: Array.isArray(args.persona.toneExamples) ? args.persona.toneExamples : [],
        });

        const systemInstructionText = ((await settingsService.getSystemPrompt("dynamic")).parts?.[0].text ?? "") + args.rosterSystemPrompt + tonePrompt;

        const instruction = `<system>You are participating in a dynamic group chat.\n` +
            `Reply naturally as ${speakerName}.\n` +
            `Write ONLY the message content (no speaker prefix like \"${speakerName}:\").\n` +
            `</system>`;

        let resultText = "";
        let resultThinking = "";
        let thoughtSignature: string | undefined;

        if (args.isPremiumEndpointPreferred) {
            const payloadSettings: PremiumEndpoint.RequestSettings = {
                model: settings.model,
                streamResponses: false,
                maxOutputTokens: parseInt(settings.maxTokens),
                temperature: parseInt(settings.temperature) / 100,
                systemInstruction: { parts: [{ text: systemInstructionText }] } as Content,
                safetySettings: settings.safetySettings,
                responseMimeType: "text/plain",
                tools: args.isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined,
                thinkingConfig: generateThinkingConfig(settings.model, settings.enableThinking, settings),
            } as any;

            const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: instruction,
                    settings: payloadSettings,
                    history,
                    pinnedHistoryIndices,
                } satisfies PremiumEndpoint.Request),
            });

            if (!res.ok) {
                throw new Error(`Edge function error: ${res.status}`);
            }

            const json = await res.json();
            const extracted = extractTextAndThinkingFromResponse(json as GenerateContentResponse);
            resultText = extracted.text;
            resultThinking = extracted.thinking;
        } else {
            const ai = new GoogleGenAI({ apiKey: settings.apiKey });
            const config: GenerateContentConfig = {
                maxOutputTokens: parseInt(settings.maxTokens),
                temperature: parseInt(settings.temperature) / 100,
                systemInstruction: { parts: [{ text: systemInstructionText }] } as Content,
                safetySettings: settings.safetySettings,
                responseMimeType: "text/plain",
                tools: args.isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined,
                thinkingConfig: generateThinkingConfig(settings.model, settings.enableThinking, settings),
            } as any;

            const chat = ai.chats.create({ model: settings.model, history, config });
            const response = await chat.sendMessage({ message: [{ text: instruction }] });
            const processed = await processGeminiLocalSdkResponse({
                response,
                process: {
                    includeThoughts: !!config.thinkingConfig?.includeThoughts,
                    useSkipThoughtSignature: false,
                    skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE,
                    abortMode: "throw",
                    throwOnBlocked: false,
                },
            });

            resultText = processed.text;
            resultThinking = processed.thinking;
            thoughtSignature = processed.textSignature;

            if (
                processed.finishReason === FinishReason.PROHIBITED_CONTENT ||
                processed.finishReason === FinishReason.OTHER ||
                processed.finishReason === BlockedReason.PROHIBITED_CONTENT
            ) {
                showGeminiProhibitedContentToast({ finishReason: processed.finishReason });
            }
        }

        const trimmed = (resultText ?? "").toString().trim();
        if (!trimmed) {
            return;
        }

        const modelMessage: Message = {
            role: "model",
            personalityid: personaId,
            parts: [{ text: trimmed, thoughtSignature }],
            thinking: resultThinking?.trim() ? resultThinking : undefined,
        };

        // Persist + insert
        const appended = await appendMessageToChat({ chatId: args.chatId, message: modelMessage });
        if (!appended) return;
        await insertIfCurrent(args.chatId, modelMessage, appended.index);
        await refreshAfterActivity(args.chatId);

        incrementPersonaCount(args.chatId, personaId);

        cascadeText = trimmed;

    } finally {
        typingService.stopTyping(args.chatId, personaId);
        getInFlight(args.chatId).delete(personaId);
    }

    if (cascadeText) {
        debugLogDynamic("Cascade triggered", { fromPersonaId: personaId, text: cascadeText.slice(0, 80) });
        void triggerResponses({
            chatId: args.chatId,
            senderId: personaId,
            triggeringText: cascadeText,
            isPremiumEndpointPreferred: args.isPremiumEndpointPreferred,
            isInternetSearchEnabled: args.isInternetSearchEnabled,
            shouldEnforceThoughtSignaturesInHistory: args.shouldEnforceThoughtSignaturesInHistory,
        });
    }
}

export async function sendGroupChatDynamic(args: DynamicInputArgs): Promise<HTMLElement | undefined> {
    const currentChat = await chatsService.getCurrentChat(db);
    if (!currentChat || currentChat.groupChat?.mode !== "dynamic") {
        return;
    }

    const chatId = (currentChat as any).id as number;
    if (!Number.isFinite(chatId)) {
        return;
    }

    const trimmed = (args.msg ?? "").toString();
    const hasFiles = (args.attachmentFiles?.length ?? 0) > 0;
    if (trimmed.trim().length === 0 && !hasFiles) {
        return;
    }

    // Reset per-persona counters on user interaction.
    resetCountsForChat(chatId);

    const userMessage: Message = { role: "user", parts: [{ text: trimmed, attachments: args.attachmentFiles }] };
    const appended = await appendMessageToChat({ chatId, message: userMessage });
    if (!appended) {
        warn({ title: "Error", text: "Unable to append user message." });
        return;
    }

    const userElm = await insertIfCurrent(chatId, userMessage, appended.index);
    await refreshAfterActivity(chatId);

    // Trigger initial response wave.
    void triggerResponses({
        chatId,
        senderId: "user",
        triggeringText: trimmed,
        isPremiumEndpointPreferred: args.isPremiumEndpointPreferred,
        isInternetSearchEnabled: args.isInternetSearchEnabled,
        shouldEnforceThoughtSignaturesInHistory: args.shouldEnforceThoughtSignaturesInHistory,
    });

    return userElm ?? undefined;
}

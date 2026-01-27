/**
 * RPG Group Chat implementation.
 * Handles turn-based group chat with multiple AI personas and optional narrator.
 *
 * This is an internal module used by Message.service.ts - not a standalone service.
 */

import { Content, GenerateContentConfig, GenerateContentResponse, GoogleGenAI } from "@google/genai";
import hljs from "highlight.js";

import type { Message } from "../types/Message";
import type { DbChat } from "../types/Chat";
import type { DbPersonality } from "../types/Personality";
import { ChatModel } from "../types/Models";
import { PremiumEndpoint } from "../types/PremiumEndpoint";
import type {
    GroupChatParticipantPersona,
    RpgContext,
    ParticipantMeta,
    NarratorMode,
    GroupTurnDecision,
} from "../types/GroupChat";
import type { TextAndThinking } from "../types/Message";

import * as settingsService from "./Settings.service";
import * as personalityService from "./Personality.service";
import * as chatsService from "./Chats.service";
import * as helpers from "../utils/helpers";
import { db } from "./Db.service";
import { SUPABASE_URL, getAuthHeaders, getUserProfile } from "./Supabase.service";
import { parseMarkdownToHtml } from "./Parser.service";
import { messageElement } from "../components/dynamic/message";

import { isGeminiBlockedFinishReason, throwGeminiBlocked, processGeminiLocalSdkStream, processGeminiLocalSdkResponse } from "./GeminiResponseProcessor.service";
import { processPremiumEndpointSse } from "./PremiumEndpointResponseProcessor.service";

import {
    NARRATOR_PERSONALITY_ID,
    isPersonalityMarker,
    isLegacyPersonalityIntro,
} from "../utils/personalityMarkers";

import {
    buildGroupChatRosterSystemPrompt,
    buildSpeakerToneExamplesSystemPrompt,
    stripLeadingSpeakerPrefix,
    maybePrefixSpeaker,
} from "../utils/chatHistory";

import {
    findLastGeneratedImageIndex,
    findLastAttachmentIndex,
    processAttachmentsToParts,
    processGeneratedImagesToParts,
    extractTextAndThinkingFromResponse,
} from "../utils/chatHistoryBuilder";

import { throwAbortError } from "../utils/abort";
import { dispatchAppEvent } from "../events";

import {
    startGeneration,
    endGeneration,
    insertMessage,
    persistMessages,
    createModelPlaceholderMessage,
    createModelErrorMessage,
    showGeminiProhibitedContentToast,
    generateThinkingConfig,
    ensureThinkingUiOnMessageElement,
    SKIP_THOUGHT_SIGNATURE_VALIDATOR,
} from "./Message.service";

// ================================================================================
// CONSTANTS
// ================================================================================

export const USER_SKIP_TURN_MARKER_TEXT = "__user_skip_turn__";
const AI_SKIP_TURN_MARKER_TEXT = "__ai_skip_turn__";

const GROUP_TURN_DECISION_SCHEMA: any = {
    type: "object",
    additionalProperties: false,
    properties: {
        kind: {
            type: "string",
            enum: ["reply", "skip"],
            description: "Whether the participant replies this turn or skips."
        },
        text: {
            type: ["string", "null"],
            description: "If kind is 'reply', the message text to send. Otherwise null."
        }
    },
    required: ["kind", "text"],
};

// ================================================================================
// PUBLIC API
// ================================================================================

export interface RpgInputArgs {
    msg: string;
    attachmentFiles: FileList;
    isInternetSearchEnabled: boolean;
    isPremiumEndpointPreferred: boolean;
    skipTurn: boolean;
}

export async function sendGroupChatRpg(args: RpgInputArgs): Promise<HTMLElement | undefined> {
    const ctx = await buildRpgContext(args);
    if (!ctx) return;

    const { abortController: currentAbortController, currentRoundIndex, narratorEnabled } = ctx;

    // Narrator before first round
    if (narratorEnabled && !currentAbortController?.signal.aborted) {
        await handleNarratorBeforeFirst(ctx);
    }

    // Refresh working chat
    let workingChat = await chatsService.getCurrentChat(db);
    if (!workingChat) {
        endGeneration();
        return;
    }
    ctx.workingChat = workingChat;

    let userElm: HTMLElement | undefined = undefined;

    // Insert user message if provided
    if (args.msg) {
        userElm = await insertUserMessage(ctx);
        if (!userElm) {
            endGeneration();
            return;
        }
    }

    // Calculate next participants
    const { nextParticipants, stoppedForUser, startsNewRound, nextSpeakerId } = calculateNextParticipants(ctx);

    // Build metadata for participants
    const participantMeta = await buildParticipantMeta(nextParticipants);

    // Execute AI turns
    for (const meta of participantMeta) {
        if (currentAbortController?.signal.aborted) {
            endGeneration();
            return userElm;
        }

        // 5% chance of mid-round narrator interjection
        if (narratorEnabled && Math.random() < 0.05) {
            await handleNarratorInterjection(ctx);
        }

        const result = await executeParticipantTurn({ ctx, meta, participantMeta });

        if (!result.continueLoop) {
            endGeneration();
            return userElm;
        }

        ctx.workingChat = (await chatsService.getCurrentChat(db))!;
    }

    // Narrator after round: only when the round actually completes
    // (i.e. after the last participant speaks and the next turn would start a new round).
    const userCompletedTurn = !!args.msg || !!args.skipTurn;
    if (narratorEnabled && startsNewRound && !currentAbortController?.signal.aborted) {
        await handleNarratorAfterRound(ctx);
    }

    // Dispatch round state for UI
    dispatchRoundState({ userCompletedTurn, currentRoundIndex, stoppedForUser, startsNewRound, nextSpeakerId });

    endGeneration();
    return userElm;
}

// ================================================================================
// CONTEXT BUILDING
// ================================================================================

async function buildRpgContext(args: RpgInputArgs): Promise<RpgContext | null> {
    const settings = settingsService.getSettings();
    const shouldEnforceThoughtSignaturesInHistory = settings.model === ChatModel.NANO_BANANA_PRO;

    let workingChat = await chatsService.getCurrentChat(db);
    if (!workingChat) {
        console.error("Group chat send called without an active chat");
        return null;
    }

    const groupChat = (workingChat as any).groupChat as any;
    const rpg = groupChat?.rpg as any;
    const turnOrder: string[] = Array.isArray(rpg?.turnOrder) ? rpg.turnOrder : [];
    const scenarioPrompt: string = (rpg?.scenarioPrompt ?? "").toString();
    const narratorEnabled: boolean = !!rpg?.narratorEnabled;
    const participants: string[] = Array.isArray(groupChat?.participantIds) ? groupChat.participantIds : [];

    const effectiveOrder = buildEffectiveTurnOrder({ participants, turnOrder });
    const currentRoundIndex = calculateCurrentRoundIndex(workingChat, effectiveOrder);

    // Handle skip turn marker persistence
    if (args.skipTurn && !args.msg) {
        const updatedChat = await persistSkipTurnMarkerIfNeeded(workingChat, currentRoundIndex);
        if (!updatedChat) return null;
        workingChat = updatedChat;
    }

    const abortController = startGeneration();
    const userName = await getUserDisplayName();
    const { participantPersonas, speakerNameById } = await buildParticipantData(participants);
    const allParticipantNames = participantPersonas.map(p => p.name);

    const rosterSystemPrompt = buildGroupChatRosterSystemPrompt({
        participantPersonas,
        userName,
        scenarioPrompt,
        narratorEnabled,
    });

    return {
        msg: args.msg,
        attachmentFiles: args.attachmentFiles,
        isInternetSearchEnabled: args.isInternetSearchEnabled,
        isPremiumEndpointPreferred: args.isPremiumEndpointPreferred,
        skipTurn: !!args.skipTurn,
        settings,
        shouldEnforceThoughtSignaturesInHistory,
        workingChat,
        currentRoundIndex,
        turnOrder,
        scenarioPrompt,
        narratorEnabled,
        participants,
        participantPersonas,
        speakerNameById,
        allParticipantNames,
        userName,
        rosterSystemPrompt,
        abortController,
    };
}

function calculateCurrentRoundIndex(chat: DbChat, effectiveOrder: string[]): number {
    const chatContent = chat?.content ?? [];
    const roundIndices = chatContent
        .filter(m => typeof m.roundIndex === "number")
        .map(m => m.roundIndex as number);

    if (roundIndices.length === 0) return 1;

    const maxRoundIndex = Math.max(...roundIndices);

    const anyNonNarratorTurnInMaxRound = chatContent.some(m => {
        if (!m || m.roundIndex !== maxRoundIndex) return false;
        if (isPersonalityMarker(m)) return false;
        if (isLegacyPersonalityIntro(m)) return false;

        if (isUserSkipTurnMarker(m as Message)) return true;

        if (m.hidden) return false;

        if (m.role === "user") return true;
        if (m.role === "model" && m.personalityid === NARRATOR_PERSONALITY_ID) return false;
        return typeof m.personalityid === "string";
    });

    if (!anyNonNarratorTurnInMaxRound) return maxRoundIndex;

    const lastTurnMessageInMaxRound = (() => {
        for (let i = chatContent.length - 1; i >= 0; i--) {
            const candidate = chatContent[i];
            if (!candidate || candidate.roundIndex !== maxRoundIndex) continue;
            if (isPersonalityMarker(candidate)) continue;
            if (isLegacyPersonalityIntro(candidate)) continue;
            if (candidate.role === "model" && candidate.personalityid === NARRATOR_PERSONALITY_ID) continue;
            if (candidate.hidden && !isUserSkipTurnMarker(candidate as Message) && !isAiSkipTurnMarker(candidate as Message)) continue;
            return candidate;
        }
        return undefined;
    })();

    if (!lastTurnMessageInMaxRound) return maxRoundIndex;

    const lastSpeakerId = isUserSkipTurnMarker(lastTurnMessageInMaxRound as Message)
        ? "user"
        : lastTurnMessageInMaxRound.role === "user"
            ? "user"
            : lastTurnMessageInMaxRound.personalityid;

    const lastSpeakerIndex = effectiveOrder.indexOf(String(lastSpeakerId));
    if (lastSpeakerIndex === -1) return maxRoundIndex;

    const userIndex = effectiveOrder.indexOf("user");
    if (userIndex === -1) return maxRoundIndex;

    const nextIndex = (lastSpeakerIndex + 1) % effectiveOrder.length;
    const nextSpeaker = effectiveOrder[nextIndex];

    // A new round begins when the turn order cycles back to the start.
    // This keeps the user's message and the following AI replies grouped
    // under the same round, regardless of where "user" appears in the order.
    return nextSpeaker === effectiveOrder[0] ? maxRoundIndex + 1 : maxRoundIndex;
}

function buildEffectiveTurnOrder(args: { participants: string[]; turnOrder: string[] }): string[] {
    // Important: ensure a stable, cycle-based order.
    // If the UI saved a turnOrder array, it may start at an arbitrary offset.
    // For round/block rollover we treat args.participants[0] as the canonical
    // start-of-round marker.
    const base = args.turnOrder.length > 0 ? args.turnOrder : [...args.participants, "user"];
    const withUser = base.includes("user") ? base : [...base, "user"];

    const canonicalStart = args.participants[0];
    if (!canonicalStart) return withUser;

    const startIndex = withUser.indexOf(canonicalStart);
    if (startIndex <= 0) return withUser;

    return [...withUser.slice(startIndex), ...withUser.slice(0, startIndex)];
}

async function persistSkipTurnMarkerIfNeeded(chat: DbChat, currentRoundIndex: number): Promise<DbChat | null> {
    const chatContent = chat?.content ?? [];
    const hasSkipMarkerForRound = chatContent.some((m: Message) => {
        if (!m || m.role !== "user" || !m.hidden || m.roundIndex !== currentRoundIndex) return false;
        const parts = Array.isArray(m.parts) ? m.parts : [];
        return parts.some((p: any) => (p?.text ?? "").toString() === USER_SKIP_TURN_MARKER_TEXT);
    });

    if (!hasSkipMarkerForRound) {
        const skipMarker: Message = {
            role: "user",
            hidden: true,
            roundIndex: currentRoundIndex,
            parts: [{ text: USER_SKIP_TURN_MARKER_TEXT }],
        };
        await persistMessages([skipMarker]);
        return (await chatsService.getCurrentChat(db)) ?? null;
    }

    return chat;
}

async function getUserDisplayName(): Promise<string> {
    try {
        const userProfile = await getUserProfile();
        return userProfile?.preferredName || "User";
    } catch {
        return "User";
    }
}

async function buildParticipantData(participants: string[]): Promise<{
    participantPersonas: GroupChatParticipantPersona[];
    speakerNameById: Map<string, string>;
}> {
    const participantPersonas: GroupChatParticipantPersona[] = [];
    const speakerNameById = new Map<string, string>();
    speakerNameById.set(NARRATOR_PERSONALITY_ID, "Narrator");

    for (const personaId of participants) {
        const persona = await personalityService.get(personaId);
        const name = (persona?.name || "Unknown").toString();
        speakerNameById.set(personaId, name);
        participantPersonas.push({
            id: personaId,
            name,
            description: (persona?.description ?? "").toString(),
            prompt: (persona?.prompt ?? "").toString(),
            aggressiveness: Number((persona as any)?.aggressiveness ?? 0),
            sensuality: Number((persona as any)?.sensuality ?? 0),
            independence: Number((persona as any)?.independence ?? 0),
        });
    }

    return { participantPersonas, speakerNameById };
}

// ================================================================================
// TURN CALCULATION
// ================================================================================

function calculateNextParticipants(ctx: RpgContext): {
    nextParticipants: string[];
    stoppedForUser: boolean;
    startsNewRound: boolean;
    nextSpeakerId?: string;
} {
    const effectiveOrder = buildEffectiveTurnOrder({ participants: ctx.participants, turnOrder: ctx.turnOrder });
    const startIndex = calculateLastSpeakerIndex(ctx, effectiveOrder);
    const shouldAutoProgress = !!ctx.settings?.rpgGroupChatsProgressAutomatically;

    // Treat an AI skip as a completed turn when deciding who speaks next.
    // Otherwise we keep scheduling the same participant again.
    const lastTurnWasAiSkip = didLastTurnSkip(ctx, effectiveOrder);

    const nextParticipants: string[] = [];
    let stoppedForUser = false;
    let startsNewRound = false;

    if (effectiveOrder.length === 0) return { nextParticipants, stoppedForUser, startsNewRound };

    // Manual mode: after the user acts, we pause immediately (no AI auto-run).
    // The next speaker is the one immediately after the user's message/skip.
    if (!shouldAutoProgress && (ctx.msg || ctx.skipTurn)) {
        const nextIndex = (startIndex + 1 + effectiveOrder.length) % effectiveOrder.length;
        const nextId = effectiveOrder[nextIndex];

        stoppedForUser = nextId === "user";
        startsNewRound = nextId === effectiveOrder[0];
        return { nextParticipants, stoppedForUser, startsNewRound, nextSpeakerId: nextId };
    }

    // Auto-progress: run forward through the CURRENT round only.
    if (shouldAutoProgress) {
        // If the last executed turn was a skip marker, start from that speaker,
        // so we can correctly advance to the next participant.
        const firstIndex = startIndex < 0 ? 0 : startIndex + (lastTurnWasAiSkip ? 2 : 1);
        for (let idx = firstIndex; idx < effectiveOrder.length; idx++) {
            const id = effectiveOrder[idx];
            if (id === "user") {
                stoppedForUser = true;
                break;
            }
            nextParticipants.push(id);
        }

        // Calculate who is next AFTER the scheduled participants
        const lastScheduledIndex = nextParticipants.length > 0 
            ? effectiveOrder.indexOf(nextParticipants[nextParticipants.length - 1])
            : startIndex;
        const nextIndex = (lastScheduledIndex + 1) % effectiveOrder.length;
        const nextId = effectiveOrder[nextIndex];

        startsNewRound = !stoppedForUser;
        return { nextParticipants, stoppedForUser, startsNewRound, nextSpeakerId: nextId };
    }

    // Manual mode (continue pressed): execute exactly one AI turn, then pause.
    const startOffset = lastTurnWasAiSkip ? 2 : 1;
    const nextIndex = (startIndex + startOffset + effectiveOrder.length) % effectiveOrder.length;
    const nextId = effectiveOrder[nextIndex];
    const afterNextIndex = (nextIndex + 1) % effectiveOrder.length;
    const afterNextId = effectiveOrder[afterNextIndex];

    if (nextId === "user") {
        stoppedForUser = true;
        startsNewRound = nextId === effectiveOrder[0];
        return { nextParticipants, stoppedForUser, startsNewRound, nextSpeakerId: nextId };
    } else {
        nextParticipants.push(nextId);
        stoppedForUser = afterNextId === "user";
        startsNewRound = afterNextId === effectiveOrder[0];
        return { nextParticipants, stoppedForUser, startsNewRound, nextSpeakerId: afterNextId };
    }
}

function didLastTurnSkip(ctx: RpgContext, effectiveOrder: string[]): boolean {
    const content = ctx.workingChat?.content ?? [];

    for (let i = content.length - 1; i >= 0; i--) {
        const candidate = content[i];
        if (!candidate || candidate.roundIndex !== ctx.currentRoundIndex) continue;
        if (isPersonalityMarker(candidate)) continue;
        if (isLegacyPersonalityIntro(candidate)) continue;

        // We only care about the AI skip marker here.
        if (isAiSkipTurnMarker(candidate as Message)) return true;

        // If we hit a normal (non-hidden) turn message first, then it's not a skip.
        if (!candidate.hidden) return false;

        // Ignore other hidden messages.
        continue;
    }

    return false;
}

function calculateLastSpeakerIndex(ctx: RpgContext, effectiveOrder: string[]): number {
    const content = ctx.workingChat?.content ?? [];

    const currentRoundHasAnyTurnMessages = content.some(m => {
        if (!m || m.roundIndex !== ctx.currentRoundIndex) return false;
        if (isPersonalityMarker(m)) return false;
        if (isLegacyPersonalityIntro(m)) return false;
        if (isAnySkipTurnMarker(m as Message)) return true;
        if (m.hidden) return false;
        if (m.role === "user") return true;
        return typeof m.personalityid === "string" && m.personalityid !== NARRATOR_PERSONALITY_ID;
    });

    if (!currentRoundHasAnyTurnMessages) return -1;

    const lastTurnMessageInRound = (() => {
        for (let i = content.length - 1; i >= 0; i--) {
            const candidate = content[i];
            if (!candidate || candidate.roundIndex !== ctx.currentRoundIndex) continue;
            if (isPersonalityMarker(candidate)) continue;
            if (isLegacyPersonalityIntro(candidate)) continue;
            if (candidate.role === "model" && candidate.personalityid === NARRATOR_PERSONALITY_ID) continue;
            if (candidate.hidden && !isUserSkipTurnMarker(candidate as Message) && !isAiSkipTurnMarker(candidate as Message)) continue;
            return candidate;
        }
        return undefined;
    })();

    if (lastTurnMessageInRound) {
        const lastSpeakerId = isAnySkipTurnMarker(lastTurnMessageInRound as Message)
            ? (isUserSkipTurnMarker(lastTurnMessageInRound as Message) ? "user" : lastTurnMessageInRound.personalityid)
            : lastTurnMessageInRound.role === "user"
                ? "user"
                : lastTurnMessageInRound.personalityid;
        const lastSpeakerIndex = effectiveOrder.indexOf(String(lastSpeakerId));
        return lastSpeakerIndex !== -1 ? lastSpeakerIndex : -1;
    }

    return -1;
}

function isUserSkipTurnMarker(message: Message): boolean {
    if (!message || message.role !== "user" || !message.hidden) return false;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts.some((part: any) => (part?.text ?? "").toString() === USER_SKIP_TURN_MARKER_TEXT);
}

function isAiSkipTurnMarker(message: Message): boolean {
    if (!message || message.role !== "model" || !message.hidden) return false;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts.some((part: any) => (part?.text ?? "").toString() === AI_SKIP_TURN_MARKER_TEXT);
}

function isAnySkipTurnMarker(message: Message): boolean {
    return isUserSkipTurnMarker(message) || isAiSkipTurnMarker(message);
}

async function persistAiSkipTurnMarker(args: { personaId: string; currentRoundIndex: number }): Promise<void> {
    const chat = await chatsService.getCurrentChat(db);
    const chatContent = chat?.content ?? [];

    const hasSkipMarkerForRound = chatContent.some((m: Message) => {
        if (!m || m.role !== "model" || !m.hidden || m.roundIndex !== args.currentRoundIndex) return false;
        if (m.personalityid !== args.personaId) return false;
        const parts = Array.isArray(m.parts) ? m.parts : [];
        return parts.some((p: any) => (p?.text ?? "").toString() === AI_SKIP_TURN_MARKER_TEXT);
    });

    if (hasSkipMarkerForRound) return;

    const skipMarker: Message = {
        role: "model",
        personalityid: args.personaId,
        hidden: true,
        roundIndex: args.currentRoundIndex,
        parts: [{ text: AI_SKIP_TURN_MARKER_TEXT }],
    };

    await persistMessages([skipMarker]);
}

async function buildParticipantMeta(participantIds: string[]): Promise<ParticipantMeta[]> {
    const meta: ParticipantMeta[] = [];
    for (const personaId of participantIds) {
        const persona = await personalityService.get(personaId);
        meta.push({
            id: personaId,
            name: persona?.name || "Unknown",
            independence: Math.max(0, Math.min(3, Number((persona as any)?.independence ?? 0))),
        });
    }
    return meta;
}

// ================================================================================
// USER MESSAGE INSERTION
// ================================================================================

async function insertUserMessage(ctx: RpgContext): Promise<HTMLElement | undefined> {
    const userMessage: Message = {
        role: "user",
        parts: [{ text: ctx.msg, attachments: ctx.attachmentFiles }],
        roundIndex: ctx.currentRoundIndex,
    };

    const userIndex = ctx.workingChat.content.length;
    const userElm = await insertMessage(userMessage, userIndex);
    await persistMessages([userMessage]);

    const updatedChat = await chatsService.getCurrentChat(db);
    if (!updatedChat) return undefined;
    ctx.workingChat = updatedChat;

    hljs.highlightAll();
    helpers.messageContainerScrollToBottom(true);

    return userElm;
}

// ================================================================================
// TURN EXECUTION
// ================================================================================

async function executeParticipantTurn(args: {
    ctx: RpgContext;
    meta: ParticipantMeta;
    participantMeta: ParticipantMeta[];
}): Promise<{ continueLoop: boolean; error?: Error }> {
    const { ctx, meta, participantMeta } = args;
    const { settings, abortController: currentAbortController, currentRoundIndex } = ctx;

    if (currentAbortController?.signal.aborted) {
        return { continueLoop: false };
    }

    const persona = await personalityService.get(meta.id);
    const toneExamplesForSpeaker = Array.isArray((persona as any)?.toneExamples)
        ? ((persona as any).toneExamples as unknown[]).map(v => (v ?? "").toString()).filter(v => v.trim().length > 0)
        : [];
    const speakerToneSystemPrompt = buildSpeakerToneExamplesSystemPrompt({
        speakerName: meta.name,
        toneExamples: toneExamplesForSpeaker,
    });

    const chatSnapshot = await chatsService.getCurrentChat(db);
    if (!chatSnapshot) return { continueLoop: false };

    const { history } = await constructGeminiChatHistoryForGroupChatRpg(
        chatSnapshot,
        {
            speakerNameById: ctx.speakerNameById,
            userName: ctx.userName,
            enforceThoughtSignatures: ctx.shouldEnforceThoughtSignaturesInHistory,
        }
    );

    const useIndependentAction = shouldTriggerIndependentAction(meta.independence);
    const participantsLine = participantMeta.map(p => `${p.name} (${p.id})`).join(", ");
    const turnInstruction = buildTurnInstruction({ participantsLine, speakerName: meta.name, useIndependentAction });

    const placeholderIndex = (await chatsService.getCurrentChat(db))?.content.length ?? -1;
    const placeholderElm = placeholderIndex >= 0
        ? await insertMessage(createModelPlaceholderMessage(meta.id, "", currentRoundIndex), placeholderIndex)
        : undefined;
    helpers.messageContainerScrollToBottom(true);

    let raw = "";
    let turnThinking = "";

    try {
        if (ctx.isPremiumEndpointPreferred) {
            const result = await executeTurnPremium({
                ctx, meta, history, turnInstruction, speakerToneSystemPrompt, placeholderElm,
                onRawUpdate: (text) => { raw = text; },
                onThinkingUpdate: (thinking) => { turnThinking = thinking; },
            });
            raw = result.text;
            turnThinking = result.thinking;
        } else {
            const result = await executeTurnLocalSdk({
                ctx, meta, history, turnInstruction, speakerToneSystemPrompt, placeholderElm,
                onRawUpdate: (text) => { raw = text; },
                onThinkingUpdate: (thinking) => { turnThinking = thinking; },
            });
            raw = result.text;
            turnThinking = result.thinking;
        }
    } catch (error: any) {
        if (error?.name === "AbortError" || currentAbortController?.signal.aborted) {
            placeholderElm?.remove();
            return { continueLoop: false };
        }

        if (error?.name === "GeminiBlocked" || error?.finishReason) {
            showGeminiProhibitedContentToast({ finishReason: error?.finishReason, detail: error?.message });
        }
        console.error("Group chat Round generation failed", error);

        const modelMessage: Message = {
            ...createModelErrorMessage(meta.id),
            thinking: turnThinking?.trim() ? turnThinking.trim() : undefined,
            roundIndex: currentRoundIndex,
        };
        await persistMessages([modelMessage]);
        await replacePlaceholderWithPersistedMessage(placeholderElm);
        return { continueLoop: true };
    }

    const decision = await parseGroupTurnDecision(raw);

    if (decision.kind === "skip") {
        if (placeholderElm) {
            const skipNotice = document.createElement("div");
            skipNotice.className = "skip-notice";
            const safeName = helpers.getSanitized(meta.name || "Someone");
            const reason = (decision.text ?? "").toString().trim();
            const safeReasonSuffix = reason ? `: ${helpers.getSanitized(reason)}` : "";
            skipNotice.innerHTML = `<span class="material-symbols-outlined">skip_next</span> ${safeName} skipped their turn${safeReasonSuffix}`;
            placeholderElm.replaceWith(skipNotice);
        }

        // Persist a hidden marker so future turn calculation can advance.
        // Without this, a skip isn't represented in chat history, so "Continue" can loop.
        await persistAiSkipTurnMarker({ personaId: meta.id, currentRoundIndex });

        return { continueLoop: true };
    }

    const finalText = stripLeadingSpeakerPrefix((decision.text || ""), meta.name);
    const modelMessage: Message = {
        role: "model",
        personalityid: meta.id,
        parts: [{ text: finalText }],
        thinking: turnThinking?.trim() ? turnThinking.trim() : undefined,
        roundIndex: currentRoundIndex,
    };
    await persistMessages([modelMessage]);
    await replacePlaceholderWithPersistedMessage(placeholderElm);
    return { continueLoop: true };
}

async function replacePlaceholderWithPersistedMessage(placeholderElm: HTMLElement | undefined): Promise<void> {
    const updatedChat = await chatsService.getCurrentChat(db);
    if (updatedChat) {
        const modelIndex = updatedChat.content.length - 1;
        const newElm = await messageElement(updatedChat.content[modelIndex], modelIndex);
        if (placeholderElm) {
            placeholderElm.replaceWith(newElm);
        } else {
            await insertMessage(updatedChat.content[modelIndex], modelIndex);
        }
    }
    hljs.highlightAll();
    helpers.messageContainerScrollToBottom(true);
}

// ================================================================================
// TURN EXECUTION - PREMIUM ENDPOINT
// ================================================================================

async function executeTurnPremium(args: {
    ctx: RpgContext;
    meta: ParticipantMeta;
    history: Content[];
    turnInstruction: string;
    speakerToneSystemPrompt: string;
    placeholderElm: HTMLElement | undefined;
    onRawUpdate: (text: string) => void;
    onThinkingUpdate: (thinking: string) => void;
}): Promise<{ text: string; thinking: string }> {
    const { ctx, meta, history, turnInstruction, speakerToneSystemPrompt, placeholderElm, onRawUpdate, onThinkingUpdate } = args;
    const { settings, rosterSystemPrompt, isInternetSearchEnabled, abortController } = ctx;

    const payloadSettings: PremiumEndpoint.RequestSettings = {
        model: settings.model,
        streamResponses: settings.streamResponses,
        generate: false,
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: parseInt(settings.temperature) / 100,
        systemInstruction: ({
            parts: [{ text: ((await settingsService.getSystemPrompt("rpg")).parts?.[0].text ?? "") + rosterSystemPrompt + speakerToneSystemPrompt }]
        }) as Content,
        safetySettings: settings.safetySettings,
        responseMimeType: "application/json",
        responseJsonSchema: GROUP_TURN_DECISION_SCHEMA,
        tools: isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: generateThinkingConfig(settings.model, settings.enableThinking, settings),
    } as any;

    const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;
    const resp = await fetch(endpoint, {
        method: "POST",
        headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ message: turnInstruction, settings: payloadSettings, history } satisfies PremiumEndpoint.Request),
        signal: abortController?.signal,
    });

    if (!resp.ok) throw new Error(`Edge function error: ${resp.status}`);

    let raw = "";
    let turnThinking = "";

    if (settings.streamResponses) {
        let thinkingContentElm: HTMLDivElement | null = null;
        let isJsonSchemaFallback = false;
        let lastRenderedPreviewText = "";

        const result = await processPremiumEndpointSse({
            res: resp,
            process: {
                signal: abortController?.signal ?? undefined,
                abortMode: "throw",
                includeThoughts: true,
                useSkipThoughtSignature: false,
                skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
                throwOnBlocked: (finishReason) => isGeminiBlockedFinishReason(finishReason),
                onBlocked: ({ finishReason, finishMessage }) => { throwGeminiBlocked({ finishReason, finishMessage }); },
                callbacks: {
                    onFallbackStart: (args) => {
                        isJsonSchemaFallback = !!args?.hasJsonSchema;
                        raw = "";
                        lastRenderedPreviewText = "";
                    },
                    onText: async ({ text }) => {
                        raw = text;
                        onRawUpdate(raw);
                        if (!placeholderElm) return;

                        let preview: string | null;
                        if (isJsonSchemaFallback) {
                            preview = raw;
                        } else {
                            preview = extractGroupTurnDecisionTextPreview(raw);
                        }
                        if (preview === null) return;

                        const finalPreview = stripLeadingSpeakerPrefix(preview, meta.name);
                        if (finalPreview === lastRenderedPreviewText) return;
                        lastRenderedPreviewText = finalPreview;

                        placeholderElm.querySelector('.message-text')?.classList.remove('is-loading');
                        const contentElm = placeholderElm.querySelector<HTMLElement>(".message-text .message-text-content");
                        if (contentElm) {
                            contentElm.innerHTML = await parseMarkdownToHtml(finalPreview);
                            helpers.messageContainerScrollToBottom();
                        }
                    },
                    onThinking: ({ thinking: thinkingSoFar }) => {
                        turnThinking = thinkingSoFar;
                        onThinkingUpdate(turnThinking);
                        if (!placeholderElm) return;
                        thinkingContentElm ??= ensureThinkingUiOnMessageElement(placeholderElm);
                        if (thinkingContentElm) thinkingContentElm.textContent = turnThinking;
                    },
                },
            },
        });

        raw = result.text;
        turnThinking = result.thinking;
    } else {
        const json = await resp.json();
        const finishReason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason;
        if (isGeminiBlockedFinishReason(finishReason)) {
            const finishMessage = (json?.candidates?.[0] as any)?.finishMessage;
            throwGeminiBlocked({ finishReason, finishMessage });
        }
        const extracted = extractTextAndThinkingFromResponse(json);
        raw = extracted.text;
        turnThinking = extracted.thinking;
    }

    return { text: raw, thinking: turnThinking };
}

// ================================================================================
// TURN EXECUTION - LOCAL SDK
// ================================================================================

async function executeTurnLocalSdk(args: {
    ctx: RpgContext;
    meta: ParticipantMeta;
    history: Content[];
    turnInstruction: string;
    speakerToneSystemPrompt: string;
    placeholderElm: HTMLElement | undefined;
    onRawUpdate: (text: string) => void;
    onThinkingUpdate: (thinking: string) => void;
}): Promise<{ text: string; thinking: string }> {
    const { ctx, meta, history, turnInstruction, speakerToneSystemPrompt, placeholderElm, onRawUpdate, onThinkingUpdate } = args;
    const { settings, rosterSystemPrompt, isInternetSearchEnabled, abortController } = ctx;

    const config: GenerateContentConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: parseInt(settings.temperature) / 100,
        systemInstruction: ({
            parts: [{ text: ((await settingsService.getSystemPrompt("rpg")).parts?.[0].text ?? "") + rosterSystemPrompt + speakerToneSystemPrompt }]
        }) as Content,
        safetySettings: settings.safetySettings,
        responseMimeType: "application/json",
        responseJsonSchema: GROUP_TURN_DECISION_SCHEMA,
        tools: isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: generateThinkingConfig(settings.model, settings.enableThinking, settings),
    } as any;

    let thinkingContentElm: HTMLDivElement | null = null;
    let lastRenderedPreviewText = "";

    const extracted = await runLocalSdkRpgTurn({
        settings,
        history,
        config,
        turnInstruction,
        signal: abortController?.signal,
        onThinking: (thinkingSoFar) => {
            onThinkingUpdate(thinkingSoFar);
            if (!placeholderElm) return;
            thinkingContentElm ??= ensureThinkingUiOnMessageElement(placeholderElm);
            if (thinkingContentElm) thinkingContentElm.textContent = thinkingSoFar;
        },
        onText: async (textSoFar) => {
            onRawUpdate(textSoFar);
            if (!placeholderElm) return;
            const preview = extractGroupTurnDecisionTextPreview(textSoFar);
            if (preview === null) return;

            const finalPreview = stripLeadingSpeakerPrefix(preview, meta.name);
            if (finalPreview === lastRenderedPreviewText) return;
            lastRenderedPreviewText = finalPreview;

            placeholderElm.querySelector('.message-text')?.classList.remove('is-loading');
            const contentElm = placeholderElm.querySelector<HTMLElement>(".message-text .message-text-content");
            if (contentElm) {
                contentElm.innerHTML = await parseMarkdownToHtml(finalPreview);
                helpers.messageContainerScrollToBottom();
            }
        },
    });

    return { text: extracted.text, thinking: extracted.thinking };
}

async function runLocalSdkRpgTurn(args: {
    settings: ReturnType<typeof settingsService.getSettings>;
    history: Content[];
    config: GenerateContentConfig;
    turnInstruction: string;
    signal?: AbortSignal;
    onThinking?: (thinkingSoFar: string) => void;
    onText?: (textSoFar: string) => void | Promise<void>;
}): Promise<TextAndThinking> {
    const { settings, history, config, turnInstruction, signal, onThinking, onText } = args;

    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const chat = ai.chats.create({ model: settings.model, history, config });

    if (settings.streamResponses) {
        const result = await processGeminiLocalSdkStream({
            stream: await chat.sendMessageStream({ message: [{ text: turnInstruction }] }),
            process: {
                includeThoughts: true,
                useSkipThoughtSignature: false,
                skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
                signal,
                abortMode: "throw",
                throwOnBlocked: true,
                callbacks: {
                    onThinking: ({ thinking }) => { onThinking?.(thinking); },
                    onText: async ({ text }) => { await onText?.(text); },
                },
            },
        });

        return { text: result.text, thinking: result.thinking };
    }

    const response = await chat.sendMessage({ message: [{ text: turnInstruction }] });
    const result = await processGeminiLocalSdkResponse({
        response,
        process: {
            includeThoughts: true,
            useSkipThoughtSignature: false,
            skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
            signal,
            abortMode: "throw",
            throwOnBlocked: true,
        },
    });

    return { text: result.text, thinking: result.thinking };
}

// ================================================================================
// NARRATOR
// ================================================================================

async function handleNarratorBeforeFirst(ctx: RpgContext): Promise<void> {
    const visibleAtStart = (ctx.workingChat?.content ?? []).filter(m => !m.hidden);
    if (visibleAtStart.length === 0) {
        const { history: beforeHistory } = await constructGeminiChatHistoryForGroupChatRpg(
            ctx.workingChat,
            { speakerNameById: ctx.speakerNameById, userName: ctx.userName, enforceThoughtSignatures: false }
        );

        const before = await generateNarratorMessage({
            mode: "before_first",
            history: beforeHistory,
            scenarioPrompt: ctx.scenarioPrompt,
            participantNames: ctx.allParticipantNames,
            userName: ctx.userName,
            rosterSystemPrompt: ctx.rosterSystemPrompt,
            settings: ctx.settings,
            isPremiumEndpointPreferred: ctx.isPremiumEndpointPreferred,
            signal: ctx.abortController?.signal,
        });

        if (before && !ctx.abortController?.signal.aborted) {
            const narratorMessage: Message = {
                role: "model",
                personalityid: NARRATOR_PERSONALITY_ID,
                parts: [{ text: before.text }],
                roundIndex: ctx.currentRoundIndex,
            };

            const narratorIndex = ctx.workingChat.content.length;
            await insertMessage(narratorMessage, narratorIndex);
            await persistMessages([narratorMessage]);
            hljs.highlightAll();
            helpers.messageContainerScrollToBottom(true);
        }
    }
}

async function handleNarratorInterjection(ctx: RpgContext): Promise<void> {
    const chatForInterjection = await chatsService.getCurrentChat(db);
    if (!chatForInterjection) return;

    const { history: interjectionHistory } = await constructGeminiChatHistoryForGroupChatRpg(
        chatForInterjection,
        { speakerNameById: ctx.speakerNameById, userName: ctx.userName, enforceThoughtSignatures: false }
    );

    const interjection = await generateNarratorMessage({
        mode: "interjection",
        history: interjectionHistory,
        scenarioPrompt: ctx.scenarioPrompt,
        participantNames: ctx.allParticipantNames,
        userName: ctx.userName,
        rosterSystemPrompt: ctx.rosterSystemPrompt,
        settings: ctx.settings,
        isPremiumEndpointPreferred: ctx.isPremiumEndpointPreferred,
        signal: ctx.abortController?.signal,
    });

    if (interjection && !ctx.abortController?.signal.aborted) {
        const interjectionMessage: Message = {
            role: "model",
            personalityid: NARRATOR_PERSONALITY_ID,
            parts: [{ text: interjection.text }],
            roundIndex: ctx.currentRoundIndex,
        };

        const interjectionIndex = (await chatsService.getCurrentChat(db))?.content.length ?? -1;
        if (interjectionIndex >= 0) {
            await insertMessage(interjectionMessage, interjectionIndex);
            await persistMessages([interjectionMessage]);
            hljs.highlightAll();
            helpers.messageContainerScrollToBottom(true);
        }
    }
}

async function handleNarratorAfterRound(ctx: RpgContext): Promise<void> {
    const chatForAfter = await chatsService.getCurrentChat(db);
    if (!chatForAfter) return;

    const lastInRound = [...(chatForAfter.content || [])]
        .reverse()
        .find(m => !m.hidden && m.roundIndex === ctx.currentRoundIndex);

    const lastInRoundIsNarrator = !!lastInRound &&
        lastInRound.role === "model" &&
        lastInRound.personalityid === NARRATOR_PERSONALITY_ID;

    if (!lastInRoundIsNarrator) {
        const { history: afterHistory } = await constructGeminiChatHistoryForGroupChatRpg(
            chatForAfter,
            { speakerNameById: ctx.speakerNameById, userName: ctx.userName, enforceThoughtSignatures: false }
        );

        const after = await generateNarratorMessageResilient({
            mode: "after",
            history: afterHistory,
            scenarioPrompt: ctx.scenarioPrompt,
            participantNames: ctx.allParticipantNames,
            userName: ctx.userName,
            rosterSystemPrompt: ctx.rosterSystemPrompt,
            settings: ctx.settings,
            isPremiumEndpointPreferred: ctx.isPremiumEndpointPreferred,
            signal: ctx.abortController?.signal,
        });

        const afterText = after?.text?.trim() || "";
        if (!ctx.abortController?.signal.aborted && afterText) {
            const afterMessage: Message = {
                role: "model",
                personalityid: NARRATOR_PERSONALITY_ID,
                parts: [{ text: afterText }],
                roundIndex: ctx.currentRoundIndex,
            };

            const afterIndex = (await chatsService.getCurrentChat(db))?.content.length ?? -1;
            if (afterIndex >= 0) {
                await insertMessage(afterMessage, afterIndex);
                await persistMessages([afterMessage]);
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom(true);
            }
        }
    }
}

interface NarratorGenerationArgs {
    mode: NarratorMode;
    history: Content[];
    scenarioPrompt: string;
    participantNames: string[];
    userName: string;
    rosterSystemPrompt: string;
    settings: ReturnType<typeof settingsService.getSettings>;
    isPremiumEndpointPreferred: boolean;
    signal?: AbortSignal;
}

async function generateNarratorMessageResilient(args: NarratorGenerationArgs): Promise<TextAndThinking | null> {
    const primary = await generateNarratorMessage(args);
    if (primary?.text?.trim()) {
        return { text: primary.text.trim(), thinking: "" };
    }
    if (args.signal?.aborted) return null;

    try {
        const retry = await generateNarratorMessage({ ...args, history: [] });
        if (retry?.text?.trim()) {
            return { text: retry.text.trim(), thinking: "" };
        }
    } catch {
        // Ignore
    }

    return null;
}

async function generateNarratorMessage(args: NarratorGenerationArgs): Promise<TextAndThinking | null> {
    const { mode, history, scenarioPrompt, participantNames, userName, rosterSystemPrompt, settings, isPremiumEndpointPreferred, signal } = args;

    const narratorSystemInstructionText = (
        "You are a creative narrator for a roleplay." +
        (rosterSystemPrompt?.trim() ? `\n${rosterSystemPrompt}` : "")
    ).trim();

    const narratorModel = ChatModel.FLASH;
    const narratorPrompt = buildNarratorPrompt(mode, scenarioPrompt, userName, participantNames);

    try {
        let raw = "";
        let thinking = "";

        if (isPremiumEndpointPreferred) {
            const result = await generateNarratorPremium({ narratorModel, narratorSystemInstructionText, narratorPrompt, history, settings, signal });
            raw = result.text;
            thinking = result.thinking;
        } else {
            const result = await generateNarratorLocalSdk({ narratorModel, narratorSystemInstructionText, narratorPrompt, history, settings, signal });
            raw = result.text;
            thinking = result.thinking;
        }

        const trimmed = raw.trim();
        if (!trimmed) return null;

        return { text: trimmed, thinking: "" };

    } catch (err: any) {
        if (err?.name === "AbortError") return null;
        console.error("[Narrator] Generation error:", err);
        return null;
    }
}

function buildNarratorPrompt(mode: NarratorMode, scenarioPrompt: string, userName: string, participantNames: string[]): string {
    const allNames = [userName, ...participantNames].join(", ");

    switch (mode) {
        case "before_first":
            if (scenarioPrompt.trim()) {
                return `<system>You are the narrator. Set the scene and expand on this scenario: "${scenarioPrompt}". Introduce the characters present: ${allNames}. Write in second or third person. Be evocative but concise (2-4 sentences).</system>`;
            }
            return `<system>You are the narrator. A fateful meeting brings together: ${allNames}. Describe the setting where they meet and set the tone for their interaction. Write in second or third person. Be evocative but concise (2-4 sentences).</system>`;
        case "before":
            return `<system>You are the narrator. Provide brief scene narration before the next round of conversation. You may describe the atmosphere, advance time, note environmental changes, or create tension. Be brief (1-3 sentences). Do not speak for the characters.</system>`;
        case "after":
            return `<system>You are the narrator. The characters have just finished speaking. Provide closing narration for this turn: emphasize key moments, create tension, advance the plot, or describe reactions and atmosphere. Be brief (1-3 sentences). Do not speak for the characters.</system>`;
        case "interjection":
            return `<system>You are the narrator. Something unexpected happens! Generate a brief special event: a sudden change in scenery, someone trips or does something by accident, an interruption, a twist, or inject some spice into the scene. Be brief and impactful (1-2 sentences). This should create an interesting moment for the characters to react to.</system>`;
    }
}

async function generateNarratorPremium(args: {
    narratorModel: string;
    narratorSystemInstructionText: string;
    narratorPrompt: string;
    history: Content[];
    settings: ReturnType<typeof settingsService.getSettings>;
    signal?: AbortSignal;
}): Promise<TextAndThinking> {
    const { narratorModel, narratorSystemInstructionText, narratorPrompt, history, settings, signal } = args;

    const payloadSettings: PremiumEndpoint.RequestSettings = {
        model: narratorModel,
        streamResponses: settings.streamResponses,
        generate: false,
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: 1.0,
        systemInstruction: { parts: [{ text: narratorSystemInstructionText }] } as Content,
        safetySettings: settings.safetySettings,
        thinkingConfig: generateThinkingConfig(narratorModel, false, settings),
    } as any;

    const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;
    const resp = await fetch(endpoint, {
        method: "POST",
        headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ message: narratorPrompt, settings: payloadSettings, history } satisfies PremiumEndpoint.Request),
        signal,
    });

    if (!resp.ok) return { text: "", thinking: "" };

    if (settings.streamResponses) {
        const streamed = await readPremiumEndpointTextAndThinkingFromSse({ res: resp, signal });
        return { text: streamed.text, thinking: "" };
    }

    const json = await resp.json();
    const extracted = extractTextAndThinkingFromResponse(json);
    return { text: extracted.text, thinking: "" };
}

async function generateNarratorLocalSdk(args: {
    narratorModel: string;
    narratorSystemInstructionText: string;
    narratorPrompt: string;
    history: Content[];
    settings: ReturnType<typeof settingsService.getSettings>;
    signal?: AbortSignal;
}): Promise<TextAndThinking> {
    const { narratorModel, narratorSystemInstructionText, narratorPrompt, history, settings, signal } = args;

    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const config: GenerateContentConfig = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: 1.0,
        systemInstruction: { parts: [{ text: narratorSystemInstructionText }] } as Content,
        safetySettings: settings.safetySettings,
        thinkingConfig: generateThinkingConfig(narratorModel, false, settings),
    };

    const chat = ai.chats.create({ model: narratorModel, history, config });
    let raw = "";

    if (settings.streamResponses) {
        const stream: AsyncGenerator<GenerateContentResponse> = await chat.sendMessageStream({ message: [{ text: narratorPrompt }] });
        for await (const chunk of stream) {
            if (signal?.aborted) {
                throwAbortError();
            }
            const extracted = extractTextAndThinkingFromResponse(chunk);
            raw += extracted.text;
        }
    } else {
        const response = await chat.sendMessage({ message: [{ text: narratorPrompt }] });
        const extracted = extractTextAndThinkingFromResponse(response);
        raw = extracted.text;
    }

    return { text: raw, thinking: "" };
}

// ================================================================================
// HELPERS
// ================================================================================

function shouldTriggerIndependentAction(independence: number): boolean {
    const thresholds: Record<number, number> = { 0: 0.00, 1: 0.15, 2: 0.35, 3: 0.50 };
    const clampedIndependence = Math.max(0, Math.min(3, Math.trunc(independence)));
    const threshold = thresholds[clampedIndependence] ?? 0;
    return Math.random() < threshold;
}

function buildTurnInstruction(args: { participantsLine: string; speakerName: string; useIndependentAction: boolean }): string {
    const { participantsLine, speakerName, useIndependentAction } = args;

    if (useIndependentAction) {
        return `<system>You are participating in a turn-based group chat. Participants: ${participantsLine}.
It is now ${speakerName}'s turn to respond.

${speakerName} is feeling independent right now. They should progress the story on their own terms - perhaps start an activity, pursue a personal goal, engage with another character, or do something that doesn't revolve around the user. The user doesn't need to be involved in everything.

If you reply, write ONLY what ${speakerName} would send as a single chat message (no prefixes like "${speakerName}:").
If you choose to skip this turn entirely, set kind to "skip".
</system>`;
    }

    return `<system>You are participating in a turn-based group chat. Participants: ${participantsLine}.
It is now ${speakerName}'s turn to respond.

Respond naturally as ${speakerName}, staying true to their independence level and personality.

If you reply, write ONLY what ${speakerName} would send as a single chat message (no prefixes like "${speakerName}:").
If you choose to skip this turn entirely, set kind to "skip".
</system>`;
}

function dispatchRoundState(args: {
    userCompletedTurn: boolean;
    currentRoundIndex: number;
    stoppedForUser: boolean;
    startsNewRound: boolean;
    nextSpeakerId?: string;
}): void {
    const { currentRoundIndex, stoppedForUser, startsNewRound, nextSpeakerId } = args;
    const isUserTurnNext = stoppedForUser;

    dispatchAppEvent('round-state-changed', {
        isUserTurn: isUserTurnNext,
        currentRoundIndex,
        roundComplete: stoppedForUser,
        nextRoundNumber: startsNewRound ? currentRoundIndex + 1 : currentRoundIndex,
        startsNewRound,
        nextSpeakerId,
    });
}

// ================================================================================
// JSON PARSING
// ================================================================================

async function parseGroupTurnDecision(rawText: string): Promise<GroupTurnDecision> {
    try {
        const parsed = JSON.parse(rawText) as Partial<GroupTurnDecision>;
        const kind = parsed.kind;
        if (kind !== "reply" && kind !== "skip") throw new Error("invalid kind");
        return { kind, text: typeof parsed.text === "string" ? parsed.text : null };
    } catch {
        // Continue
    }

    const lastJsonStart = rawText.lastIndexOf('{"kind"');
    if (lastJsonStart > 0) {
        const lastPart = rawText.slice(lastJsonStart);
        let braceCount = 0;
        let endIndex = -1;
        for (let i = 0; i < lastPart.length; i++) {
            if (lastPart[i] === '{') braceCount++;
            else if (lastPart[i] === '}') {
                braceCount--;
                if (braceCount === 0) { endIndex = i + 1; break; }
            }
        }
        if (endIndex > 0) {
            try {
                const lastJson = JSON.parse(lastPart.slice(0, endIndex)) as Partial<GroupTurnDecision>;
                const kind = lastJson.kind;
                if (kind === "reply" || kind === "skip") {
                    return { kind, text: typeof lastJson.text === "string" ? lastJson.text : null };
                }
            } catch {
                // Continue
            }
        }
    }

    const extractedText = extractGroupTurnDecisionTextFromPossiblyMalformedJson(rawText);
    if (extractedText !== null) {
        const hasSkipKind = rawText.includes('"kind"') && rawText.includes('"skip"');
        return { kind: hasSkipKind ? "skip" : "reply", text: extractedText };
    }

    return { kind: "reply", text: rawText || "" };
}

function extractPartialJsonStringProperty(raw: string, propertyName: string): string | null {
    const key = `"${propertyName}"`;
    const keyIndex = raw.indexOf(key);
    if (keyIndex < 0) return null;

    let i = keyIndex + key.length;
    while (i < raw.length && raw[i] !== ':') i++;
    if (i >= raw.length) return null;
    i++;

    while (i < raw.length && /\s/.test(raw[i] || '')) i++;
    if (i >= raw.length) return null;

    if (raw.slice(i, i + 4) === 'null') return "";
    if (raw[i] !== '"') return null;
    i++;

    let out = "";
    for (; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '"') return out;
        if (ch === '\\') {
            i++;
            if (i >= raw.length) return out;
            const esc = raw[i];
            switch (esc) {
                case '"': out += '"'; break;
                case '\\': out += '\\'; break;
                case '/': out += '/'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'n': out += '\n'; break;
                case 'r': out += '\r'; break;
                case 't': out += '\t'; break;
                case 'u': {
                    if (i + 4 < raw.length) {
                        const hex = raw.slice(i + 1, i + 5);
                        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                            out += String.fromCharCode(parseInt(hex, 16));
                            i += 4;
                        }
                    }
                    break;
                }
                default: out += esc;
            }
        } else {
            out += ch;
        }
    }
    return out;
}

function extractGroupTurnDecisionTextFromPossiblyMalformedJson(raw: string): string | null {
    const lastJsonStart = raw.lastIndexOf('{"kind"');
    if (lastJsonStart > 0) {
        const lastPart = raw.slice(lastJsonStart);
        const lastText = extractPartialJsonStringProperty(lastPart, "text");
        if (lastText !== null && lastText.length > 0) return lastText;
    }
    return extractPartialJsonStringProperty(raw, "text");
}

function extractGroupTurnDecisionTextPreview(raw: string): string | null {
    return extractPartialJsonStringProperty(raw, "text");
}

async function readPremiumEndpointTextAndThinkingFromSse(args: { res: Response; signal?: AbortSignal }): Promise<TextAndThinking> {
    const { res, signal } = args;
    if (!res.body) return { text: "", thinking: "" };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let isFallbackMode = false;
    let text = "";
    let thinking = "";

    while (true) {
        if (signal?.aborted) {
            try { await reader.cancel(); } catch { /* noop */ }
            throwAbortError();
        }

        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let delimiterIndex: number;
        while ((delimiterIndex = buffer.indexOf("\n\n")) !== -1) {
            const eventBlock = buffer.slice(0, delimiterIndex);
            buffer = buffer.slice(delimiterIndex + 2);
            if (!eventBlock) continue;
            if (eventBlock.startsWith(":")) continue;

            const lines = eventBlock.split("\n");
            let eventName = "message";
            let data = "";
            for (const line of lines) {
                if (line.startsWith("event: ")) eventName = line.slice(7).trim();
                else if (line.startsWith("data: ")) data += line.slice(6);
            }

            if (eventName === "error") throw new Error(data);
            if (eventName === "done") return { text, thinking };
            if (eventName === "fallback") {
                isFallbackMode = true;
                text = "";
                thinking = "";
                continue;
            }
            if (!data) continue;

            if (isFallbackMode) {
                if (data === "[DONE]") return { text, thinking };
                if (data === "{}") continue;
                const glmPayload = JSON.parse(data);
                const choice = glmPayload.choices?.[0];
                const delta = choice?.delta;
                if (delta?.content) text += delta.content;
                if (delta?.reasoning) thinking += delta.reasoning;
                continue;
            }

            const payload = JSON.parse(data) as GenerateContentResponse;
            for (const part of payload?.candidates?.[0]?.content?.parts || []) {
                if (part?.thought && part?.text) thinking += part.text;
                else if (part?.text) text += part.text;
            }
        }
    }

    return { text, thinking };
}

// ================================================================================
// HISTORY BUILDING FOR GROUP CHAT
// ================================================================================

async function constructGeminiChatHistoryForGroupChatRpg(
    currentChat: DbChat,
    args: {
        speakerNameById: Map<string, string>;
        userName: string;
        enforceThoughtSignatures?: boolean;
    }
): Promise<{ history: Content[]; pinnedHistoryIndices: number[] }> {
    const history: Content[] = [];
    const pinnedHistoryIndices: number[] = [];
    const shouldEnforceThoughtSignatures = args.enforceThoughtSignatures === true;

    const speakerNameForMessage = (m: Message): string => {
        if (m.role === "user") return (args.userName || "User").toString();
        if (m.personalityid === NARRATOR_PERSONALITY_ID) return "Narrator";
        const id = (m.personalityid ?? "").toString();
        return args.speakerNameById.get(id) ?? "Unknown";
    };

    const lastImageIndex = findLastGeneratedImageIndex(currentChat.content);
    const lastAttachmentIndex = findLastAttachmentIndex(currentChat.content);

    for (let index = 0; index < currentChat.content.length; index++) {
        const dbMessage = currentChat.content[index];
        if (dbMessage.hidden) continue;

        const aggregatedParts: any[] = [];
        const speaker = speakerNameForMessage(dbMessage);

        for (const part of dbMessage.parts) {
            const text = (part.text || "").toString();
            const attachments = part.attachments || [];

            if (text.trim().length > 0 || part.thoughtSignature) {
                const partObj: any = { text: maybePrefixSpeaker(text, speaker) };
                partObj.thoughtSignature = part.thoughtSignature ?? (shouldEnforceThoughtSignatures ? SKIP_THOUGHT_SIGNATURE_VALIDATOR : undefined);
                aggregatedParts.push(partObj);
            }

            const attachmentParts = await processAttachmentsToParts({
                attachments,
                shouldProcess: attachments.length > 0 && index === lastAttachmentIndex,
            });
            aggregatedParts.push(...attachmentParts);
        }

        const genAiMessage: Content = { role: dbMessage.role, parts: aggregatedParts };

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

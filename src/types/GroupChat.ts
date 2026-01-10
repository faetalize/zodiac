/**
 * Types for RPG group chat functionality.
 */

import type { Content } from "@google/genai";
import type { DbChat } from "./Chat";

/**
 * Participant persona data used in group chats.
 */
export interface GroupChatParticipantPersona {
    id: string;
    name: string;
    description: string;
    prompt: string;
    aggressiveness?: number;
    sensuality?: number;
    independence?: number;
}

/**
 * Decision made by an AI participant for their turn.
 */
export interface GroupTurnDecision {
    kind: "reply" | "skip";
    text: string | null;
}

/**
 * Narrator generation modes.
 */
export type NarratorMode = "before_first" | "before" | "after" | "interjection";

/**
 * Metadata for a participant in the current turn batch.
 */
export interface ParticipantMeta {
    id: string;
    name: string;
    independence: number;
}

/**
 * Settings type - use ReturnType<typeof settingsService.getSettings> in implementations.
 * This is just a documentation placeholder.
 */
export type RpgSettings = any;

/**
 * Shared context for RPG group chat operations.
 */
export interface RpgContext {
    // Input arguments
    msg: string;
    attachmentFiles: FileList;
    isInternetSearchEnabled: boolean;
    isPremiumEndpointPreferred: boolean;
    skipTurn: boolean;

    // Settings
    settings: RpgSettings;
    shouldEnforceThoughtSignaturesInHistory: boolean;

    // Chat state
    workingChat: DbChat;
    currentRoundIndex: number;

    // Group chat config
    turnOrder: string[];
    scenarioPrompt: string;
    narratorEnabled: boolean;
    participants: string[];

    // Participant data
    participantPersonas: GroupChatParticipantPersona[];
    speakerNameById: Map<string, string>;
    allParticipantNames: string[];

    // User info
    userName: string;

    // System prompts
    rosterSystemPrompt: string;

    // Generation state
    abortController: AbortController;
}

/**
 * Arguments for narrator generation.
 */
export interface NarratorGenerationArgs {
    mode: NarratorMode;
    history: Content[];
    scenarioPrompt: string;
    participantNames: string[];
    userName: string;
    rosterSystemPrompt: string;
    settings: RpgSettings;
    isPremiumEndpointPreferred: boolean;
    signal?: AbortSignal;
}

/**
 * Result of executing a single AI turn.
 */
export interface TurnExecutionResult {
    success: boolean;
    skipped: boolean;
    skipReason?: string;
    text?: string;
    thinking?: string;
    error?: Error;
    /** Whether the turn loop should continue after this turn */
    continueLoop: boolean;
}

/**
 * JSON schema for group turn decision validation.
 */
export const GROUP_TURN_DECISION_SCHEMA = {
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
} as const;

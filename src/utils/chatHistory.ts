/**
 * Pure utility functions for chat history manipulation.
 * These are stateless helper functions with no side effects.
 */

import type { GroupChatParticipantPersona } from "../types/GroupChat";
import { TONE_QUESTIONS } from "../constants/ToneQuestions";

/**
 * Escapes special regex characters in a string.
 */
function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips a leading speaker prefix from message text.
 * Handles formats like "Name: ...", "Name - ...", "Name — ..."
 */
export function stripLeadingSpeakerPrefix(text: string, speakerName: string): string {
    const trimmed = (text ?? "").toString();
    const name = (speakerName ?? "").toString().trim();
    if (!name) {
        return trimmed;
    }

    // Remove a single leading "Name: " / "Name - " / "Name — " prefix if present.
    const re = new RegExp(`^\\s*${escapeRegExp(name)}\\s*[:\\uFF1A\\u2013\\u2014-]\\s+`, "i");
    return trimmed.replace(re, "");
}

/**
 * Adds a speaker prefix to text if not already present.
 */
export function maybePrefixSpeaker(text: string, speaker: string): string {
    const raw = (text ?? "").toString();
    const s = (speaker ?? "").toString().trim();
    if (!s) return raw;
    const already = new RegExp(`^\\s*${escapeRegExp(s)}\\s*[:\\uFF1A\\u2013\\u2014-]\\s+`, "i");
    if (already.test(raw)) return raw;
    return `${s}: ${raw}`;
}

/**
 * Builds the system prompt for RPG group chat roster.
 */
export function buildGroupChatRosterSystemPrompt(args: {
    participantPersonas: GroupChatParticipantPersona[];
    userName: string;
    scenarioPrompt: string;
    narratorEnabled: boolean;
}): string {
    const userName = (args.userName || "User").toString();
    const scenario = (args.scenarioPrompt || "").toString().trim();
    const participants = Array.isArray(args.participantPersonas) ? args.participantPersonas : [];

    const lines: string[] = [];
    lines.push("<system>Turn-based group chat RPG mode.");
    lines.push("Participants are fixed for this chat.");
    lines.push("When replying, write ONLY the message content (no speaker prefix like 'Name:').");
    lines.push(`The user is: ${userName}.`);
    if (scenario) {
        lines.push(`Scenario: ${scenario}`);
    }
    lines.push("Participant roster:");

    for (const p of participants) {
        const name = (p.name || "Unknown").toString();
        const desc = (p.description || "").toString().trim();
        const prompt = (p.prompt || "").toString().trim();
        const aggression = Number.isFinite(p.aggressiveness as number) ? Math.trunc(p.aggressiveness as number) : 0;
        const sensuality = Number.isFinite(p.sensuality as number) ? Math.trunc(p.sensuality as number) : 0;
        const independence = Number.isFinite(p.independence as number) ? Math.trunc(p.independence as number) : 0;

        lines.push(`- ${name} (${p.id})`);
        if (desc) lines.push(`  Description: ${desc}`);
        if (prompt) lines.push(`  Prompt: ${prompt}`);
        lines.push(`  Traits: aggression ${aggression}/3, sensuality ${sensuality}/3, independence ${independence}/3.`);
    }

    lines.push("Chat transcript format: each message begins with 'SpeakerName: ...'. Do not copy that formatting in your replies.");
    lines.push("</system>");
    return "\n" + lines.join("\n");
}

/**
 * Builds tone examples system prompt for a speaker.
 */
export function buildSpeakerToneExamplesSystemPrompt(args: {
    speakerName: string;
    toneExamples: string[];
}): string {
    const speakerName = (args.speakerName ?? "").toString().trim();
    const toneExamples = Array.isArray(args.toneExamples)
        ? args.toneExamples.map(v => (v ?? "").toString().trim()).filter(Boolean)
        : [];

    if (!speakerName || toneExamples.length === 0) {
        return "";
    }

    const lines: string[] = [];
    lines.push(`<system>Tone examples for ${speakerName}. Use these as style guidance and stay in character. Do NOT include a speaker prefix like "${speakerName}:" in your reply.</system>`);
    for (let i = 0; i < toneExamples.length; i++) {
        const q = TONE_QUESTIONS[i] ?? "Give an example of how you would talk.";
        const a = toneExamples[i];
        lines.push(`<system>Q: ${q}\nA (as ${speakerName}): ${a}</system>`);
    }
    return "\n" + lines.join("\n");
}

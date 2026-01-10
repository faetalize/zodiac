/**
 * Pure utility functions for personality marker manipulation.
 * These are stateless helper functions with no side effects.
 */

import type { Content } from "@google/genai";
import type { Message } from "../types/Message";
import type { Chat } from "../types/Chat";
import type { DbPersonality } from "../types/Personality";
import { TONE_QUESTIONS } from "../constants/ToneQuestions";

/**
 * Prefix used to identify personality marker messages.
 */
export const PERSONALITY_MARKER_PREFIX = "__personality_marker__|";

/**
 * Special personality ID for the narrator in RPG group chats.
 */
export const NARRATOR_PERSONALITY_ID = "__narrator__";

/**
 * Creates a personality marker message.
 */
export function createPersonalityMarkerMessage(personalityId: string): Message {
    return {
        role: "model",
        parts: [{ text: `${PERSONALITY_MARKER_PREFIX}${personalityId}|${new Date().toISOString()}` }],
        personalityid: personalityId,
        hidden: true,
    };
}

/**
 * Checks if a message is a personality marker.
 */
export function isPersonalityMarker(message: Message): boolean {
    if (!message.hidden) {
        return false;
    }
    const text = message.parts?.[0]?.text;
    return typeof text === "string" && text.startsWith(PERSONALITY_MARKER_PREFIX);
}

/**
 * Extracts personality marker info from a message.
 */
export function getPersonalityMarkerInfo(message: Message): { personalityId: string; updatedAt?: string } | undefined {
    if (!isPersonalityMarker(message)) {
        return undefined;
    }
    const text = message.parts?.[0]?.text ?? "";
    const payload = text.slice(PERSONALITY_MARKER_PREFIX.length);
    const [personalityId, updatedAt] = payload.split("|");
    if (!personalityId) {
        return undefined;
    }
    return { personalityId, updatedAt };
}

/**
 * Checks if a message is a legacy personality intro (old format).
 */
export function isLegacyPersonalityIntro(message: Message): boolean {
    if (!message.hidden || message.role !== "user") {
        return false;
    }
    const text = message.parts?.[0]?.text ?? "";
    return text.includes("<system>Personality Name:");
}

/**
 * Removes trailing personality markers from a chat.
 * Mutates the chat.content array in place.
 */
export function pruneTrailingPersonalityMarkers(chat: Chat): void {
    const content = chat.content;
    while (content.length > 0) {
        const last = content[content.length - 1];
        if (isPersonalityMarker(last)) {
            content.pop();
            continue;
        }
        break;
    }
}

/**
 * Builds personality instruction messages for Gemini history.
 */
export function buildPersonalityInstructionMessages(personality: DbPersonality): Content[] {
    const messages: Content[] = [
        {
            role: "user",
            parts: [{
                text: `<system>Personality Name: ${personality.name}\nPersonality Description: ${personality.description}\nPersonality Prompt: ${personality.prompt}\nYour level of aggression is ${personality.aggressiveness} out of 3. Your sensuality is ${personality.sensuality} out of 3.</system>`
            }]
        },
        {
            role: "model",
            parts: [{
                text: `Very well, from now on, I will be acting as the personality you have chosen. I'm ${personality.name}, and will continue this chat as your desired personality.`
            }]
        },
    ];

    // Before adding tone examples, we add a system message explaining what we're doing
    if (personality.toneExamples && personality.toneExamples.length > 0) {
        messages.push(
            {
                role: "user",
                parts: [{
                    text: `<system>We are gonna establish some examples of how this personality would talk/speak. I will ask you questions, and you will respond in character as '${personality.name}'.</system>`
                }]
            },
            {
                role: "model",
                parts: [{
                    text: `Understood. I am ready to respond as '${personality.name}'. Please proceed with your questions.`
                }]
            });
    }

    // Add tone examples, if any
    (personality.toneExamples || [])
        .slice(0, TONE_QUESTIONS.length)
        .forEach((toneExample, index) => {
            const prompt = TONE_QUESTIONS[index] ?? "Give me an example on how this personality would talk/speak.";
            messages.push(
                {
                    role: "user",
                    parts: [{ text: prompt }]
                },
                {
                    role: "model",
                    parts: [{ text: toneExample }]
                }
            );
        });

    // After adding tone examples, we add a system message to tell the model to continue in this tone
    if (personality.toneExamples && personality.toneExamples.length > 0) {
        messages.push(
            {
                role: "user",
                parts: [{
                    text: `<system>End of examples. From now on, continue responding as ${personality.name}, using the tone and style established in the examples above. Do NOT ever stray from the writing style you've established above. Respond with 'OK' if all is understood and ready to proceed.</system>`
                }]
            },
            {
                role: "model",
                parts: [{
                    text: "OK"
                }]
            });
    }

    return messages;
}

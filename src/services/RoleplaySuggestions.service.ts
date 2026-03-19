import { Content, GoogleGenAI } from "@google/genai";

import * as chatsService from "./Chats.service";
import * as personalityService from "./Personality.service";
import * as settingsService from "./Settings.service";
import { constructGeminiChatHistoryFromLocalChat } from "./Message.service";
import {
    buildOpenRouterRequest,
    convertGeminiHistoryToOpenRouterMessages,
    requestOpenRouterCompletion,
} from "./OpenRouter.service";
import {
    getChatModelDefinition,
    getValidChatModel,
    isGeminiModel,
    type ChatModelAccess,
} from "../types/Models";
import type { DbPersonality } from "../types/Personality";

export type RoleplaySuggestionResult = {
    options: string[];
    model: string;
};

const MAX_CONTEXT_MESSAGES = 18;
const MAX_SUGGESTIONS = 4;

function getSuggestionModelAccess(settings: ReturnType<typeof settingsService.getSettings>): ChatModelAccess {
    return {
        hasGeminiAccess: settings.geminiApiKey.trim().length > 0,
        hasOpenRouterAccess: settings.openRouterApiKey.trim().length > 0,
    };
}

export function getRoleplaySuggestionModel(settings: ReturnType<typeof settingsService.getSettings>): string {
    const preferred = settings.roleplaySuggestionModel?.trim();
    if (!preferred) {
        return settings.model;
    }

    const access = getSuggestionModelAccess(settings);
    return getValidChatModel(preferred, access);
}

function createSuggestionInstruction(): string {
    return [
        "You generate quick reply options for a roleplay chat UI.",
        "Read the conversation and propose exactly 4 distinct next-turn options for the user.",
        "Each option must be written from the user's point of view as something the user could send next.",
        "Keep each option concise, natural, and actionable.",
        "If roleplay formatting is already established, preserve it.",
        "Vary the tone between the options (e.g. warm, cautious, bold, playful) when appropriate.",
        "Do not explain the options.",
        "Return JSON only in this exact shape: {\"options\":[\"...\",\"...\",\"...\",\"...\"]}.",
    ].join("\n");
}

function normalizeHistory(history: Content[]): Content[] {
    if (history.length <= MAX_CONTEXT_MESSAGES) return history;
    const tail = history.slice(-MAX_CONTEXT_MESSAGES);
    const pinned = history.slice(0, Math.max(0, history.length - MAX_CONTEXT_MESSAGES)).filter((entry) => entry.role === "system");
    return [...pinned, ...tail];
}

function safeJsonParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        const objectMatch = raw.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}

function normalizeOptions(payload: unknown): string[] {
    const rawOptions = Array.isArray(payload)
        ? payload
        : (payload && typeof payload === "object" && Array.isArray((payload as { options?: unknown[] }).options)
            ? (payload as { options: unknown[] }).options
            : []);

    const unique: string[] = [];
    for (const entry of rawOptions) {
        const value = String(entry ?? "").trim();
        if (!value || unique.includes(value)) continue;
        unique.push(value);
        if (unique.length >= MAX_SUGGESTIONS) break;
    }

    return unique;
}

async function buildRoleplayHistory(personality: DbPersonality): Promise<Content[]> {
    const currentChat = await chatsService.getCurrentChat();
    if (!currentChat) return [];

    const { history } = await constructGeminiChatHistoryFromLocalChat(currentChat, personality);
    return normalizeHistory(history);
}

async function requestGeminiSuggestions(args: {
    model: string;
    apiKey: string;
    systemPrompt: string;
    history: Content[];
}): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: args.apiKey });
    const response = await ai.models.generateContent({
        model: args.model,
        config: {
            systemInstruction: {
                role: "system",
                parts: [{ text: args.systemPrompt }],
            },
            responseMimeType: "application/json",
            maxOutputTokens: 300,
            temperature: 0.9,
        },
        contents: [
            ...args.history,
            {
                role: "user",
                parts: [{ text: createSuggestionInstruction() }],
            },
        ],
    });

    return response.text || "";
}

async function requestOpenRouterSuggestions(args: {
    model: string;
    apiKey: string;
    systemPrompt: string;
    history: Content[];
}): Promise<string> {
    const messages = await convertGeminiHistoryToOpenRouterMessages(args.history);
    messages.unshift({ role: "system", content: args.systemPrompt });
    messages.push({ role: "user", content: createSuggestionInstruction() });

    const response = await requestOpenRouterCompletion({
        apiKey: args.apiKey,
        request: buildOpenRouterRequest({
            model: args.model,
            messages,
            stream: false,
            maxTokens: 300,
            temperature: 0.9,
            enableThinking: false,
            thinkingBudget: 0,
            isInternetSearchEnabled: false,
            responseFormat: { type: "json_object" },
        }),
    });

    return response.text || "";
}

export async function generateRoleplaySuggestions(): Promise<RoleplaySuggestionResult> {
    const personality = await personalityService.getSelected();
    if (!personality?.roleplayEnabled) {
        return { options: [], model: "" };
    }

    const settings = settingsService.getSettings();
    const model = getRoleplaySuggestionModel(settings);
    const modelDefinition = getChatModelDefinition(model);
    if (!modelDefinition) {
        throw new Error("No suggestion model is available.");
    }

    const visibleHistory = await buildRoleplayHistory(personality as DbPersonality);
    const hasConversationTurn = visibleHistory.some((entry) => entry.role === "model");
    if (!hasConversationTurn) {
        return { options: [], model };
    }

    const baseSystemPrompt = await settingsService.getSystemPrompt("chat");
    const baseText = String(baseSystemPrompt.parts?.[0]?.text || "");
    const systemPrompt = `${baseText}\n\n${createSuggestionInstruction()}`;

    if (isGeminiModel(model) && !settings.geminiApiKey.trim()) {
        throw new Error("Add a Gemini API key to generate roleplay suggestions with this model.");
    }

    if (!isGeminiModel(model) && !settings.openRouterApiKey.trim()) {
        throw new Error("Add an OpenRouter API key to generate roleplay suggestions with this model.");
    }

    const rawResponse = isGeminiModel(model)
        ? await requestGeminiSuggestions({
            model,
            apiKey: settings.geminiApiKey,
            systemPrompt,
            history: visibleHistory,
        })
        : await requestOpenRouterSuggestions({
            model,
            apiKey: settings.openRouterApiKey,
            systemPrompt,
            history: visibleHistory,
        });

    const options = normalizeOptions(safeJsonParse(rawResponse));
    return { options, model };
}

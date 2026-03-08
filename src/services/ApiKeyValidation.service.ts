import { GoogleGenAI } from "@google/genai";

import { ChatModel } from "../types/Models";

const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

export async function validateGeminiApiKey(apiKey: string): Promise<boolean> {
    const trimmed = apiKey.trim();
    if (!trimmed) return false;

    try {
        const ai = new GoogleGenAI({ apiKey: trimmed });
        await ai.models.generateContent({
            model: ChatModel.FLASH_LITE_LATEST,
            contents: "Say hello.",
        });
        return true;
    } catch {
        return false;
    }
}

export async function validateOpenRouterApiKey(apiKey: string): Promise<boolean> {
    const trimmed = apiKey.trim();
    if (!trimmed) return false;

    try {
        const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${trimmed}`,
                "HTTP-Referer": window.location.origin,
                "X-OpenRouter-Title": "Zodiac",
            },
        });

        return response.ok;
    } catch {
        return false;
    }
}

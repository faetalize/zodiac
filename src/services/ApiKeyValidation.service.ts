import { GoogleGenAI } from "@google/genai";

import { ChatModel } from "../types/Models";

const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_VALIDATION_MODEL = "openrouter/free";

export async function validateGeminiApiKey(apiKey: string): Promise<boolean> {
	const trimmed = apiKey.trim();
	if (!trimmed) return false;

	try {
		const ai = new GoogleGenAI({ apiKey: trimmed });
		await ai.models.generateContent({
			model: ChatModel.FLASH_LITE,
			contents: "Say hello."
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
		const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${trimmed}`,
				"Content-Type": "application/json",
				"HTTP-Referer": window.location.origin,
				"X-OpenRouter-Title": "Zodiac"
			},
			body: JSON.stringify({
				model: OPENROUTER_VALIDATION_MODEL,
				messages: [{ role: "user", content: "hi" }],
				max_tokens: 1
			})
		});

		return response.ok;
	} catch {
		return false;
	}
}

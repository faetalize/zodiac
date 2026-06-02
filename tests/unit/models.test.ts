import { describe, expect, it } from "vitest";

import {
	DEFAULT_OPENROUTER_TITLE_MODEL,
	getAccessibleRoleplaySuggestionModels,
	getValidRoleplaySuggestionModel,
	type ChatModelAccess
} from "../../src/types/Models";

describe("default model roles", () => {
	it("uses GLM 5 for local OpenRouter chat title generation", () => {
		expect(DEFAULT_OPENROUTER_TITLE_MODEL).toBe("z-ai/glm-5");
	});
});

describe("roleplay suggestion models", () => {
	it("includes only models flagged for roleplay suggestions", () => {
		const fullAccess: ChatModelAccess = { hasGeminiAccess: true, hasOpenRouterAccess: true };

		const expectedModels = [
			"Gemini 3.1 Flash Lite",
			"Gemini 3.1 Flash Lite via OpenRouter",
			"Gemini 3 Flash Preview",
			"Gemini 3 Flash Preview via OpenRouter",
			"Gemini 3.5 Flash",
			"Gemini 3.5 Flash via OpenRouter",
			"Gemini 3.1 Pro Preview",
			"Gemini 3.1 Pro Preview via OpenRouter",
			"GPT-OSS 120B",
			"Claude Sonnet 4.6",
			"GLM 5",
			"Qwen3.5 397B",
			"Qwen3.5 Plus"
		];
		const receivedModels = getAccessibleRoleplaySuggestionModels(fullAccess).map((model) => model.label);

		expect(receivedModels.sort()).toEqual(expectedModels.sort());
	});

	it("maps local-only Gemini suggestion models to OpenRouter variants for premium endpoint access", () => {
		const premiumAccess: ChatModelAccess = {
			hasGeminiAccess: true,
			hasOpenRouterAccess: true,
			isPremiumEndpointPreferred: true
		};

		expect(getValidRoleplaySuggestionModel("gemini-3.5-flash", premiumAccess)).toBe("google/gemini-3.5-flash");
	});
});

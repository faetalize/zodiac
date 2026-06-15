import { describe, expect, it } from "vitest";

import {
	DEFAULT_OPENROUTER_TITLE_MODEL,
	getAccessibleRoleplaySuggestionModels,
	getChatModelDefinition,
	getPremiumEndpointChatModel,
	getValidChatModel,
	getValidRoleplaySuggestionModel,
	modelRequiresThinking,
	type ChatModelAccess
} from "../../src/types/Models";

describe("default model roles", () => {
	it("uses GLM 5 for local OpenRouter chat title generation", () => {
		expect(DEFAULT_OPENROUTER_TITLE_MODEL).toBe("z-ai/glm-5");
	});
});

describe("premium endpoint model mapping", () => {
	it("keeps local Nano Banana as a local-only Gemini SDK model", () => {
		const localNanoBanana = getChatModelDefinition("gemini-2.5-flash-image");

		expect(localNanoBanana?.provider).toBe("gemini");
		expect(localNanoBanana?.localOnly).toBe(true);
		expect(localNanoBanana?.supportsImageOutput).toBe(true);
	});

	it("maps Nano Banana hybrid models to OpenRouter variants", () => {
		const premiumAccess: ChatModelAccess = {
			hasGeminiAccess: true,
			hasOpenRouterAccess: true,
			isPremiumEndpointPreferred: true
		};

		expect(getPremiumEndpointChatModel("gemini-2.5-flash-image")).toBe("google/gemini-2.5-flash-image");
		expect(getValidChatModel("gemini-2.5-flash-image", premiumAccess)).toBe("google/gemini-2.5-flash-image");
		expect(getValidChatModel("gemini-3-pro-image-preview", premiumAccess)).toBe(
			"google/gemini-3-pro-image-preview"
		);
		expect(getValidChatModel("gemini-3.1-flash-image-preview", premiumAccess)).toBe(
			"google/gemini-3.1-flash-image-preview"
		);
	});

	it("keeps OpenRouter image-output variants as image-output chat models", () => {
		const models = [
			"google/gemini-2.5-flash-image",
			"google/gemini-3-pro-image-preview",
			"google/gemini-3.1-flash-image-preview",
			"x-ai/grok-imagine-image-quality"
		];

		for (const model of models) {
			expect(getChatModelDefinition(model)?.provider).toBe("openrouter");
			expect(getChatModelDefinition(model)?.supportsImageOutput).toBe(true);
		}
	});
});

describe("roleplay suggestion models", () => {
	it("requires thinking for Gemini 3.5 Flash local and OpenRouter variants", () => {
		expect(modelRequiresThinking("gemini-3.5-flash")).toBe(true);
		expect(modelRequiresThinking("google/gemini-3.5-flash")).toBe(true);
	});

	it("requires thinking for Nano Banana Pro local and OpenRouter variants", () => {
		expect(modelRequiresThinking("gemini-3-pro-image-preview")).toBe(true);
		expect(modelRequiresThinking("google/gemini-3-pro-image-preview")).toBe(true);
	});

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
			"Claude Haiku 4.5",
			"DeepSeek V4 Flash",
			"GLM 5",
			"GLM 5.1",
			"Gemma 4 31B",
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

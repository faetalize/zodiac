import { describe, expect, it } from "vitest";

import { getAccessibleRoleplaySuggestionModels, type ChatModelAccess } from "../../src/types/Models";

describe("roleplay suggestion models", () => {
	it("includes only models flagged for roleplay suggestions", () => {
		const fullAccess: ChatModelAccess = { hasGeminiAccess: true, hasOpenRouterAccess: true };

		const expectedModels = [
			"Gemini 3.1 Flash Lite Preview",
			"Gemini 3 Flash Preview",
			"Gemini 3.5 Flash",
			"Gemini 3.1 Pro Preview",
			"GPT-OSS 120B",
			"Claude Sonnet 4.6",
			"GLM 5",
			"Qwen3.5 397B",
			"Qwen3.5 Plus"
		];
		const receivedModels = getAccessibleRoleplaySuggestionModels(fullAccess).map((model) => model.label);

		expect(receivedModels.sort()).toEqual(expectedModels.sort());
	});
});

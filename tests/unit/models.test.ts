import { describe, expect, it } from "vitest";

import { getAccessibleRoleplaySuggestionModels, type ChatModelAccess } from "../../src/types/Models";

describe("roleplay suggestion models", () => {
	it("includes only models flagged for roleplay suggestions", () => {
		const fullAccess: ChatModelAccess = { hasGeminiAccess: true, hasOpenRouterAccess: true };

		expect(getAccessibleRoleplaySuggestionModels(fullAccess).map((model) => model.label)).toEqual([
			"Gemini 3.1 Flash Lite Preview",
			"Gemini 3.0 Flash",
			"Gemini 3.1 Pro Preview",
			"GPT-OSS 120B",
			"Claude Sonnet 4.6",
			"GLM 5",
			"Qwen3.5 397B",
			"Qwen3.5 Plus"
		]);
	});
});

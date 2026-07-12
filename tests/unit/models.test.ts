import { describe, expect, it } from "vitest";

import {
	DEFAULT_OPENROUTER_TITLE_MODEL,
	ImageModelId,
	ImageModelProvider,
	ImagePromptType,
	getAccessibleRoleplaySuggestionModels,
	getChatModelDefinition,
	getValidRoleplaySuggestionModel,
	modelRequiresThinking,
	type ChatModelAccess
} from "../../src/types/Models";
import { DEFAULT_IMAGE_EDIT_MODEL, DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "../../src/constants/ImageModels";

describe("default model roles", () => {
	it("uses GLM 5 for local OpenRouter chat title generation", () => {
		expect(DEFAULT_OPENROUTER_TITLE_MODEL).toBe("z-ai/glm-5");
	});
});

describe("image model definitions", () => {
	it("represents current image generation and editing models once", () => {
		const modelIds = IMAGE_MODELS.map((model) => model.id);

		expect(new Set(modelIds).size).toBe(modelIds.length);
		expect(modelIds.sort()).toEqual(
			[
				ImageModelId.ILLUSTRIOUS,
				ImageModelId.BLXL,
				ImageModelId.QWEN,
				ImageModelId.SEEDREAM,
				ImageModelId.PRUNA,
				ImageModelId.SEEDREAM_5_0_PRO,
				ImageModelId.SEEDREAM_4_5,
				ImageModelId.QWEN_2_0_PRO,
				ImageModelId.QWEN_2_0,
				ImageModelId.GEMINI_2_5_FLASH_IMAGE,
				ImageModelId.GEMINI_3_PRO_IMAGE_PREVIEW,
				ImageModelId.GEMINI_3_1_FLASH_IMAGE_PREVIEW,
				ImageModelId.GROK_IMAGINE_IMAGE_QUALITY
			].sort()
		);
	});

	it("keeps image defaults pointed at valid model capabilities", () => {
		expect(IMAGE_MODELS.find((model) => model.id === DEFAULT_IMAGE_MODEL)?.generation).toBe(true);
		expect(IMAGE_MODELS.find((model) => model.id === DEFAULT_IMAGE_EDIT_MODEL)?.editing).toBe(true);
	});

	it("records provider routes for dedicated image models", () => {
		for (const model of IMAGE_MODELS.filter((candidate) => !candidate.openRouterModelId)) {
			expect(model.providers).toEqual([ImageModelProvider.EDGE]);
		}
		for (const modelId of [
			ImageModelId.GEMINI_2_5_FLASH_IMAGE,
			ImageModelId.GEMINI_3_PRO_IMAGE_PREVIEW,
			ImageModelId.GEMINI_3_1_FLASH_IMAGE_PREVIEW
		]) {
			expect(IMAGE_MODELS.find((model) => model.id === modelId)?.providers).toEqual([
				ImageModelProvider.EDGE,
				ImageModelProvider.OPENROUTER,
				ImageModelProvider.GOOGLE
			]);
		}
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.GROK_IMAGINE_IMAGE_QUALITY)?.providers).toEqual([
			ImageModelProvider.EDGE,
			ImageModelProvider.OPENROUTER
		]);
	});

	it("stores prompt type per image model", () => {
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.ILLUSTRIOUS)?.promptType).toBe(
			ImagePromptType.TAG
		);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.BLXL)?.promptType).toBe(ImagePromptType.TAG);

		for (const modelId of [
			ImageModelId.QWEN,
			ImageModelId.SEEDREAM,
			ImageModelId.PRUNA,
			ImageModelId.SEEDREAM_5_0_PRO,
			ImageModelId.SEEDREAM_4_5,
			ImageModelId.QWEN_2_0_PRO,
			ImageModelId.QWEN_2_0
		]) {
			expect(IMAGE_MODELS.find((model) => model.id === modelId)?.promptType).toBe(ImagePromptType.SEMANTIC);
		}
	});

	it("declares Runware LoRA support only for open-weight models", () => {
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.ILLUSTRIOUS)?.loraArchitecture).toBe(
			"illustrious"
		);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.BLXL)?.loraArchitecture).toBe("sdxl");

		for (const model of IMAGE_MODELS.filter(
			(candidate) => candidate.id !== ImageModelId.ILLUSTRIOUS && candidate.id !== ImageModelId.BLXL
		)) {
			expect(model.loraArchitecture).toBeUndefined();
		}
	});

	it("stores editing input image limits in image model metadata", () => {
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.QWEN)?.maxInputImages).toBe(3);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.SEEDREAM)?.maxInputImages).toBe(5);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.PRUNA)?.maxInputImages).toBe(5);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.SEEDREAM_5_0_PRO)?.maxInputImages).toBe(5);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.SEEDREAM_4_5)?.maxInputImages).toBe(5);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.QWEN_2_0_PRO)?.maxInputImages).toBe(3);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.QWEN_2_0)?.maxInputImages).toBe(3);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.GEMINI_2_5_FLASH_IMAGE)?.maxInputImages).toBe(5);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.GEMINI_3_PRO_IMAGE_PREVIEW)?.maxInputImages).toBe(
			5
		);
		expect(
			IMAGE_MODELS.find((model) => model.id === ImageModelId.GEMINI_3_1_FLASH_IMAGE_PREVIEW)?.maxInputImages
		).toBe(5);
		expect(IMAGE_MODELS.find((model) => model.id === ImageModelId.GROK_IMAGINE_IMAGE_QUALITY)?.maxInputImages).toBe(
			3
		);
	});
});

describe("image models are not chat models", () => {
	it("keeps dedicated image model IDs out of the chat catalog", () => {
		for (const model of [
			"gemini-2.5-flash-image",
			"gemini-3-pro-image-preview",
			"gemini-3.1-flash-image-preview",
			"google/gemini-2.5-flash-image",
			"google/gemini-3-pro-image-preview",
			"google/gemini-3.1-flash-image-preview",
			"x-ai/grok-imagine-image-quality"
		]) {
			expect(getChatModelDefinition(model)).toBeUndefined();
		}
	});
});

describe("roleplay suggestion models", () => {
	it("requires thinking for Gemini 3.5 Flash local and OpenRouter variants", () => {
		expect(modelRequiresThinking("gemini-3.5-flash")).toBe(true);
		expect(modelRequiresThinking("google/gemini-3.5-flash")).toBe(true);
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
			"GLM 5.2",
			"Gemma 4 31B",
			"Grok 4.3",
			"Qwen3.5 397B",
			"Qwen3.5 Plus",
			"Qwen3.6 Max Preview",
			"Qwen3.6 Plus",
			"Qwen3.7 Max",
			"Qwen3.7 Plus"
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

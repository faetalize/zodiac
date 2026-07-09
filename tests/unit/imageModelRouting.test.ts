import { describe, expect, it } from "vitest";

import { ImageModelProvider, ImagePromptType, type ImageModelDefinition } from "../../src/types/ImageModels";
import { ImageModelId } from "../../src/types/ImageModels";
import { resolveImageModelRoute, type ImageRouteAvailability } from "../../src/utils/imageModelRouting";

function makeModel(providers: ImageModelProvider[]): ImageModelDefinition {
	return {
		id: ImageModelId.ILLUSTRIOUS,
		label: "Test model",
		providers,
		generation: true,
		editing: false,
		promptType: ImagePromptType.SEMANTIC
	};
}

const NOTHING: ImageRouteAvailability = { edgeCredits: false, geminiKey: false, openRouterKey: false };

describe("resolveImageModelRoute", () => {
	describe("prefer edge (image premium endpoint ON) — strict edge-only", () => {
		it("routes to edge when the model supports edge and credits are available", () => {
			const result = resolveImageModelRoute(makeModel([ImageModelProvider.EDGE]), true, {
				...NOTHING,
				edgeCredits: true
			});
			expect(result).toEqual({ route: "edge" });
		});

		it("prefers edge even when a BYOK key would also work", () => {
			const result = resolveImageModelRoute(
				makeModel([ImageModelProvider.GOOGLE, ImageModelProvider.EDGE]),
				true,
				{
					edgeCredits: true,
					geminiKey: true,
					openRouterKey: false
				}
			);
			expect(result).toEqual({ route: "edge" });
		});

		it("fails with edge-no-credits when the model supports edge but credits are exhausted", () => {
			const result = resolveImageModelRoute(makeModel([ImageModelProvider.EDGE]), true, NOTHING);
			expect(result).toEqual({ route: null, reason: "edge-no-credits" });
		});

		it("does NOT fall back to an available BYOK route under strict edge preference", () => {
			const result = resolveImageModelRoute(
				makeModel([ImageModelProvider.GOOGLE, ImageModelProvider.EDGE]),
				true,
				{
					edgeCredits: false,
					geminiKey: true,
					openRouterKey: false
				}
			);
			expect(result).toEqual({ route: null, reason: "edge-no-credits" });
		});

		it("fails with edge-not-supported when the model has no edge provider", () => {
			const result = resolveImageModelRoute(makeModel([ImageModelProvider.GOOGLE]), true, {
				...NOTHING,
				geminiKey: true,
				edgeCredits: true
			});
			expect(result).toEqual({ route: null, reason: "edge-not-supported" });
		});
	});

	describe("prefer BYOK (image premium endpoint OFF) — strict BYOK-only", () => {
		it("routes to google when the model supports Google and a Gemini key is present", () => {
			const result = resolveImageModelRoute(makeModel([ImageModelProvider.GOOGLE]), false, {
				...NOTHING,
				geminiKey: true
			});
			expect(result).toEqual({ route: "google" });
		});

		it("routes to openrouter when the model supports OpenRouter and a key is present", () => {
			const result = resolveImageModelRoute(makeModel([ImageModelProvider.OPENROUTER]), false, {
				...NOTHING,
				openRouterKey: true
			});
			expect(result).toEqual({ route: "openrouter" });
		});

		it("picks the first AVAILABLE BYOK provider in the model's declared order", () => {
			// Model lists OpenRouter first, but only a Gemini key is present.
			const result = resolveImageModelRoute(
				makeModel([ImageModelProvider.OPENROUTER, ImageModelProvider.GOOGLE]),
				false,
				{ ...NOTHING, geminiKey: true }
			);
			expect(result).toEqual({ route: "google" });
		});

		it("honors declared order when multiple BYOK routes are available", () => {
			const result = resolveImageModelRoute(
				makeModel([ImageModelProvider.OPENROUTER, ImageModelProvider.GOOGLE]),
				false,
				{ edgeCredits: false, geminiKey: true, openRouterKey: true }
			);
			expect(result).toEqual({ route: "openrouter" });
		});

		it("does NOT fall back to edge credits under strict BYOK preference", () => {
			const result = resolveImageModelRoute(
				makeModel([ImageModelProvider.GOOGLE, ImageModelProvider.EDGE]),
				false,
				{
					edgeCredits: true,
					geminiKey: false,
					openRouterKey: false
				}
			);
			expect(result).toEqual({ route: null, reason: "byok-missing-key" });
		});

		it("fails with byok-missing-key when the model supports a BYOK provider but no matching key is present", () => {
			const result = resolveImageModelRoute(makeModel([ImageModelProvider.GOOGLE]), false, NOTHING);
			expect(result).toEqual({ route: null, reason: "byok-missing-key" });
		});

		it("fails with byok-not-supported when the model is edge-only", () => {
			const result = resolveImageModelRoute(makeModel([ImageModelProvider.EDGE]), false, {
				edgeCredits: true,
				geminiKey: true,
				openRouterKey: true
			});
			expect(result).toEqual({ route: null, reason: "byok-not-supported" });
		});
	});
});

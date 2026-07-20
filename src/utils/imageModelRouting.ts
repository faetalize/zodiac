import { ImageModelProvider, type ImageModelDefinition } from "../types/ImageModels";

/**
 * A concrete transport an image request can be sent over.
 * - `edge`      -> Supabase edge function, billed against the user's image credits
 * - `google`    -> Google Gemini SDK, using the user's own Gemini API key (BYOK)
 * - `openrouter`-> OpenRouter, using the user's own OpenRouter API key (BYOK)
 */
export type ImageRoute = "edge" | "google" | "openrouter";

/**
 * Why no route could be resolved for the selected model under the current preference.
 * Consumers map these to actionable user-facing messages.
 */
export type ImageRouteUnavailableReason =
	| "edge-no-credits" // prefer edge, model supports edge, but the account has no image credits
	| "edge-not-supported" // prefer edge, but the model has no edge provider
	| "byok-missing-key" // prefer BYOK, model supports a BYOK provider, but no matching API key is set
	| "byok-not-supported"; // prefer BYOK, but the model is edge-only

export interface ImageRouteAvailability {
	/** The account can spend image credits on the edge endpoint (isImageGenerationAvailable -> type "all"). */
	edgeCreditsAvailable: boolean;
	/** A Gemini API key is configured. */
	geminiKey: boolean;
	/** An OpenRouter API key is configured. */
	openRouterKey: boolean;
}

export type ImageRouteResolution =
	| { route: ImageRoute; reason?: undefined }
	| { route: null; reason: ImageRouteUnavailableReason };

/**
 * Resolves which transport an image request for `model` should use.
 *
 * Routing is STRICT: `preferEdge` selects the route class outright rather than
 * expressing a soft preference. When the selected model cannot satisfy the
 * chosen class, the resolution fails (with a reason) instead of silently
 * falling back to the other class — the caller surfaces an actionable toast.
 *
 * @param model        the selected image model definition
 * @param preferEdge   true when the "prefer image credits" toggle is on (edge-only); false for BYOK-only
 * @param availability what the account currently has access to
 */
export function resolveImageModelRoute(
	model: ImageModelDefinition,
	preferEdge: boolean,
	availability: ImageRouteAvailability
): ImageRouteResolution {
	if (preferEdge) {
		if (!model.providers.includes(ImageModelProvider.EDGE)) {
			return { route: null, reason: "edge-not-supported" };
		}
		if (!availability.edgeCreditsAvailable) {
			return { route: null, reason: "edge-no-credits" };
		}
		return { route: "edge" };
	}

	const byokProviders = model.providers.filter((provider) => provider !== ImageModelProvider.EDGE);
	if (byokProviders.length === 0) {
		return { route: null, reason: "byok-not-supported" };
	}

	for (const provider of byokProviders) {
		if (provider === ImageModelProvider.GOOGLE && availability.geminiKey) {
			return { route: "google" };
		}
		if (provider === ImageModelProvider.OPENROUTER && availability.openRouterKey) {
			return { route: "openrouter" };
		}
	}

	return { route: null, reason: "byok-missing-key" };
}

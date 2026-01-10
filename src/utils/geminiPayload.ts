/**
 * Gemini payload extraction utilities.
 * Shared functions for extracting data from Gemini API responses.
 */

import type { GeneratedImage } from "../types/Message";

/**
 * Extracts the finish reason from a Gemini response payload.
 */
export function getFinishReason(payload: any): unknown {
    return payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason;
}

/**
 * Extracts the finish message from a Gemini response payload.
 */
export function getFinishMessage(payload: any): unknown {
    return (payload?.candidates?.[0] as any)?.finishMessage;
}

/**
 * Extracts the grounding rendered content from a Gemini response payload.
 */
export function getGroundingRenderedContent(payload: any): string {
    return payload?.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent || "";
}

/**
 * Pushes an inline image from a Gemini response part to the images array.
 */
export function pushInlineImage(args: {
    images: GeneratedImage[];
    part: any;
    useSkipThoughtSignature: boolean;
    skipThoughtSignatureValidator: string;
}): void {
    const { images, part, useSkipThoughtSignature, skipThoughtSignatureValidator } = args;

    images.push({
        mimeType: part.inlineData?.mimeType || "image/png",
        base64: part.inlineData?.data || "",
        thoughtSignature: part.thoughtSignature ?? (useSkipThoughtSignature ? skipThoughtSignatureValidator : undefined),
        thought: part.thought,
    });
}

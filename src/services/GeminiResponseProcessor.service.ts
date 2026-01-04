import { BlockedReason, FinishReason, GenerateContentResponse } from "@google/genai";
import type { GeneratedImage } from "../models/Message";

export type GeminiAbortMode = "throw" | "return";

export type GeminiLocalSdkCallbacks = {
    onText?: (args: { delta: string; text: string }) => void | Promise<void>;
    onThinking?: (args: { delta: string; thinking: string }) => void | Promise<void>;
    onGrounding?: (args: { renderedContent: string }) => void;
    onImage?: (image: GeneratedImage) => void;
};

export type GeminiLocalSdkProcessArgs = {
    includeThoughts: boolean;
    useSkipThoughtSignature: boolean;
    skipThoughtSignatureValidator: string;
    signal?: AbortSignal;
    abortMode: GeminiAbortMode;
    throwOnBlocked: boolean;
    callbacks?: GeminiLocalSdkCallbacks;
};

export type GeminiLocalSdkProcessResult = {
    text: string;
    thinking: string;
    textSignature?: string;
    finishReason?: unknown;
    groundingContent: string;
    images: GeneratedImage[];
    wasAborted: boolean;
};

export function isGeminiBlockedFinishReason(finishReason: unknown): boolean {
    return (
        finishReason === FinishReason.PROHIBITED_CONTENT ||
        finishReason === FinishReason.OTHER ||
        finishReason === BlockedReason.PROHIBITED_CONTENT
    );
}

export function throwGeminiBlocked(args: { finishReason: unknown; finishMessage?: unknown }): never {
    const message = (args.finishMessage ?? "").toString() || `Message blocked by Gemini (${String(args.finishReason)}).`;
    const err = new Error(message);
    (err as any).name = "GeminiBlocked";
    (err as any).finishReason = args.finishReason;
    throw err;
}

function throwAbortError(): never {
    const err = new Error("Aborted");
    (err as any).name = "AbortError";
    throw err;
}

function getFinishReason(payload: any): unknown {
    return payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason;
}

function getFinishMessage(payload: any): unknown {
    return (payload?.candidates?.[0] as any)?.finishMessage;
}

function getGroundingRenderedContent(payload: any): string {
    return payload?.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent || "";
}

function pushInlineImage(args: {
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

export async function processGeminiLocalSdkResponse(args: {
    response: GenerateContentResponse;
    process: GeminiLocalSdkProcessArgs;
}): Promise<GeminiLocalSdkProcessResult> {
    const { response, process } = args;

    let text = "";
    let thinking = "";
    let textSignature: string | undefined;
    let finishReason: unknown;
    let groundingContent = "";
    const images: GeneratedImage[] = [];

    finishReason = getFinishReason(response);
    if (process.throwOnBlocked && isGeminiBlockedFinishReason(finishReason)) {
        throwGeminiBlocked({ finishReason, finishMessage: getFinishMessage(response) });
    }

    for (const part of response?.candidates?.[0]?.content?.parts || []) {
        if (part?.thought && part?.text && process.includeThoughts) {
            const delta = String(part.text);
            thinking += delta;
            await process.callbacks?.onThinking?.({ delta, thinking });
        } else if (part?.text) {
            if (!textSignature) {
                textSignature = part.thoughtSignature ?? (process.useSkipThoughtSignature ? process.skipThoughtSignatureValidator : undefined);
            }
            const delta = String(part.text);
            text += delta;
            await process.callbacks?.onText?.({ delta, text });
        } else if (part?.inlineData) {
            pushInlineImage({
                images,
                part,
                useSkipThoughtSignature: process.useSkipThoughtSignature,
                skipThoughtSignatureValidator: process.skipThoughtSignatureValidator,
            });
            process.callbacks?.onImage?.(images[images.length - 1]);
        }
    }

    groundingContent = getGroundingRenderedContent(response);
    if (groundingContent) {
        process.callbacks?.onGrounding?.({ renderedContent: groundingContent });
    }

    return {
        text,
        thinking,
        textSignature,
        finishReason,
        groundingContent,
        images,
        wasAborted: false,
    };
}

export async function processGeminiLocalSdkStream(args: {
    stream: AsyncGenerator<GenerateContentResponse>;
    process: GeminiLocalSdkProcessArgs;
}): Promise<GeminiLocalSdkProcessResult> {
    const { stream, process } = args;

    let text = "";
    let thinking = "";
    let textSignature: string | undefined;
    let finishReason: unknown;
    let groundingContent = "";
    const images: GeneratedImage[] = [];
    let wasAborted = false;

    for await (const chunk of stream) {
        if (process.signal?.aborted) {
            if (process.abortMode === "throw") {
                throwAbortError();
            }
            wasAborted = true;
            break;
        }

        finishReason = getFinishReason(chunk);
        if (process.throwOnBlocked && isGeminiBlockedFinishReason(finishReason)) {
            throwGeminiBlocked({ finishReason, finishMessage: getFinishMessage(chunk) });
        }

        for (const part of chunk?.candidates?.[0]?.content?.parts || []) {
            if (part?.thought && part?.text && process.includeThoughts) {
                const delta = String(part.text);
                thinking += delta;
                await process.callbacks?.onThinking?.({ delta, thinking });
            } else if (part?.text) {
                if (!textSignature) {
                    textSignature = part.thoughtSignature ?? (process.useSkipThoughtSignature ? process.skipThoughtSignatureValidator : undefined);
                }
                const delta = String(part.text);
                text += delta;
                await process.callbacks?.onText?.({ delta, text });
            } else if (part?.inlineData) {
                pushInlineImage({
                    images,
                    part,
                    useSkipThoughtSignature: process.useSkipThoughtSignature,
                    skipThoughtSignatureValidator: process.skipThoughtSignatureValidator,
                });
                process.callbacks?.onImage?.(images[images.length - 1]);
            }
        }

        const chunkGrounding = getGroundingRenderedContent(chunk);
        if (chunkGrounding) {
            groundingContent = chunkGrounding;
            process.callbacks?.onGrounding?.({ renderedContent: groundingContent });
        }
    }

    return {
        text,
        thinking,
        textSignature,
        finishReason,
        groundingContent,
        images,
        wasAborted,
    };
}

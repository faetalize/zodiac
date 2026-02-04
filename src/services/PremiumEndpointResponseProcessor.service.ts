import type { GenerateContentResponse } from "@google/genai";
import type { Response as OpenRouterResponse, StreamingChoice } from "../types/OpenRouterTypes";
import type { GeneratedImage } from "../types/Message";
import type { PremiumEndpointAbortMode, PremiumEndpointCallbacks, PremiumEndpointProcessArgs, PremiumEndpointProcessResult } from "../types/PremiumEndpointResponseProcessor";

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

async function applyGeminiPayload(args: {
    payload: GenerateContentResponse;
    process: PremiumEndpointProcessArgs;
    state: {
        text: string;
        thinking: string;
        textSignature?: string;
        finishReason?: unknown;
        groundingContent: string;
        images: GeneratedImage[];
    };
}): Promise<void> {
    const { payload, process, state } = args;

    const finishReason = getFinishReason(payload);
    state.finishReason = finishReason;
    if (process.throwOnBlocked(finishReason)) {
        process.onBlocked({ finishReason, finishMessage: getFinishMessage(payload) });
    }

    for (const part of payload?.candidates?.[0]?.content?.parts || []) {
        if (part?.thought && part?.text) {
            // Never mix thought parts into the main answer.
            if (process.includeThoughts) {
                const delta = String(part.text);
                state.thinking += delta;
                await process.callbacks?.onThinking?.({ delta, thinking: state.thinking });
            }
        } else if (part?.text) {
            if (!state.textSignature) {
                state.textSignature = part.thoughtSignature ?? (process.useSkipThoughtSignature ? process.skipThoughtSignatureValidator : undefined);
            }
            const delta = String(part.text);
            state.text += delta;
            await process.callbacks?.onText?.({ delta, text: state.text });
        } else if (part?.inlineData) {
            pushInlineImage({
                images: state.images,
                part,
                useSkipThoughtSignature: process.useSkipThoughtSignature,
                skipThoughtSignatureValidator: process.skipThoughtSignatureValidator,
            });
            process.callbacks?.onImage?.(state.images[state.images.length - 1]);
        }
    }

    const grounding = getGroundingRenderedContent(payload);
    if (grounding) {
        state.groundingContent = grounding;
        process.callbacks?.onGrounding?.({ renderedContent: grounding });
    }
}

async function applyFallbackDelta(args: {
    data: string;
    process: PremiumEndpointProcessArgs;
    state: {
        text: string;
        thinking: string;
    };
}): Promise<void> {
    const { data, process, state } = args;

    if (data === "[DONE]" || data === "{}") {
        return;
    }

    const glmPayload = JSON.parse(data) as OpenRouterResponse;
    const choice = glmPayload.choices?.[0] as StreamingChoice | undefined;
    const deltaObj = choice?.delta;

    if (deltaObj?.content) {
        const delta = String(deltaObj.content);
        state.text += delta;
        await process.callbacks?.onText?.({ delta, text: state.text });
    }

    if (deltaObj?.reasoning && process.includeThoughts) {
        const delta = String(deltaObj.reasoning);
        state.thinking += delta;
        await process.callbacks?.onThinking?.({ delta, thinking: state.thinking });
    }
}

export async function processPremiumEndpointSse(args: {
    res: Response;
    process: PremiumEndpointProcessArgs;
}): Promise<PremiumEndpointProcessResult> {
    const { res, process } = args;

    if (!res.body) {
        return {
            text: "",
            thinking: "",
            groundingContent: "",
            images: [],
            wasAborted: false,
            wasFallbackMode: false,
        };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const state: {
        text: string;
        thinking: string;
        textSignature?: string;
        finishReason?: unknown;
        groundingContent: string;
        images: GeneratedImage[];
    } = {
        text: "",
        thinking: "",
        groundingContent: "",
        images: [],
    };

    let buffer = "";
    let wasFallbackMode = false;
    let wasAborted = false;

    while (true) {
        if (process.signal?.aborted) {
            try {
                await reader.cancel();
            } catch {
                //noop
            }

            if (process.abortMode === "throw") {
                throwAbortError();
            }

            wasAborted = true;
            break;
        }

        const { value, done } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });

        let delimiterIndex: number;
        while ((delimiterIndex = buffer.indexOf("\n\n")) !== -1) {
            const eventBlock = buffer.slice(0, delimiterIndex);
            buffer = buffer.slice(delimiterIndex + 2);
            if (!eventBlock) continue;
            if (eventBlock.startsWith(":")) continue;

            const lines = eventBlock.split("\n");
            let eventName = "message";
            let data = "";
            for (const line of lines) {
                if (line.startsWith("event: ")) eventName = line.slice(7).trim();
                else if (line.startsWith("data: ")) data += line.slice(6);
            }

            if (eventName === "error") {
                throw new Error(data);
            }
            if (eventName === "done") {
                return {
                    text: state.text,
                    thinking: state.thinking,
                    textSignature: state.textSignature,
                    finishReason: state.finishReason,
                    groundingContent: state.groundingContent,
                    images: state.images,
                    wasAborted,
                    wasFallbackMode,
                };
            }
            if (eventName === "fallback") {
                wasFallbackMode = true;
                let fallbackMeta: { mode?: "continue" | "restart"; requestId?: string; reason?: string; hasJsonSchema?: boolean } | undefined;
                if (data) {
                    try {
                        fallbackMeta = JSON.parse(data);
                    } catch {
                        //noop
                    }
                }

                const mode = fallbackMeta?.mode;
                if (mode === "restart") {
                    // Backend is restarting the response from scratch (e.g. no prefill available
                    // or the continuation attempt produced no tokens). Clear any partial Gemini output.
                    state.text = "";
                    state.thinking = "";
                    state.textSignature = undefined;
                }

                // Default behavior: preserve already-streamed Gemini output and append GLM continuation.
                // Only reset metadata that truly restarts (finish reason, grounding, images).
                state.finishReason = undefined;
                state.groundingContent = "";
                state.images = [];
                process.callbacks?.onFallbackStart?.(fallbackMeta);
                continue;
            }
            if (!data) {
                continue;
            }

            if (wasFallbackMode) {
                await applyFallbackDelta({ data, process, state });
                continue;
            }

            const payload = JSON.parse(data) as GenerateContentResponse;
            await applyGeminiPayload({ payload, process, state });
        }
    }

    return {
        text: state.text,
        thinking: state.thinking,
        textSignature: state.textSignature,
        finishReason: state.finishReason,
        groundingContent: state.groundingContent,
        images: state.images,
        wasAborted,
        wasFallbackMode,
    };
}

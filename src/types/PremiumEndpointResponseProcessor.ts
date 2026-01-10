import type { GeneratedImage } from "./Message";

export type PremiumEndpointAbortMode = "throw" | "return";

export type PremiumEndpointCallbacks = {
    onFallbackStart?: (args?: { mode?: "continue" | "restart"; requestId?: string; reason?: string; hasJsonSchema?: boolean }) => void;
    onText?: (args: { delta: string; text: string }) => void | Promise<void>;
    onThinking?: (args: { delta: string; thinking: string }) => void | Promise<void>;
    onGrounding?: (args: { renderedContent: string }) => void;
    onImage?: (image: GeneratedImage) => void;
};

export type PremiumEndpointProcessArgs = {
    signal?: AbortSignal;
    abortMode: PremiumEndpointAbortMode;
    includeThoughts: boolean;
    useSkipThoughtSignature: boolean;
    skipThoughtSignatureValidator: string;
    throwOnBlocked: (finishReason: unknown) => boolean;
    onBlocked: (args: { finishReason: unknown; finishMessage?: unknown }) => never;
    callbacks?: PremiumEndpointCallbacks;
};

export type PremiumEndpointProcessResult = {
    text: string;
    thinking: string;
    textSignature?: string;
    finishReason?: unknown;
    groundingContent: string;
    images: GeneratedImage[];
    wasAborted: boolean;
    wasFallbackMode: boolean;
};

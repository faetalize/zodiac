import type { GeneratedImage } from "./Message";

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

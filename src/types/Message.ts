import type { BlobReference } from './BlobReference';

/**
 * Text and thinking content extracted from a model response.
 */
export interface TextAndThinking {
    text: string;
    thinking: string;
}

export interface GeneratedImage {
    mimeType: string;
    base64: string; // raw base64 bytes without data: prefix
    thoughtSignature?: string;
    thought?: boolean;
    /**
     * Runtime-only blob reference for images stored in encrypted blob storage.
     * Present when the image was pulled from cloud sync using the blob store
     * format. Not persisted to IndexedDB — only used to lazily resolve the
     * base64 data on demand (base64 will be '' until resolved).
     */
    _blobRef?: BlobReference;
    /**
     * Runtime-only blob reference for oversized thought signatures.
     * Present when thoughtSignature is stored in encrypted blob storage.
     */
    _thoughtSignatureRef?: BlobReference;
}

export type MessageDebugMode = "normal" | "image_generation" | "image_editing";

export interface MessageDebugInfo {
    mode: MessageDebugMode;
    premiumEndpointEnabled: boolean;
    requestSlug?: string;
    requestSlugs?: string[];
    chatSettings: {
        model: string;
        maxOutputTokens: number;
        temperature: number;
        streamResponses: boolean;
        thinkingEnabled: boolean;
        thinkingBudget: number;
    };
    modeSettings?: {
        requestModel?: string;
        imageModel?: string;
        imageEditingModel?: string;
    };
}

export interface Message {
    role: "user" | "model";
    parts: Array<{
        text: string;
        attachments?: FileList | File[];
        thoughtSignature?: string;
        _thoughtSignatureRef?: BlobReference;
    }>;
    personalityid?: string;
    groundingContent?: string;
    // Optional AI-generated images for model responses
    generatedImages?: GeneratedImage[];
    // Optional chain-of-thought / reasoning text (not part of visible answer by default)
    thinking?: string;
    // Whether this message is hidden from the normal chat view (e.g. system prompts)
    hidden?: boolean;
    // Whether this message was interrupted by the user
    interrupted?: boolean;
    // Round index for group chat RPG mode (groups messages into rounds)
    roundIndex?: number;
    // Model identifier for the LLM or image model that generated this response
    originModel?: string;
    debugInfo?: MessageDebugInfo;
}

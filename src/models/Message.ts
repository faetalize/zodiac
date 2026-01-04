import { Content } from "@google/genai";

export interface GeneratedImage {
    mimeType: string;
    base64: string; // raw base64 bytes without data: prefix
    thoughtSignature?: string;
    thought?: boolean;
}

export interface Message {
    role: "user" | "model";
    parts: Array<{
        text: string;
        attachments?: FileList;
        thoughtSignature?: string;
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
}

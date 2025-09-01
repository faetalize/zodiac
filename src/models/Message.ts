export interface GeneratedImage {
    mimeType: string;
    base64: string; // raw base64 bytes without data: prefix
}

export interface Message {
    role: "user" | "model";
    parts: Array<{
        text: string;
        attachments?: FileList;
    }>;
    personalityid?: string;
    groundingContent?: string;
    // Optional AI-generated images for model responses
    generatedImages?: GeneratedImage[];
}
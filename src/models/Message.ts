export interface Message {
    role: "user" | "model";
    parts: Array<{
        text: string;
        attachments?: FileList;
    }>;
    personalityid?: number;
    groundingContent?: string;
}
export interface Message {
    role: "user" | "model";
    parts: Array<{
        text: string;
        attachments?: FileList;
    }>;
    personalityid?: string;
    groundingContent?: string;
}
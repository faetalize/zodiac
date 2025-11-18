import { Message } from "./Message";

export type ChatSortMode = "created_at" | "last_interaction" | "alphabetical";

export interface Chat {
    title: string;
    timestamp: number; // creation date
    content: Array<Message>;
    // last interaction timestamp; should remain separate from creation timestamp
    lastModified?: Date;
}

export interface DbChat extends Chat {
    id: number;
}
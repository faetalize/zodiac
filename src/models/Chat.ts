import { Message } from "./Message";

export type ChatSortMode = "created_at" | "last_interaction" | "alphabetical";

export type GroupChatMode = "dynamic" | "rpg";

export interface GroupChatRpgSettings {
    turnOrder: string[]; //personality ids in order
    scenarioPrompt?: string;
    narratorEnabled?: boolean;
}

export interface GroupChatConfig {
    mode: GroupChatMode;
    participantIds: string[]; //max 5
    rpg?: GroupChatRpgSettings;
}

export interface Chat {
    title: string;
    timestamp: number; // creation date
    content: Array<Message>;
    // last interaction timestamp; should remain separate from creation timestamp
    lastModified?: Date;

    // Optional group chat metadata. Absent => legacy single chat.
    groupChat?: GroupChatConfig;
}

export interface DbChat extends Chat {
    id: number;
}
import * as chatsService from "./Chats.service";
import * as personalityService from "./Personality.service";
import { db } from "./Db.service";
export { db };
import type { Chat, GroupChatConfig, GroupChatRpgSettings } from "../types/Chat";

function uniq(list: string[]): string[] {
    return Array.from(new Set(list));
}

export async function createRpgGroupChat(options: {
    participantIds: string[];
    turnOrder: string[];
    scenarioPrompt?: string;
    narratorEnabled?: boolean;
}): Promise<number | null> {
    const participantIds = uniq(options.participantIds).slice(0, 5);
    if (participantIds.length < 2) {
        return null;
    }

    const turnOrder = options.turnOrder.length > 0
        ? options.turnOrder.filter(id => id === "user" || participantIds.includes(id))
        : [...participantIds, "user"];

    // Ensure everyone (including user) is in the final order
    for (const id of participantIds) {
        if (!turnOrder.includes(id)) {
            turnOrder.push(id);
        }
    }
    if (!turnOrder.includes("user")) {
        turnOrder.push("user");
    }

    const rpg: GroupChatRpgSettings = {
        turnOrder,
        scenarioPrompt: options.scenarioPrompt?.trim() || undefined,
        narratorEnabled: !!options.narratorEnabled,
    };

    const groupChat: GroupChatConfig = {
        mode: "rpg",
        participantIds,
        rpg,
    };

    // Build a simple title based on participants
    const names: string[] = [];
    for (const id of participantIds) {
        const persona = await personalityService.get(id);
        names.push(persona?.name || "Unknown");
    }
    const title = `Group: ${names.join(", ")}`.slice(0, 60) || "New Group Chat";

    const chat: Chat = {
        title,
        timestamp: Date.now(),
        content: [],
        groupChat,
    };

    try {
        console.log("createRpgGroupChat: creating chat", chat);
        const id = await chatsService.addChatRecord(chat);
        console.log(`createRpgGroupChat: addChatRecord returned id=${id}`);
        const loaded = await chatsService.loadChat(id, db);
        console.log(`createRpgGroupChat: loadChat returned`, loaded);
        const chatInput = document.querySelector<HTMLInputElement>(`#chat${id}`);
        if (chatInput) {
            chatInput.checked = true;
        }
        return id;
    } catch (error) {
        console.error("createRpgGroupChat: failed to create group chat", error);
        return null;
    }
}

export async function updateRpgGroupChat(chatId: number, options: {
    participantIds: string[];
    turnOrder: string[];
    scenarioPrompt?: string;
    narratorEnabled?: boolean;
}): Promise<boolean> {
    const chat = await db.chats.get(chatId);
    if (!chat || !chat.groupChat) {
        return false;
    }

    const participantIds = uniq(options.participantIds).slice(0, 5);
    if (participantIds.length < 2) {
        return false;
    }

    const turnOrder = options.turnOrder.length > 0
        ? options.turnOrder.filter(id => id === "user" || participantIds.includes(id))
        : [...participantIds, "user"];

    for (const id of participantIds) {
        if (!turnOrder.includes(id)) {
            turnOrder.push(id);
        }
    }
    if (!turnOrder.includes("user")) {
        turnOrder.push("user");
    }

    const rpg: GroupChatRpgSettings = {
        turnOrder,
        scenarioPrompt: options.scenarioPrompt?.trim() || undefined,
        narratorEnabled: !!options.narratorEnabled,
    };

    chat.groupChat = {
        ...chat.groupChat,
        participantIds,
        rpg,
    };

    // Update title if it was the default group title
    if (chat.title.startsWith("Group: ")) {
        const names: string[] = [];
        for (const id of participantIds) {
            const persona = await personalityService.get(id);
            names.push(persona?.name || "Unknown");
        }
        chat.title = `Group: ${names.join(", ")}`.slice(0, 60);
    }

    await db.chats.put(chat);
    
    // If this is the current chat, reload it to reflect changes in UI
    const currentId = chatsService.getCurrentChatId();
    if (currentId === chatId) {
        await chatsService.loadChat(chatId, db);
    } else {
        // Just refresh the sidebar entry
        await chatsService.refreshChatListAfterActivity(db);
    }

    return true;
}

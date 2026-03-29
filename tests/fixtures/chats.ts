import type { DbChat } from "../../src/types/Chat";
import { makeUserMessage } from "./messages";

export function makeChat(overrides: Partial<DbChat> = {}): DbChat {
    const timestamp = overrides.timestamp ?? Date.now();

    return {
        id: overrides.id ?? "chat-test-id",
        title: overrides.title ?? "Test Chat",
        timestamp,
        content: overrides.content ?? [makeUserMessage("Hello")],
        lastModified: overrides.lastModified,
        groupChat: overrides.groupChat,
    };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../../../src/services/Db.service";
import { makeChat } from "../../fixtures/chats";
import { makeUserMessage } from "../../fixtures/messages";
import { waitForCondition } from "../../helpers/async";
import { resetIndexedDb } from "../../helpers/db";
import { bootstrapDom } from "../../helpers/dom";
import { MockDataTransfer } from "../../helpers/files";

vi.mock("highlight.js", () => ({
    default: {
        highlightAll: vi.fn(),
    },
}));

vi.mock("../../../src/services/Settings.service", () => ({
    isMobile: vi.fn(() => false),
}));

vi.mock("../../../src/services/Personality.service", () => ({
    get: vi.fn(async () => ({
        name: "Mock Persona",
        image: "https://example.com/persona.png",
        description: "Mock persona",
        prompt: "Be helpful.",
        aggressiveness: 0,
        sensuality: 0,
        independence: 0,
        nsfw: false,
        internetEnabled: false,
        roleplayEnabled: false,
        toneExamples: [],
        tags: [],
        category: "assistant",
    })),
    getDefault: vi.fn(() => ({
        name: "Mock Persona",
        image: "https://example.com/persona.png",
        description: "Mock persona",
        prompt: "Be helpful.",
        aggressiveness: 0,
        sensuality: 0,
        independence: 0,
        nsfw: false,
        internetEnabled: false,
        roleplayEnabled: false,
        toneExamples: [],
        tags: [],
        category: "assistant",
    })),
}));

vi.mock("../../../src/services/Message.service", () => ({
    regenerate: vi.fn(async () => {}),
    ensureRoundBlockUi: vi.fn(),
}));

vi.mock("../../../src/services/Overlay.service", () => ({
    showMessageDebugModal: vi.fn(),
}));

vi.mock("../../../src/services/Parser.service", () => ({
    parseMarkdownToHtml: vi.fn(async (text: string) => text),
    parseHtmlToMarkdown: vi.fn((text: string) => text),
}));

vi.mock("../../../src/services/Toast.service", () => ({
    info: vi.fn(),
    warn: vi.fn(),
    danger: vi.fn(),
}));

vi.mock("../../../src/services/Sync.service", () => ({
    isOnlineSyncEnabled: vi.fn(() => false),
    isSyncActive: vi.fn(() => false),
}));

vi.mock("../../../src/services/Pinning.service", () => ({
    getPinnedChatIds: vi.fn(() => []),
    isChatPinned: vi.fn(() => false),
    toggleChatPinned: vi.fn(async () => false),
    removeChatPin: vi.fn(async () => {}),
    clearChatPins: vi.fn(async () => {}),
}));

vi.mock("../../../src/utils/helpers", () => ({
    getDecoded: vi.fn(async (value: string) => value),
    getSanitized: vi.fn((value: string) => value),
    messageContainerScrollToBottom: vi.fn(),
    hideElement: vi.fn(),
    showElement: vi.fn(),
}));

vi.mock("../../../src/utils/codeBlocks", () => ({
    enhanceCodeBlocks: vi.fn(),
    stripCodeBlockEnhancements: vi.fn(),
}));

vi.mock("../../../src/utils/blobResolver", () => ({
    resolveAttachmentFile: vi.fn(),
    resolveGeneratedImageSrc: vi.fn(),
    resolveThoughtSignature: vi.fn(async (part: { thoughtSignature?: string }) => part.thoughtSignature),
}));

vi.mock("../../../src/events", () => ({
    dispatchAppEvent: vi.fn((name: string, detail: unknown) => {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }),
}));

function bootstrapChatDom(): void {
    bootstrapDom(`
        <div class="sidebar"></div>
        <div id="chatHistorySection"></div>
        <div id="chat-title"></div>
        <div id="chat-loading-indicator" class="hidden"></div>
        <div id="scrollable-chat-container">
            <div class="message-container"></div>
        </div>
    `);
}

function makeLongChatMessageContent(total: number): ReturnType<typeof makeUserMessage>[] {
    return Array.from({ length: total }, (_, index) => {
        const label = index.toString().padStart(3, "0");
        return makeUserMessage(`Long chat message ${label}`);
    });
}

async function loadServices() {
    const dbService = await import("../../../src/services/Db.service");
    const chatsService = await import("../../../src/services/Chats.service");

    return {
        db: dbService.db,
        chatsService,
    };
}

async function createAndLoadChat(args: {
    chatsService: Awaited<ReturnType<typeof loadServices>>["chatsService"];
    chatId: string;
    messageCount: number;
}): Promise<void> {
    await args.chatsService.addChatRecord(makeChat({
        id: args.chatId,
        title: "Long Paged Chat",
        content: makeLongChatMessageContent(args.messageCount),
    }));

    const radio = document.querySelector<HTMLInputElement>(`#chat${args.chatId}`);
    if (!radio) {
        throw new Error(`Missing chat radio for ${args.chatId}`);
    }

    radio.click();
    await args.chatsService.loadChat(args.chatId);
}

describe("paged long-chat message editing", () => {
    let db: Db | undefined;

    beforeEach(async () => {
        vi.resetModules();
        await resetIndexedDb();
        bootstrapChatDom();
        Object.defineProperty(globalThis, "DataTransfer", {
            value: MockDataTransfer,
            configurable: true,
        });
        Object.defineProperty(window.navigator, "clipboard", {
            value: { writeText: vi.fn(async () => {}) },
            configurable: true,
        });
    });

    afterEach(async () => {
        db?.close();
        db = undefined;
        await resetIndexedDb();
    });

    it("loads only the current page for long chats", async () => {
        const { db: testDb, chatsService } = await loadServices();
        db = testDb;

        await createAndLoadChat({
            chatsService,
            chatId: "chat-long-initial-window",
            messageCount: 150,
        });

        const renderedMessages = Array.from(document.querySelectorAll<HTMLElement>(".message[data-chat-index]"));
        expect(renderedMessages).toHaveLength(50);
        expect(renderedMessages[0]?.dataset.chatIndex).toBe("100");
        expect(renderedMessages[49]?.dataset.chatIndex).toBe("149");
        expect(renderedMessages[0]?.querySelector(".message-text")?.textContent).toContain("Long chat message 100");
        expect(renderedMessages[49]?.querySelector(".message-text")?.textContent).toContain("Long chat message 149");

        expect(document.querySelector(`.message[data-chat-index='99']`)).toBeNull();
        expect(document.querySelector(`.message[data-chat-index='150']`)).toBeNull();

        const currentChat = await chatsService.getCurrentChat();
        expect(currentChat?.content).toHaveLength(150);
        expect(currentChat?.content[0]?.parts[0]?.text).toBe("Long chat message 000");
        expect(currentChat?.content[99]?.parts[0]?.text).toBe("Long chat message 099");
        expect(currentChat?.content[100]?.parts[0]?.text).toBe("Long chat message 100");
        expect(currentChat?.content[149]?.parts[0]?.text).toBe("Long chat message 149");

        const persistedChat = await testDb.chats.get("chat-long-initial-window");
        expect(persistedChat?.content).toHaveLength(150);
        expect(persistedChat?.content[0]?.parts[0]?.text).toBe("Long chat message 000");
        expect(persistedChat?.content[99]?.parts[0]?.text).toBe("Long chat message 099");
        expect(persistedChat?.content[100]?.parts[0]?.text).toBe("Long chat message 100");
        expect(persistedChat?.content[149]?.parts[0]?.text).toBe("Long chat message 149");
    });

    it("edits absolute message index in a 150 message paged chat", async () => {
        const { db: testDb, chatsService } = await loadServices();
        db = testDb;

        await createAndLoadChat({
            chatsService,
            chatId: "chat-long-paged",
            messageCount: 150,
        });

        const visibleMessages = Array.from(document.querySelectorAll<HTMLElement>(".message[data-chat-index]"));
        expect(visibleMessages).toHaveLength(50);
        expect(visibleMessages[0]?.dataset.chatIndex).toBe("100");
        expect(visibleMessages[0]?.querySelector(".message-text")?.textContent).toContain("Long chat message 100");
        expect(visibleMessages[49]?.dataset.chatIndex).toBe("149");

        const targetMessage = visibleMessages[0];
        const targetText = targetMessage.querySelector<HTMLElement>(".message-text");
        const editButton = targetMessage.querySelector<HTMLButtonElement>(".btn-edit");
        const saveButton = targetMessage.querySelector<HTMLButtonElement>(".btn-save");

        expect(targetMessage.dataset.chatIndex).toBe("100");
        expect(editButton).not.toBeNull();
        expect(saveButton).not.toBeNull();

        editButton?.click();

        await waitForCondition(
            () => targetText?.getAttribute("contenteditable") === "true",
            "Timed out waiting for message edit mode",
        );

        if (!targetText) {
            throw new Error("Missing target message text element");
        }

        targetText.innerText = "Edited absolute message 100";
        saveButton?.click();

        await waitForCondition(async () => {
            const chat = await testDb.chats.get("chat-long-paged");
            return chat?.content[100]?.parts[0]?.text === "Edited absolute message 100";
        }, "Timed out waiting for edited message to persist");

        const persistedChat = await testDb.chats.get("chat-long-paged");
        expect(persistedChat?.content[99]?.parts[0]?.text).toBe("Long chat message 099");
        expect(persistedChat?.content[100]?.parts[0]?.text).toBe("Edited absolute message 100");
        expect(persistedChat?.content[101]?.parts[0]?.text).toBe("Long chat message 101");

        const currentChat = await chatsService.getCurrentChat();
        expect(currentChat?.content[99]?.parts[0]?.text).toBe("Long chat message 099");
        expect(currentChat?.content[100]?.parts[0]?.text).toBe("Edited absolute message 100");
        expect(currentChat?.content[101]?.parts[0]?.text).toBe("Long chat message 101");

        await waitForCondition(() => {
            const rerenderedTarget = document.querySelector<HTMLElement>(`.message[data-chat-index='100'] .message-text`);
            return rerenderedTarget?.textContent?.includes("Edited absolute message 100") === true;
        }, "Timed out waiting for edited message DOM to update");

        expect(document.querySelector(`.message[data-chat-index='99']`)).toBeNull();
        expect(document.querySelector<HTMLElement>(`.message[data-chat-index='100'] .message-text`)?.textContent).toContain("Edited absolute message 100");
        expect(document.querySelector<HTMLElement>(`.message[data-chat-index='101'] .message-text`)?.textContent).toContain("Long chat message 101");
        expect(Array.from(document.querySelectorAll<HTMLElement>(".message[data-chat-index]"))).toHaveLength(50);
    });

    it("loads older messages without remapping absolute chat indices", async () => {
        const { db: testDb, chatsService } = await loadServices();
        db = testDb;

        await createAndLoadChat({
            chatsService,
            chatId: "chat-long-prepend",
            messageCount: 150,
        });

        const scrollContainer = document.querySelector<HTMLDivElement>("#scrollable-chat-container");
        expect(scrollContainer).not.toBeNull();

        const initiallyVisibleMessages = Array.from(document.querySelectorAll<HTMLElement>(".message[data-chat-index]"));
        expect(initiallyVisibleMessages).toHaveLength(50);
        expect(initiallyVisibleMessages[0]?.dataset.chatIndex).toBe("100");
        expect(initiallyVisibleMessages[49]?.dataset.chatIndex).toBe("149");

        if (!scrollContainer) {
            throw new Error("Missing scroll container");
        }

        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new Event("scroll"));

        await waitForCondition(() => {
            const renderedMessages = Array.from(document.querySelectorAll<HTMLElement>(".message[data-chat-index]"));
            return renderedMessages.length === 100;
        }, "Timed out waiting for older messages to prepend");

        const renderedMessages = Array.from(document.querySelectorAll<HTMLElement>(".message[data-chat-index]"));
        expect(renderedMessages).toHaveLength(100);
        expect(renderedMessages[0]?.dataset.chatIndex).toBe("50");
        expect(renderedMessages[49]?.dataset.chatIndex).toBe("99");
        expect(renderedMessages[50]?.dataset.chatIndex).toBe("100");
        expect(renderedMessages[99]?.dataset.chatIndex).toBe("149");

        expect(renderedMessages[0]?.querySelector(".message-text")?.textContent).toContain("Long chat message 050");
        expect(renderedMessages[49]?.querySelector(".message-text")?.textContent).toContain("Long chat message 099");
        expect(renderedMessages[50]?.querySelector(".message-text")?.textContent).toContain("Long chat message 100");
        expect(renderedMessages[99]?.querySelector(".message-text")?.textContent).toContain("Long chat message 149");

        expect(document.querySelector<HTMLElement>(`.message[data-chat-index='50'] .message-text`)?.textContent).toContain("Long chat message 050");
        expect(document.querySelector<HTMLElement>(`.message[data-chat-index='99'] .message-text`)?.textContent).toContain("Long chat message 099");
        expect(document.querySelector<HTMLElement>(`.message[data-chat-index='100'] .message-text`)?.textContent).toContain("Long chat message 100");
        expect(document.querySelector<HTMLElement>(`.message[data-chat-index='149'] .message-text`)?.textContent).toContain("Long chat message 149");
        expect(document.querySelector(`.message[data-chat-index='49']`)).toBeNull();

        const currentChat = await chatsService.getCurrentChat();
        expect(currentChat?.content[50]?.parts[0]?.text).toBe("Long chat message 050");
        expect(currentChat?.content[99]?.parts[0]?.text).toBe("Long chat message 099");
        expect(currentChat?.content[100]?.parts[0]?.text).toBe("Long chat message 100");
        expect(currentChat?.content[149]?.parts[0]?.text).toBe("Long chat message 149");

        const persistedChat = await testDb.chats.get("chat-long-prepend");
        expect(persistedChat?.content[50]?.parts[0]?.text).toBe("Long chat message 050");
        expect(persistedChat?.content[99]?.parts[0]?.text).toBe("Long chat message 099");
        expect(persistedChat?.content[100]?.parts[0]?.text).toBe("Long chat message 100");
        expect(persistedChat?.content[149]?.parts[0]?.text).toBe("Long chat message 149");
    });
});

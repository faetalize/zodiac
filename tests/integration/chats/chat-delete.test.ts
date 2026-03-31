import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../../../src/services/Db.service";
import { makeChat } from "../../fixtures/chats";
import { makeUserMessage } from "../../fixtures/messages";
import { resetIndexedDb } from "../../helpers/db";
import { bootstrapDom } from "../../helpers/dom";

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

function getVisibleMessageTexts(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>(".message"))
        .filter((element) => element.dataset.hidden !== "true" && element.style.display !== "none")
        .map((element) => {
            return element.querySelector<HTMLElement>(".message-text-content")?.textContent
                ?? element.querySelector<HTMLElement>(".message-text")?.textContent
                ?? "";
        })
        .filter(Boolean);
}

async function loadServices() {
    const dbService = await import("../../../src/services/Db.service");
    const chatsService = await import("../../../src/services/Chats.service");

    return {
        db: dbService.db,
        chatsService,
    };
}

async function createChat(args: {
    chatsService: Awaited<ReturnType<typeof loadServices>>["chatsService"];
    chatId: string;
    title: string;
    messageText: string;
}): Promise<void> {
    await args.chatsService.addChatRecord(makeChat({
        id: args.chatId,
        title: args.title,
        content: [makeUserMessage(args.messageText)],
    }));
}

describe("chat deletion behavior", () => {
    let db: Db | undefined;

    beforeEach(async () => {
        vi.resetModules();
        await resetIndexedDb();
        bootstrapChatDom();
    });

    afterEach(async () => {
        db?.close();
        db = undefined;
        await resetIndexedDb();
    });

    it("deletes the selected chat and returns to the new-chat state", async () => {
        const { db: testDb, chatsService } = await loadServices();
        db = testDb;

        await createChat({
            chatsService,
            chatId: "chat-selected-delete",
            title: "Selected Chat",
            messageText: "Selected message",
        });
        await createChat({
            chatsService,
            chatId: "chat-neighbor-keep",
            title: "Neighbor Chat",
            messageText: "Neighbor message",
        });

        const selectedRadio = document.querySelector<HTMLInputElement>("#chatchat-selected-delete");
        if (!selectedRadio) {
            throw new Error("Missing selected chat radio");
        }

        selectedRadio.click();
        await chatsService.loadChat("chat-selected-delete");

        expect(chatsService.getCurrentChatId()).toBe("chat-selected-delete");
        expect((await chatsService.getCurrentChat())?.id).toBe("chat-selected-delete");
        expect(document.querySelector("#chat-title")?.textContent).toBe("Selected Chat");
        expect(getVisibleMessageTexts()).toEqual(["Selected message"]);

        await chatsService.deleteChat("chat-selected-delete", testDb);

        expect(await testDb.chats.get("chat-selected-delete")).toBeUndefined();
        expect(await testDb.chats.get("chat-neighbor-keep")).toMatchObject({
            id: "chat-neighbor-keep",
            title: "Neighbor Chat",
        });

        expect(chatsService.getCurrentChatId()).toBeNull();
        expect(await chatsService.getCurrentChat()).toBeNull();

        expect(document.querySelector<HTMLInputElement>("input[name='currentChat']:checked")).toBeNull();
        expect(document.querySelector("#chat-title")?.textContent).toBe("");
        expect(document.querySelectorAll(".message")).toHaveLength(0);
        expect(getVisibleMessageTexts()).toEqual([]);

        expect(document.querySelector("#chatchat-selected-delete")).toBeNull();
        expect(document.querySelector("label[for='chatchat-selected-delete']")).toBeNull();
        expect(document.querySelector("#chatchat-neighbor-keep")).not.toBeNull();
        expect(document.querySelector("label[for='chatchat-neighbor-keep']")?.textContent).toContain("Neighbor Chat");
    });

    it("deletes an unselected chat without changing the current chat", async () => {
        const { db: testDb, chatsService } = await loadServices();
        db = testDb;

        await createChat({
            chatsService,
            chatId: "chat-current-keep",
            title: "Current Chat",
            messageText: "Current message",
        });
        await createChat({
            chatsService,
            chatId: "chat-unselected-delete",
            title: "Delete Me",
            messageText: "Delete me message",
        });

        const currentRadio = document.querySelector<HTMLInputElement>("#chatchat-current-keep");
        if (!currentRadio) {
            throw new Error("Missing current chat radio");
        }

        currentRadio.click();
        await chatsService.loadChat("chat-current-keep");

        expect(chatsService.getCurrentChatId()).toBe("chat-current-keep");
        expect((await chatsService.getCurrentChat())?.id).toBe("chat-current-keep");
        expect(document.querySelector("#chat-title")?.textContent).toBe("Current Chat");
        expect(getVisibleMessageTexts()).toEqual(["Current message"]);

        await chatsService.deleteChat("chat-unselected-delete", testDb);

        expect(await testDb.chats.get("chat-unselected-delete")).toBeUndefined();
        expect(await testDb.chats.get("chat-current-keep")).toMatchObject({
            id: "chat-current-keep",
            title: "Current Chat",
        });

        expect(chatsService.getCurrentChatId()).toBe("chat-current-keep");
        expect((await chatsService.getCurrentChat())?.id).toBe("chat-current-keep");
        expect(document.querySelector<HTMLInputElement>("input[name='currentChat']:checked")?.id).toBe(
            "chatchat-current-keep",
        );
        expect(document.querySelector("#chat-title")?.textContent).toBe("Current Chat");
        expect(getVisibleMessageTexts()).toEqual(["Current message"]);

        expect(document.querySelector("#chatchat-unselected-delete")).toBeNull();
        expect(document.querySelector("label[for='chatchat-unselected-delete']")).toBeNull();
        expect(document.querySelector("#chatchat-current-keep")).not.toBeNull();
        expect(document.querySelector("label[for='chatchat-current-keep']")?.textContent).toContain("Current Chat");
    });
});

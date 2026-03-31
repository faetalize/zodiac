import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../../../src/services/Db.service";
import type { Personality } from "../../../src/types/Personality";
import { makeChat } from "../../fixtures/chats";
import { makeUserMessage } from "../../fixtures/messages";
import { resetIndexedDb } from "../../helpers/db";
import { bootstrapDom } from "../../helpers/dom";

type MockOpenRouterResult = {
    text: string;
    thinking?: string;
    finishReason?: string;
};

type MockSettings = {
    apiKey: string;
    geminiApiKey: string;
    openRouterApiKey: string;
    maxTokens: string;
    temperature: string;
    model: string;
    imageModel: string;
    streamResponses: boolean;
    enableThinking: boolean;
    thinkingBudget: number;
    safetySettings: unknown[];
    rpgGroupChatsProgressAutomatically: boolean;
    disallowPersonaPinging: boolean;
    dynamicGroupChatPingOnly: boolean;
    autoscroll: boolean;
};

const testState = vi.hoisted(() => ({
    openRouterResults: [] as MockOpenRouterResult[],
    settings: {
        apiKey: "",
        geminiApiKey: "",
        openRouterApiKey: "test-openrouter-key",
        maxTokens: "256",
        temperature: "50",
        model: "openai/gpt-5.4",
        imageModel: "",
        streamResponses: false,
        enableThinking: false,
        thinkingBudget: 0,
        safetySettings: [],
        rpgGroupChatsProgressAutomatically: true,
        disallowPersonaPinging: false,
        dynamicGroupChatPingOnly: false,
        autoscroll: true,
    } as MockSettings,
}));

const defaultPersona: Personality = {
    name: "zodiac",
    image: "https://example.com/default-persona.png",
    description: "Default persona",
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
};

vi.mock("highlight.js", () => ({
    default: {
        highlightAll: vi.fn(),
    },
}));

vi.mock("../../../src/services/Settings.service", () => ({
    getSettings: vi.fn(() => testState.settings),
    getSystemPrompt: vi.fn(async () => ({ parts: [{ text: "" }] })),
    isMobile: vi.fn(() => false),
}));

vi.mock("../../../src/services/Personality.service", () => ({
    get: vi.fn(async () => defaultPersona),
    getDefault: vi.fn(() => defaultPersona),
    getSelected: vi.fn(async () => defaultPersona),
}));

vi.mock("../../../src/services/Supabase.service", () => ({
    SUPABASE_URL: "https://example.supabase.co",
    getAuthHeaders: vi.fn(async () => ({})),
    getUserSubscription: vi.fn(async () => null),
    getSubscriptionTier: vi.fn(async () => "free"),
    isImageGenerationAvailable: vi.fn(async () => ({ type: "none" })),
    getUserProfile: vi.fn(async () => ({ preferredName: "Tester" })),
}));

vi.mock("../../../src/services/Sync.service", () => ({
    isOnlineSyncEnabled: vi.fn(() => false),
    isSyncActive: vi.fn(() => false),
    isChatSnapshotFullyHydrated: vi.fn(() => true),
    fetchAllSyncedChatMessages: vi.fn(async () => []),
}));

vi.mock("../../../src/services/Toast.service", () => ({
    info: vi.fn(),
    warn: vi.fn(),
    danger: vi.fn(),
}));

vi.mock("../../../src/services/Overlay.service", () => ({
    showMessageDebugModal: vi.fn(),
}));

vi.mock("../../../src/services/Parser.service", () => ({
    parseMarkdownToHtml: vi.fn(async (text: string) => text),
    parseHtmlToMarkdown: vi.fn((text: string) => text),
}));

vi.mock("../../../src/services/OpenRouter.service", () => ({
    buildOpenRouterRequest: vi.fn((request: unknown) => request),
    buildOpenRouterRequestMessages: vi.fn(async () => []),
    requestOpenRouterCompletion: vi.fn(async (args: {
        onText?: (payload: { text: string; delta: string }) => void | Promise<void>;
        onThinking?: (payload: { thinking: string; delta: string }) => void | Promise<void>;
    }) => {
        const next = testState.openRouterResults.shift();
        if (!next) {
            throw new Error("No queued OpenRouter response available for test");
        }

        if (next.thinking && args.onThinking) {
            await args.onThinking({ thinking: next.thinking, delta: next.thinking });
        }

        if (args.onText) {
            await args.onText({ text: next.text, delta: next.text });
        }

        return {
            text: next.text,
            thinking: next.thinking ?? "",
            finishReason: next.finishReason,
        };
    }),
}));

vi.mock("../../../src/services/Lora.service", () => ({
    getLoraState: vi.fn(() => []),
}));

vi.mock("../../../src/components/static/ImageButton.component", () => ({
    isImageModeActive: vi.fn(() => false),
}));

vi.mock("../../../src/components/static/ImageEditButton.component", () => ({
    isImageEditingActive: vi.fn(() => false),
}));

vi.mock("../../../src/components/static/ApiKeyInput.component", () => ({
    shouldPreferPremiumEndpoint: vi.fn(() => false),
}));

vi.mock("../../../src/components/static/ImageEditModelSelector.component", () => ({
    getSelectedEditingModel: vi.fn(() => "qwen"),
}));

vi.mock("../../../src/components/static/ImageCreditsLabel.component", () => ({
    updateImageCreditsLabelVisibility: vi.fn(),
}));

vi.mock("../../../src/components/dynamic/HistoryImagePreview", () => ({
    historyImagePreviewElement: vi.fn(() => document.createElement("div")),
}));

vi.mock("../../../src/services/GroupChatTyping.service", () => ({
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
}));

vi.mock("../../../src/utils/helpers", () => ({
    messageContainerScrollToBottom: vi.fn(),
    hideElement: vi.fn((element: HTMLElement) => {
        element.style.display = "none";
    }),
    showElement: vi.fn((element: HTMLElement) => {
        element.style.display = "";
    }),
    getDecoded: vi.fn(async (value: string) => value),
    getEncoded: vi.fn((value: string) => value),
    getSanitized: vi.fn((value: string) => value),
    getClientScrollbarWidth: vi.fn(() => 0),
    confirmDialogDanger: vi.fn(async () => true),
}));

vi.mock("../../../src/utils/codeBlocks", () => ({
    enhanceCodeBlocks: vi.fn(),
    stripCodeBlockEnhancements: vi.fn(),
}));

vi.mock("../../../src/utils/blobResolver", () => ({
    resolveThoughtSignature: vi.fn(async (part: { thoughtSignature?: string }) => part.thoughtSignature),
    resolveAttachmentFile: vi.fn(),
    resolveGeneratedImageSrc: vi.fn(),
}));

function bootstrapChatDom(): void {
    bootstrapDom(`
        <div class="sidebar"></div>
        <div id="personalitiesDiv"></div>
        <button id="btn-new-chat" type="button">New chat</button>
        <button id="btn-chat-import" type="button">Import</button>
        <div id="chatHistorySection"></div>
        <div id="chat-title"></div>
        <div id="chat-loading-indicator" class="hidden"></div>
        <div id="scrollable-chat-container">
            <div class="message-container"></div>
        </div>
        <div id="message-box">
            <div id="messageInput" contenteditable="true"></div>
            <input id="attachments" type="file" />
            <div id="attachment-preview"></div>
            <button id="btn-send" type="button">send</button>
            <button id="btn-internet" type="button">internet</button>
            <button id="btn-roleplay" type="button">roleplay</button>
        </div>
        <div id="turn-control-panel" class="hidden">
            <span id="turn-control-label"></span>
            <button id="btn-start-turn" type="button"><span id="start-round-text"></span></button>
            <button id="btn-skip-turn" type="button">Skip</button>
            <button id="btn-rpg-settings" type="button">Settings</button>
        </div>
    `);
}

class MockDataTransfer {
    readonly items = {
        add: (_file: File) => {},
    };

    get files(): FileList {
        return document.createElement("input").files!;
    }
}

async function waitFor(condition: () => Promise<boolean> | boolean, message: string): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await condition()) {
            return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    throw new Error(message);
}

async function loadChatModules() {
    const dbService = await import("../../../src/services/Db.service");
    const chatsService = await import("../../../src/services/Chats.service");
    const openRouterService = await import("../../../src/services/OpenRouter.service");

    await import("../../../src/components/static/AttachmentPreview.component");
    await import("../../../src/components/static/ChatInput.component");
    await import("../../../src/components/static/CreateChatButton.component");

    return {
        db: dbService.db,
        chatsService,
        openRouterService,
    };
}

function getVisibleMessageTexts(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>(".message"))
        .map((element) => {
            return element.querySelector<HTMLElement>(".message-text-content")?.textContent
                ?? element.querySelector<HTMLElement>(".message-text")?.textContent
                ?? "";
        })
        .filter(Boolean);
}

describe("chat creation from the new-chat state", () => {
    let db: Db | undefined;

    beforeEach(async () => {
        vi.resetModules();
        testState.openRouterResults.length = 0;
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

    it("creates a new chat from the cleared composer state and switches selection to it", async () => {
        const { db: testDb, chatsService, openRouterService } = await loadChatModules();
        db = testDb;

        const existingChatId = await chatsService.addChatRecord(makeChat({
            id: "chat-existing",
            title: "Existing Chat",
            content: [
                makeUserMessage("Old message"),
            ],
        }));

        const existingRadio = document.querySelector<HTMLInputElement>(`#chat${existingChatId}`);
        expect(existingRadio).not.toBeNull();
        existingRadio?.click();

        await waitFor(async () => {
            if (chatsService.getCurrentChatId() !== existingChatId) {
                return false;
            }

            const currentChat = await chatsService.getCurrentChat();
            return currentChat?.title === "Existing Chat"
                && document.querySelector("#chat-title")?.textContent === "Existing Chat";
        }, "Timed out waiting for the existing chat to load");

        const newChatButton = document.querySelector<HTMLButtonElement>("#btn-new-chat");
        expect(newChatButton).not.toBeNull();
        newChatButton?.click();

        await waitFor(() => chatsService.getCurrentChatId() === null, "Timed out waiting for the app to return to the new-chat state");
        expect(document.querySelector<HTMLInputElement>("input[name='currentChat']:checked")).toBeNull();
        expect(document.querySelector("#chat-title")?.textContent).toBe("");
        expect(document.querySelectorAll(".message")).toHaveLength(0);

        testState.openRouterResults.push(
            { text: "Fresh Thread" },
            { text: "Assistant reply for the fresh thread." },
        );

        const messageInput = document.querySelector<HTMLDivElement>("#messageInput");
        const sendButton = document.querySelector<HTMLButtonElement>("#btn-send");
        expect(messageInput).not.toBeNull();
        expect(sendButton).not.toBeNull();

        messageInput!.innerHTML = "Start a fresh thread";
        sendButton?.click();

        await waitFor(
            () => vi.mocked(openRouterService.requestOpenRouterCompletion).mock.calls.length === 2,
            "Timed out waiting for title and reply provider calls",
        );

        await waitFor(async () => {
            const checkedRadio = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
            const currentChatId = checkedRadio?.id.startsWith("chat") ? checkedRadio.id.slice(4) : null;
            if (!currentChatId || currentChatId === existingChatId) {
                return false;
            }

            await chatsService.waitForPendingWrites(currentChatId);
            const storedChat = await testDb.chats.get(currentChatId);
            const visibleMessages = (storedChat?.content ?? []).filter((message) => !message.hidden);
            return visibleMessages.length === 2;
        }, "Timed out waiting for the new chat to be created and populated");

        const currentChat = await chatsService.getCurrentChat();
        expect(currentChat).not.toBeNull();
        expect(currentChat?.id).not.toBe(existingChatId);
        expect(currentChat?.title).toBe("Fresh Thread");
        expect((currentChat?.content ?? []).filter((message) => !message.hidden)).toEqual([
            expect.objectContaining({ role: "user", parts: [expect.objectContaining({ text: "Start a fresh thread" })] }),
            expect.objectContaining({ role: "model", parts: [expect.objectContaining({ text: "Assistant reply for the fresh thread." })] }),
        ]);
        expect(currentChat).toMatchObject({
            title: "Fresh Thread",
        });

        const storedExistingChat = await testDb.chats.get(existingChatId);
        expect(storedExistingChat).toMatchObject({
            id: existingChatId,
            title: "Existing Chat",
            content: [expect.objectContaining({ parts: [expect.objectContaining({ text: "Old message" })] })],
        });

        const allChats = await testDb.chats.toArray();
        expect(allChats).toHaveLength(2);
        expect(allChats.map((chat) => chat.id)).toEqual(expect.arrayContaining([existingChatId, currentChat!.id]));

        const checkedRadio = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
        expect(checkedRadio?.id).toBe(`chat${currentChat?.id}`);
        expect(document.querySelector(`#chat${existingChatId}`)).not.toBeNull();
        expect(document.querySelector("#chat-title")?.textContent).toBe("Fresh Thread");
        expect(getVisibleMessageTexts()).toEqual([
            "Start a fresh thread",
            "Assistant reply for the fresh thread.",
        ]);
    });
});

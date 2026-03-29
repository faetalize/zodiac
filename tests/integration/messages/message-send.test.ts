import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../../../src/services/Db.service";
import type { Chat, GroupChatConfig } from "../../../src/types/Chat";
import type { Personality } from "../../../src/types/Personality";
import { makeChat } from "../../fixtures/chats";
import { makeModelMessage, makeUserMessage } from "../../fixtures/messages";
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
};

const testState = vi.hoisted(() => ({
    personas: new Map<string, Personality>(),
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
}));

vi.mock("../../../src/services/Personality.service", () => ({
    get: vi.fn(async (id: string) => ({
        id,
        ...(testState.personas.get(id) ?? defaultPersona),
    })),
    getDefault: vi.fn(() => defaultPersona),
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
        onText?: (payload: { text: string }) => void | Promise<void>;
        onThinking?: (payload: { thinking: string }) => void | Promise<void>;
    }) => {
        const next = testState.openRouterResults.shift();
        if (!next) {
            throw new Error("No queued OpenRouter response available for test");
        }

        if (next.thinking && args.onThinking) {
            await args.onThinking({ thinking: next.thinking });
        }
        if (args.onText) {
            await args.onText({ text: next.text });
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

vi.mock("../../../src/components/static/AttachmentPreview.component", () => ({
    clearAttachmentPreviews: vi.fn(),
}));

vi.mock("../../../src/components/static/ChatInput.component", () => ({
    getCurrentHistoryImageDataUri: vi.fn(() => null),
}));

vi.mock("../../../src/components/static/ApiKeyInput.component", () => ({
    shouldPreferPremiumEndpoint: vi.fn(() => false),
}));

vi.mock("../../../src/components/static/ImageEditModelSelector.component", () => ({
    getSelectedEditingModel: vi.fn(() => "qwen"),
}));

vi.mock("../../../src/services/GroupChatTyping.service", () => ({
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
}));

vi.mock("../../../src/utils/helpers", () => ({
    messageContainerScrollToBottom: vi.fn(),
    hideElement: vi.fn(),
    showElement: vi.fn(),
    getDecoded: vi.fn(async (value: string) => value),
    getSanitized: vi.fn((value: string) => value),
    confirmDialogDanger: vi.fn(async () => true),
}));

vi.mock("../../../src/utils/blobResolver", () => ({
    resolveThoughtSignature: vi.fn(async (part: { thoughtSignature?: string }) => part.thoughtSignature),
    resolveAttachmentFile: vi.fn(),
    resolveGeneratedImageSrc: vi.fn(),
}));

vi.mock("../../../src/utils/personalityMarkers", () => ({
    PERSONALITY_MARKER_PREFIX: "__persona_marker__:",
    NARRATOR_PERSONALITY_ID: "__narrator__",
    createPersonalityMarkerMessage: vi.fn((personalityId: string) => ({
        role: "model",
        hidden: true,
        personalityid: personalityId,
        parts: [{ text: `__persona_marker__:${personalityId}` }],
    })),
    isPersonalityMarker: vi.fn((message: { parts?: Array<{ text?: string }> }) =>
        (message.parts?.[0]?.text ?? "").startsWith("__persona_marker__:"),
    ),
    getPersonalityMarkerInfo: vi.fn((message: { parts?: Array<{ text?: string }> }) => {
        const text = message.parts?.[0]?.text ?? "";
        if (!text.startsWith("__persona_marker__:")) return null;
        return { personalityId: text.slice("__persona_marker__:".length) };
    }),
    isLegacyPersonalityIntro: vi.fn(() => false),
    pruneTrailingPersonalityMarkers: vi.fn(),
    buildPersonalityInstructionMessages: vi.fn(() => []),
}));

vi.mock("../../../src/utils/chatHistoryBuilder", () => ({
    findLastGeneratedImageIndex: vi.fn(() => -1),
    findLastAttachmentIndex: vi.fn(() => -1),
    processAttachmentsToParts: vi.fn(async () => []),
    processGeneratedImagesToParts: vi.fn(async () => []),
    renderGroundingToShadowDom: vi.fn((element: HTMLElement, content: string) => {
        element.innerHTML = content;
    }),
    ensureThinkingUi: vi.fn((messageElement: HTMLElement) => {
        let content = messageElement.querySelector<HTMLDivElement>(".thinking-content");
        if (!content) {
            const wrapper = document.createElement("div");
            wrapper.className = "message-thinking";
            const button = document.createElement("button");
            button.className = "thinking-toggle";
            button.textContent = "Show reasoning";
            content = document.createElement("div");
            content.className = "thinking-content";
            wrapper.append(button, content);
            messageElement.append(wrapper);
        }
        return content;
    }),
    createThinkingUiElements: vi.fn(() => {
        const wrapper = document.createElement("div");
        wrapper.className = "message-thinking";
        const button = document.createElement("button");
        button.className = "thinking-toggle";
        button.textContent = "Show reasoning";
        const content = document.createElement("div");
        content.className = "thinking-content";
        wrapper.append(button, content);
        return { wrapper, content };
    }),
    createErrorMessage: vi.fn((kind: string, personalityId: string) => ({
        role: "model",
        personalityid: personalityId,
        parts: [{ text: `Error: ${kind}` }],
    })),
    UNRESTRICTED_SAFETY_SETTINGS: [],
    extractTextAndThinkingFromResponse: vi.fn(() => ({ text: "", thinking: "" })),
}));

vi.mock("../../../src/utils/groupChatHistory", () => ({
    constructGeminiChatHistoryForGroupChat: vi.fn(async () => ({ history: [], pinnedHistoryIndices: [] })),
}));

vi.mock("../../../src/utils/chatHistory", () => ({
    buildGroupChatRosterSystemPrompt: vi.fn(() => ""),
    buildDynamicGroupChatRosterSystemPrompt: vi.fn(() => ""),
    buildSpeakerToneExamplesSystemPrompt: vi.fn(() => ""),
    stripLeadingSpeakerPrefix: vi.fn((text: string, speakerName: string) =>
        text.replace(new RegExp(`^${speakerName}:\\s*`), ""),
    ),
    maybePrefixSpeaker: vi.fn((text: string) => text),
}));

vi.mock("../../../src/utils/mentions", () => ({
    extractMentionedParticipantIds: vi.fn((text: string, participants: string[]) => {
        const matches = Array.from(text.matchAll(/@([A-Za-z0-9_-]+)/g)).map((match) => match[1]);
        return matches.filter((id) => participants.includes(id));
    }),
}));

vi.mock("../../../src/events", () => ({
    dispatchAppEvent: vi.fn((name: string, detail: unknown) => {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }),
    dispatchEmptyAppEvent: vi.fn((name: string) => {
        window.dispatchEvent(new CustomEvent(name));
    }),
    onAppEvent: vi.fn(),
}));

vi.mock("../../../src/components/dynamic/message", () => ({
    messageElement: vi.fn(async (message: {
        role: "user" | "model";
        personalityid?: string;
        hidden?: boolean;
        roundIndex?: number;
        parts: Array<{ text: string }>;
    }, index: number) => {
        const element = document.createElement("div");
        element.className = `message message-${message.role}`;
        element.dataset.chatIndex = String(index);
        element.dataset.hidden = message.hidden ? "true" : "false";
        if (typeof message.roundIndex === "number") {
            element.dataset.roundIndex = String(message.roundIndex);
        }
        if (message.hidden) {
            element.style.display = "none";
        }

        const header = document.createElement("div");
        header.className = "message-header";
        const role = document.createElement("h3");
        role.className = "message-role";
        role.textContent = message.role === "user" ? "You" : (message.personalityid ?? "Model");
        header.append(role);

        const textWrapper = document.createElement("div");
        textWrapper.className = "message-text";
        if ((message.parts[0]?.text ?? "").trim().length === 0) {
            textWrapper.classList.add("is-loading");
        }

        const spinner = document.createElement("span");
        spinner.className = "message-spinner";
        const textContent = document.createElement("div");
        textContent.className = "message-text-content";
        textContent.textContent = message.parts[0]?.text ?? "";
        textWrapper.append(spinner, textContent);

        const grounding = document.createElement("div");
        grounding.className = "message-grounding-rendered-content";

        element.append(header, textWrapper, grounding);
        return element;
    }),
}));

function bootstrapMessagingDom(): void {
    bootstrapDom(`
        <div class="sidebar"></div>
        <div id="chatHistorySection"></div>
        <div id="chat-title"></div>
        <div id="chat-loading-indicator" class="hidden"></div>
        <div id="scrollable-chat-container">
            <div class="message-container"></div>
        </div>
        <input id="attachments" type="file">
        <button id="btn-internet" type="button"></button>
    `);
}

class MockDataTransfer {
    private filesInternal: File[] = [];

    readonly items = {
        add: (file: File) => {
            this.filesInternal.push(file);
        },
    };

    get files(): FileList {
        return this.filesInternal as unknown as FileList;
    }
}

function makeEmptyFileList(): FileList {
    return [] as unknown as FileList;
}

function queueOpenRouterResponse(text: string, thinking?: string): void {
    testState.openRouterResults.push({ text, thinking });
}

function seedMockPersonas(personas: Array<{ id: string; persona: Partial<Personality> }>): void {
    testState.personas.clear();

    for (const entry of personas) {
        testState.personas.set(entry.id, {
            ...defaultPersona,
            ...entry.persona,
        });
    }
}

async function waitFor(condition: () => Promise<boolean>, message: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await condition()) {
            return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    throw new Error(message);
}

async function loadServices() {
    const dbService = await import("../../../src/services/Db.service");
    const chatsService = await import("../../../src/services/Chats.service");
    const messageService = await import("../../../src/services/Message.service");

    return {
        db: dbService.db,
        chatsService,
        messageService,
    };
}

async function createAndLoadChat(args: {
    chatsService: Awaited<ReturnType<typeof loadServices>>["chatsService"];
    chat: Chat & { id: string };
}): Promise<string> {
    const id = await args.chatsService.addChatRecord(args.chat);
    const radio = document.querySelector<HTMLInputElement>(`#chat${id}`);
    if (!radio) {
        throw new Error(`Missing chat radio for ${id}`);
    }

    radio.click();
    await args.chatsService.loadChat(id);
    return id;
}

function getVisibleMessageElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(".message")).filter((element) => {
        return element.dataset.hidden !== "true" && element.style.display !== "none";
    });
}

function getVisibleMessageTexts(): Array<string | undefined> {
    return getVisibleMessageElements().map((element) => {
        return element.querySelector<HTMLElement>(".message-text-content")?.textContent
            ?? element.querySelector<HTMLElement>(".message-text")?.textContent
            ?? undefined;
    });
}

describe("Message send lifecycle", () => {
    let db: Db | undefined;

    beforeEach(async () => {
        vi.resetModules();
        await resetIndexedDb();
        bootstrapMessagingDom();
        const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
        if (!attachmentsInput) {
            throw new Error("Missing attachments input in test DOM");
        }
        Object.defineProperty(attachmentsInput, "files", {
            value: makeEmptyFileList(),
            writable: true,
            configurable: true,
        });
        Object.defineProperty(globalThis, "DataTransfer", {
            value: MockDataTransfer,
            configurable: true,
        });
        testState.personas.clear();
        testState.openRouterResults.length = 0;
        testState.settings.model = "openai/gpt-5.4";
        testState.settings.streamResponses = false;
        testState.settings.enableThinking = false;
        testState.settings.rpgGroupChatsProgressAutomatically = true;
        testState.settings.disallowPersonaPinging = false;
        testState.settings.dynamicGroupChatPingOnly = false;
    });

    afterEach(async () => {
        db?.close();
        db = undefined;
        await resetIndexedDb();
    });

    it("sends a message and stores the mocked response in a normal chat", async () => {
        seedMockPersonas([
            {
                id: "persona-normal",
                persona: {
                    name: "Normal Persona",
                    description: "Replies in normal chats.",
                },
            },
        ]);

        queueOpenRouterResponse("Mocked assistant reply", "Mocked thinking");

        const { db: testDb, chatsService, messageService } = await loadServices();
        db = testDb;

        const chatId = await createAndLoadChat({
            chatsService,
            chat: makeChat({
                id: "chat-normal",
                title: "Normal Chat",
                content: [],
            }),
        });

        await messageService.send("Hello normal chat", {
            targetChatId: chatId,
            selectedPersonalityId: "persona-normal",
            attachmentFiles: makeEmptyFileList(),
        });

        const persistedChat = await testDb.chats.get(chatId);
        const visiblePersistedMessages = (persistedChat?.content ?? []).filter((message) => !message.hidden);
        expect(visiblePersistedMessages).toHaveLength(2);
        expect(visiblePersistedMessages[0]).toMatchObject({
            role: "user",
            parts: [expect.objectContaining({ text: "Hello normal chat" })],
        });
        expect(visiblePersistedMessages[1]).toMatchObject({
            role: "model",
            personalityid: "persona-normal",
            parts: [expect.objectContaining({ text: "Mocked assistant reply" })],
            thinking: "Mocked thinking",
            originModel: "openai/gpt-5.4",
        });

        const currentChat = await chatsService.getCurrentChat();
        const visibleCurrentMessages = (currentChat?.content ?? []).filter((message) => !message.hidden);
        expect(currentChat?.id).toBe(chatId);
        expect(visibleCurrentMessages.map((message) => message.role)).toEqual(["user", "model"]);
        expect(messageService.getIsGenerating(chatId)).toBe(false);

        const visibleDomMessages = getVisibleMessageElements();
        expect(visibleDomMessages).toHaveLength(2);
        expect(visibleDomMessages[0].querySelector(".message-text-content")?.textContent).toBe("Hello normal chat");
        expect(visibleDomMessages[1].querySelector(".message-text-content")?.textContent).toBe("Mocked assistant reply");
        expect(document.querySelector("#chat-title")?.textContent).toBe("Normal Chat");
    });

    it("sends a message and stores ordered mocked replies in an RPG group chat", async () => {
        seedMockPersonas([
            {
                id: "persona-rpg-a",
                persona: {
                    name: "RPG Alpha",
                    description: "First RPG responder.",
                },
            },
            {
                id: "persona-rpg-b",
                persona: {
                    name: "RPG Beta",
                    description: "Second RPG responder.",
                },
            },
        ]);

        queueOpenRouterResponse('{"kind":"reply","text":"Alpha takes the lead."}');
        queueOpenRouterResponse('{"kind":"reply","text":"Beta follows up."}');

        const { db: testDb, chatsService, messageService } = await loadServices();
        db = testDb;

        const groupChat: GroupChatConfig = {
            mode: "rpg",
            participantIds: ["persona-rpg-a", "persona-rpg-b"],
            rpg: {
                turnOrder: ["user", "persona-rpg-a", "persona-rpg-b"],
                narratorEnabled: false,
            },
        };

        const chatId = await createAndLoadChat({
            chatsService,
            chat: makeChat({
                id: "chat-rpg",
                title: "RPG Group Chat",
                content: [],
                groupChat,
            }),
        });

        await messageService.send("Advance the round", {
            targetChatId: chatId,
            selectedPersonalityId: "persona-rpg-a",
            attachmentFiles: makeEmptyFileList(),
        });

        const persistedChat = await testDb.chats.get(chatId);
        const visiblePersistedMessages = (persistedChat?.content ?? []).filter((message) => !message.hidden);
        expect(visiblePersistedMessages).toHaveLength(3);
        expect(visiblePersistedMessages.map((message) => ({
            role: message.role,
            personalityid: message.personalityid,
            text: message.parts[0]?.text,
            roundIndex: message.roundIndex,
        }))).toEqual([
            { role: "user", personalityid: undefined, text: "Advance the round", roundIndex: 1 },
            { role: "model", personalityid: "persona-rpg-a", text: "Alpha takes the lead.", roundIndex: 1 },
            { role: "model", personalityid: "persona-rpg-b", text: "Beta follows up.", roundIndex: 1 },
        ]);

        const currentChat = await chatsService.getCurrentChat();
        expect(currentChat?.groupChat?.mode).toBe("rpg");
        expect(messageService.getIsGenerating(chatId)).toBe(false);

        const roundBlock = document.querySelector<HTMLElement>(".round-block[data-round-index='1']");
        expect(roundBlock).not.toBeNull();
        const visibleDomMessages = Array.from(roundBlock?.querySelectorAll<HTMLElement>(".message[data-hidden='false']") ?? []);
        expect(visibleDomMessages).toHaveLength(3);
        expect(visibleDomMessages.map((element) => element.querySelector(".message-text-content")?.textContent)).toEqual([
            "Advance the round",
            "Alpha takes the lead.",
            "Beta follows up.",
        ]);
    });

    it("sends a message and stores a mocked reply in a dynamic group chat", async () => {
        seedMockPersonas([
            {
                id: "persona-dyn-a",
                persona: {
                    name: "Dynamic Alpha",
                    description: "Dynamic responder.",
                    independence: 0,
                },
            },
            {
                id: "persona-dyn-b",
                persona: {
                    name: "Dynamic Beta",
                    description: "Unused secondary participant.",
                    independence: 3,
                },
            },
        ]);

        queueOpenRouterResponse("Dynamic Alpha replies to the ping.");

        const { db: testDb, chatsService, messageService } = await loadServices();
        db = testDb;
        const openRouterService = await import("../../../src/services/OpenRouter.service");
        const dynamicGroupChatService = await import("../../../src/services/DynamicGroupChat");

        const groupChat: GroupChatConfig = {
            mode: "dynamic",
            participantIds: ["persona-dyn-a"],
            dynamic: {
                allowPings: false,
                maxMessageGuardById: {
                    "persona-dyn-a": 1,
                },
            },
        };

        const chatId = await createAndLoadChat({
            chatsService,
            chat: makeChat({
                id: "chat-dynamic",
                title: "Dynamic Group Chat",
                content: [],
                groupChat,
            }),
        });

        expect(chatsService.getCurrentChatId()).toBe(chatId);
        expect((await chatsService.getCurrentChat())?.groupChat?.mode).toBe("dynamic");
        vi.spyOn(Math, "random").mockReturnValue(0);

        await dynamicGroupChatService.sendGroupChatDynamic({
            msg: "Step in here",
            attachmentFiles: makeEmptyFileList(),
            isInternetSearchEnabled: false,
            isPremiumEndpointPreferred: false,
            shouldEnforceThoughtSignaturesInHistory: false,
        });

        await waitFor(async () => vi.mocked(openRouterService.requestOpenRouterCompletion).mock.calls.length === 1, "Timed out waiting for dynamic provider call");

        await waitFor(async () => {
            const chat = await testDb.chats.get(chatId);
            return (chat?.content ?? []).filter((message) => !message.hidden).length >= 2;
        }, "Timed out waiting for dynamic response to persist");

        const persistedChat = await testDb.chats.get(chatId);
        const visiblePersistedMessages = (persistedChat?.content ?? []).filter((message) => !message.hidden);
        expect(visiblePersistedMessages).toHaveLength(2);
        expect(visiblePersistedMessages[0]).toMatchObject({
            role: "user",
            parts: [expect.objectContaining({ text: "Step in here" })],
        });
        expect(visiblePersistedMessages[1]).toMatchObject({
            role: "model",
            personalityid: "persona-dyn-a",
            parts: [expect.objectContaining({ text: "Dynamic Alpha replies to the ping." })],
        });

        const currentChat = await chatsService.getCurrentChat();
        expect(currentChat?.groupChat?.mode).toBe("dynamic");
        expect(chatsService.getCurrentChatId()).toBe(chatId);
        expect(messageService.getIsGenerating(chatId)).toBe(false);

        await waitFor(async () => getVisibleMessageElements().length === 2, "Timed out waiting for dynamic response to render");
        const visibleDomMessages = getVisibleMessageElements();
        expect(visibleDomMessages.map((element) => element.querySelector(".message-text-content")?.textContent)).toEqual([
            "Step in here",
            "Dynamic Alpha replies to the ping.",
        ]);
    });

    it("regenerate prunes only the expected tail", async () => {
        seedMockPersonas([
            {
                id: "persona-regen",
                persona: {
                    name: "Regen Persona",
                    description: "Used for regeneration tests.",
                },
            },
        ]);

        queueOpenRouterResponse("Regenerated second reply", "Regenerated thinking");

        const { db: testDb, chatsService, messageService } = await loadServices();
        db = testDb;
        const openRouterService = await import("../../../src/services/OpenRouter.service");

        const chatId = await createAndLoadChat({
            chatsService,
            chat: makeChat({
                id: "chat-regenerate",
                title: "Regenerate Chat",
                content: [
                    makeUserMessage("First prompt"),
                    makeModelMessage("First reply", { personalityid: "persona-regen", originModel: "openai/gpt-5.4" }),
                    {
                        role: "model",
                        hidden: true,
                        personalityid: "persona-regen",
                        parts: [{ text: "__persona_marker__:persona-regen" }],
                    },
                    makeUserMessage("Second prompt"),
                    makeModelMessage("Second reply", { personalityid: "persona-regen", originModel: "openai/gpt-5.4" }),
                    makeUserMessage("Third prompt"),
                    makeModelMessage("Third reply", { personalityid: "persona-regen", originModel: "openai/gpt-5.4" }),
                ],
            }),
        });

        expect(getVisibleMessageElements().map((element) => element.querySelector(".message-text-content")?.textContent)).toEqual([
            "First prompt",
            "First reply",
            "Second prompt",
            "Second reply",
            "Third prompt",
            "Third reply",
        ]);

        await messageService.regenerate(4);

        expect(vi.mocked(openRouterService.requestOpenRouterCompletion).mock.calls.length).toBe(1);
        await chatsService.waitForPendingWrites(chatId);

        const persistedChat = await testDb.chats.get(chatId);
        const persistedContent = persistedChat?.content ?? [];
        const visiblePersistedMessages = persistedContent.filter((message) => !message.hidden);
        expect(visiblePersistedMessages.map((message) => message.parts[0]?.text)).toEqual([
            "First prompt",
            "First reply",
            "Second prompt",
            "Regenerated second reply",
        ]);
        expect(persistedContent.some((message) => message.parts[0]?.text === "Third prompt")).toBe(false);
        expect(persistedContent.some((message) => message.parts[0]?.text === "Third reply")).toBe(false);
        const secondPromptIndex = persistedContent.findIndex((message) => message.parts[0]?.text === "Second prompt");
        expect(secondPromptIndex).toBeGreaterThan(0);
        expect(persistedContent[secondPromptIndex - 1]).toMatchObject({
            hidden: true,
            personalityid: "persona-regen",
        });
        expect(persistedContent.at(-1)).toMatchObject({
            role: "model",
            personalityid: "persona-regen",
            parts: [expect.objectContaining({ text: "Regenerated second reply" })],
        });

        const currentChat = await chatsService.getCurrentChat();
        expect((currentChat?.content ?? []).filter((message) => !message.hidden).map((message) => message.parts[0]?.text)).toEqual([
            "First prompt",
            "First reply",
            "Second prompt",
            "Regenerated second reply",
        ]);
        expect((currentChat?.content ?? []).some((message) => message.parts[0]?.text === "Third prompt")).toBe(false);
        expect((currentChat?.content ?? []).some((message) => message.parts[0]?.text === "Third reply")).toBe(false);
        expect(messageService.getIsGenerating(chatId)).toBe(false);

        await waitFor(async () => getVisibleMessageElements().length === 4, "Timed out waiting for regenerated DOM to settle");
        expect(document.querySelector(`.message[data-hidden='true']`)).not.toBeNull();
        expect(getVisibleMessageElements().map((element) => element.querySelector(".message-text-content")?.textContent)).toEqual([
            "First prompt",
            "First reply",
            "Second prompt",
            "Regenerated second reply",
        ]);
        expect(document.querySelector(".message-container")?.textContent).not.toContain("Third prompt");
        expect(document.querySelector(".message-container")?.textContent).not.toContain("Third reply");
    });

    it("regeneration in an RPG group chat round prunes later round DOM and state consistently", async () => {
        vi.doUnmock("../../../src/components/dynamic/message");

        seedMockPersonas([
            {
                id: "persona-rpg-a",
                persona: {
                    name: "RPG Alpha",
                    description: "First RPG responder.",
                },
            },
            {
                id: "persona-rpg-b",
                persona: {
                    name: "RPG Beta",
                    description: "Second RPG responder.",
                },
            },
            {
                id: "persona-rpg-c",
                persona: {
                    name: "RPG Gamma",
                    description: "Third RPG responder.",
                },
            },
            {
                id: "persona-rpg-d",
                persona: {
                    name: "RPG Delta",
                    description: "Fourth RPG responder.",
                },
            },
        ]);

        queueOpenRouterResponse('{"kind":"skip","text":"Alpha steps back."}');
        queueOpenRouterResponse('{"kind":"reply","text":"Beta speaks."}');
        queueOpenRouterResponse('{"kind":"skip","text":"Gamma steps aside."}');
        queueOpenRouterResponse('{"kind":"reply","text":"Delta closes the round."}');
        queueOpenRouterResponse('{"kind":"reply","text":"Beta regenerated."}');
        queueOpenRouterResponse('{"kind":"reply","text":"Gamma regenerated."}');
        queueOpenRouterResponse('{"kind":"reply","text":"Delta regenerated."}');

        const { db: testDb, chatsService, messageService } = await loadServices();
        db = testDb;
        const openRouterService = await import("../../../src/services/OpenRouter.service");

        const groupChat: GroupChatConfig = {
            mode: "rpg",
            participantIds: ["persona-rpg-a", "persona-rpg-b", "persona-rpg-c", "persona-rpg-d"],
            rpg: {
                turnOrder: ["user", "persona-rpg-a", "persona-rpg-b", "persona-rpg-c", "persona-rpg-d"],
                narratorEnabled: false,
            },
        };

        const chatId = await createAndLoadChat({
            chatsService,
            chat: makeChat({
                id: "chat-rpg-regenerate",
                title: "RPG Regenerate Chat",
                content: [],
                groupChat,
            }),
        });

        await messageService.send("Round one prompt", {
            targetChatId: chatId,
            selectedPersonalityId: "persona-rpg-a",
            attachmentFiles: makeEmptyFileList(),
        });

        await waitFor(async () => getVisibleMessageTexts().length === 3, "Timed out waiting for initial RPG round render");
        expect(getVisibleMessageTexts()).toEqual([
            "Round one prompt",
            "Beta speaks.",
            "Delta closes the round.",
        ]);

        const initialRoundBlock = document.querySelector<HTMLElement>(".round-block[data-round-index='1']");
        expect(initialRoundBlock).not.toBeNull();
        expect(initialRoundBlock?.querySelectorAll(".message, .skip-notice")).toHaveLength(5);

        const initialSkipNotices = Array.from(initialRoundBlock?.querySelectorAll<HTMLElement>(".skip-notice") ?? []);
        expect(initialSkipNotices).toHaveLength(2);
        expect(initialSkipNotices[0]?.textContent).toContain("RPG Alpha skipped their turn: Alpha steps back.");
        expect(initialSkipNotices[1]?.textContent).toContain("RPG Gamma skipped their turn: Gamma steps aside.");

        vi.mocked(openRouterService.requestOpenRouterCompletion).mockClear();

        const roundOneBetaMessage = Array.from(document.querySelectorAll<HTMLElement>(".message[data-round-index='1']"))
            .find((element) => element.querySelector(".message-text-content")?.textContent === "Beta speaks.");
        expect(roundOneBetaMessage).not.toBeUndefined();

        const refreshButton = roundOneBetaMessage?.querySelector<HTMLButtonElement>(".btn-refresh");
        expect(refreshButton).not.toBeNull();
        refreshButton?.click();

        await waitFor(async () => vi.mocked(openRouterService.requestOpenRouterCompletion).mock.calls.length === 3, "Timed out waiting for RPG regenerate provider calls");
        await chatsService.waitForPendingWrites(chatId);

        const persistedChat = await testDb.chats.get(chatId);
        expect(persistedChat?.content).toHaveLength(5);

        const persistedVisibleMessages = (persistedChat?.content ?? []).filter((message) => !message.hidden);
        expect(persistedVisibleMessages.map((message) => ({
            text: message.parts[0]?.text,
            roundIndex: message.roundIndex,
            personalityid: message.personalityid,
        }))).toEqual([
            { text: "Round one prompt", roundIndex: 1, personalityid: undefined },
            { text: "Beta regenerated.", roundIndex: 1, personalityid: "persona-rpg-b" },
            { text: "Gamma regenerated.", roundIndex: 1, personalityid: "persona-rpg-c" },
            { text: "Delta regenerated.", roundIndex: 1, personalityid: "persona-rpg-d" },
        ]);
        expect((persistedChat?.content ?? []).some((message) => message.hidden && message.personalityid === "persona-rpg-a" && message.parts[0]?.text === "__ai_skip_turn__" && message.roundIndex === 1)).toBe(true);
        expect((persistedChat?.content ?? []).some((message) => message.hidden && message.personalityid === "persona-rpg-c" && message.parts[0]?.text === "__ai_skip_turn__" && message.roundIndex === 1)).toBe(false);

        const currentChat = await chatsService.getCurrentChat();
        expect(currentChat?.content).toHaveLength(5);
        expect((currentChat?.content ?? []).filter((message) => !message.hidden).map((message) => ({
            text: message.parts[0]?.text,
            roundIndex: message.roundIndex,
            personalityid: message.personalityid,
        }))).toEqual([
            { text: "Round one prompt", roundIndex: 1, personalityid: undefined },
            { text: "Beta regenerated.", roundIndex: 1, personalityid: "persona-rpg-b" },
            { text: "Gamma regenerated.", roundIndex: 1, personalityid: "persona-rpg-c" },
            { text: "Delta regenerated.", roundIndex: 1, personalityid: "persona-rpg-d" },
        ]);
        expect((currentChat?.content ?? []).some((message) => message.hidden && message.personalityid === "persona-rpg-a" && message.parts[0]?.text === "__ai_skip_turn__" && message.roundIndex === 1)).toBe(true);
        expect((currentChat?.content ?? []).some((message) => message.hidden && message.personalityid === "persona-rpg-c" && message.parts[0]?.text === "__ai_skip_turn__" && message.roundIndex === 1)).toBe(false);
        expect(messageService.getIsGenerating(chatId)).toBe(false);

        await waitFor(async () => getVisibleMessageElements().length >= 4, "Timed out waiting for group regeneration DOM to settle");
        expect(getVisibleMessageTexts()).toEqual([
            "Round one prompt",
            "Beta regenerated.",
            "Gamma regenerated.",
            "Delta regenerated.",
        ]);

        const roundOneBlock = document.querySelector<HTMLElement>(".round-block[data-round-index='1']");
        expect(roundOneBlock).not.toBeNull();
        expect(document.querySelectorAll(".round-block")).toHaveLength(1);
        expect(roundOneBlock?.querySelectorAll(".message, .skip-notice")).toHaveLength(5);

        expect(Array.from(roundOneBlock?.querySelectorAll<HTMLElement>(".message") ?? []).map((element) => {
            return element.querySelector<HTMLElement>(".message-text-content")?.textContent
                ?? element.querySelector<HTMLElement>(".message-text")?.textContent
                ?? undefined;
        })).toEqual([
            "Round one prompt",
            "Beta regenerated.",
            "Gamma regenerated.",
            "Delta regenerated.",
        ]);

        const roundOneSkipNotices = Array.from(roundOneBlock?.querySelectorAll<HTMLElement>(".skip-notice") ?? []);
        expect(roundOneSkipNotices).toHaveLength(1);
        expect(roundOneSkipNotices[0]?.textContent).toContain("RPG Alpha skipped their turn: Alpha steps back.");
    });
});

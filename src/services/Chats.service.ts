import * as messageService from "./Message.service"
import { messageElement } from "../components/dynamic/message";
import * as helpers from "../utils/helpers"
import { Db, db } from "./Db.service";
import { Chat, ChatSortMode, DbChat } from "../types/Chat";
import { Message } from "../types/Message";
import { dispatchAppEvent } from "../events";
import hljs from "highlight.js";
import { v4 as uuidv4 } from 'uuid';
import * as syncService from "./Sync.service";
import * as toastService from "./Toast.service";
const messageContainer = document.querySelector<HTMLDivElement>(".message-container");
const scrollableChatContainerSelector = "#scrollable-chat-container";
const chatHistorySection = document.querySelector<HTMLDivElement>("#chatHistorySection");
const sidebar = document.querySelector<HTMLDivElement>(".sidebar");

// Incremental loading state for the currently opened chat
const PAGE_SIZE = 50; // number of messages to load per page
let currentChatIdState: string | null = null;
let currentChatMessages: Message[] = [];
let loadedStartIndex = 0; // inclusive
let loadedEndIndex = 0;   // exclusive
let isLoadingOlder = false;
let hasMoreOlder = false;
let scrollListenerAttached = false;
let isRemotePagedMode = false;
let remoteOldestLoadedIndex = 0;
let remoteWindowStartIndex = 0;
const remoteChatsById = new Map<string, DbChat>();
let currentChatSnapshot: DbChat | null = null;

const CHAT_SORT_MODE_STORAGE_KEY = "chat-sort-mode";
// Lazily initialized from localStorage on first access so that the initial
// sort on load reflects the user's last choice instead of always defaulting
// to "created_at".
let currentChatSortMode: ChatSortMode | undefined;

function loadChatSortModeFromStorage(): ChatSortMode {
    try {
        const stored = localStorage.getItem(CHAT_SORT_MODE_STORAGE_KEY);
        if (stored === "created_at" || stored === "last_interaction" || stored === "alphabetical") {
            return stored;
        }
    } catch (error) {
        console.error("Failed to load chat sort mode from storage", error);
    }
    return "created_at";
}

function getLastInteractionTimestamp(chat: DbChat): number {
    const raw = (chat as any).lastModified;
    if (raw instanceof Date) {
        const ts = raw.getTime();
        if (!Number.isNaN(ts)) return ts;
    } else if (typeof raw === "string" || typeof raw === "number") {
        const ts = new Date(raw as any).getTime();
        if (!Number.isNaN(ts)) return ts;
    }

    const lastMsg = chat.content && chat.content.length > 0
        ? chat.content[chat.content.length - 1]
        : undefined;

    if (lastMsg && typeof (lastMsg as any).timestamp === "number") {
        return (lastMsg as any).timestamp as number;
    }

    return chat.timestamp;
}

function sortChats(chats: DbChat[], mode: ChatSortMode): DbChat[] {
    const list = [...chats];

    if (mode === "alphabetical") {
        list.sort((a, b) => {
            const titleA = (a.title || "").toLocaleLowerCase();
            const titleB = (b.title || "").toLocaleLowerCase();
            // Alphabetical A → Z
            if (titleA < titleB) return -1;
            if (titleA > titleB) return 1;
            return 0;
        });
        return list;
    }

    if (mode === "created_at") {
        // Newest first (most recently created at the top)
        list.sort((a, b) => b.timestamp - a.timestamp);
        return list;
    }

    // last_interaction
    list.sort((a, b) => {
        const aLast = getLastInteractionTimestamp(a);
        const bLast = getLastInteractionTimestamp(b);
        // Most recent first (chat with latest activity at the top)
        return bLast - aLast;
    });
    return list;
}

export function getCurrentChatId(): string | null {
    const currentChatElement = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
    if (currentChatElement) {
        const val = currentChatElement.value.replace("chat", "");
        return val || null;
    }
    return null;
}

function cacheRemoteChats(chats: DbChat[]) {
    remoteChatsById.clear();
    for (const chat of chats) {
        remoteChatsById.set(chat.id, structuredClone(chat));
    }
}

function upsertRemoteChat(chat: DbChat) {
    remoteChatsById.set(chat.id, structuredClone(chat));
}

export async function initialize() {
    const chatContainer = document.querySelector<HTMLDivElement>("#chatHistorySection");
    if (!chatContainer) {
        console.error("Chat container not found");
        return;
    }
    chatContainer.innerHTML = "";
    // Ensure sort mode is loaded from storage (or defaulted) before first render
    const mode = getChatSortMode();
    const chats = await getAllChats(db);
    const sortedChats = sortChats(chats, mode);
    // For initial render, append in sorted order so the first item in the
    // sorted array appears at the top visually.
    for (let chat of sortedChats) {
        insertChatEntry(chat, "append");
    }
}

export function setChatSortMode(mode: ChatSortMode) {
    currentChatSortMode = mode;
    try {
        localStorage.setItem(CHAT_SORT_MODE_STORAGE_KEY, mode);
    } catch (error) {
        console.error("Failed to persist chat sort mode", error);
    }
    // Do not fully reload the chat list here; instead, re-order existing DOM
    // entries to preserve selection and avoid flashing.
    void reorderChatListInDom();
}

export function getChatSortMode(): ChatSortMode {
    if (!currentChatSortMode) {
        currentChatSortMode = loadChatSortModeFromStorage();
    }
    return currentChatSortMode;
}

// Helper to get the current chat ordering based on the active sort mode,
// using real data from Dexie so that created_at and last_interaction behave correctly.
async function getSortedChatsSnapshotFromDb(): Promise<DbChat[]> {
    const chats = await getAllChats(db);
    const mode = getChatSortMode();
    return sortChats(chats, mode);
}

// Reorder existing DOM nodes in #chatHistorySection to match the current sort mode
async function reorderChatListInDom() {
    if (!chatHistorySection) return;

    const sorted = await getSortedChatsSnapshotFromDb();

    const fragment = document.createDocumentFragment();
    for (const chat of sorted) {
        const identifier = "chat" + chat.id;
        const radio = document.querySelector<HTMLInputElement>(`input[value='${identifier}']`);
        const label = document.querySelector<HTMLLabelElement>(`label[for='${identifier}']`);
        if (radio && label) {
            fragment.appendChild(radio);
            fragment.appendChild(label);
        }
    }

    chatHistorySection.innerHTML = "";
    chatHistorySection.appendChild(fragment);
}

// Rebuild the chat list according to the current sort mode after data changes
// (e.g., when messages are persisted and lastModified is updated).
export async function refreshChatListAfterActivity(dbArg: Db = db): Promise<void> {
    try {
        const mode = getChatSortMode();

        // When activity occurs, only adjust the DOM order instead of rebuilding from DB.
        // This keeps the currently selected radio and avoids visual flashing.
        if (mode === "last_interaction" || mode === "created_at" || mode === "alphabetical") {
            await reorderChatListInDom();
        }
    } catch (error) {
        console.error("Failed to refresh chat list after activity", error);
    }
}

function insertChatEntry(chat: DbChat, position: "append" | "prepend" = "prepend") {
    //radio button
    const chatRadioButton = document.createElement("input");
    chatRadioButton.setAttribute("type", "radio");
    chatRadioButton.setAttribute("name", "currentChat");
    chatRadioButton.setAttribute("value", "chat" + chat.id);
    chatRadioButton.id = "chat" + chat.id;
    chatRadioButton.classList.add("input-radio-currentchat");

    //label
    const chatLabel = document.createElement("label");
    chatLabel.setAttribute("for", "chat" + chat.id);
    chatLabel.classList.add("title-chat");
    chatLabel.classList.add("label-currentchat");


    // chat title
    const chatLabelText = document.createElement("span");
    chatLabelText.classList.add("chat-title-text");
    chatLabelText.style.overflow = "hidden";
    chatLabelText.style.textOverflow = "ellipsis";
    chatLabelText.textContent = chat.title;

    // chat icon
    const chatIcon = document.createElement("span");
    chatIcon.classList.add("material-symbols-outlined");
    // Use a distinct icon for group chats
    chatIcon.classList.add("chat-icon");
    chatIcon.textContent = chat.groupChat ? "groups" : "chat_bubble";

    // actions dropdown (ellipsis + menu)
    const actionsWrapper = document.createElement("div");
    actionsWrapper.classList.add("chat-actions-wrapper");

    const actionsButton = document.createElement("button");
    actionsButton.classList.add("btn-textual", "material-symbols-outlined", "chat-actions-button");
    actionsButton.setAttribute("aria-haspopup", "true");
    actionsButton.setAttribute("aria-expanded", "false");
    actionsButton.setAttribute("title", "Chat actions");
    actionsButton.textContent = "more_vert"; // material icon for vertical ellipsis

    const menu = document.createElement("div");
    menu.classList.add("chat-actions-menu");
    menu.classList.add("dropdown-menu");
    menu.setAttribute("role", "menu");

    function closeMenu() {
        if (actionsWrapper.classList.contains("open")) {
            actionsWrapper.classList.remove("open");
            actionsButton.setAttribute("aria-expanded", "false");
        }
    }

    function openMenu() {
        if (!actionsWrapper.classList.contains("open")) {
            // close other open menus
            document.querySelectorAll('.chat-actions-wrapper.open').forEach(el => {
                if (el !== actionsWrapper) el.classList.remove('open');
            });

            // Check if menu would overflow at the bottom
            const scrollContainer = chatHistorySection;
            if (scrollContainer) {
                const buttonRect = actionsButton.getBoundingClientRect();
                const containerRect = scrollContainer.getBoundingClientRect();

                // Estimate menu height (we'll use 120px as approximate height for 3 items)
                const estimatedMenuHeight = 120;
                const spaceBelow = containerRect.bottom - buttonRect.bottom;
                const spaceAbove = buttonRect.top - containerRect.top;

                // If not enough space below but enough space above, open upward
                if (spaceBelow < estimatedMenuHeight && spaceAbove > estimatedMenuHeight) {
                    actionsWrapper.classList.add("menu-above");
                } else {
                    actionsWrapper.classList.remove("menu-above");
                }
            }

            actionsWrapper.classList.add("open");
            actionsButton.setAttribute("aria-expanded", "true");
        }
    }

    actionsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!actionsWrapper.classList.contains("open")) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    // Menu items
    const editItem = document.createElement("button");
    editItem.classList.add("chat-actions-item");
    editItem.setAttribute("role", "menuitem");
    editItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">edit</span><span>Edit title</span>`;
    editItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        chatLabelText.setAttribute("contenteditable", "true");
        chatLabelText.focus();
        document.execCommand("selectAll", false);
        chatLabelText.addEventListener("blur", async () => {
            chatLabelText.removeAttribute("contenteditable");
            const newTitle = chatLabelText.textContent?.trim() || "";
            if (newTitle && newTitle !== chat.title) {
                await editChat(chat.id, newTitle);
            }
        }, { once: true });
        chatLabelText.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                chatLabelText.blur();
            }
        });
    });

    const deleteItem = document.createElement("button");
    deleteItem.classList.add("chat-actions-item");
    deleteItem.setAttribute("role", "menuitem");
    deleteItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">delete</span><span>Delete</span>`;
    deleteItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        deleteChat(chat.id, db);
    });

    // Group settings (only for group chats)
    let groupSettingsItem: HTMLButtonElement | null = null;
    if (chat.groupChat) {
        groupSettingsItem = document.createElement("button");
        groupSettingsItem.classList.add("chat-actions-item");
        groupSettingsItem.setAttribute("role", "menuitem");
        groupSettingsItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">settings</span><span>Group Settings</span>`;
        groupSettingsItem.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMenu();
            // Dispatch custom event to open group chat editor
            dispatchAppEvent('open-group-chat-editor', { chatId: chat.id });
        });
    }

    // export single chat
    const exportItem = document.createElement("button");
    exportItem.classList.add("chat-actions-item");
    exportItem.setAttribute("role", "menuitem");
    exportItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">share</span><span>Export</span>`;
    exportItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        closeMenu();
        await exportChat(chat.id);
    });

    if (groupSettingsItem) {
        menu.append(groupSettingsItem);
    }
    menu.append(editItem, exportItem, deleteItem);
    actionsWrapper.append(actionsButton, menu);

    // close on outside click
    document.addEventListener("click", (e) => {
        if (!actionsWrapper.contains(e.target as Node)) {
            closeMenu();
        }
    });

    // keyboard accessibility
    actionsButton.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeMenu();
            actionsButton.blur();
        } else if ((e.key === "Enter" || e.key === " ") && !actionsWrapper.classList.contains("open")) {
            openMenu();
        } else if (e.key === "ArrowDown") {
            openMenu();
            (menu.querySelector("button") as HTMLButtonElement)?.focus();
        }
    });
    menu.addEventListener("keydown", (e) => {
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button.chat-actions-item"));
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "Escape") {
            closeMenu();
            actionsButton.focus();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            items[(currentIndex + 1) % items.length].focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            items[(currentIndex - 1 + items.length) % items.length].focus();
        }
    });

    chatLabel.append(chatIcon);
    chatLabel.append(chatLabelText);
    chatLabel.append(actionsWrapper);

    chatRadioButton.addEventListener("change", async () => {
        await loadChat(chat.id, db);
        if (window.innerWidth < 1032 && sidebar) {
            helpers.hideElement(sidebar);
        }
    });
    if (chatHistorySection) {
        if (position === "append") {
            chatHistorySection.append(chatRadioButton, chatLabel);
        } else {
            chatHistorySection.prepend(chatRadioButton, chatLabel);
        }
    }
}

export async function addChat(title: string, content?: Message[]): Promise<string> {
    const id = uuidv4();
    const chat: DbChat = {
        id,
        title: title,
        timestamp: Date.now(),
        content: content || []
    };
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) {
            throw new Error('Cloud sync is enabled but locked. Unlock sync before creating chats.');
        }
        const ok = await syncService.upsertSyncedChat(chat);
        if (!ok) {
            throw new Error('Failed to create synced chat');
        }
        upsertRemoteChat(chat);
    } else {
        await db.chats.put(chat);
    }
    // New chats should appear at the top when they are created.
    insertChatEntry(chat, "prepend");
    return id;
}

export async function addChatRecord(chat: Chat): Promise<string> {
    const id = (chat as any).id ?? uuidv4();
    const record: DbChat = {
        id,
        title: chat.title,
        timestamp: chat.timestamp ?? Date.now(),
        content: chat.content || [],
        lastModified: (chat as any).lastModified,
        groupChat: (chat as any).groupChat,
    };
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) {
            throw new Error('Cloud sync is enabled but locked. Unlock sync before importing chats.');
        }
        const ok = await syncService.upsertSyncedChat(record);
        if (!ok) {
            throw new Error('Failed to add synced chat record');
        }
        upsertRemoteChat(record);
    } else {
        await db.chats.put(record);
    }
    console.log(`addChatRecord: inserted chat id=${id}`, record);
    insertChatEntry(record, "prepend");
    return id;
}

export async function getCurrentChat(dbArg: Db = db) {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) return null;
        if (currentChatSnapshot) return structuredClone(currentChatSnapshot);
        const id = getCurrentChatId();
        if (!id) return null;
        const remote = remoteChatsById.get(id) ?? await syncService.fetchSyncedChatMetadata(id);
        if (!remote) return null;
        currentChatSnapshot = structuredClone(remote);
        upsertRemoteChat(remote);
        return structuredClone(remote);
    }

    const id = getCurrentChatId();
    if (!id) {
        return null;
    }
    return (await dbArg.chats.get(id));
}

export async function deleteAllChats(db: Db) {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) {
            throw new Error('Cloud sync is enabled but locked. Unlock sync before deleting chats.');
        }
        const chats = await getAllChats(db);
        for (const chat of chats) {
            await syncService.deleteSyncedChat(chat.id);
        }
        remoteChatsById.clear();
        currentChatSnapshot = null;
    } else {
        await db.chats.clear();
    }
    // Clear chat list and messages without rebuilding from DB
    if (chatHistorySection) {
        chatHistorySection.innerHTML = "";
    }
    newChat();
}


export async function deleteChat(id: string, db: Db) {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) {
            throw new Error('Cloud sync is enabled but locked. Unlock sync before deleting chats.');
        }
        await syncService.deleteSyncedChat(id);
        remoteChatsById.delete(id);
        if (currentChatSnapshot?.id === id) currentChatSnapshot = null;
    } else {
        await db.chats.delete(id);
    }
    const currentId = getCurrentChatId();

    // Remove the radio + label for this chat from the DOM
    const identifier = "chat" + id;
    const radioButton = document.querySelector<HTMLInputElement>(`input[value='${identifier}']`);
    const label = document.querySelector<HTMLLabelElement>(`label[for='${identifier}']`);
    if (radioButton) {
        radioButton.remove();
    }
    if (label) {
        label.remove();
    }

    // If the deleted chat was selected, clear the messages and selection
    if (currentId === id) {
        newChat();
    }
}

export function newChat() {
    if (!messageContainer) {
        console.error("Message container not found");
        return;
    }

    // Clear DOM
    messageContainer.innerHTML = "";
    document.querySelector("#chat-title")!.textContent = "";

    // Reset pagination state
    currentChatIdState = null;
    currentChatMessages = [];
    loadedStartIndex = 0;
    loadedEndIndex = 0;
    isLoadingOlder = false;
    hasMoreOlder = false;
    currentChatSnapshot = null;
    remoteWindowStartIndex = 0;

    // Uncheck current chat selection
    const checkedInput = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
    if (checkedInput) {
        checkedInput.checked = false;
    }

    //dispatch event with null chat to reset UI (e.g., hide Turn Control panel)
    dispatchAppEvent('chat-loaded', { chat: null });
}

export async function saveChat(chat: DbChat): Promise<void> {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) {
            throw new Error('Cloud sync is enabled but locked. Unlock sync before saving chat changes.');
        }
        let chatToSave = chat;

        if (isRemotePagedMode && currentChatIdState === chat.id) {
            const fullMessages = await syncService.fetchAllSyncedChatMessages(chat.id);
            if (fullMessages) {
                const localMessages = chat.content || [];
                const rebased = [...fullMessages];

                for (let localIndex = 0; localIndex < localMessages.length; localIndex++) {
                    const absoluteIndex = remoteWindowStartIndex + localIndex;
                    rebased[absoluteIndex] = localMessages[localIndex];
                }

                chatToSave = {
                    ...chat,
                    content: rebased,
                };
            }
        }

        const previous = remoteChatsById.get(chat.id) ?? (currentChatSnapshot?.id === chat.id ? currentChatSnapshot : undefined);
        const ok = await syncService.upsertSyncedChat(chatToSave, previous);
        if (!ok) {
            throw new Error(`Failed to sync chat ${chat.id}`);
        }
        upsertRemoteChat(chatToSave);
        if (currentChatSnapshot?.id === chat.id) {
            currentChatSnapshot = structuredClone(chatToSave);
        }
        await refreshChatListAfterActivity(db);
        return;
    }

    await db.chats.put(chat);
    await refreshChatListAfterActivity(db);
}

export async function getChatById(id: string): Promise<DbChat | undefined> {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) return undefined;
        const cached = remoteChatsById.get(id);
        if (cached) return structuredClone(cached);

        const remote = await syncService.fetchSyncedChatMetadata(id);
        if (!remote) return undefined;
        upsertRemoteChat(remote);
        return structuredClone(remote);
    }

    return db.chats.get(id);
}

export async function replaceCurrentChatMessages(messages: Message[]): Promise<void> {
    if (!currentChatSnapshot) return;
    currentChatMessages = structuredClone(messages);
    loadedStartIndex = 0;
    loadedEndIndex = currentChatMessages.length;
    hasMoreOlder = false;
    isRemotePagedMode = false;
    remoteOldestLoadedIndex = 0;
    remoteWindowStartIndex = 0;

    currentChatSnapshot = {
        ...currentChatSnapshot,
        content: structuredClone(currentChatMessages),
    };
    upsertRemoteChat(currentChatSnapshot);
}

async function renderMessagesSlice(start: number, end: number, prepend: boolean) {
    if (!messageContainer) {
        console.error("Message container not found while rendering messages slice");
        return;
    }

    const slice = currentChatMessages.slice(start, end);
    if (slice.length === 0) {
        return;
    }
    const scrollContainer = document.querySelector<HTMLDivElement>(scrollableChatContainerSelector);
    const previousScrollHeight = scrollContainer?.scrollHeight ?? 0;
    const previousScrollTop = scrollContainer?.scrollTop ?? 0;
    const absoluteBase = isRemotePagedMode ? remoteWindowStartIndex : 0;

    // For initial load (prepend = false), render slice in natural order (older -> newer)
    if (!prepend) {
        for (let offset = 0; offset < slice.length; offset++) {
            const msg = slice[offset];
            // The real index in chat.content/currentChatMessages
            const chatIndex = absoluteBase + start + offset;
            await messageService.insertMessage(msg, chatIndex);
        }
    } else {
        // For prepending older messages:
        // 1. Render them into a DocumentFragment to minimize reflows.
        // 2. Iterate chronological (Old -> New) within the slice to build proper blocks.
        // 3. Prepend the entire fragment.
        // 4. Handle boundary merging with the existing first block.
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < slice.length; i++) {
            const msg = slice[i];
            const chatIndex = absoluteBase + start + i;
            const element = await messageElement(msg, chatIndex);

            // Turn Grouping Logic (Fragment Building)
            const lastBlock = fragment.lastElementChild as HTMLElement;
            const currentRoundIndex = msg.roundIndex;

            if (
                typeof currentRoundIndex === 'number' &&
                lastBlock?.classList.contains('round-block') &&
                lastBlock.dataset.roundIndex === String(currentRoundIndex)
            ) {
                lastBlock.append(element);
            } else if (typeof currentRoundIndex === 'number') {
                const block = document.createElement("div");
                block.classList.add("round-block");
                block.dataset.roundIndex = String(currentRoundIndex);
                messageService.ensureRoundBlockUi(block as HTMLDivElement, currentRoundIndex);
                block.append(element);
                fragment.append(block);
            } else {
                fragment.append(element);
            }
        }

        // Boundary merging: If the last block of the fragment matches the first block of the DOM
        if (messageContainer.firstElementChild) {
            const firstBlockInDom = messageContainer.firstElementChild as HTMLElement;
            const lastBlockInFragment = fragment.lastElementChild as HTMLElement;

            if (
                firstBlockInDom?.classList.contains('round-block') &&
                lastBlockInFragment?.classList.contains('round-block') &&
                firstBlockInDom.dataset.roundIndex === lastBlockInFragment.dataset.roundIndex
            ) {
                // Merge DOM block's children into fragment's last block (appending them)
                // Fragment: [Msg A]
                // DOM: [Msg B]
                // Result Fragment: [Msg A, Msg B]
                while (firstBlockInDom.firstChild) {
                    lastBlockInFragment.append(firstBlockInDom.firstChild);
                }
                firstBlockInDom.remove();
            }
        }

        if (messageContainer) {
            messageContainer.prepend(fragment);
        }
    }

    if (prepend && scrollContainer) {
        const newScrollHeight = scrollContainer.scrollHeight;
        scrollContainer.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
    } else {
        // For initial load, we want to end at the bottom
        helpers.messageContainerScrollToBottom(true);
    }

    hljs.highlightAll();
}

function attachScrollListener() {
    if (scrollListenerAttached) {
        return;
    }

    const scrollContainer = document.querySelector<HTMLDivElement>(scrollableChatContainerSelector);
    if (!scrollContainer) {
        console.error("Scrollable chat container not found when attaching scroll listener");
        return;
    }

    const onScroll = async () => {
        if (!hasMoreOlder || isLoadingOlder) {
            return;
        }
        // When the user scrolls near the top of the scrollable container, load older messages
        const threshold = 200; // px
        if (scrollContainer.scrollTop <= threshold) {
            console.log("Loading older messages...");
            await loadOlderMessages();
        }
    };

    scrollContainer.addEventListener("scroll", onScroll);
    scrollListenerAttached = true;
}

async function loadOlderMessages() {
    if (isLoadingOlder) return;
    isLoadingOlder = true;

    try {
        if (isRemotePagedMode && currentChatIdState) {
            const window = await syncService.hydrateOlderChatMessagesWindow(currentChatIdState, remoteOldestLoadedIndex, PAGE_SIZE);
            if (!window || window.messages.length === 0) {
                hasMoreOlder = false;
                return;
            }

            currentChatMessages = [...window.messages, ...currentChatMessages];
            if (currentChatSnapshot) {
                currentChatSnapshot = {
                    ...currentChatSnapshot,
                    content: structuredClone(currentChatMessages),
                };
                upsertRemoteChat(currentChatSnapshot);
            }

            remoteWindowStartIndex = window.startIndex;
            await renderMessagesSlice(0, window.messages.length, true);

            remoteOldestLoadedIndex = window.startIndex;
            hasMoreOlder = window.hasMoreOlder;
            loadedStartIndex = 0;
            loadedEndIndex = currentChatMessages.length;
            return;
        }

        const nextStart = Math.max(0, loadedStartIndex - PAGE_SIZE);
        if (nextStart === loadedStartIndex) {
            hasMoreOlder = false;
            return;
        }

        await renderMessagesSlice(nextStart, loadedStartIndex, true);
        loadedStartIndex = nextStart;
        hasMoreOlder = loadedStartIndex > 0;
    } catch (error) {
        console.error("Failed to load older messages", error);
    } finally {
        isLoadingOlder = false;
    }
}

export async function loadChat(chatID: string, dbArg: Db = db) {
    try {
        if (!chatID || !messageContainer) {
            console.error("Chat ID is null or message container not found");
            throw new Error("Chat ID is null or message container not found");
        }

        // Reset state for new chat
        currentChatIdState = chatID;
        currentChatMessages = [];
        loadedStartIndex = 0;
        loadedEndIndex = 0;
        isLoadingOlder = false;
        hasMoreOlder = false;
        isRemotePagedMode = false;
        remoteOldestLoadedIndex = 0;
        remoteWindowStartIndex = 0;

        messageContainer.innerHTML = ''; // Clear existing messages
        const chat = syncService.isOnlineSyncEnabled()
            ? (remoteChatsById.get(chatID) ?? await syncService.fetchSyncedChatMetadata(chatID))
            : await dbArg.chats.get(chatID);
        if (!chat) {
            console.error("Chat not found", chatID);
            document.querySelector("#chat-title")!.textContent = "";
            return null;
        }

        document.querySelector("#chat-title")!.textContent = chat.title || "";
        currentChatSnapshot = {
            ...chat,
            content: [],
        };

        if (syncService.isOnlineSyncEnabled()) {
            if (!syncService.isSyncActive()) {
                document.querySelector("#chat-title")!.textContent = "";
                return null;
            }
            const latestWindow = await syncService.hydrateLatestChatMessagesWindow(chatID, PAGE_SIZE);
            if (latestWindow) {
                isRemotePagedMode = true;
                remoteOldestLoadedIndex = latestWindow.startIndex;
                remoteWindowStartIndex = latestWindow.startIndex;
                currentChatMessages = latestWindow.messages;
                currentChatSnapshot = {
                    ...chat,
                    content: structuredClone(latestWindow.messages),
                };
                upsertRemoteChat(currentChatSnapshot);
                loadedStartIndex = 0;
                loadedEndIndex = latestWindow.messages.length;
                hasMoreOlder = latestWindow.hasMoreOlder;

                if (loadedEndIndex > 0) {
                    await renderMessagesSlice(loadedStartIndex, loadedEndIndex, false);
                }

                attachScrollListener();
                dispatchAppEvent('chat-loaded', {
                    chat: {
                        ...chat,
                        content: latestWindow.messages,
                    },
                });
                return chat;
            }
        }

        currentChatMessages = chat.content || [];
        currentChatSnapshot = {
            ...chat,
            content: structuredClone(currentChatMessages),
        };

        const total = currentChatMessages.length;
        if (total === 0) {
            //dispatch event even for empty chats so UI can update
            dispatchAppEvent('chat-loaded', { chat });
            return chat;
        }

        loadedEndIndex = total;
        loadedStartIndex = Math.max(0, total - PAGE_SIZE);
        hasMoreOlder = loadedStartIndex > 0;

        await renderMessagesSlice(loadedStartIndex, loadedEndIndex, false);
        attachScrollListener();

        dispatchAppEvent('chat-loaded', { chat });

        return chat;
    }
    catch (error) {
        toastService.danger({
            title: "Chat Load Error",
            text: "Please report this to the developer. You might need to restart the page to continue normal usage."
        });
        console.error(error);
    }
}

export async function getAllChats(db: Db): Promise<DbChat[]> {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) return [];
        const remoteChats = await syncService.fetchSyncedChatsMetadata();
        cacheRemoteChats(remoteChats);
        return remoteChats;
    }
    const chats = await db.chats.orderBy('timestamp').toArray(); // Get all objects
    return chats;
}

export async function editChat(id: string, title: string) {
    const chat = await getChatById(id);
    if (chat) {
        chat.title = title;
        await saveChat(chat);
        // Resort entries in place to reflect updated title without full reload
        void reorderChatListInDom();
    }
}

export async function exportChat(id: string): Promise<void> {
    const chat = await getChatById(id);
    if (!chat) {
        console.error("Chat not found for export", id);
        return;
    }
    // Exclude the id so imported chats get a new one (mirrors exportAllChats behavior)
    const { id: _omit, ...rest } = chat as DbChat;
    const blob = new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' });
    // Derive a safe filename from the chat title
    const safeTitle = (chat.title || 'chat').toLowerCase().replace(/[^a-z0-9-_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${safeTitle || 'chat'}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function exportAllChats(): Promise<void> {
    const chats = await getAllChats(db);
    //we remove the id
    const blob = new Blob([JSON.stringify(chats.map(({ id, ...rest }) => rest), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chats.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importChats(files: FileList): Promise<void> {
    const reader = new FileReader();
    reader.addEventListener('load', async (event) => {
        const content = event.target?.result as string;
        try {
            const chatOrChats = JSON.parse(content);
            //check if it's iterable
            const chats: Chat[] = Array.isArray(chatOrChats) ? chatOrChats : [chatOrChats]; //wrap single chat in array
            for (const chat of chats) {
                await addChatRecord(chat);
            }
            initialize();
        } catch (error) {
            console.error("Error parsing chat file:", error);
            toastService.danger({
                title: "Import Failed",
                text: "Failed to import chats. Please ensure the file is in the correct format."
            });
        }
    });
    for (const file of files) {
        reader.readAsText(file);
    }


}

export async function moveChatDomEntryToTop(id: string) {
    const identifier = "chat" + id;
    const radioButton = document.querySelector<HTMLInputElement>(`input[value='${identifier}']`);
    const label = document.querySelector<HTMLLabelElement>(`label[for='${identifier}']`);
    if (radioButton && label && chatHistorySection) {
        chatHistorySection.prepend(label);
        chatHistorySection.prepend(radioButton);
    }
}


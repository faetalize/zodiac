import * as messageService from "./Message.service";
import { messageElement } from "../components/dynamic/message";
import * as helpers from "../utils/helpers";
import type { Db } from "./Db.service";
import { db } from "./Db.service";
import type { Chat, ChatSortMode, DbChat } from "../types/Chat";
import type { Message } from "../types/Message";
import { dispatchAppEvent } from "../events";
import hljs from "highlight.js";
import { v4 as uuidv4 } from "uuid";
import * as syncService from "./Sync.service";
import * as toastService from "./Toast.service";
import * as pinningService from "./Pinning.service";
const messageContainer = document.querySelector<HTMLDivElement>(".message-container");
const scrollableChatContainerSelector = "#scrollable-chat-container";
const chatHistorySection = document.querySelector<HTMLDivElement>("#chatHistorySection");
const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
const chatLoadingIndicator = document.querySelector<HTMLDivElement>("#chat-loading-indicator");

// Incremental loading state for the currently opened chat
const PAGE_SIZE = 50; // number of messages to load per page
const REMOTE_INITIAL_BATCH_SIZE = 10;
let currentChatIdState: string | null = null;
let currentChatMessages: Message[] = [];
let loadedStartIndex = 0; // inclusive
let loadedEndIndex = 0; // exclusive
let isLoadingOlder = false;
let hasMoreOlder = false;
let scrollListenerAttached = false;
let isRemotePagedMode = false;
let remoteOldestLoadedIndex = 0;
let remoteWindowStartIndex = 0;
const remoteChatsById = new Map<string, DbChat>();
let currentChatSnapshot: DbChat | null = null;
const chatWriteQueueById = new Map<string, Promise<void>>();
let chatLoadInFlight = 0;
let chatLoadDelayTimer: number | null = null;
let activeChatLoadToken = 0;
let activeChatLoadAbortController: AbortController | null = null;
const generatingChatIds = new Set<string>();

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

function setChatLoadingVisibility(isVisible: boolean) {
	if (!chatLoadingIndicator) {
		return;
	}

	chatLoadingIndicator.classList.toggle("hidden", !isVisible);
	chatLoadingIndicator.setAttribute("aria-hidden", String(!isVisible));
}

function beginChatLoadingFeedback() {
	chatLoadInFlight += 1;
	if (chatLoadInFlight !== 1) {
		return;
	}

	if (chatLoadDelayTimer !== null) {
		clearTimeout(chatLoadDelayTimer);
	}

	chatLoadDelayTimer = window.setTimeout(() => {
		chatLoadDelayTimer = null;
		if (chatLoadInFlight > 0) {
			setChatLoadingVisibility(true);
		}
	}, 150);
}

function dispatchComposerStateReset(reason: "chat-switch" | "chat-cleared", nextChatId: string | null): void {
	dispatchAppEvent("composer-state-reset", {
		reason,
		nextChatId,
		preserveMessageText: true
	});
}

function endChatLoadingFeedback() {
	chatLoadInFlight = Math.max(0, chatLoadInFlight - 1);
	if (chatLoadInFlight > 0) {
		return;
	}

	if (chatLoadDelayTimer !== null) {
		clearTimeout(chatLoadDelayTimer);
		chatLoadDelayTimer = null;
	}

	setChatLoadingVisibility(false);
}

function resetChatLoadingFeedback() {
	chatLoadInFlight = 0;

	if (chatLoadDelayTimer !== null) {
		clearTimeout(chatLoadDelayTimer);
		chatLoadDelayTimer = null;
	}

	setChatLoadingVisibility(false);
}

function updateChatGenerationIndicator(chatId: string): void {
	const label = document.querySelector<HTMLLabelElement>(`label[for='chat${chatId}']`);
	if (!label) return;

	const spinner = label.querySelector<HTMLElement>(".chat-generation-indicator");
	if (!spinner) return;

	const isGenerating = generatingChatIds.has(chatId);
	spinner.classList.toggle("hidden", !isGenerating);
	label.classList.toggle("chat-is-generating", isGenerating);
}

function syncAllChatGenerationIndicators(): void {
	for (const label of Array.from(document.querySelectorAll<HTMLLabelElement>("label.label-currentchat"))) {
		const target = label.htmlFor;
		const chatId = target.startsWith("chat") ? target.slice("chat".length) : "";
		if (!chatId) continue;
		updateChatGenerationIndicator(chatId);
	}
}

window.addEventListener("generation-state-changed", (event: any) => {
	const chatId = event?.detail?.chatId;
	if (!chatId) return;

	if (event.detail?.isGenerating) {
		generatingChatIds.add(chatId);
	} else {
		generatingChatIds.delete(chatId);
	}

	updateChatGenerationIndicator(chatId);
});

function beginChatLoadRequest() {
	activeChatLoadToken += 1;
	activeChatLoadAbortController?.abort();
	activeChatLoadAbortController = new AbortController();

	const token = activeChatLoadToken;
	const signal = activeChatLoadAbortController.signal;

	return {
		token,
		signal,
		isCurrent: () => activeChatLoadToken === token
	};
}

function finishChatLoadRequest(token: number) {
	if (activeChatLoadToken !== token) return;
}

function cancelActiveChatLoad() {
	activeChatLoadToken += 1;
	activeChatLoadAbortController?.abort();
	activeChatLoadAbortController = null;
}

function settleChatScrollToBottom(isCurrent: () => boolean) {
	const scrollContainer = document.querySelector<HTMLDivElement>(scrollableChatContainerSelector);
	if (!scrollContainer || !messageContainer) return;

	const snapToBottom = () => {
		if (!isCurrent()) return;
		helpers.messageContainerScrollToBottom(true);
	};

	snapToBottom();

	requestAnimationFrame(() => {
		snapToBottom();
		requestAnimationFrame(() => {
			snapToBottom();
		});
	});

	for (const delayMs of [120, 320, 650]) {
		window.setTimeout(() => {
			snapToBottom();
		}, delayMs);
	}

	const mediaElements = messageContainer.querySelectorAll<HTMLImageElement>("img");
	for (const media of mediaElements) {
		if (media.complete) continue;

		const onSettled = () => {
			snapToBottom();
		};

		media.addEventListener("load", onSettled, { once: true });
		media.addEventListener("error", onSettled, { once: true });
	}
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

	const lastMsg = chat.content && chat.content.length > 0 ? chat.content[chat.content.length - 1] : undefined;

	if (lastMsg && typeof (lastMsg as any).timestamp === "number") {
		return (lastMsg as any).timestamp as number;
	}

	return chat.timestamp;
}

function sortChats(chats: DbChat[], mode: ChatSortMode): DbChat[] {
	const baseSort = (list: DbChat[]): DbChat[] => {
		const sorted = [...list];

		if (mode === "alphabetical") {
			sorted.sort((a, b) => {
				const titleA = (a.title || "").toLocaleLowerCase();
				const titleB = (b.title || "").toLocaleLowerCase();
				if (titleA < titleB) return -1;
				if (titleA > titleB) return 1;
				return 0;
			});
			return sorted;
		}

		if (mode === "created_at") {
			sorted.sort((a, b) => b.timestamp - a.timestamp);
			return sorted;
		}

		sorted.sort((a, b) => {
			const aLast = getLastInteractionTimestamp(a);
			const bLast = getLastInteractionTimestamp(b);
			return bLast - aLast;
		});
		return sorted;
	};

	const pinnedIds = new Set(pinningService.getPinnedChatIds());
	const pinned: DbChat[] = [];
	const unpinned: DbChat[] = [];

	for (const chat of chats) {
		if (pinnedIds.has(chat.id)) pinned.push(chat);
		else unpinned.push(chat);
	}

	return [...baseSort(pinned), ...baseSort(unpinned)];
}

export function getCurrentChatId(): string | null {
	const currentChatElement = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
	if (currentChatElement) {
		const rawValue = currentChatElement.value;
		if (!rawValue || rawValue === "none") {
			return null;
		}

		if (!rawValue.startsWith("chat")) {
			return null;
		}

		const chatId = rawValue.slice(4);
		return chatId || null;
	}
	return null;
}

export function isCurrentChatRemotePagedMode(): boolean {
	return isRemotePagedMode;
}

export function isChatLoading(chatId?: string | null): boolean {
	if (!chatId) return false;
	return currentChatIdState === chatId && chatLoadInFlight > 0;
}

async function enqueueChatWrite(chatId: string, task: () => Promise<void>): Promise<void> {
	const previous = chatWriteQueueById.get(chatId) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(task);

	const tracked = run.finally(() => {
		if (chatWriteQueueById.get(chatId) === tracked) {
			chatWriteQueueById.delete(chatId);
		}
	});

	chatWriteQueueById.set(chatId, tracked);
	return tracked;
}

async function persistChatWithinQueue(chat: DbChat): Promise<void> {
	if (syncService.isOnlineSyncEnabled()) {
		if (!syncService.isSyncActive()) {
			throw new Error("Cloud sync is enabled but locked. Unlock sync before saving chat changes.");
		}
		let chatToSave = chat;
		let previousForSync =
			remoteChatsById.get(chat.id) ?? (currentChatSnapshot?.id === chat.id ? currentChatSnapshot : undefined);

		if (isRemotePagedMode && currentChatIdState === chat.id) {
			const fullMessages = await syncService.fetchAllSyncedChatMessages(chat.id);
			if (fullMessages) {
				const localMessages = chat.content || [];
				const rebased = [...fullMessages];
				const previousLocalMessages =
					currentChatSnapshot?.id === chat.id ? currentChatSnapshot.content || [] : [];

				for (let localIndex = 0; localIndex < localMessages.length; localIndex++) {
					const absoluteIndex = remoteWindowStartIndex + localIndex;
					rebased[absoluteIndex] = localMessages[localIndex];
				}

				if (localMessages.length < previousLocalMessages.length) {
					const truncateAt = Math.max(0, remoteWindowStartIndex + localMessages.length);
					rebased.length = Math.min(rebased.length, truncateAt);
				}

				chatToSave = {
					...chat,
					content: rebased
				};

				previousForSync = {
					...(chat as any),
					content: fullMessages
				} as DbChat;
			}
		}

		const ok = await syncService.upsertSyncedChat(chatToSave, previousForSync);
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

export async function mutateChat<T>(
	chatId: string,
	mutator: (chat: DbChat) => Promise<T | undefined> | T | undefined
): Promise<T | undefined> {
	let result: T | undefined;

	await enqueueChatWrite(chatId, async () => {
		const chat = await getChatById(chatId);
		if (!chat) return;

		result = await mutator(chat);
		if (typeof result === "undefined") return;

		await persistChatWithinQueue(chat);
	});

	return result;
}

export async function waitForPendingWrites(chatId: string): Promise<void> {
	const pending = chatWriteQueueById.get(chatId);
	if (!pending) return;
	await pending.catch(() => undefined);
}

export async function waitForCurrentChatPendingWrites(): Promise<void> {
	const chatId = getCurrentChatId();
	if (!chatId) return;
	await waitForPendingWrites(chatId);
}

function cacheRemoteChats(chats: DbChat[]) {
	const nextRemoteChatsById = new Map<string, DbChat>();
	for (const chat of chats) {
		const existing = currentChatSnapshot?.id === chat.id ? currentChatSnapshot : remoteChatsById.get(chat.id);

		const preservedContent =
			existing && existing.content.length > chat.content.length
				? structuredClone(existing.content)
				: structuredClone(chat.content || []);

		nextRemoteChatsById.set(chat.id, {
			...structuredClone(chat),
			content: preservedContent
		});
	}

	remoteChatsById.clear();
	for (const [chatId, chat] of nextRemoteChatsById) {
		remoteChatsById.set(chatId, chat);
	}
}

function upsertRemoteChat(chat: DbChat) {
	remoteChatsById.set(chat.id, structuredClone(chat));
}

function pickRicherChatSnapshot(
	primary: DbChat | null | undefined,
	secondary: DbChat | null | undefined
): DbChat | undefined {
	if (primary && secondary) {
		return (primary.content?.length ?? 0) >= (secondary.content?.length ?? 0) ? primary : secondary;
	}

	return primary ?? secondary ?? undefined;
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
	for (const chat of sortedChats) {
		insertChatEntry(chat, "append");
	}
	await reorderChatListInDom();
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
	const pinnedIds = new Set(pinningService.getPinnedChatIds());
	const pinnedCount = sorted.reduce((count, chat) => count + (pinnedIds.has(chat.id) ? 1 : 0), 0);
	let didInsertPinnedHeader = false;
	let didInsertOtherHeader = false;

	const fragment = document.createDocumentFragment();
	for (const chat of sorted) {
		const isPinned = pinnedIds.has(chat.id);

		if (pinnedCount > 0 && isPinned && !didInsertPinnedHeader) {
			const pinnedHeader = document.createElement("div");
			pinnedHeader.classList.add("sidebar-group-divider");
			pinnedHeader.textContent = "Pinned";
			fragment.appendChild(pinnedHeader);
			didInsertPinnedHeader = true;
		}

		if (pinnedCount > 0 && !isPinned && !didInsertOtherHeader) {
			const othersHeader = document.createElement("div");
			othersHeader.classList.add("sidebar-group-divider");
			othersHeader.textContent = "All chats";
			fragment.appendChild(othersHeader);
			didInsertOtherHeader = true;
		}

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
export async function refreshChatListAfterActivity(_dbArg: Db = db): Promise<void> {
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
	let isPinned = pinningService.isChatPinned(chat.id);

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

	const pinnedIndicator = document.createElement("span");
	pinnedIndicator.classList.add("material-symbols-outlined", "chat-pinned-indicator");
	pinnedIndicator.textContent = "keep";
	pinnedIndicator.setAttribute("aria-hidden", "true");
	pinnedIndicator.classList.toggle("hidden", !isPinned);

	const generationIndicator = document.createElement("span");
	generationIndicator.classList.add("chat-generation-indicator", "loading-spinner");
	generationIndicator.classList.toggle("hidden", !generatingChatIds.has(chat.id));
	generationIndicator.setAttribute("aria-hidden", "true");

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
			document.querySelectorAll(".chat-actions-wrapper.open").forEach((el) => {
				if (el !== actionsWrapper) el.classList.remove("open");
			});

			// Check if menu would overflow at the bottom
			const scrollContainer = chatHistorySection;
			if (scrollContainer) {
				const buttonRect = actionsButton.getBoundingClientRect();
				const containerRect = scrollContainer.getBoundingClientRect();

				const menuItemsCount = menu.querySelectorAll("button.chat-actions-item").length;
				const estimatedMenuHeight = Math.max(120, menuItemsCount * 40 + 16);
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
		chatLabelText.addEventListener(
			"blur",
			async () => {
				chatLabelText.removeAttribute("contenteditable");
				const newTitle = chatLabelText.textContent?.trim() || "";
				if (newTitle && newTitle !== chat.title) {
					await editChat(chat.id, newTitle);
				}
			},
			{ once: true }
		);
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
	deleteItem.addEventListener("click", async (e) => {
		e.stopPropagation();
		closeMenu();

		const originalMarkup = deleteItem.innerHTML;
		deleteItem.disabled = true;
		deleteItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">hourglass_top</span><span>Deleting…</span>`;

		toastService.info({
			title: "Deleting chat",
			text: "Deleting chat. This can take a while for long chats."
		});

		try {
			await deleteChat(chat.id, db);
			toastService.info({
				title: "Chat deleted",
				text: "Chat deleted successfully."
			});
		} catch (error) {
			console.error("Failed to delete chat", error);
			toastService.danger({
				title: "Delete failed",
				text: "Could not delete chat. Please try again."
			});
		} finally {
			deleteItem.disabled = false;
			deleteItem.innerHTML = originalMarkup;
		}
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
			dispatchAppEvent("open-group-chat-editor", { chatId: chat.id });
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

	const pinItem = document.createElement("button");
	pinItem.classList.add("chat-actions-item");
	pinItem.setAttribute("role", "menuitem");

	const updatePinMenuUi = () => {
		pinItem.innerHTML = isPinned
			? `<span class="material-symbols-outlined chat-action-icon">keep_off</span><span>Unpin</span>`
			: `<span class="material-symbols-outlined chat-action-icon">keep</span><span>Pin</span>`;

		pinnedIndicator.classList.toggle("hidden", !isPinned);
	};

	updatePinMenuUi();

	pinItem.addEventListener("click", async (e) => {
		e.stopPropagation();
		closeMenu();
		isPinned = await pinningService.toggleChatPinned(chat.id);
		updatePinMenuUi();
		await reorderChatListInDom();
	});

	if (groupSettingsItem) {
		menu.append(groupSettingsItem);
	}
	menu.append(pinItem, editItem, exportItem, deleteItem);
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
	chatLabel.append(generationIndicator);
	chatLabel.append(pinnedIndicator);
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

	updateChatGenerationIndicator(chat.id);
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
			throw new Error("Cloud sync is enabled but locked. Unlock sync before creating chats.");
		}
		const ok = await syncService.upsertSyncedChat(chat);
		if (!ok) {
			try {
				await syncService.deleteSyncedChat(chat.id);
			} catch (cleanupError) {
				console.warn("addChat cleanup failed for chat id=%s", chat.id, cleanupError);
			}
			throw new Error("Failed to create synced chat");
		}
		upsertRemoteChat(chat);
	} else {
		await db.chats.put(chat);
	}
	// New chats should appear at the top when they are created.
	insertChatEntry(chat, "prepend");
	await reorderChatListInDom();
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
		groupChat: (chat as any).groupChat
	};
	if (syncService.isOnlineSyncEnabled()) {
		if (!syncService.isSyncActive()) {
			throw new Error("Cloud sync is enabled but locked. Unlock sync before importing chats.");
		}
		const ok = await syncService.upsertSyncedChat(record);
		if (!ok) {
			try {
				await syncService.deleteSyncedChat(record.id);
			} catch (cleanupError) {
				console.warn("addChatRecord cleanup failed for chat id=%s", record.id, cleanupError);
			}
			throw new Error("Failed to add synced chat record");
		}
		upsertRemoteChat(record);
	} else {
		await db.chats.put(record);
	}
	insertChatEntry(record, "prepend");
	await reorderChatListInDom();
	return id;
}

export async function getCurrentChat(dbArg: Db = db) {
	if (syncService.isOnlineSyncEnabled()) {
		if (!syncService.isSyncActive()) return null;
		if (currentChatSnapshot) return structuredClone(currentChatSnapshot);
		const id = getCurrentChatId();
		if (!id) return null;
		const remote = remoteChatsById.get(id) ?? (await syncService.fetchSyncedChatMetadata(id));
		if (!remote) return null;
		currentChatSnapshot = structuredClone(remote);
		upsertRemoteChat(remote);
		return structuredClone(remote);
	}

	const id = getCurrentChatId();
	if (!id) {
		return null;
	}
	return await dbArg.chats.get(id);
}

export async function deleteAllChats(db: Db) {
	if (syncService.isOnlineSyncEnabled()) {
		if (!syncService.isSyncActive()) {
			throw new Error("Cloud sync is enabled but locked. Unlock sync before deleting chats.");
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

	await pinningService.clearChatPins();

	// Clear chat list and messages without rebuilding from DB
	if (chatHistorySection) {
		chatHistorySection.innerHTML = "";
	}
	newChat();
}

export async function deleteChat(id: string, db: Db) {
	if (syncService.isOnlineSyncEnabled()) {
		if (!syncService.isSyncActive()) {
			throw new Error("Cloud sync is enabled but locked. Unlock sync before deleting chats.");
		}
		const deleted = await syncService.deleteSyncedChat(id);
		if (!deleted) {
			throw new Error(`Failed to delete synced chat ${id}`);
		}
		remoteChatsById.delete(id);
		if (currentChatSnapshot?.id === id) currentChatSnapshot = null;
	} else {
		await db.chats.delete(id);
	}

	await pinningService.removeChatPin(id);

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

	await reorderChatListInDom();
}

export function newChat() {
	if (!messageContainer) {
		console.error("Message container not found");
		return;
	}

	cancelActiveChatLoad();

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
	resetChatLoadingFeedback();

	// Uncheck current chat selection
	const checkedInput = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
	if (checkedInput) {
		checkedInput.checked = false;
	}

	dispatchComposerStateReset("chat-cleared", null);

	//dispatch event with null chat to reset UI (e.g., hide Turn Control panel)
	dispatchAppEvent("chat-loaded", { chat: null });
}

export async function saveChat(chat: DbChat): Promise<void> {
	await enqueueChatWrite(chat.id, async () => {
		await persistChatWithinQueue(chat);
	});
}

export async function getChatById(id: string): Promise<DbChat | undefined> {
	if (syncService.isOnlineSyncEnabled()) {
		if (!syncService.isSyncActive()) return undefined;
		if (currentChatSnapshot?.id === id) {
			const richestCurrent = pickRicherChatSnapshot(currentChatSnapshot, remoteChatsById.get(id));
			if (richestCurrent) {
				return structuredClone(richestCurrent);
			}
		}
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
		content: structuredClone(currentChatMessages)
	};
	upsertRemoteChat(currentChatSnapshot);
	syncAllChatGenerationIndicators();
}

export function replaceCachedChatMessages(chatId: string, messages: Message[]): void {
	const cached = remoteChatsById.get(chatId);
	if (!cached) return;

	remoteChatsById.set(chatId, {
		...cached,
		content: structuredClone(messages)
	});
}

async function renderMessagesSlice(
	start: number,
	end: number,
	prepend: boolean,
	isCurrentLoad: () => boolean = () => true
) {
	if (!messageContainer) {
		console.error("Message container not found while rendering messages slice");
		return;
	}

	if (!isCurrentLoad()) {
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

	const appendToRoundContainer = (target: DocumentFragment | HTMLElement, msg: Message, element: HTMLElement) => {
		const lastBlock = target.lastElementChild as HTMLElement | null;
		const currentRoundIndex = msg.roundIndex;

		if (
			typeof currentRoundIndex === "number" &&
			lastBlock?.classList.contains("round-block") &&
			lastBlock.dataset.roundIndex === String(currentRoundIndex)
		) {
			lastBlock.append(element);
			return;
		}

		if (typeof currentRoundIndex === "number") {
			const block = document.createElement("div");
			block.classList.add("round-block");
			block.dataset.roundIndex = String(currentRoundIndex);
			messageService.ensureRoundBlockUi(block as HTMLDivElement, currentRoundIndex);
			block.append(element);
			target.append(block);
			return;
		}

		target.append(element);
	};

	// For initial load (prepend = false), render slice in natural order (older -> newer)
	if (!prepend) {
		for (let i = 0; i < slice.length; i++) {
			if (!isCurrentLoad()) {
				return;
			}

			const msg = slice[i];
			const chatIndex = absoluteBase + start + i;
			const element = await messageElement(msg, chatIndex);

			if (!isCurrentLoad()) {
				return;
			}

			appendToRoundContainer(messageContainer, msg, element);
		}
	} else {
		// For prepending older messages:
		// 1. Render them into a DocumentFragment to minimize reflows.
		// 2. Iterate chronological (Old -> New) within the slice to build proper blocks.
		// 3. Prepend the entire fragment.
		// 4. Handle boundary merging with the existing first block.
		const fragment = document.createDocumentFragment();

		for (let i = 0; i < slice.length; i++) {
			if (!isCurrentLoad()) {
				return;
			}
			const msg = slice[i];
			const chatIndex = absoluteBase + start + i;
			const element = await messageElement(msg, chatIndex);

			appendToRoundContainer(fragment, msg, element);
		}

		// Boundary merging: If the last block of the fragment matches the first block of the DOM
		if (messageContainer.firstElementChild) {
			const firstBlockInDom = messageContainer.firstElementChild as HTMLElement;
			const lastBlockInFragment = fragment.lastElementChild as HTMLElement;

			if (
				firstBlockInDom?.classList.contains("round-block") &&
				lastBlockInFragment?.classList.contains("round-block") &&
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

	if (!isCurrentLoad()) {
		return;
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
			await loadOlderMessages();
		}
	};

	scrollContainer.addEventListener("scroll", onScroll);
	scrollListenerAttached = true;
}

async function loadOlderMessages() {
	if (isLoadingOlder) return;
	isLoadingOlder = true;
	const loadChatId = currentChatIdState;
	const signal = activeChatLoadAbortController?.signal;

	try {
		if (isRemotePagedMode && currentChatIdState) {
			let fetchedThisPass = 0;

			while (currentChatIdState === loadChatId && hasMoreOlder && fetchedThisPass < PAGE_SIZE) {
				const remaining = PAGE_SIZE - fetchedThisPass;
				const nextBatchSize = Math.min(REMOTE_INITIAL_BATCH_SIZE, remaining);

				const window = await syncService.hydrateOlderChatMessagesWindow(
					currentChatIdState,
					remoteOldestLoadedIndex,
					nextBatchSize,
					{ signal }
				);

				if (currentChatIdState !== loadChatId) {
					return;
				}
				if (!window || window.messages.length === 0) {
					hasMoreOlder = false;
					break;
				}

				currentChatMessages = [...window.messages, ...currentChatMessages];
				if (currentChatSnapshot) {
					currentChatSnapshot = {
						...currentChatSnapshot,
						content: structuredClone(currentChatMessages)
					};
					upsertRemoteChat(currentChatSnapshot);
				}

				remoteWindowStartIndex = window.startIndex;
				await renderMessagesSlice(0, window.messages.length, true, () => currentChatIdState === loadChatId);
				if (currentChatIdState !== loadChatId) {
					return;
				}

				remoteOldestLoadedIndex = window.startIndex;
				hasMoreOlder = window.hasMoreOlder;
				loadedStartIndex = 0;
				loadedEndIndex = currentChatMessages.length;
				fetchedThisPass += window.messages.length;
			}

			return;
		}

		const nextStart = Math.max(0, loadedStartIndex - PAGE_SIZE);
		if (nextStart === loadedStartIndex) {
			hasMoreOlder = false;
			return;
		}

		await renderMessagesSlice(nextStart, loadedStartIndex, true, () => currentChatIdState === loadChatId);
		if (currentChatIdState !== loadChatId) {
			return;
		}
		loadedStartIndex = nextStart;
		hasMoreOlder = loadedStartIndex > 0;
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return;
		}
		console.error("Failed to load older messages", error);
	} finally {
		isLoadingOlder = false;
	}
}

export async function loadChat(chatID: string, dbArg: Db = db) {
	const chatLoadRequest = beginChatLoadRequest();
	beginChatLoadingFeedback();
	const previousChatId = currentChatIdState;
	const shouldResetComposerState = previousChatId !== chatID;

	try {
		if (!chatID || !messageContainer) {
			console.error("Chat ID is null or message container not found");
			throw new Error("Chat ID is null or message container not found");
		}

		if (!chatLoadRequest.isCurrent()) {
			return null;
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

		if (shouldResetComposerState) {
			dispatchComposerStateReset("chat-switch", chatID);
		}

		messageContainer.innerHTML = ""; // Clear existing messages
		const chat = syncService.isOnlineSyncEnabled()
			? (remoteChatsById.get(chatID) ?? (await syncService.fetchSyncedChatMetadata(chatID)))
			: await dbArg.chats.get(chatID);
		if (!chatLoadRequest.isCurrent()) {
			return null;
		}
		if (!chat) {
			console.error("Chat not found", chatID);
			document.querySelector("#chat-title")!.textContent = "";
			return null;
		}

		document.querySelector("#chat-title")!.textContent = chat.title || "";
		const richestKnownChat = pickRicherChatSnapshot(chat, remoteChatsById.get(chatID));
		currentChatSnapshot = structuredClone(richestKnownChat ?? chat);

		if (syncService.isOnlineSyncEnabled()) {
			if (!syncService.isSyncActive()) {
				document.querySelector("#chat-title")!.textContent = "";
				return null;
			}
			const latestWindow = await syncService.hydrateLatestChatMessagesWindow(chatID, REMOTE_INITIAL_BATCH_SIZE, {
				signal: chatLoadRequest.signal
			});
			if (!chatLoadRequest.isCurrent()) {
				return null;
			}
			if (latestWindow) {
				isRemotePagedMode = true;
				remoteOldestLoadedIndex = latestWindow.startIndex;
				remoteWindowStartIndex = latestWindow.startIndex;
				currentChatMessages = latestWindow.messages;
				currentChatSnapshot = {
					...chat,
					content: structuredClone(currentChatMessages)
				};
				upsertRemoteChat(currentChatSnapshot);
				loadedStartIndex = 0;
				loadedEndIndex = currentChatMessages.length;
				hasMoreOlder = latestWindow.hasMoreOlder;

				if (loadedEndIndex > 0) {
					await renderMessagesSlice(loadedStartIndex, loadedEndIndex, false, chatLoadRequest.isCurrent);
				}
				if (!chatLoadRequest.isCurrent()) {
					return null;
				}

				settleChatScrollToBottom(chatLoadRequest.isCurrent);

				void (async () => {
					if (isLoadingOlder) return;
					isLoadingOlder = true;

					try {
						while (chatLoadRequest.isCurrent() && hasMoreOlder && currentChatMessages.length < PAGE_SIZE) {
							const remaining = PAGE_SIZE - currentChatMessages.length;
							const nextBatchSize = Math.min(REMOTE_INITIAL_BATCH_SIZE, remaining);
							const olderWindow = await syncService.hydrateOlderChatMessagesWindow(
								chatID,
								remoteOldestLoadedIndex,
								nextBatchSize,
								{ signal: chatLoadRequest.signal }
							);

							if (!chatLoadRequest.isCurrent()) {
								return;
							}

							if (!olderWindow || olderWindow.messages.length === 0) {
								hasMoreOlder = false;
								break;
							}

							currentChatMessages = [...olderWindow.messages, ...currentChatMessages];
							remoteWindowStartIndex = olderWindow.startIndex;
							remoteOldestLoadedIndex = olderWindow.startIndex;
							loadedStartIndex = 0;
							loadedEndIndex = currentChatMessages.length;
							hasMoreOlder = olderWindow.hasMoreOlder;

							currentChatSnapshot = {
								...chat,
								content: structuredClone(currentChatMessages)
							};
							upsertRemoteChat(currentChatSnapshot);

							await renderMessagesSlice(0, olderWindow.messages.length, true, chatLoadRequest.isCurrent);
						}
					} catch (error) {
						if (error instanceof DOMException && error.name === "AbortError") {
							return;
						}
						console.error("Failed to prefetch older messages", error);
					} finally {
						isLoadingOlder = false;
					}
				})();

				if (!chatLoadRequest.isCurrent()) {
					return null;
				}

				attachScrollListener();
				const loadedChat = {
					...chat,
					content: currentChatMessages
				};
				dispatchAppEvent("chat-loaded", { chat: loadedChat });
				return chat;
			}
		}

		currentChatMessages = chat.content || [];
		currentChatSnapshot = {
			...chat,
			content: structuredClone(currentChatMessages)
		};

		const total = currentChatMessages.length;
		if (total === 0) {
			//dispatch event even for empty chats so UI can update
			dispatchAppEvent("chat-loaded", { chat });
			return chat;
		}

		loadedEndIndex = total;
		loadedStartIndex = Math.max(0, total - PAGE_SIZE);
		hasMoreOlder = loadedStartIndex > 0;

		await renderMessagesSlice(loadedStartIndex, loadedEndIndex, false, chatLoadRequest.isCurrent);
		if (!chatLoadRequest.isCurrent()) {
			return null;
		}
		settleChatScrollToBottom(chatLoadRequest.isCurrent);
		attachScrollListener();
		dispatchAppEvent("chat-loaded", { chat });

		return chat;
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return null;
		}
		toastService.danger({
			title: "Chat Load Error",
			text: "Please report this to the developer. You might need to restart the page to continue normal usage."
		});
		console.error(error);
	} finally {
		endChatLoadingFeedback();
		finishChatLoadRequest(chatLoadRequest.token);
	}
}

export async function getAllChats(db: Db): Promise<DbChat[]> {
	if (syncService.isOnlineSyncEnabled()) {
		if (!syncService.isSyncActive()) return [];
		const remoteChats = await syncService.fetchSyncedChatsMetadata();
		cacheRemoteChats(remoteChats);
		return remoteChats;
	}
	const chats = await db.chats.orderBy("timestamp").toArray(); // Get all objects
	return chats;
}

export async function editChat(id: string, title: string) {
	const didUpdate = await mutateChat(id, (chat) => {
		chat.title = title;
		return true;
	});
	if (!didUpdate) return;

	// Resort entries in place to reflect updated title without full reload
	void reorderChatListInDom();
}

export async function exportChat(id: string): Promise<void> {
	if (syncService.isOnlineSyncEnabled() && !syncService.isSyncActive()) {
		toastService.danger({
			title: "Export unavailable",
			text: "Unlock cloud sync before exporting chats."
		});
		return;
	}

	const chat = await getChatById(id);
	if (!chat) {
		console.error("Chat not found for export", id);
		toastService.danger({
			title: "Export Failed",
			text: "Chat not found."
		});
		return;
	}

	let chatForExport: DbChat = chat;
	if (syncService.isOnlineSyncEnabled()) {
		const syncedMessages = await syncService.fetchAllSyncedChatMessages(chat.id);
		if (syncedMessages === null) {
			toastService.danger({
				title: "Export Failed",
				text: "Failed to fetch chat messages from cloud sync."
			});
			return;
		}
		chatForExport = {
			...chat,
			content: syncedMessages
		};
	}

	// Exclude the id so imported chats get a new one (mirrors exportAllChats behavior)
	const { id: _omit, ...rest } = chatForExport;
	const blob = new Blob([JSON.stringify(rest, null, 2)], { type: "application/json" });
	// Derive a safe filename from the chat title
	const safeTitle = (chatForExport.title || "chat")
		.toLowerCase()
		.replace(/[^a-z0-9-_]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")
		.slice(0, 40);
	const a = document.createElement("a");
	const url = URL.createObjectURL(blob);
	a.href = url;
	a.download = `${safeTitle || "chat"}_export.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	toastService.info({
		title: "Chat exported",
		text: `Exported \"${chatForExport.title || "chat"}\".`
	});
}

export async function exportAllChats(): Promise<void> {
	if (syncService.isOnlineSyncEnabled() && !syncService.isSyncActive()) {
		toastService.danger({
			title: "Export unavailable",
			text: "Unlock cloud sync before exporting chats."
		});
		return;
	}

	const chats = await getAllChats(db);

	const chatsForExport: DbChat[] = [];
	for (const chat of chats) {
		if (syncService.isOnlineSyncEnabled()) {
			const syncedMessages = await syncService.fetchAllSyncedChatMessages(chat.id);
			if (syncedMessages === null) {
				toastService.danger({
					title: "Export Failed",
					text: `Failed to fetch messages for chat \"${chat.title || chat.id}\".`
				});
				return;
			}
			chatsForExport.push({
				...chat,
				content: syncedMessages
			});
			continue;
		}

		chatsForExport.push(chat);
	}

	//we remove the id
	const blob = new Blob(
		[
			JSON.stringify(
				chatsForExport.map(({ id: _id, ...rest }) => rest),
				null,
				2
			)
		],
		{ type: "application/json" }
	);
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "chats.json";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	toastService.info({
		title: "Chats exported",
		text: `Exported ${chatsForExport.length} chat${chatsForExport.length === 1 ? "" : "s"}.`
	});
}

export async function importChats(files: FileList): Promise<void> {
	if (!files || files.length === 0) return;

	if (syncService.isOnlineSyncEnabled() && !syncService.isSyncActive()) {
		toastService.danger({
			title: "Import unavailable",
			text: "Unlock cloud sync before importing chats."
		});
		return;
	}

	try {
		const allChatsToImport: Chat[] = [];

		for (const file of Array.from(files)) {
			const content = await file.text();
			const chatOrChats = JSON.parse(content);
			const chats: Chat[] = Array.isArray(chatOrChats) ? chatOrChats : [chatOrChats];
			allChatsToImport.push(...chats);
		}

		for (const chat of allChatsToImport) {
			await addChatRecord(chat);
		}

		await initialize();

		toastService.info({
			title: "Chats imported",
			text: `Imported ${allChatsToImport.length} chat${allChatsToImport.length === 1 ? "" : "s"}.`
		});
	} catch (error) {
		console.error("Error importing chats:", error);
		toastService.danger({
			title: "Import Failed",
			text: "Failed to import chats. Please ensure the file is in the correct format."
		});
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

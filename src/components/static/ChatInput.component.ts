import * as messageService from "../../services/Message.service";
import * as helpers from "../../utils/helpers";
import * as personalityService from "../../services/Personality.service";
import { attachmentPreviewElement } from "./AttachmentPreview.component";
import * as toastService from "../../services/Toast.service";
import {
	formatFileListForToast,
	getFileSignature,
	validateAttachmentFile,
	MAX_ATTACHMENTS,
	SUPPORTED_ACCEPT_ATTRIBUTE,
	SUPPORTED_TYPES_LABEL
} from "../../utils/attachments";
import * as settingsService from "../../services/Settings.service";
import * as chatsService from "../../services/Chats.service";
import { getSelectedEditingModel } from "./ImageEditModelSelector.component";
import { updateImageCreditsLabelVisibility } from "./ImageCreditsLabel.component";
import { IMAGE_MODELS } from "../../constants/ImageModels";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { openCustomerPortal } from "../../services/Supabase.service";
import type { SubscriptionTier } from "../../types/Supabase";
import {
	countMessageCharacters,
	getMessagePayloadLimitState,
	getPremiumMessageCharacterLimit,
	truncateToCharacterLimit
} from "../../utils/payloadLimits";

interface AttachmentRemovedDetail {
	signature: string;
}

const messageInput = document.querySelector<HTMLDivElement>("#messageInput");
const messageBox = document.querySelector<HTMLDivElement>("#message-box");
const bottomUiContainer = document.querySelector<HTMLDivElement>("#bottom-ui-container");
const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
const attachmentPreview = document.querySelector<HTMLDivElement>("#attachment-preview");
const sendMessageButton = document.querySelector<HTMLButtonElement>("#btn-send");
const internetSearchToggle = document.querySelector<HTMLButtonElement>("#btn-internet");
const roleplayActionsMenu = document.querySelector<HTMLButtonElement>("#btn-roleplay");
const messageBoxRight = document.querySelector<HTMLDivElement>(".message-box-right");

//turn control elements (optional - for group chats)
const turnControlPanel = document.querySelector<HTMLDivElement>("#turn-control-panel");
const turnControlLabel = document.querySelector<HTMLSpanElement>("#turn-control-label");
const startTurnBtn = document.querySelector<HTMLButtonElement>("#btn-start-turn");
const startRoundText = document.querySelector<HTMLSpanElement>("#start-round-text");
const skipTurnBtn = document.querySelector<HTMLButtonElement>("#btn-skip-turn");
const rpgSettingsButton = document.querySelector<HTMLButtonElement>("#btn-rpg-settings");

if (
	!messageInput ||
	!messageBox ||
	!bottomUiContainer ||
	!attachmentsInput ||
	!attachmentPreview ||
	!sendMessageButton ||
	!internetSearchToggle ||
	!roleplayActionsMenu
) {
	console.error("Chat input component is missing some elements. Please check the HTML structure.");
	throw new Error("Chat input component is not properly initialized.");
}

const scrollbarWidth = helpers.getClientScrollbarWidth();
if (scrollbarWidth > 0) {
	document.documentElement.style.setProperty("--scroll-bar-width", `${scrollbarWidth}px`);
}

attachmentPreview.setAttribute("aria-live", "polite");
attachmentPreview.setAttribute("aria-atomic", "false");
messageBox.setAttribute("role", "group");
messageBox.setAttribute("aria-label", "Message input and attachment dropzone");

attachmentsInput.accept = SUPPORTED_ACCEPT_ATTRIBUTE;
attachmentsInput.multiple = true;

let attachmentState: File[] = Array.from(attachmentsInput.files || []);
let isInternetSearchEnabled = false;
let dragDepth = 0;
let currentHistoryImagePreview: HTMLElement | null = null;
let isImageEditingModeActive = false;
let isComposerAllowanceBlocked = false;
let composerAllowanceBlockTitle = "Request unavailable";
let composerAllowanceBlockText = "This request is currently unavailable.";
let isMessagePayloadOverLimit = false;
let activeSubscriptionTier: SubscriptionTier = "free";
let isPremiumEndpointPreferred = getStoredPremiumEndpointPreference();

let isUserTurnInRpg = true;
let isGroupChatContext = false;
let isRpgGroupChatContext = false;
let isDynamicGroupChatContext = false;
let allowDynamicPings = false;

const messageLimitIndicator = document.createElement("span");
messageLimitIndicator.id = "message-limit-indicator";
messageLimitIndicator.className = "message-limit-indicator hidden";
messageLimitIndicator.setAttribute("aria-live", "polite");
messageLimitIndicator.setAttribute("role", "status");
messageBoxRight?.prepend(messageLimitIndicator);

function copyRuntimeFileMetadata(source: File, target: File): void {
	const sourceMetadata = source as any;
	for (const key of Object.keys(sourceMetadata)) {
		(target as any)[key] = sourceMetadata[key];
	}
}

function filesToFileList(files: File[]): FileList {
	const dataTransfer = new DataTransfer();
	for (const file of files) {
		dataTransfer.items.add(file);
	}
	for (let index = 0; index < files.length; index++) {
		const clonedFile = dataTransfer.files[index] as File | undefined;
		if (clonedFile) copyRuntimeFileMetadata(files[index], clonedFile);
	}
	return dataTransfer.files;
}

function syncBottomUiHeight(): void {
	const height = Math.ceil(bottomUiContainer!.getBoundingClientRect().height);
	const prevHeightStr = document.documentElement.style.getPropertyValue("--bottom-ui-height");

	if (prevHeightStr === `${height}px`) return;

	const scrollContainer = document.querySelector<HTMLDivElement>("#scrollable-chat-container");
	const isAtBottom = scrollContainer
		? scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 50
		: false;

	document.documentElement.style.setProperty("--bottom-ui-height", `${height}px`);

	if (isAtBottom && scrollContainer) {
		helpers.messageContainerScrollToBottom(true);
	}
}

syncBottomUiHeight();

const bottomUiResizeObserver = new ResizeObserver(() => {
	syncBottomUiHeight();
});

bottomUiResizeObserver.observe(bottomUiContainer);

function getStoredPremiumEndpointPreference(): boolean {
	const savedPreference = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT);
	return savedPreference === null ? true : savedPreference === "true";
}

function getActiveMessageCharacterLimit(): number | null {
	return getPremiumMessageCharacterLimit(activeSubscriptionTier, isPremiumEndpointPreferred);
}

function getCurrentMessageCharacterCount(): number {
	return countMessageCharacters(serializeMessageInput());
}

function getSelectedInputCharacterCount(): number {
	const input = messageInput as HTMLDivElement;
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return 0;
	const range = selection.getRangeAt(0);
	if (!input.contains(range.commonAncestorContainer)) return 0;

	const fragment = range.cloneContents();
	fragment.querySelectorAll(".mention-chip-input").forEach((node) => node.remove());
	return countMessageCharacters(fragment.textContent ?? "");
}

function getRemainingCharacterBudgetForInsertion(): number | null {
	const limit = getActiveMessageCharacterLimit();
	if (limit === null) return null;

	const selectedCount = getSelectedInputCharacterCount();
	const currentCount = getCurrentMessageCharacterCount();
	return Math.max(0, limit - Math.max(0, currentCount - selectedCount));
}

function formatCompactCharacterLimit(limit: number): string {
	return limit >= 1000 && limit % 1000 === 0 ? `${limit / 1000}K` : limit.toLocaleString();
}

function showMessageLimitToast(): void {
	const limit = getActiveMessageCharacterLimit();
	if (limit === null) return;

	const actions =
		activeSubscriptionTier === "pro"
			? [
					{
						label: "Upgrade to Pro+",
						onClick: async (dismiss: () => void) => {
							dismiss();
							try {
								await openCustomerPortal();
							} catch (error) {
								console.error(error);
								toastService.danger({
									title: "Portal unavailable",
									text: "Unable to open your customer portal right now. Please try again in a moment."
								});
							}
						}
					}
				]
			: [];

	toastService.warn({
		title: "Message limit reached",
		text: `Premium endpoint messages are limited to ${limit.toLocaleString()} characters on your current plan.`,
		actions
	});
}

function insertTextRespectingMessageLimit(text: string): void {
	const normalizedText = text.replace(/\r/g, "");
	const remaining = getRemainingCharacterBudgetForInsertion();
	if (remaining === null) {
		document.execCommand("insertText", false, normalizedText);
		updateMessageLimitIndicator();
		return;
	}

	if (remaining <= 0) {
		showMessageLimitToast();
		updateMessageLimitIndicator();
		return;
	}

	const truncatedText = truncateToCharacterLimit(normalizedText, remaining);
	if (countMessageCharacters(truncatedText) < countMessageCharacters(normalizedText)) {
		showMessageLimitToast();
	}

	if (truncatedText) {
		document.execCommand("insertText", false, truncatedText);
	}
	updateMessageLimitIndicator();
}

function getMentionMarkerLength(element: HTMLElement): number | null {
	if (!element.classList.contains("mention-chip-input")) return null;
	const personaId = element.dataset.personaId;
	return personaId ? countMessageCharacters(`@<${personaId}>`) : 0;
}

function getAtomicNodeCharacterLength(node: Node): number | null {
	if (node.nodeType === Node.TEXT_NODE) {
		return countMessageCharacters(node.textContent ?? "");
	}

	if (!(node instanceof HTMLElement)) {
		return null;
	}

	const mentionLength = getMentionMarkerLength(node);
	if (mentionLength !== null) {
		return mentionLength;
	}

	if (node.tagName === "BR") {
		return 1;
	}

	return null;
}

function trimLiveComposerNodeFromEnd(node: Node, charactersToRemove: { value: number }): boolean {
	if (charactersToRemove.value <= 0) return false;

	const atomicLength = getAtomicNodeCharacterLength(node);
	if (atomicLength !== null) {
		if (atomicLength <= 0) {
			node.parentNode?.removeChild(node);
			return true;
		}

		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? "";
			if (atomicLength <= charactersToRemove.value) {
				node.parentNode?.removeChild(node);
				charactersToRemove.value -= atomicLength;
			} else {
				node.textContent = truncateToCharacterLimit(text, atomicLength - charactersToRemove.value);
				charactersToRemove.value = 0;
			}
			return true;
		}

		node.parentNode?.removeChild(node);
		charactersToRemove.value = Math.max(0, charactersToRemove.value - atomicLength);
		return true;
	}

	const children = Array.from(node.childNodes);
	let didTrim = false;
	for (let index = children.length - 1; index >= 0 && charactersToRemove.value > 0; index--) {
		didTrim = trimLiveComposerNodeFromEnd(children[index], charactersToRemove) || didTrim;
	}

	if (node !== messageInput && node instanceof HTMLElement && node.childNodes.length === 0) {
		node.remove();
	}

	return didTrim;
}

function moveCaretToComposerEnd(): void {
	const input = messageInput as HTMLDivElement;
	const selection = window.getSelection();
	if (!selection) return;

	const range = document.createRange();
	range.selectNodeContents(input);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}

function trimLiveComposerToSerializedLimit(limit: number): boolean {
	let didTrim = false;

	for (let attempts = 0; attempts < 20; attempts++) {
		const serializedMessage = serializeMessageInput();
		const overage = countMessageCharacters(serializedMessage) - limit;
		if (overage <= 0) {
			return didTrim;
		}

		const removed = trimLiveComposerNodeFromEnd(messageInput as HTMLDivElement, { value: overage });
		if (!removed) {
			return didTrim;
		}
		didTrim = true;
	}

	return didTrim;
}

function enforceCurrentMessageLimit(options: { showToast?: boolean } = {}): void {
	const limit = getActiveMessageCharacterLimit();
	if (limit === null) return;

	const serializedMessage = serializeMessageInput();
	const state = getMessagePayloadLimitState(serializedMessage, limit);
	if (!state.isOverLimit) return;

	if (!trimLiveComposerToSerializedLimit(limit)) return;
	moveCaretToComposerEnd();
	closeMentionMenu();
	if (options.showToast) {
		showMessageLimitToast();
	}
}

function updateMessageLimitIndicator(
	options: { enforceCurrentContent?: boolean; showLimitToast?: boolean } = {}
): void {
	if (options.enforceCurrentContent) {
		enforceCurrentMessageLimit({ showToast: options.showLimitToast });
	}

	const indicator = messageLimitIndicator;
	const limit = getActiveMessageCharacterLimit();
	const state = getMessagePayloadLimitState(serializeMessageInput(), limit);
	isMessagePayloadOverLimit = state.isOverLimit;

	if (limit === null || !state.isNearLimit) {
		indicator.classList.add("hidden");
		indicator.textContent = "";
		indicator.title = "";
		indicator.classList.remove(
			"message-limit-indicator-near",
			"message-limit-indicator-over",
			"message-limit-indicator-upsell"
		);
		syncComposerInteractivity();
		return;
	}

	indicator.classList.remove("hidden");
	const remaining = state.remaining ?? 0;
	indicator.textContent =
		remaining === 0
			? `${formatCompactCharacterLimit(limit)} character limit`
			: `${state.characterCount.toLocaleString()} / ${limit.toLocaleString()}`;
	indicator.classList.toggle("message-limit-indicator-near", state.isNearLimit);
	indicator.classList.toggle("message-limit-indicator-over", state.isOverLimit);

	const shouldUpsell = activeSubscriptionTier === "pro" && state.isNearLimit;
	indicator.classList.toggle("message-limit-indicator-upsell", shouldUpsell);
	indicator.title = shouldUpsell
		? "Pro+ allows longer premium endpoint messages."
		: `${(state.remaining ?? 0).toLocaleString()} characters remaining`;
	syncComposerInteractivity();
}

function refreshMessageLimitFromPreference(): void {
	isPremiumEndpointPreferred = getStoredPremiumEndpointPreference();
	updateMessageLimitIndicator({ enforceCurrentContent: true, showLimitToast: true });
}

function syncComposerInteractivity(): void {
	const canEdit = !isRpgGroupChatContext || (!isCurrentlyGenerating && isUserTurnInRpg);
	messageInput!.contentEditable = String(canEdit);
	messageInput!.classList.toggle("disabled", !canEdit);

	const isSendActionBlocked = (isComposerAllowanceBlocked || isMessagePayloadOverLimit) && !isCurrentlyGenerating;
	const isSendUiDisabled =
		isSendActionBlocked || (isRpgGroupChatContext && !isUserTurnInRpg && !isCurrentlyGenerating);

	sendMessageButton!.disabled = isSendActionBlocked;
	sendMessageButton!.classList.toggle("disabled", isSendUiDisabled);
	sendMessageButton!.setAttribute("aria-disabled", isSendActionBlocked ? "true" : "false");

	if (isMessagePayloadOverLimit) {
		sendMessageButton!.title = "Message is over the character limit.";
	} else if (isSendActionBlocked) {
		sendMessageButton!.title = composerAllowanceBlockTitle;
	} else if (!isCurrentlyGenerating) {
		sendMessageButton!.title = "";
	}
}

function resetComposerContextState(): void {
	isUserTurnInRpg = true;
	isGroupChatContext = false;
	isRpgGroupChatContext = false;
	isDynamicGroupChatContext = false;
	allowDynamicPings = false;
	mentionOptions = [];

	closeMentionMenu();
	clearHistoryPreview();
	turnControlPanel?.classList.add("hidden");
	syncComposerInteractivity();
}

type MentionOption = {
	id: string;
	name: string;
	image?: string;
};

type MentionState = {
	query: string;
	startIndex: number;
	endIndex: number;
	range: Range;
};

let mentionOptions: MentionOption[] = [];
let mentionState: MentionState | null = null;
let mentionActiveIndex = 0;
let mentionMenuOpen = false;
let mentionFilteredOptions: MentionOption[] = [];

const mentionMenu = document.createElement("div");
mentionMenu.id = "mention-suggestions";
mentionMenu.className = "mention-suggestions hidden";
mentionMenu.setAttribute("role", "listbox");
mentionMenu.setAttribute("aria-label", "Mention suggestions");
document.body.appendChild(mentionMenu);

async function updateRpgTurnControlUi(args: {
	isUserTurn: boolean;
	startsNewRound: boolean;
	nextRoundNumber: number;
	nextSpeakerId?: string;
}) {
	const { isUserTurn, startsNewRound, nextRoundNumber, nextSpeakerId } = args;

	isUserTurnInRpg = !!isUserTurn;
	syncComposerInteractivity();

	if (isUserTurn) {
		if (turnControlLabel) turnControlLabel.textContent = "Your turn";
		startTurnBtn?.classList.add("hidden");
		skipTurnBtn?.classList.remove("hidden");
	} else {
		startTurnBtn?.classList.remove("hidden");
		skipTurnBtn?.classList.add("hidden");

		// Determine next speaker name
		let nextSpeakerName = "AI";
		if (nextSpeakerId) {
			const persona = await personalityService.get(nextSpeakerId);
			if (persona) nextSpeakerName = persona.name;
		}

		if (startsNewRound) {
			if (turnControlLabel) turnControlLabel.textContent = "Start next round";
			if (startRoundText && typeof nextRoundNumber === "number") {
				startRoundText.textContent = `Start Round ${nextRoundNumber}`;
				startTurnBtn?.setAttribute("aria-label", `Start Round ${nextRoundNumber}`);
			}
		} else {
			if (turnControlLabel) turnControlLabel.textContent = `${nextSpeakerName}'s turn`;
			if (startRoundText && typeof nextRoundNumber === "number") {
				startRoundText.textContent = `Continue`;
				startTurnBtn?.setAttribute("aria-label", `Continue`);
			}
		}
	}
}

function getPlainTextNodes(): Array<{ node: Text; start: number; end: number }> {
	const input = messageInput as HTMLDivElement;
	const nodes: Array<{ node: Text; start: number; end: number }> = [];
	const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null);
	let index = 0;

	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		const parent = node.parentElement;
		if (parent?.classList.contains("mention-chip-input")) {
			continue;
		}
		const value = node.nodeValue ?? "";
		const start = index;
		const end = index + value.length;
		nodes.push({ node, start, end });
		index = end;
	}

	return nodes;
}

function getPlainTextBeforeCaret(): { text: string; caretIndex: number } | null {
	const input = messageInput as HTMLDivElement;
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	if (!input.contains(range.endContainer)) return null;

	const caretRange = range.cloneRange();
	caretRange.collapse(true);
	const preRange = range.cloneRange();
	preRange.selectNodeContents(input);
	preRange.setEnd(caretRange.endContainer, caretRange.endOffset);

	const fragment = preRange.cloneContents();
	fragment.querySelectorAll(".mention-chip-input").forEach((node) => node.remove());
	const text = fragment.textContent ?? "";

	return { text, caretIndex: text.length };
}

function buildRangeFromPlainTextOffsets(startIndex: number, endIndex: number): Range | null {
	if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return null;
	const nodes = getPlainTextNodes();
	if (nodes.length === 0) return null;

	const startNode = nodes.find((n) => startIndex >= n.start && startIndex <= n.end);
	const endNode = nodes.find((n) => endIndex >= n.start && endIndex <= n.end);
	if (!startNode || !endNode) return null;

	const range = document.createRange();
	range.setStart(startNode.node, Math.max(0, startIndex - startNode.start));
	range.setEnd(endNode.node, Math.max(0, endIndex - endNode.start));
	return range;
}

function shouldShowMentionMenu(): boolean {
	if (!isDynamicGroupChatContext) return false;
	if (!allowDynamicPings) return false;
	return true;
}

function closeMentionMenu(): void {
	const input = messageInput as HTMLDivElement;
	mentionMenu.classList.add("hidden");
	mentionMenuOpen = false;
	mentionState = null;
	mentionActiveIndex = 0;
	input.removeAttribute("aria-activedescendant");
}

function positionMentionMenu(range: Range): void {
	const input = messageInput as HTMLDivElement;
	const rect = range.getBoundingClientRect();
	const fallback = input.getBoundingClientRect();
	const anchor = rect.width || rect.height ? rect : fallback;

	const menuRect = mentionMenu.getBoundingClientRect();
	const padding = 8;
	let left = Math.min(anchor.left, window.innerWidth - menuRect.width - padding);
	left = Math.max(padding, left);

	let top = anchor.bottom + padding;
	if (top + menuRect.height > window.innerHeight - padding) {
		top = Math.max(padding, anchor.top - menuRect.height - padding);
	}

	mentionMenu.style.left = `${Math.round(left)}px`;
	mentionMenu.style.top = `${Math.round(top)}px`;
}

function renderMentionMenu(options: MentionOption[]): void {
	mentionMenu.innerHTML = "";

	if (options.length === 0) {
		const empty = document.createElement("div");
		empty.className = "mention-suggestion-empty";
		empty.textContent = "No matches";
		mentionMenu.appendChild(empty);
		return;
	}

	options.forEach((option, index) => {
		const item = document.createElement("button");
		item.type = "button";
		item.className = "mention-suggestion-item";
		if (index === mentionActiveIndex) {
			item.classList.add("active");
		}
		item.setAttribute("role", "option");
		item.setAttribute("aria-selected", index === mentionActiveIndex ? "true" : "false");
		item.dataset.index = String(index);
		item.textContent = option.name;
		item.addEventListener("mousedown", (event) => {
			event.preventDefault();
		});
		item.addEventListener("click", () => {
			insertMention(option);
		});
		mentionMenu.appendChild(item);
	});

	const active = mentionMenu.querySelector<HTMLElement>(
		`.mention-suggestion-item[data-index="${mentionActiveIndex}"]`
	);
	if (active) {
		const id = `mention-option-${mentionActiveIndex}`;
		active.id = id;
		(messageInput as HTMLDivElement).setAttribute("aria-activedescendant", id);
	}
}

function openMentionMenu(state: MentionState, options: MentionOption[]): void {
	mentionState = state;
	mentionMenuOpen = true;
	mentionMenu.classList.remove("hidden");
	mentionMenu.style.position = "fixed";
	renderMentionMenu(options);
	positionMentionMenu(state.range);
}

function updateMentionMenu(): void {
	if (!shouldShowMentionMenu()) {
		closeMentionMenu();
		return;
	}

	const plain = getPlainTextBeforeCaret();
	if (!plain) {
		closeMentionMenu();
		return;
	}

	const match = plain.text.match(/(^|\s)@([^\s@]*)$/);
	if (!match) {
		closeMentionMenu();
		return;
	}

	const query = match[2] ?? "";
	const tokenLength = 1 + query.length;
	const endIndex = plain.caretIndex;
	const startIndex = endIndex - tokenLength;
	const range = buildRangeFromPlainTextOffsets(startIndex, endIndex);
	if (!range) {
		closeMentionMenu();
		return;
	}

	const normalized = query.toLowerCase();
	const filtered = mentionOptions.filter((option) => option.name.toLowerCase().includes(normalized));
	mentionFilteredOptions = filtered;
	mentionActiveIndex = Math.min(mentionActiveIndex, Math.max(0, filtered.length - 1));

	openMentionMenu({ query, startIndex, endIndex, range }, filtered);
}

function insertMention(option: MentionOption): void {
	if (!mentionState) return;
	const range = mentionState.range;

	range.deleteContents();

	const chip = document.createElement("span");
	chip.className = "mention-chip mention-chip-input";
	chip.dataset.personaId = option.id;
	chip.contentEditable = "false";
	chip.textContent = `@${option.name}`;

	const space = document.createTextNode(" ");
	range.insertNode(space);
	range.insertNode(chip);

	const selection = window.getSelection();
	if (selection) {
		const nextRange = document.createRange();
		nextRange.setStartAfter(space);
		nextRange.collapse(true);
		selection.removeAllRanges();
		selection.addRange(nextRange);
	}

	closeMentionMenu();
}

function serializeMessageInput(): string {
	const clone = (messageInput as HTMLDivElement).cloneNode(true) as HTMLElement;
	clone.querySelectorAll<HTMLElement>(".mention-chip-input[data-persona-id]").forEach((chip) => {
		const id = chip.dataset.personaId;
		if (!id) return;
		chip.replaceWith(document.createTextNode(`@<${id}>`));
	});
	return helpers.getEncoded(clone.innerHTML);
}

internetSearchToggle.addEventListener("click", () => {
	isInternetSearchEnabled = !isInternetSearchEnabled;
	internetSearchToggle.classList.toggle("btn-toggled");
});

//enter key to send message but support shift+enter for new line on PC only
messageInput.addEventListener("keydown", (e: KeyboardEvent) => {
	const isMobile = settingsService.isMobile();

	if (mentionMenuOpen) {
		if (e.key === "ArrowDown") {
			if (mentionFilteredOptions.length > 0) {
				e.preventDefault();
				mentionActiveIndex = (mentionActiveIndex + 1) % mentionFilteredOptions.length;
				renderMentionMenu(mentionFilteredOptions);
				if (mentionState) positionMentionMenu(mentionState.range);
			}
			return;
		}
		if (e.key === "ArrowUp") {
			if (mentionFilteredOptions.length > 0) {
				e.preventDefault();
				mentionActiveIndex =
					(mentionActiveIndex - 1 + mentionFilteredOptions.length) % mentionFilteredOptions.length;
				renderMentionMenu(mentionFilteredOptions);
				if (mentionState) positionMentionMenu(mentionState.range);
			}
			return;
		}
		if (e.key === "Enter" || e.key === "Tab") {
			if (mentionFilteredOptions.length > 0) {
				e.preventDefault();
				const choice = mentionFilteredOptions[mentionActiveIndex];
				if (choice) {
					insertMention(choice);
				}
			} else {
				closeMentionMenu();
			}
			return;
		}
		if (e.key === "Escape") {
			e.preventDefault();
			closeMentionMenu();
			return;
		}
		if (e.key === " " || e.key === "Spacebar") {
			closeMentionMenu();
			return;
		}
	}

	if (e.key === "Enter" && !e.shiftKey && !isMobile) {
		e.preventDefault();
		// Don't send if insufficient credits
		if (isComposerAllowanceBlocked) {
			toastService.warn({
				title: composerAllowanceBlockTitle,
				text: composerAllowanceBlockText
			});
			return;
		}
		sendMessageButton.click();
	}
});

messageInput.addEventListener("blur", () => {
	closeMentionMenu();
});

messageInput.addEventListener("focus", () => {
	if (!settingsService.isMobile()) {
		return;
	}

	window.requestAnimationFrame(() => {
		messageInput.scrollIntoView({ block: "nearest", inline: "nearest" });
	});
});

messageInput.addEventListener("beforeinput", (event: InputEvent) => {
	if (event.isComposing || !event.inputType.startsWith("insert")) {
		return;
	}

	const remaining = getRemainingCharacterBudgetForInsertion();
	if (remaining === null) {
		return;
	}

	const incomingText =
		event.inputType === "insertParagraph" || event.inputType === "insertLineBreak" ? "\n" : event.data;
	if (incomingText === null) {
		if (remaining <= 0) {
			event.preventDefault();
			showMessageLimitToast();
			updateMessageLimitIndicator();
		}
		return;
	}

	const normalizedText = incomingText.replace(/\r/g, "");
	if (countMessageCharacters(normalizedText) <= remaining) {
		return;
	}

	event.preventDefault();
	insertTextRespectingMessageLimit(normalizedText);
});

messageInput.addEventListener("paste", (event: ClipboardEvent) => {
	const files = collectFilesFromClipboard(event);
	const text = event.clipboardData?.getData("text/plain") ?? "";
	const hasFiles = files.length > 0;
	const hasText = text.length > 0;

	if (!hasFiles) {
		if (hasText) {
			event.preventDefault();
			insertTextRespectingMessageLimit(text);
		}
		return;
	}

	event.preventDefault();
	if (hasText) {
		insertTextRespectingMessageLimit(text);
	}
	addAttachments(files);
});

messageInput.addEventListener("input", () => {
	if (messageInput.innerHTML.trim() === "<br>" || messageInput.innerHTML.trim() === "<p><br></p>") {
		messageInput.innerHTML = "";
	}
	updateMessageLimitIndicator();
	updateMentionMenu();
});

document.addEventListener("selectionchange", () => {
	const input = messageInput as HTMLDivElement;
	if (document.activeElement === input) {
		updateMentionMenu();
	} else if (mentionMenuOpen) {
		closeMentionMenu();
	}
});

document.addEventListener("click", (event) => {
	if (!mentionMenuOpen) return;
	const target = event.target as Node | null;
	if (!target) return;
	if (mentionMenu.contains(target)) return;
	if ((messageInput as HTMLDivElement).contains(target)) return;
	closeMentionMenu();
});

window.addEventListener("resize", () => {
	if (mentionMenuOpen && mentionState) {
		positionMentionMenu(mentionState.range);
	}
});

attachmentsInput.addEventListener(
	"change",
	(event) => {
		const files = Array.from(attachmentsInput.files || []);
		if (files.length === 0) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		addAttachments(files);
	},
	true
);

attachmentPreview.addEventListener("attachmentremoved", (event: Event) => {
	const detail = (event as CustomEvent<AttachmentRemovedDetail>).detail;
	if (!detail?.signature) {
		return;
	}
	attachmentState = attachmentState.filter((file) => getFileSignature(file) !== detail.signature);
	syncAttachmentInput();
});

messageBox.addEventListener("dragenter", handleDragEnter);
messageBox.addEventListener("dragover", handleDragOver);
messageBox.addEventListener("dragleave", handleDragLeave);
messageBox.addEventListener("drop", handleDrop);

messageInput.addEventListener("dragenter", handleDragEnter);
messageInput.addEventListener("dragover", handleDragOver);
messageInput.addEventListener("dragleave", handleDragLeave);
messageInput.addEventListener("drop", handleDrop);

//track if currently generating a response
let isCurrentlyGenerating = false;

function syncGenerationUiForCurrentChat(): void {
	const currentChatId = chatsService.getCurrentChatId();
	isCurrentlyGenerating = messageService.getIsGenerating(currentChatId);
	syncComposerInteractivity();

	if (isCurrentlyGenerating) {
		sendMessageButton!.textContent = "stop";
		sendMessageButton!.title = "Stop generating";
		sendMessageButton!.classList.add("generating");
		turnControlPanel?.classList.add("hidden");
		if (turnControlLabel) turnControlLabel.textContent = "AI responding...";
		return;
	}

	sendMessageButton!.textContent = "send";
	if (!isComposerAllowanceBlocked) {
		sendMessageButton!.title = "";
	}
	sendMessageButton!.classList.remove("generating");
	void chatsService.getCurrentChat().then((chat) => {
		if (chat?.groupChat?.mode === "rpg") {
			turnControlPanel?.classList.remove("hidden");
		}
	});
}

sendMessageButton.addEventListener(
	"click",
	() =>
		void (async () => {
			//if generating, abort instead of send
			if (isCurrentlyGenerating) {
				messageService.abortGeneration(chatsService.getCurrentChatId() ?? undefined);
				return;
			}

			// In RPG group chats, only allow sending during the user's turn.
			if (isRpgGroupChatContext && !isUserTurnInRpg) {
				toastService.warn({
					title: "Not your turn",
					text: "Wait for your turn, then send your message."
				});
				return;
			}

			// Check for insufficient credits before sending
			if (isComposerAllowanceBlocked) {
				toastService.warn({
					title: composerAllowanceBlockTitle,
					text: composerAllowanceBlockText
				});
				return;
			}

			if (isMessagePayloadOverLimit) {
				showMessageLimitToast();
				return;
			}

			try {
				if (roleplayActionsMenu.classList.contains("btn-toggled")) {
					const roleplaySendRequested = new CustomEvent("roleplay-send-requested", { cancelable: true });
					const wasHandled = !window.dispatchEvent(roleplaySendRequested);
					if (wasHandled) {
						return;
					}
				}

				const message = serializeMessageInput();
				messageInput.innerHTML = "";
				closeMentionMenu();
				await messageService.send(message);
			} catch (error: any) {
				toastService.danger({
					title: "Error sending message",
					text: JSON.stringify(error.message || error)
				});
				console.error(error);
				return;
			}
		})()
);

//listen for generation state changes to toggle send/stop button
window.addEventListener("generation-state-changed", (event: any) => {
	if (!event?.detail?.chatId) return;
	syncGenerationUiForCurrentChat();
});

//listen for round state changes to update UI dynamically
window.addEventListener("round-state-changed", (event: any) => {
	const currentChatId = chatsService.getCurrentChatId();
	if (!currentChatId || event.detail?.chatId !== currentChatId) return;

	const { isUserTurn, nextRoundNumber, startsNewRound, nextSpeakerId } = event.detail;

	void updateRpgTurnControlUi({ isUserTurn, startsNewRound, nextRoundNumber, nextSpeakerId });

	// auto-progress RPG group chats (never pause on AI)
	if (!isUserTurn && settingsService.getSettings().rpgGroupChatsProgressAutomatically) {
		const roundChatId = currentChatId;
		const startNextRoundIfIdle = async () => {
			if (isCurrentlyGenerating) return;
			if (chatsService.getCurrentChatId() !== roundChatId) return;
			const chat = await chatsService.getCurrentChat();
			if (chat?.id !== roundChatId || chat.groupChat?.mode !== "rpg") return;
			await messageService.send("");
		};

		//round-state-changed is dispatched before generation-state-changed(false),
		//so wait for generation to finish, then kick off the next round.
		const onGenerationState = async (e: any) => {
			if (e?.detail?.chatId !== roundChatId || e?.detail?.isGenerating) return;
			window.removeEventListener("generation-state-changed", onGenerationState as any);
			try {
				// Let the originating send() fully unwind (sendInFlight reset, etc.)
				// before we trigger the next round.
				window.setTimeout(() => {
					void startNextRoundIfIdle();
				}, 0);
			} catch (error: any) {
				toastService.danger({
					title: "Error starting next round",
					text: JSON.stringify(error?.message || error)
				});
			}
		};
		window.addEventListener("generation-state-changed", onGenerationState as any);
	}
});

//skip turn button - skips user's turn and triggers next round
skipTurnBtn?.addEventListener(
	"click",
	() =>
		void (async () => {
			if (isCurrentlyGenerating) return;

			try {
				await messageService.skipRpgTurn();
			} catch (error: any) {
				toastService.danger({
					title: "Error skipping turn",
					text: JSON.stringify(error.message || error)
				});
			}
		})()
);

//start turn button - triggers AI participants before user's turn
startTurnBtn?.addEventListener(
	"click",
	() =>
		void (async () => {
			if (isCurrentlyGenerating) return;

			try {
				// send empty message to trigger AI turn (participants before user will respond)
				await messageService.send("");
			} catch (error: any) {
				toastService.danger({
					title: "Error starting turn",
					text: JSON.stringify(error.message || error)
				});
			}
		})()
);

rpgSettingsButton?.addEventListener(
	"click",
	() =>
		void (async () => {
			const chat = await chatsService.getCurrentChat();
			if (!chat?.groupChat) return;

			// Ensure sidebar is visible
			const sidebar = document.querySelector<HTMLElement>(".sidebar");
			if (sidebar) {
				sidebar.style.display = "flex";
				helpers.showElement(sidebar, false);
			}

			// Switch to the Settings tab (3rd tab)
			const navbar = document.querySelector<HTMLElement>('.navbar[data-target-id="sidebar-content"]');
			const settingsTab = navbar?.querySelector<HTMLElement>(".navbar-tab:nth-child(3)");
			settingsTab?.click();

			// Open the Group chat Settings page
			const settingsSection = document.querySelector<HTMLElement>("#settings-section");
			const groupChatSettingsButton = settingsSection?.querySelector<HTMLElement>(
				'[data-settings-target="groupchat"]'
			);

			// If we're already in settings home, clicking this will navigate to the groupchat page.
			// If we're already inside another settings page, the click will still work because
			// SettingsNavigation attaches handlers directly to the home list items.
			groupChatSettingsButton?.click();
		})()
);

window.addEventListener(
	"chat-loaded",
	(e: any) =>
		void (async () => {
			const chat = e.detail.chat;

			isGroupChatContext = !!chat?.groupChat;
			isRpgGroupChatContext = chat?.groupChat?.mode === "rpg";
			isDynamicGroupChatContext = chat?.groupChat?.mode === "dynamic";
			allowDynamicPings = isDynamicGroupChatContext;

			if (isDynamicGroupChatContext) {
				const participantIds: string[] = Array.isArray(chat.groupChat?.participantIds)
					? chat.groupChat.participantIds
					: [];
				const nextOptions: MentionOption[] = [];
				for (const id of participantIds) {
					const persona = await personalityService.get(String(id));
					const resolved = persona || personalityService.getDefault();
					if (!resolved) continue;
					nextOptions.push({
						id: String(id),
						name: String(resolved.name || "Unknown"),
						image: resolved.image
					});
				}
				mentionOptions = nextOptions;
			} else {
				mentionOptions = [];
				closeMentionMenu();
			}

			if (isGroupChatContext) {
				messageInput?.setAttribute("placeholder", "Send a message");
				internetSearchToggle?.classList.add("hidden");
				roleplayActionsMenu?.classList.add("hidden");
			} else {
				await setupBottomBar();
			}

			const imageBtn = document.querySelector<HTMLButtonElement>("#btn-image");
			const editBtn = document.querySelector<HTMLButtonElement>("#btn-edit");
			imageBtn?.classList.toggle("hidden", isGroupChatContext);
			editBtn?.classList.toggle("hidden", isGroupChatContext);

			if (isRpgGroupChatContext) {
				turnControlPanel?.classList.remove("hidden");

				//determine turn state from chat content
				const rpg = chat.groupChat?.rpg;
				const turnOrder: string[] = Array.isArray(rpg?.turnOrder) ? rpg.turnOrder : [];
				const participants: string[] = Array.isArray(chat.groupChat?.participantIds)
					? chat.groupChat.participantIds
					: [];
				const effectiveOrder = turnOrder.length > 0 ? turnOrder : [...participants, "user"];
				const userIndex = effectiveOrder.indexOf("user");

				const allMessages = (chat.content || []) as any[];
				const isUserSkipTurnMarker = (m: any): boolean => {
					if (!m || m.role !== "user" || !m.hidden) return false;
					const parts = Array.isArray(m.parts) ? m.parts : [];
					return parts.some(
						(p: any) => (p?.text ?? "").toString() === messageService.USER_SKIP_TURN_MARKER_TEXT
					);
				};
				const isAiSkipTurnMarker = (m: any): boolean => {
					if (!m || m.role !== "model" || !m.hidden) return false;
					const parts = Array.isArray(m.parts) ? m.parts : [];
					return parts.some((p: any) => (p?.text ?? "").toString() === "__ai_skip_turn__");
				};
				const isSkipTurnMarker = (m: any): boolean => isUserSkipTurnMarker(m) || isAiSkipTurnMarker(m);

				//use "turn relevant" messages to determine current state
				//this includes the hidden skip-turn marker (counts as user completing their turn)
				const turnRelevantMessages = allMessages.filter((m: any) => !m.hidden || isSkipTurnMarker(m));
				const lastMessage = turnRelevantMessages[turnRelevantMessages.length - 1];

				let isUserTurn = false;
				let startsNewRound = false;
				let nextSpeakerId: string | undefined;

				//calculate next round number from existing messages
				const roundIndices = (chat.content || [])
					.filter((m: any) => typeof m.roundIndex === "number")
					.map((m: any) => m.roundIndex as number);
				const maxRoundIndex = roundIndices.length > 0 ? Math.max(...roundIndices) : 0;

				if (turnRelevantMessages.length === 0) {
					// Empty chat: next speaker is the first in the order.
					const nextSpeaker = effectiveOrder[0];
					nextSpeakerId = nextSpeaker;
					startsNewRound = true;
					isUserTurn = nextSpeaker === "user" || userIndex === 0 || userIndex === -1;
				} else {
					// Determine whose turn is next based on last speaker
					const lastSpeakerId = isUserSkipTurnMarker(lastMessage)
						? "user"
						: lastMessage.role === "user"
							? "user"
							: lastMessage.personalityid;

					// Skip narrator messages when determining turn
					let effectiveLastSpeaker = lastSpeakerId;
					if (lastSpeakerId === "__narrator__") {
						// Look backwards for non-narrator message
						for (let i = turnRelevantMessages.length - 2; i >= 0; i--) {
							const msg = turnRelevantMessages[i];
							const speakerId = msg.role === "user" ? "user" : msg.personalityid;
							if (speakerId !== "__narrator__") {
								effectiveLastSpeaker = speakerId;
								break;
							}
						}
					}

					const lastSpeakerIndex = effectiveOrder.indexOf(String(effectiveLastSpeaker));
					if (lastSpeakerIndex === -1) {
						// Unknown speaker, default to user's turn
						isUserTurn = true;
						startsNewRound = false;
					} else {
						// Next speaker is the one after lastSpeaker in the order
						const nextIndex = (lastSpeakerIndex + 1) % effectiveOrder.length;
						const nextSpeaker = effectiveOrder[nextIndex];
						nextSpeakerId = nextSpeaker;
						isUserTurn = nextSpeaker === "user";
						startsNewRound = nextSpeaker === effectiveOrder[0];
					}
				}

				const nextRoundNumber = startsNewRound ? maxRoundIndex + 1 : Math.max(1, maxRoundIndex);

				void updateRpgTurnControlUi({ isUserTurn, startsNewRound, nextRoundNumber, nextSpeakerId });

				//auto-progress when loading into a state that requires starting the next round
				if (!isUserTurn && settingsService.getSettings().rpgGroupChatsProgressAutomatically) {
					//avoid double-triggers during initial load
					syncGenerationUiForCurrentChat();
					if (!isCurrentlyGenerating) {
						void messageService.send("");
					}
				}
			} else if (chat?.groupChat) {
				// Dynamic group chat
				turnControlPanel?.classList.add("hidden");
				syncComposerInteractivity();
			} else {
				//Normal chat or empty
				turnControlPanel?.classList.add("hidden");
				syncComposerInteractivity();
			}

			syncGenerationUiForCurrentChat();
		})()
);

window.addEventListener("composer-state-reset", () => {
	resetComposerContextState();
});

const setupBottomBar = async () => {
	if (isGroupChatContext) {
		messageInput.setAttribute("placeholder", "Send a message");
		return;
	}

	const personality = await personalityService.getSelected();
	if (personality) {
		messageInput.setAttribute("placeholder", `Send a message to ${personality.name}`);
		if (personality.roleplayEnabled) {
			roleplayActionsMenu.classList.remove("hidden");
		} else {
			roleplayActionsMenu.classList.add("hidden");
		}
		if (personality.internetEnabled) {
			internetSearchToggle.classList.remove("hidden");
		} else {
			internetSearchToggle.classList.add("hidden");
		}
	} else {
		messageInput.setAttribute("placeholder", "Send a message");
	}
};

document.querySelector<HTMLDivElement>("#personalitiesDiv")!.addEventListener(
	"change",
	(e: Event) =>
		void (async () => {
			if ((e.target as HTMLSelectElement).name === "personality") {
				await setupBottomBar();
			}
		})()
);

updateMessageLimitIndicator();
await setupBottomBar();

// Listen for image editing toggle events
window.addEventListener(
	"image-editing-toggled",
	(event: any) =>
		void (async () => {
			isImageEditingModeActive = event.detail.enabled;

			if (!isImageEditingModeActive) {
				// Clear history preview when editing is disabled
				clearHistoryPreview();
			} else {
				// If toggled ON, enforce model-specific image limit
				enforceImageLimitForModel();
			}

			updateImageCreditsLabelVisibility();
		})()
);

// Listen for image generation toggle events
window.addEventListener("image-generation-toggled", () => {
	updateImageCreditsLabelVisibility();
});

// Listen for attachment changes
window.addEventListener(
	"attachment-added",
	() =>
		void (async () => {
			// Hide history preview when attachments are added
			if (isImageEditingModeActive) {
				clearHistoryPreview();
				enforceImageLimitForModel();
			}
		})()
);

// Listen for history image removal
window.addEventListener("history-image-removed", () => {
	currentHistoryImagePreview = null;
});

window.addEventListener("auth-state-changed", (event: any) => {
	const subscription = event.detail?.subscription ?? null;
	if (!event.detail?.loggedIn || !subscription) {
		activeSubscriptionTier = "free";
		updateMessageLimitIndicator();
		return;
	}

	// subscription-updated follows this event after Supabase UI refresh; keep this as a quick fallback.
	activeSubscriptionTier = event.detail?.tier ?? activeSubscriptionTier;
	updateMessageLimitIndicator({ enforceCurrentContent: true, showLimitToast: true });
});

window.addEventListener("subscription-updated", (event: any) => {
	activeSubscriptionTier = event.detail?.tier ?? "free";
	updateMessageLimitIndicator({ enforceCurrentContent: true, showLimitToast: true });
});

window.addEventListener("premium-endpoint-preference-changed", refreshMessageLimitFromPreference);
window.addEventListener("settings-loaded-from-storage", refreshMessageLimitFromPreference);

// Listen for attach-image-from-chat event (from Edit/Attach buttons in messages)
window.addEventListener("attach-image-from-chat", (event: any) => {
	const { file, toggleEditing } = event.detail;
	if (!file) return;

	// Mark this file as coming from chat history
	(file as any)._fromChatHistory = true;

	// Add the file using the existing addAttachments function
	addAttachments([file]);

	// Toggle editing mode if requested
	if (toggleEditing) {
		const editButton = document.querySelector<HTMLButtonElement>("#btn-edit");
		if (editButton && !editButton.classList.contains("btn-toggled")) {
			editButton.click();
		}
	}
});

// Listen for edit model changes (model-specific image limit)
window.addEventListener("edit-model-changed", () => {
	if (isImageEditingModeActive) {
		enforceImageLimitForModel();
	}
});

// Listen for composer allowance state changes
window.addEventListener("composer-allowance-blocked", (event: any) => {
	isComposerAllowanceBlocked = !!event.detail.blocked;
	composerAllowanceBlockTitle = event.detail.title || "Request unavailable";
	composerAllowanceBlockText = event.detail.text || "This request is currently unavailable.";
	syncComposerInteractivity();
});

function addAttachments(rawFiles: File[]): void {
	if (!rawFiles.length) {
		return;
	}

	const files = dedupeFiles(rawFiles);
	const duplicateNames: string[] = [];
	const oversizedMessages: string[] = [];
	const absoluteOversizedMessages: string[] = [];
	const unsupportedMessages: string[] = [];
	const mimeMismatchMessages: string[] = [];
	let limitReached = false;
	const added: File[] = [];
	const existingSignatures = new Set(attachmentState.map(getFileSignature));

	for (const file of files) {
		if (attachmentState.length + added.length >= MAX_ATTACHMENTS) {
			limitReached = true;
			break;
		}

		const displayName = getDisplayName(file);
		const validation = validateAttachmentFile(file);

		if (!validation.ok) {
			if (validation.reason === "too-large") {
				oversizedMessages.push(validation.message);
			} else if (validation.reason === "absolute-too-large") {
				absoluteOversizedMessages.push(validation.message);
			} else if (validation.reason === "mime-mismatch") {
				mimeMismatchMessages.push(validation.message);
			} else {
				unsupportedMessages.push(validation.message);
			}
			continue;
		}

		const signature = getFileSignature(file);
		if (existingSignatures.has(signature)) {
			duplicateNames.push(displayName);
			continue;
		}

		existingSignatures.add(signature);
		added.push(file);
	}

	if (added.length > 0) {
		let finalAdded = added;
		if (isImageEditingModeActive) {
			const editingModel = getSelectedEditingModel();
			const maxImages = IMAGE_MODELS.find((model) => model.id === editingModel)?.maxInputImages;
			if (maxImages) {
				const currentImageCount = attachmentState.filter((f) => f.type.startsWith("image/")).length;
				const newImageFiles = added.filter((f) => f.type.startsWith("image/"));
				const slotsRemaining = maxImages - currentImageCount;

				if (slotsRemaining < newImageFiles.length) {
					const skippedCount = newImageFiles.length - Math.max(0, slotsRemaining);
					const keptNewImages = newImageFiles.slice(0, Math.max(0, slotsRemaining));
					const nonImageFiles = added.filter((f) => !f.type.startsWith("image/"));
					finalAdded = [...nonImageFiles, ...keptNewImages];
					toastService.warn({
						title: `${editingModel.charAt(0).toUpperCase() + editingModel.slice(1)} supports up to ${maxImages} image${maxImages > 1 ? "s" : ""}`,
						text: `${skippedCount} image${skippedCount > 1 ? "s were" : " was"} skipped (${currentImageCount} already attached, max ${maxImages}).`
					});
				}
			}
		}

		attachmentState = [...attachmentState, ...finalAdded];
		syncAttachmentInput();
		for (const file of finalAdded) {
			const preview = attachmentPreviewElement(file);
			preview.dataset.attachmentSignature = getFileSignature(file);
			attachmentPreview!.appendChild(preview);
		}
	} else {
		// ensure FileList is in sync even if we only removed/filtered files
		syncAttachmentInput();
	}

	if (duplicateNames.length) {
		toastService.warn({
			title: duplicateNames.length === 1 ? "Duplicate attachment skipped" : "Duplicate attachments skipped",
			text: formatFileListForToast(duplicateNames)
		});
	}

	if (oversizedMessages.length) {
		toastService.warn({
			title: oversizedMessages.length === 1 ? "File exceeds type limit" : "Files exceed type limits",
			text: formatFileListForToast(oversizedMessages)
		});
	}

	if (absoluteOversizedMessages.length) {
		toastService.warn({
			title:
				absoluteOversizedMessages.length === 1
					? "File exceeds 10 MB attachment cap"
					: "Files exceed 10 MB attachment cap",
			text: formatFileListForToast(absoluteOversizedMessages)
		});
	}

	if (mimeMismatchMessages.length) {
		toastService.danger({
			title: mimeMismatchMessages.length === 1 ? "File type mismatch" : "File type mismatches",
			text: formatFileListForToast(mimeMismatchMessages)
		});
	}

	if (unsupportedMessages.length) {
		toastService.danger({
			title: unsupportedMessages.length === 1 ? "Unsupported file type" : "Unsupported file types",
			text: `${formatFileListForToast(unsupportedMessages)}\nSupported types: ${SUPPORTED_TYPES_LABEL}.`
		});
	}

	if (limitReached) {
		toastService.warn({
			title: "Attachment limit reached",
			text: `You can attach up to ${MAX_ATTACHMENTS} files per message.`
		});
	}
}

function syncAttachmentInput(): void {
	attachmentsInput!.files = filesToFileList(attachmentState);
}

function collectFilesFromClipboard(event: ClipboardEvent): File[] {
	const data = event.clipboardData;
	if (!data) {
		return [];
	}
	const files: File[] = [];
	for (const file of Array.from(data.files || [])) {
		if (file) {
			files.push(file);
		}
	}
	for (const item of Array.from(data.items || [])) {
		if (item.kind === "file") {
			const file = item.getAsFile();
			if (file) {
				files.push(file);
			}
		}
	}
	return dedupeFiles(files);
}

function dedupeFiles(files: File[]): File[] {
	const seen = new Set<string>();
	const unique: File[] = [];
	for (const file of files) {
		const signature = getFileSignature(file);
		if (seen.has(signature)) {
			continue;
		}
		seen.add(signature);
		unique.push(file);
	}
	return unique;
}

function handleDragEnter(event: DragEvent): void {
	if (!isFileDrag(event)) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	if (dragDepth === 0) {
		messageBox!.classList.add("drag-over");
	}
	dragDepth += 1;
}

function handleDragOver(event: DragEvent): void {
	if (!isFileDrag(event)) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = "copy";
	}
}

function handleDragLeave(event: DragEvent): void {
	if (!isFileDrag(event)) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	dragDepth = Math.max(0, dragDepth - 1);
	if (dragDepth === 0) {
		messageBox!.classList.remove("drag-over");
	}
}

function handleDrop(event: DragEvent): void {
	if (!isFileDrag(event)) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	const files = collectFilesFromDataTransfer(event.dataTransfer);
	if (files.length) {
		addAttachments(files);
	}
	resetDragState();
}

function collectFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
	if (!dataTransfer) {
		return [];
	}
	const files: File[] = [];
	for (const file of Array.from(dataTransfer.files || [])) {
		if (file) {
			files.push(file);
		}
	}
	for (const item of Array.from(dataTransfer.items || [])) {
		if (item.kind === "file") {
			const file = item.getAsFile();
			if (file) {
				files.push(file);
			}
		}
	}
	return dedupeFiles(files);
}

function isFileDrag(event: DragEvent): boolean {
	return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function resetDragState(): void {
	dragDepth = 0;
	messageBox!.classList.remove("drag-over");
}

function getDisplayName(file: File): string {
	return file.name?.trim() ? file.name : "Unnamed file";
}

/**
 * Updates or creates the history image preview based on current chat state
 */
/**
 * Clears the history image preview
 */
function clearHistoryPreview(): void {
	// Remove tracked preview
	if (currentHistoryImagePreview) {
		currentHistoryImagePreview.remove();
		currentHistoryImagePreview = null;
	}

	// Also remove any orphaned history previews that might exist in the DOM
	const orphanedPreviews = attachmentPreview?.querySelectorAll(".history-image-preview");
	orphanedPreviews?.forEach((preview) => preview.remove());
}

function enforceImageLimitForModel(): void {
	const editingModel = getSelectedEditingModel();
	const maxImages = IMAGE_MODELS.find((model) => model.id === editingModel)?.maxInputImages;
	if (!maxImages) return;

	const imageFiles = attachmentState.filter((file) => file.type.startsWith("image/"));
	if (imageFiles.length <= maxImages) {
		return;
	}

	let keptImages = 0;
	let removedImages = 0;
	const nextAttachmentState: File[] = [];

	for (const file of attachmentState) {
		if (!file.type.startsWith("image/")) {
			nextAttachmentState.push(file);
			continue;
		}

		if (keptImages < maxImages) {
			nextAttachmentState.push(file);
			keptImages += 1;
		} else {
			removedImages += 1;
		}
	}

	attachmentState = nextAttachmentState;
	syncAttachmentInput();

	// Rebuild attachment previews from state to avoid duplicates
	const previews = attachmentPreview?.querySelectorAll(".attachment-container:not(.history-image-preview)");
	previews?.forEach((preview) => preview.remove());

	for (const file of attachmentState) {
		const preview = attachmentPreviewElement(file);
		preview.dataset.attachmentSignature = getFileSignature(file);
		attachmentPreview!.appendChild(preview);
	}

	const modelName = editingModel.charAt(0).toUpperCase() + editingModel.slice(1);
	toastService.warn({
		title: `${modelName} supports up to ${maxImages} image${maxImages > 1 ? "s" : ""}`,
		text: `${removedImages} image${removedImages > 1 ? "s were" : " was"} removed.`
	});
}

/**
 * Export function to get current history image data URI
 */
export function getCurrentHistoryImageDataUri(): string | null {
	if (!currentHistoryImagePreview) {
		return null;
	}

	const img = currentHistoryImagePreview.querySelector<HTMLImageElement>(".history-image-thumbnail");
	return img?.src || null;
}

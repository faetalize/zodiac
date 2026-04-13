/**
 * Message service - handles all message sending, regeneration, and DOM operations.
 *
 * Public API:
 * - send(msg): Send a message in normal chat mode
 * - sendRpgTurn(msg?): Send user turn in RPG group chat mode
 * - skipRpgTurn(): Skip user turn in RPG group chat mode
 * - regenerate(modelMessageIndex): Regenerate a response
 * - abortGeneration(): Stop current generation
 * - getIsGenerating(): Check if generation is in progress
 * - insertMessage(message, index): Insert a message into the DOM
 * - ensureRoundBlockUi(block, roundIndex): Ensure round block UI elements
 * - createPersonalityMarkerMessage(personalityId): Create a personality marker
 */

import type { Content, GenerateContentConfig } from "@google/genai";
import { GoogleGenAI, createPartFromUri, BlockedReason, FinishReason } from "@google/genai";
import hljs from "highlight.js";

import type { Message, GeneratedImage, MessageDebugInfo, MessageDebugMode } from "../types/Message";
import type { Chat, DbChat } from "../types/Chat";
import type { DbPersonality } from "../types/Personality";
import {
	ChatModel,
	getPreferredNarratorLocalModel,
	isGeminiModel,
	isOpenRouterModel,
	modelSupportsThinking,
	modelSupportsTemperature,
	requiresThoughtSignaturesInHistory
} from "../types/Models";
import type { PremiumEndpoint } from "../types/PremiumEndpoint";

import * as settingsService from "./Settings.service";
import * as personalityService from "./Personality.service";
import * as chatsService from "./Chats.service";
import * as supabaseService from "./Supabase.service";
import * as syncService from "./Sync.service";
import * as helpers from "../utils/helpers";
import { db } from "./Db.service";
import { info, warn, danger } from "./Toast.service";
import { parseMarkdownToHtml } from "./Parser.service";
import { SUPABASE_URL, getAuthHeaders } from "./Supabase.service";
import { processGeminiLocalSdkResponse, processGeminiLocalSdkStream } from "./GeminiResponseProcessor.service";
import { processPremiumEndpointSse } from "./PremiumEndpointResponseProcessor.service";
import {
	buildOpenRouterRequest,
	buildOpenRouterRequestMessages,
	requestOpenRouterCompletion
} from "./OpenRouter.service";

import { messageElement } from "../components/dynamic/message";
import { isImageModeActive } from "../components/static/ImageButton.component";
import { isImageEditingActive } from "../components/static/ImageEditButton.component";
import { clearAttachmentPreviews } from "../components/static/AttachmentPreview.component";
import { getCurrentHistoryImageDataUri } from "../components/static/ChatInput.component";
import { shouldPreferPremiumEndpoint } from "../components/static/ApiKeyInput.component";
import { getSelectedEditingModel } from "../components/static/ImageEditModelSelector.component";

import { isAbortError, throwAbortError } from "../utils/abort";
import { resolveThoughtSignature } from "../utils/blobResolver";
import { dispatchAppEvent } from "../events";
import { MODEL_IMAGE_LIMITS } from "../constants/ImageModels";
import {
	NARRATOR_PERSONALITY_ID,
	createPersonalityMarkerMessage,
	isPersonalityMarker,
	getPersonalityMarkerInfo,
	isLegacyPersonalityIntro,
	pruneTrailingPersonalityMarkers,
	buildPersonalityInstructionMessages
} from "../utils/personalityMarkers";
import {
	findLastGeneratedImageIndex,
	findLastAttachmentIndex,
	processAttachmentsToParts,
	processGeneratedImagesToParts,
	renderGroundingToShadowDom,
	ensureThinkingUi,
	createThinkingUiElements,
	createErrorMessage,
	UNRESTRICTED_SAFETY_SETTINGS
} from "../utils/chatHistoryBuilder";

import { sendGroupChatRpg, type RpgInputArgs } from "./RpgGroupChat";
import { sendGroupChatDynamic, type DynamicInputArgs } from "./DynamicGroupChat";

// ================================================================================
// CONSTANTS
// ================================================================================

export const USER_SKIP_TURN_MARKER_TEXT = "__user_skip_turn__";
export const SKIP_THOUGHT_SIGNATURE_VALIDATOR = "skip_thought_signature_validator";

export { NARRATOR_PERSONALITY_ID, createPersonalityMarkerMessage };

// ================================================================================
// GENERATION STATE
// ================================================================================

const abortControllerByChatId = new Map<string, AbortController>();
const sendInFlightByChatId = new Map<string, boolean>();
const hydrateForWriteInFlightByChatId = new Map<string, Promise<void>>();
const NEW_CHAT_SEND_LOCK_KEY = "__new_chat__";

function getAnyGenerating(): boolean {
	return abortControllerByChatId.size > 0;
}

export function abortGeneration(chatId?: string): void {
	const targetChatId = chatId ?? chatsService.getCurrentChatId();
	if (!targetChatId) return;

	const abortController = abortControllerByChatId.get(targetChatId);
	if (!abortController) return;

	abortController.abort();
	abortControllerByChatId.delete(targetChatId);
}

export function getIsGenerating(chatId?: string | null): boolean {
	if (!chatId) {
		return false;
	}

	return abortControllerByChatId.has(chatId);
}

function getSendLockKey(chatId?: string | null): string {
	return chatId || chatsService.getCurrentChatId() || NEW_CHAT_SEND_LOCK_KEY;
}

function isSendInFlight(chatId?: string | null): boolean {
	return sendInFlightByChatId.get(getSendLockKey(chatId)) === true;
}

function setSendInFlight(value: boolean, chatId?: string | null): void {
	const key = getSendLockKey(chatId);
	if (value) {
		sendInFlightByChatId.set(key, true);
		return;
	}

	sendInFlightByChatId.delete(key);
}

function moveSendInFlight(fromChatId: string | null | undefined, toChatId: string): void {
	const fromKey = getSendLockKey(fromChatId);
	if (fromKey === toChatId) return;
	if (sendInFlightByChatId.get(fromKey) !== true) return;

	sendInFlightByChatId.delete(fromKey);
	sendInFlightByChatId.set(toChatId, true);
}

async function ensureChatFullyHydratedForWrite(chatId?: string | null): Promise<void> {
	if (!syncService.isSyncActive()) return;
	const targetChatId = chatId ?? chatsService.getCurrentChatId();
	if (!targetChatId) return;
	const isCurrentChat = targetChatId === chatsService.getCurrentChatId();
	const existingChat = await chatsService.getChatById(targetChatId);
	if (!existingChat) return;
	const isFullyHydrated = syncService.isChatSnapshotFullyHydrated(targetChatId, existingChat.content.length);

	if (isCurrentChat && !chatsService.isCurrentChatRemotePagedMode() && isFullyHydrated) return;
	if (!isCurrentChat && syncService.isChatSnapshotFullyHydrated(targetChatId, existingChat.content.length)) return;

	const inFlight = hydrateForWriteInFlightByChatId.get(targetChatId);
	if (inFlight) {
		await inFlight;
		return;
	}

	const hydrateForWriteInFlight = (async () => {
		const fullMessages = await syncService.fetchAllSyncedChatMessages(targetChatId);
		if (!fullMessages) return;
		if (isCurrentChat) {
			await chatsService.replaceCurrentChatMessages(fullMessages);
			return;
		}

		chatsService.replaceCachedChatMessages(targetChatId, fullMessages);
	})();

	hydrateForWriteInFlightByChatId.set(targetChatId, hydrateForWriteInFlight);

	try {
		await hydrateForWriteInFlight;
	} finally {
		hydrateForWriteInFlightByChatId.delete(targetChatId);
	}
}

function startGeneration(chatId: string): AbortController {
	const currentAbortController = new AbortController();
	abortControllerByChatId.set(chatId, currentAbortController);
	dispatchAppEvent("generation-state-changed", { chatId, isGenerating: true, anyGenerating: true });
	return currentAbortController;
}

function endGeneration(chatId?: string | null): void {
	const targetChatId = chatId ?? chatsService.getCurrentChatId();
	if (!targetChatId) return;

	abortControllerByChatId.delete(targetChatId);
	dispatchAppEvent("generation-state-changed", {
		chatId: targetChatId,
		isGenerating: false,
		anyGenerating: getAnyGenerating()
	});
}

// ================================================================================
// MESSAGE DOM
// ================================================================================

export async function insertMessage(message: Message, index: number): Promise<HTMLElement> {
	const messageElm = await messageElement(message, index);
	const messageContainer = document.querySelector<HTMLDivElement>(".message-container");

	if (messageContainer) {
		const currentRoundIndex = message.roundIndex;

		if (typeof currentRoundIndex === "number") {
			const targetBlock = messageContainer.querySelector<HTMLDivElement>(
				`.round-block[data-round-index="${currentRoundIndex}"]`
			);

			if (targetBlock) {
				ensureRoundBlockUi(targetBlock, currentRoundIndex);
				targetBlock.append(messageElm);
			} else {
				const block = document.createElement("div");
				block.classList.add("round-block");
				block.dataset.roundIndex = String(currentRoundIndex);
				ensureRoundBlockUi(block, currentRoundIndex);
				block.append(messageElm);
				messageContainer.append(block);
			}
		} else {
			messageContainer.append(messageElm);
		}
	}

	return messageElm;
}

export function ensureRoundBlockUi(block: HTMLDivElement, roundIndex: number): void {
	if (block.querySelector(".round-header")) {
		return;
	}

	const header = document.createElement("div");
	header.className = "round-header";

	const badge = document.createElement("div");
	badge.className = "round-badge";
	badge.textContent = `Round ${roundIndex}`;

	const actions = document.createElement("div");
	actions.className = "round-actions";

	const statusText = document.createElement("span");
	statusText.className = "round-action-status hidden";
	statusText.setAttribute("aria-live", "polite");

	const regenBtn = document.createElement("button");
	regenBtn.className = "btn-textual material-symbols-outlined round-action-btn";
	regenBtn.type = "button";
	regenBtn.textContent = "refresh";
	regenBtn.title = "Regenerate from this round";
	regenBtn.setAttribute("aria-label", "Regenerate from this round");
	regenBtn.addEventListener(
		"click",
		(e) =>
			void (async () => {
				e.preventDefault();
				e.stopPropagation();
				const ok = await helpers.confirmDialogDanger(
					`Regenerate from Round ${roundIndex}? This will delete Round ${roundIndex} and any later rounds, then re-run the AI from this point.`
				);
				if (!ok) return;
				const originalText = regenBtn.textContent || "refresh";
				regenBtn.disabled = true;
				deleteBtn.disabled = true;
				regenBtn.textContent = "hourglass_top";
				statusText.textContent = "Regenerating…";
				statusText.classList.remove("hidden");
				info({
					title: "Regenerating round",
					text: `Round ${roundIndex} is being regenerated. This can take a while for long chats.`
				});
				try {
					await regenerateRound(roundIndex);
				} catch (error: any) {
					console.error(error);
					danger({ title: "Error regenerating round", text: JSON.stringify(error?.message || error) });
				} finally {
					regenBtn.disabled = false;
					deleteBtn.disabled = false;
					regenBtn.textContent = originalText;
					statusText.textContent = "";
					statusText.classList.add("hidden");
				}
			})()
	);

	const deleteBtn = document.createElement("button");
	deleteBtn.className = "btn-textual material-symbols-outlined round-action-btn";
	deleteBtn.type = "button";
	deleteBtn.textContent = "delete";
	deleteBtn.title = "Delete this round";
	deleteBtn.setAttribute("aria-label", "Delete this round");
	deleteBtn.addEventListener(
		"click",
		(e) =>
			void (async () => {
				e.preventDefault();
				e.stopPropagation();
				const ok = await helpers.confirmDialogDanger(
					`Delete Round ${roundIndex}? This will permanently remove all messages in this round.`
				);
				if (!ok) return;
				const originalText = deleteBtn.textContent || "delete";
				regenBtn.disabled = true;
				deleteBtn.disabled = true;
				deleteBtn.textContent = "hourglass_top";
				statusText.textContent = "Deleting…";
				statusText.classList.remove("hidden");
				info({
					title: "Deleting round",
					text: `Round ${roundIndex} is being deleted. This can take a while for long chats.`
				});
				try {
					await deleteRound(roundIndex);
				} catch (error: any) {
					console.error(error);
					danger({ title: "Error deleting round", text: JSON.stringify(error?.message || error) });
				} finally {
					regenBtn.disabled = false;
					deleteBtn.disabled = false;
					deleteBtn.textContent = originalText;
					statusText.textContent = "";
					statusText.classList.add("hidden");
				}
			})()
	);

	actions.append(statusText, regenBtn, deleteBtn);
	header.append(badge, actions);
	block.prepend(header);
}

function ensureThinkingUiOnMessageElement(msgElement: HTMLElement): HTMLDivElement | null {
	return ensureThinkingUi(msgElement);
}

// ================================================================================
// HELPERS
// ================================================================================

function getSelectedPersonalityId(): string {
	const checked = document.querySelector<HTMLInputElement>("input[name='personality']:checked");
	const parentId = checked?.parentElement?.id ?? "";
	return parentId.startsWith("personality-") ? parentId.slice("personality-".length) : "-1";
}

function cloneFilesToFileList(files?: Iterable<File> | ArrayLike<File> | null): FileList {
	const dt = new DataTransfer();
	for (const file of Array.from(files ?? [])) {
		dt.items.add(file);
	}
	return dt.files;
}

function createModelPlaceholderMessage(
	personalityid: string,
	groundingContent?: string,
	roundIndex?: number,
	originModel?: string
): Message {
	const m: Message = { role: "model", parts: [{ text: "" }], personalityid, originModel };
	if (groundingContent !== undefined) (m as any).groundingContent = groundingContent;
	if (roundIndex !== undefined) m.roundIndex = roundIndex;
	return m;
}

function getPendingOriginModel(settings: ReturnType<typeof settingsService.getSettings>): string {
	if (isImageEditingActive()) {
		return getSelectedEditingModel();
	}

	if (isImageModeActive()) {
		return settings.imageModel || "imagen-4.0-ultra-generate-001";
	}

	return settings.model;
}

function getCurrentMessageDebugMode(): MessageDebugMode {
	if (isImageEditingActive()) {
		return "image_editing";
	}

	if (isImageModeActive()) {
		return "image_generation";
	}

	return "normal";
}

function buildMessageDebugInfo(args: {
	settings: ReturnType<typeof settingsService.getSettings>;
	mode: MessageDebugMode;
	isPremiumEndpointPreferred: boolean;
	isImagePremiumEndpointPreferred: boolean;
	requestSlug?: string;
	requestSlugs?: string[];
}): MessageDebugInfo {
	const modeSettings =
		args.mode === "image_generation"
			? {
					requestModel: args.settings.imageModel || "imagen-4.0-ultra-generate-001",
					imageModel: args.settings.imageModel || "imagen-4.0-ultra-generate-001"
				}
			: args.mode === "image_editing"
				? {
						requestModel: getSelectedEditingModel(),
						imageEditingModel: getSelectedEditingModel()
					}
				: {
						requestModel: args.settings.model
					};

	return {
		mode: args.mode,
		premiumEndpointEnabled:
			args.mode === "normal"
				? args.isPremiumEndpointPreferred
				: args.mode === "image_editing"
					? true
					: args.isImagePremiumEndpointPreferred,
		requestSlug: args.requestSlug,
		requestSlugs: args.requestSlugs,
		chatSettings: {
			model: args.settings.model,
			maxOutputTokens: parseInt(args.settings.maxTokens, 10),
			temperature: parseInt(args.settings.temperature, 10) / 100,
			streamResponses: args.settings.streamResponses,
			thinkingEnabled: args.settings.enableThinking,
			thinkingBudget: args.settings.thinkingBudget
		},
		modeSettings
	};
}

function buildUserMessageDebugInfo(args: {
	settings: ReturnType<typeof settingsService.getSettings>;
	isPremiumEndpointPreferred: boolean;
	isImagePremiumEndpointPreferred: boolean;
}): MessageDebugInfo {
	return buildMessageDebugInfo({
		...args,
		mode: getCurrentMessageDebugMode()
	});
}

function setUserMessageRequestSlug(userMessage: Message, requestSlug?: string): void {
	if (!requestSlug) return;
	if (!userMessage.debugInfo) return;
	userMessage.debugInfo.requestSlug = requestSlug;
	userMessage.debugInfo.requestSlugs = Array.from(
		new Set([...(userMessage.debugInfo.requestSlugs ?? []), requestSlug])
	);
}

export async function appendRequestSlugToStoredMessage(args: {
	chatId: string;
	messageIndex: number;
	requestSlug?: string;
}): Promise<void> {
	if (typeof args.messageIndex !== "number" || !args.requestSlug) return;
	const requestSlug = args.requestSlug;

	await ensureChatFullyHydratedForWrite(args.chatId);
	await chatsService.mutateChat(args.chatId, async (chat) => {
		const target = chat.content[args.messageIndex];
		if (!target) return undefined;

		target.debugInfo ??= buildMessageDebugInfo({
			settings: settingsService.getSettings(),
			mode: getCurrentMessageDebugMode(),
			isPremiumEndpointPreferred: shouldPreferPremiumEndpoint(),
			isImagePremiumEndpointPreferred: (await supabaseService.isImageGenerationAvailable()).type === "all"
		});
		target.debugInfo.requestSlug = target.debugInfo.requestSlug || requestSlug;
		target.debugInfo.requestSlugs = Array.from(new Set([...(target.debugInfo.requestSlugs ?? []), requestSlug]));
		chat.lastModified = new Date();
		return true;
	});
}

export async function getChatForWrite(chatId: string): Promise<DbChat | undefined> {
	await ensureChatFullyHydratedForWrite(chatId);
	return chatsService.getChatById(chatId);
}

export async function persistMessagesToChat(
	chatId: string,
	messages: Message[]
): Promise<{ startIndex: number } | null> {
	await ensureChatFullyHydratedForWrite(chatId);
	const startIndex = await chatsService.mutateChat(chatId, (chat) => {
		const nextStartIndex = chat.content.length;
		chat.content.push(...messages);
		chat.lastModified = new Date();
		return nextStartIndex;
	});
	return typeof startIndex === "number" ? { startIndex } : null;
}

async function persistMessages(messages: Message[]): Promise<void> {
	const chatId = chatsService.getCurrentChatId();
	if (!chatId) return;
	await persistMessagesToChat(chatId, messages);
}

async function updateChatMessage(chatId: string, messageIndex: number, message: Message): Promise<boolean> {
	await ensureChatFullyHydratedForWrite(chatId);
	const didUpdate = await chatsService.mutateChat(chatId, (chat) => {
		if (messageIndex < 0 || messageIndex >= chat.content.length) return undefined;

		chat.content[messageIndex] = message;
		chat.lastModified = new Date();
		return true;
	});
	return didUpdate === true;
}

async function removeChatMessageRange(chatId: string, startIndex: number, count: number): Promise<boolean> {
	await ensureChatFullyHydratedForWrite(chatId);
	const didRemove = await chatsService.mutateChat(chatId, (chat) => {
		if (count <= 0 || startIndex < 0 || startIndex >= chat.content.length) return undefined;

		chat.content.splice(startIndex, count);
		chat.lastModified = new Date();
		return true;
	});
	return didRemove === true;
}

function createModelErrorMessage(selectedPersonalityId: string, originModel?: string): Message {
	return { ...createErrorMessage("generation", selectedPersonalityId), originModel };
}

function createImageGenerationErrorMessage(selectedPersonalityId: string, originModel?: string): Message {
	return { ...createErrorMessage("image_generation", selectedPersonalityId), originModel };
}

function createImageEditingErrorMessage(selectedPersonalityId: string, originModel?: string): Message {
	return { ...createErrorMessage("image_editing", selectedPersonalityId), originModel };
}

function showGeminiProhibitedContentToast(args: { finishReason?: unknown; detail?: unknown }): void {
	const finishReasonText = (args.finishReason ?? "").toString().trim();
	const detailText = (args.detail ?? "").toString().trim();
	const suffix = finishReasonText ? ` ${finishReasonText}` : "";
	const detailSuffix = detailText && detailText !== finishReasonText ? ` ${detailText}` : "";

	warn({
		title: "Message blocked by Gemini",
		text:
			"The AI refused to answer this message. Try rephrasing it, or upgrade to Pro to get a fully unrestricted experience." +
			suffix +
			detailSuffix,
		actions: [
			{
				label: "Upgrade",
				onClick(dismiss) {
					document.querySelector<HTMLButtonElement>("#btn-show-subscription-options")?.click();
					dismiss();
				}
			}
		]
	});
}

function generateThinkingConfig(model: string, enableThinking: boolean, settings: any) {
	if (!enableThinking && model !== ChatModel.NANO_BANANA) {
		return {
			includeThoughts: false,
			thinkingBudget: 0
		};
	}
	if (model === ChatModel.NANO_BANANA) {
		return undefined;
	}
	return {
		includeThoughts: true,
		thinkingBudget: settings.thinkingBudget
	};
}

function getLocalApiKeyForModel(model: string, settings: ReturnType<typeof settingsService.getSettings>): string {
	return isOpenRouterModel(model)
		? (settings.openRouterApiKey || "").trim()
		: (settings.geminiApiKey || settings.apiKey || "").trim();
}

function hasLocalApiKeyForModel(model: string, settings: ReturnType<typeof settingsService.getSettings>): boolean {
	return getLocalApiKeyForModel(model, settings).length > 0;
}

function openApiKeySettings(): void {
	const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
	if (sidebar && window.innerWidth <= 1032) {
		sidebar.style.display = "flex";
		helpers.showElement(sidebar, false);
	}

	document.querySelector<HTMLDivElement>(".navbar-tab:nth-child(3)")?.click();

	window.setTimeout(() => {
		document.querySelector<HTMLButtonElement>('[data-settings-target="api"]')?.click();
	}, 100);
}

async function finalizeResponseElement(args: {
	chatId: string;
	messageIndex: number;
	responseElement?: HTMLElement;
	message: Message;
	scroll?: boolean;
}): Promise<void> {
	if (chatsService.getCurrentChatId() !== args.chatId) {
		return;
	}

	const connectedTarget = args.responseElement?.isConnected
		? args.responseElement
		: document.querySelector<HTMLElement>(`[data-chat-index="${args.messageIndex}"]`);

	if (!connectedTarget && chatsService.isChatLoading(args.chatId)) {
		pendingFinalizedResponseByChatId.set(args.chatId, {
			chatId: args.chatId,
			messageIndex: args.messageIndex,
			message: args.message,
			scroll: args.scroll
		});
		return;
	}

	if (connectedTarget) {
		const newElm = await messageElement(args.message, args.messageIndex);
		connectedTarget.replaceWith(newElm);
	} else {
		await insertMessage(args.message, args.messageIndex);
	}

	if (args.scroll ?? true) {
		helpers.messageContainerScrollToBottom(true);
	}
}

interface ActiveStreamingSession {
	render: () => Promise<void>;
}

const activeStreamingSessionByChatId = new Map<string, ActiveStreamingSession>();
const pendingFinalizedResponseByChatId = new Map<
	string,
	{
		chatId: string;
		messageIndex: number;
		message: Message;
		scroll?: boolean;
	}
>();

function rebindResponseElement(ctx: SendContext): boolean {
	if (!isViewingChat(ctx.chatId)) return false;

	const responseElement = ctx.responseElement.isConnected
		? ctx.responseElement
		: document.querySelector<HTMLElement>(`[data-chat-index="${ctx.modelIndex}"]`);
	if (!responseElement) return false;

	const messageContent = responseElement.querySelector(".message-text .message-text-content");
	const groundingRendered = responseElement.querySelector(".message-grounding-rendered-content");
	if (!messageContent || !groundingRendered) return false;

	ctx.responseElement = responseElement;
	ctx.messageContent = messageContent;
	ctx.groundingRendered = groundingRendered;
	ctx.thinkingWrapper = responseElement.querySelector<HTMLElement>(".message-thinking");
	ctx.thinkingContentElm = responseElement.querySelector<HTMLElement>(".thinking-content");
	return true;
}

async function renderStreamingTextState(ctx: SendContext, state: TextChatResponseState): Promise<void> {
	if (!rebindResponseElement(ctx)) return;

	ctx.responseElement.querySelector(".message-text")?.classList.remove("is-loading");
	ctx.messageContent.innerHTML = await parseMarkdownToHtml(state.rawText);

	if (state.thinking.trim().length > 0) {
		ctx.ensureThinkingElements();
		if (ctx.thinkingContentElm) {
			ctx.thinkingContentElm.innerHTML = await parseMarkdownToHtml(state.thinking);
		}
	}

	renderGroundingToShadowDom(ctx.groundingRendered, state.groundingContent);
	helpers.messageContainerScrollToBottom();
}

window.addEventListener("chat-loaded", (event: any) => {
	const chatId = event?.detail?.chat?.id;
	if (!chatId) return;

	const session = activeStreamingSessionByChatId.get(chatId);
	if (session) {
		void session.render();
	}

	const pendingFinalization = pendingFinalizedResponseByChatId.get(chatId);
	if (!pendingFinalization) return;

	pendingFinalizedResponseByChatId.delete(chatId);
	void finalizeResponseElement(pendingFinalization);
});

function createInterruptedModelMessage(args: {
	personalityId: string;
	text: string;
	textSignature?: string;
	thinking?: string;
	groundingContent?: string;
	generatedImages?: GeneratedImage[];
	originModel?: string;
}): Message {
	const hasImages = (args.generatedImages?.length ?? 0) > 0;
	const parts: Array<{ text: string; thoughtSignature?: string }> = [];

	if (args.text.trim().length > 0 || args.textSignature) {
		parts.push({ text: args.text, thoughtSignature: args.textSignature });
	} else if (!hasImages) {
		parts.push({ text: "*Response interrupted.*" });
	}

	return {
		role: "model",
		personalityid: args.personalityId,
		parts,
		groundingContent: args.groundingContent || "",
		thinking: args.thinking || undefined,
		generatedImages: args.generatedImages?.length ? args.generatedImages : undefined,
		interrupted: true,
		originModel: args.originModel
	};
}

// ================================================================================
// HISTORY BUILDING
// ================================================================================

export interface GeminiHistoryBuildResult {
	history: Content[];
	pinnedHistoryIndices: number[];
}

async function migrateLegacyPersonalityMarkers(chat: Chat): Promise<boolean> {
	let mutated = false;
	let index = 0;
	while (index < chat.content.length) {
		const message = chat.content[index];
		if (!isLegacyPersonalityIntro(message)) {
			index++;
			continue;
		}

		let end = index + 1;
		let personalityId: string | undefined = message.personalityid;
		while (end < chat.content.length) {
			const current = chat.content[end];
			if (!current.hidden || isPersonalityMarker(current)) {
				break;
			}
			if (!personalityId && current.personalityid) {
				personalityId = current.personalityid;
			}
			end++;
		}

		if (!personalityId) {
			const nextMessage = chat.content[index + 1];
			if (nextMessage?.personalityid) {
				personalityId = nextMessage.personalityid;
			}
		}

		if (!personalityId) {
			index = end;
			continue;
		}

		removeMessagesFromDom(index, end);
		chat.content.splice(index, end - index);

		const markerMessage = createPersonalityMarkerMessage(personalityId);
		chat.content.splice(index, 0, markerMessage);
		await insertHiddenMessageIntoDom(markerMessage, index);
		index++;

		mutated = true;
	}
	return mutated;
}

async function backfillMissingPersonalityMarkers(chat: Chat): Promise<boolean> {
	let mutated = false;
	let activePersonalityId: string | undefined;
	const content = chat.content;

	for (let index = 0; index < content.length; index++) {
		const message = content[index];

		if (isPersonalityMarker(message)) {
			activePersonalityId = getPersonalityMarkerInfo(message)?.personalityId;
			continue;
		}

		if (message.hidden) continue;

		const personaId = message.personalityid;
		if (!personaId) continue;
		if (personaId === activePersonalityId) continue;

		let insertionIndex = index;
		for (let cursor = index - 1; cursor >= 0; cursor--) {
			const candidate = content[cursor];
			if (isPersonalityMarker(candidate)) {
				insertionIndex = cursor;
				break;
			}
			if (candidate.hidden) continue;
			if (candidate.role === "user") {
				insertionIndex = cursor;
			}
			break;
		}

		const markerMessage = createPersonalityMarkerMessage(personaId);
		content.splice(insertionIndex, 0, markerMessage);
		await insertHiddenMessageIntoDom(markerMessage, insertionIndex);
		activePersonalityId = personaId;
		mutated = true;
		if (insertionIndex <= index) {
			index++;
		}
	}

	return mutated;
}

async function ensurePersonalityMarker(chat: Chat, personalityId: string): Promise<boolean> {
	const content = chat.content;
	for (let i = content.length - 1; i >= 0; i--) {
		if (!isPersonalityMarker(content[i])) continue;
		const info = getPersonalityMarkerInfo(content[i]);
		if (info?.personalityId === personalityId) {
			return false;
		}
	}

	const markerMessage = createPersonalityMarkerMessage(personalityId);
	content.push(markerMessage);
	await insertHiddenMessageIntoDom(markerMessage, content.length - 1);
	return true;
}

function removeMessagesFromDom(startIndex: number, endIndex: number): void {
	const container = document.querySelector<HTMLDivElement>(".message-container");
	if (!container) return;
	for (let idx = endIndex - 1; idx >= startIndex; idx--) {
		const node = container.children[idx];
		if (node) node.remove();
	}
}

async function insertHiddenMessageIntoDom(message: Message, index: number): Promise<void> {
	const container = document.querySelector<HTMLDivElement>(".message-container");
	if (!container) return;
	const element = await messageElement(message, index);
	const referenceNode = container.children[index] ?? null;
	container.insertBefore(element, referenceNode);
}

export async function constructGeminiChatHistoryFromLocalChat(
	currentChat: Chat,
	selectedPersonality: DbPersonality,
	options?: { enforceThoughtSignatures?: boolean }
): Promise<GeminiHistoryBuildResult> {
	const history: Content[] = [];
	const pinnedHistoryIndices: number[] = [];
	const shouldEnforceThoughtSignatures = options?.enforceThoughtSignatures === true;

	const migrated = await migrateLegacyPersonalityMarkers(currentChat);
	const backfilled = await backfillMissingPersonalityMarkers(currentChat);
	const markerEnsured = await ensurePersonalityMarker(currentChat, selectedPersonality.id);
	if (migrated || backfilled || markerEnsured) {
		await chatsService.saveChat(currentChat as any);
	}

	const lastImageIndex = findLastGeneratedImageIndex(currentChat.content);
	const lastAttachmentIndex = findLastAttachmentIndex(currentChat.content);

	for (let index = 0; index < currentChat.content.length; index++) {
		const dbMessage = currentChat.content[index];

		if (isPersonalityMarker(dbMessage)) {
			const markerInfo = getPersonalityMarkerInfo(dbMessage);
			if (!markerInfo) continue;
			if (markerInfo.personalityId === NARRATOR_PERSONALITY_ID) continue;

			let persona: DbPersonality | undefined;
			if (markerInfo.personalityId === selectedPersonality.id) {
				persona = selectedPersonality;
			} else {
				const fetched = await personalityService.get(markerInfo.personalityId);
				if (fetched) {
					persona = { id: markerInfo.personalityId, ...fetched } as DbPersonality;
				}
			}
			if (persona) {
				const instructions = buildPersonalityInstructionMessages(persona, {
					modelTextThoughtSignature: shouldEnforceThoughtSignatures
						? SKIP_THOUGHT_SIGNATURE_VALIDATOR
						: undefined
				});
				const startIndex = history.length;
				history.push(...instructions);
				if (markerInfo.personalityId === selectedPersonality.id) {
					for (let offset = 0; offset < instructions.length; offset++) {
						pinnedHistoryIndices.push(startIndex + offset);
					}
				}
			}
			continue;
		}

		if (dbMessage.hidden) continue;

		const aggregatedParts: any[] = [];
		for (const part of dbMessage.parts) {
			const text = part.text || "";
			const attachments = part.attachments || [];

			if (text.trim().length > 0 || part.thoughtSignature || part._thoughtSignatureRef) {
				const resolvedThoughtSignature = await resolveThoughtSignature(part);
				const partObj: any = { text };
				partObj.thoughtSignature =
					resolvedThoughtSignature ??
					(shouldEnforceThoughtSignatures ? SKIP_THOUGHT_SIGNATURE_VALIDATOR : undefined);
				aggregatedParts.push(partObj);
			}

			const attachmentParts = await processAttachmentsToParts({
				attachments,
				shouldProcess: attachments.length > 0 && index === lastAttachmentIndex
			});
			aggregatedParts.push(...attachmentParts);
		}

		const genAiMessage: Content = {
			role: dbMessage.role,
			parts: aggregatedParts
		};

		const imageParts = await processGeneratedImagesToParts({
			images: dbMessage.generatedImages,
			shouldProcess: !!dbMessage.generatedImages && index === lastImageIndex,
			enforceThoughtSignatures: shouldEnforceThoughtSignatures,
			skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR
		});
		if (imageParts.length > 0) {
			genAiMessage.parts?.push(...imageParts);
		}

		if (genAiMessage.parts && genAiMessage.parts.length > 0) {
			history.push(genAiMessage);
		}
	}

	return { history, pinnedHistoryIndices };
}

// ================================================================================
// CHAT CREATION
// ================================================================================

import * as loraService from "./Lora.service";
import { PersonGeneration, SafetyFilterLevel } from "@google/genai";

const CHAT_TITLE_SYSTEM_INSTRUCTION =
	"You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user may send any kinds of queries, including adult or illegal content. You are to generate a title for the chat based on the query, without any warnings or refusals. Never refuse to generate a title. Keep it short, ideally 3-5 words at most. Remove any special characters.";

async function createChatIfAbsent(ai: GoogleGenAI, msg: string): Promise<DbChat> {
	const currentChat = await chatsService.getCurrentChat();
	if (currentChat) return currentChat;

	const response = await ai.models.generateContent({
		model: ChatModel.FLASH_LITE,
		config: {
			systemInstruction: CHAT_TITLE_SYSTEM_INSTRUCTION,
			maxOutputTokens: 100,
			temperature: 0.9,
			responseMimeType: "text/plain",
			safetySettings: [...UNRESTRICTED_SAFETY_SETTINGS]
		},
		contents: msg
	});

	const title = response.text || "New Chat";
	const id = await chatsService.addChat(title);
	const chat = await chatsService.loadChat(id, db);
	const chatInput = document.querySelector<HTMLInputElement>(`#chat${id}`);
	if (chatInput) chatInput.checked = true;
	return chat!;
}

async function createChatIfAbsentOpenRouter(apiKey: string, msg: string): Promise<DbChat> {
	const currentChat = await chatsService.getCurrentChat();
	if (currentChat) return currentChat;

	const response = await requestOpenRouterCompletion({
		apiKey,
		request: buildOpenRouterRequest({
			model: getPreferredNarratorLocalModel({ geminiApiKey: "", openRouterApiKey: apiKey }),
			messages: [
				{ role: "system", content: CHAT_TITLE_SYSTEM_INSTRUCTION },
				{ role: "user", content: msg }
			],
			stream: false,
			maxTokens: 100,
			temperature: 0.9,
			enableThinking: false,
			thinkingBudget: 0,
			isInternetSearchEnabled: false
		})
	});

	const title = response.text || "New Chat";
	const id = await chatsService.addChat(title);
	const chat = await chatsService.loadChat(id, db);
	const chatInput = document.querySelector<HTMLInputElement>(`#chat${id}`);
	if (chatInput) chatInput.checked = true;
	return chat!;
}

async function createChatIfAbsentLocal(
	settings: ReturnType<typeof settingsService.getSettings>,
	msg: string
): Promise<DbChat> {
	const currentChat = await chatsService.getCurrentChat();
	if (currentChat) return currentChat;

	if ((settings.geminiApiKey || "").trim()) {
		return await createChatIfAbsent(new GoogleGenAI({ apiKey: settings.geminiApiKey }), msg);
	}

	if ((settings.openRouterApiKey || "").trim()) {
		return await createChatIfAbsentOpenRouter(settings.openRouterApiKey, msg);
	}

	throw new Error("No local API key available for chat creation.");
}

async function createChatIfAbsentPremium(userMessage: string): Promise<DbChat> {
	const currentChat = await chatsService.getCurrentChat();
	if (currentChat) return currentChat;

	const payloadSettings: PremiumEndpoint.RequestSettings = {
		model: ChatModel.FLASH_LITE,
		streamResponses: false,
		generate: true,
		systemInstruction: CHAT_TITLE_SYSTEM_INSTRUCTION,
		maxOutputTokens: 100,
		temperature: 0.9,
		responseMimeType: "text/plain",
		safetySettings: [...UNRESTRICTED_SAFETY_SETTINGS]
	};

	const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			...(await getAuthHeaders()),
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			message: `${CHAT_TITLE_SYSTEM_INSTRUCTION} The user's message is: ${userMessage}`,
			settings: payloadSettings,
			history: []
		})
	});

	if (!response.ok) {
		throw new Error(`Edge function error: ${response.status}`);
	}

	const json = await response.json();
	const title = json.text || "New Chat";
	const id = await chatsService.addChat(title);
	const chat = await chatsService.loadChat(id, db);
	const chatInput = document.querySelector<HTMLInputElement>(`#chat${id}`);
	if (chatInput) chatInput.checked = true;
	return chat!;
}

// ================================================================================
// SEND - PUBLIC API
// ================================================================================

/**
 * Send a message in normal chat mode.
 */
export async function send(msg: string, options: SendOptions = {}): Promise<HTMLElement | undefined> {
	const targetChatId = options.targetChatId ?? chatsService.getCurrentChatId();
	const sendLockKey = getSendLockKey(targetChatId);
	let releaseSendLockKey: string | null = targetChatId ?? null;
	if (isSendInFlight(targetChatId) || getIsGenerating(targetChatId)) return;
	setSendInFlight(true, sendLockKey);

	try {
		const validation = await performEarlyValidation(msg, options);
		if (!validation.canProceed) return;

		// Route to group chat handler if applicable
		if (validation.isGroupChat) {
			if (isImageModeActive() || isImageEditingActive()) {
				warn({ title: "Not supported", text: "Image mode is not supported in group chats yet." });
				return;
			}

			const existingChat = options.targetChatId
				? await getChatForWrite(options.targetChatId)
				: await chatsService.getCurrentChat();
			const mode = (existingChat as any)?.groupChat?.mode as "rpg" | "dynamic" | undefined;

			if (mode === "dynamic") {
				const dynamicArgs: DynamicInputArgs = {
					msg,
					attachmentFiles: validation.attachmentFiles,
					isInternetSearchEnabled: validation.isInternetSearchEnabled,
					isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
					shouldEnforceThoughtSignaturesInHistory: validation.shouldEnforceThoughtSignaturesInHistory
				};
				return await sendGroupChatDynamic(dynamicArgs);
			}

			return await sendGroupChatRpg({
				msg,
				attachmentFiles: validation.attachmentFiles,
				isInternetSearchEnabled: validation.isInternetSearchEnabled,
				isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
				skipTurn: false,
				targetChatId: options.targetChatId
			});
		}

		const ctx = await buildSendContext(msg, validation, options);
		if (!ctx) return;
		releaseSendLockKey = ctx.chatId;

		// Route to appropriate handler
		if (isImageEditingActive()) {
			return await handleImageEditing(ctx);
		}
		if (isImageModeActive()) {
			return await handleImageGeneration(ctx);
		}
		return await handleTextChat(ctx);
	} finally {
		setSendInFlight(false, sendLockKey);
		if (releaseSendLockKey) {
			setSendInFlight(false, releaseSendLockKey);
		}
	}
}

/**
 * Send user turn in RPG group chat mode.
 */
export async function sendRpgTurn(msg?: string): Promise<HTMLElement | undefined> {
	const currentChatId = chatsService.getCurrentChatId();
	const sendLockKey = getSendLockKey(currentChatId);
	if (isSendInFlight(currentChatId) || getIsGenerating(currentChatId)) return;
	setSendInFlight(true, sendLockKey);

	try {
		const validation = await performEarlyValidation(msg || "");
		if (!validation.canProceed) return;

		const existingChat = await chatsService.getCurrentChat();
		const mode = (existingChat as any)?.groupChat?.mode;
		if (mode !== "rpg") {
			warn({ title: "Not in group chat", text: "This function is only available in RPG group chats." });
			return;
		}

		return await sendGroupChatRpg({
			msg: msg || "",
			attachmentFiles: validation.attachmentFiles,
			isInternetSearchEnabled: validation.isInternetSearchEnabled,
			isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
			skipTurn: false,
			targetChatId: currentChatId ?? undefined
		});
	} finally {
		setSendInFlight(false, sendLockKey);
		if (currentChatId) {
			setSendInFlight(false, currentChatId);
		}
	}
}

/**
 * Skip user turn in RPG group chat mode.
 */
export async function skipRpgTurn(): Promise<HTMLElement | undefined> {
	const currentChatId = chatsService.getCurrentChatId();
	const sendLockKey = getSendLockKey(currentChatId);
	if (isSendInFlight(currentChatId) || getIsGenerating(currentChatId)) return;
	setSendInFlight(true, sendLockKey);

	try {
		const validation = await performEarlyValidation("");
		if (!validation.canProceed) return;

		const existingChat = await chatsService.getCurrentChat();
		const mode = (existingChat as any)?.groupChat?.mode;
		if (mode !== "rpg") {
			warn({ title: "Not in group chat", text: "This function is only available in RPG group chats." });
			return;
		}

		return await sendGroupChatRpg({
			msg: "",
			attachmentFiles: validation.attachmentFiles,
			isInternetSearchEnabled: validation.isInternetSearchEnabled,
			isPremiumEndpointPreferred: validation.isPremiumEndpointPreferred,
			skipTurn: true,
			targetChatId: currentChatId ?? undefined
		});
	} finally {
		setSendInFlight(false, sendLockKey);
		if (currentChatId) {
			setSendInFlight(false, currentChatId);
		}
	}
}

// ================================================================================
// REGENERATE
// ================================================================================

export async function regenerate(modelMessageIndex: number): Promise<void> {
	const targetChatId = chatsService.getCurrentChatId();
	if (!targetChatId) {
		console.error("No chat found");
		return;
	}

	await chatsService.waitForPendingWrites(targetChatId);
	await ensureChatFullyHydratedForWrite(targetChatId);
	const chat = await getChatForWrite(targetChatId);
	if (!chat) {
		console.error("No chat found");
		return;
	}

	if (chat.groupChat) {
		const deletionStart = modelMessageIndex;
		if (deletionStart < 0 || deletionStart >= chat.content.length) {
			console.error("Invalid message index for regeneration");
			return;
		}

		chat.content = chat.content.slice(0, deletionStart);
		pruneTrailingPersonalityMarkers(chat);
		await chatsService.saveChat(chat as any);

		const container = isViewingChat(targetChatId)
			? document.querySelector<HTMLDivElement>(".message-container")
			: null;
		if (container) {
			for (const node of Array.from(container.querySelectorAll<HTMLElement>("[data-chat-index]"))) {
				const indexAttr = node.getAttribute("data-chat-index");
				if (!indexAttr) continue;
				const chatIndex = Number.parseInt(indexAttr, 10);
				if (!Number.isFinite(chatIndex)) continue;
				if (chatIndex >= deletionStart) node.remove();
			}

			for (const block of Array.from(container.querySelectorAll<HTMLDivElement>(".round-block"))) {
				const hasAnyMessages = !!block.querySelector<HTMLElement>("[data-chat-index]");
				if (!hasAnyMessages) block.remove();
			}
		}

		try {
			if (chat.groupChat?.mode === "rpg") {
				await send("", { targetChatId });
			} else {
				warn({ title: "Not supported", text: "Regeneration for dynamic group chats is not supported yet." });
			}
		} catch (error: any) {
			console.error(error);
			danger({ title: "Error regenerating message", text: JSON.stringify(error.message || error) });
			helpers.messageContainerScrollToBottom(true);
		}
		return;
	}

	const modelMessage = chat.content[modelMessageIndex];
	const targetPersonalityId = modelMessage?.personalityid || getSelectedPersonalityId();
	const message = chat.content[modelMessageIndex - 1];
	if (!message) {
		console.error("No message found");
		return;
	}

	const userIndex = modelMessageIndex - 1;
	let deletionStart = userIndex;
	for (let i = userIndex - 1; i >= 0; i--) {
		const candidate = chat.content[i];
		if (!candidate.hidden) break;
		if (candidate.role === "model" && isPersonalityMarker(candidate)) break;
		deletionStart = i;
	}

	chat.content = chat.content.slice(0, deletionStart);
	pruneTrailingPersonalityMarkers(chat);
	await chatsService.saveChat(chat as any);

	const container = isViewingChat(targetChatId) ? document.querySelector<HTMLDivElement>(".message-container") : null;
	if (container) {
		const toRemove: Element[] = [];
		for (const child of Array.from(container.children)) {
			const indexAttr = child.getAttribute("data-chat-index");
			if (!indexAttr) continue;
			const chatIndex = Number.parseInt(indexAttr, 10);
			if (!Number.isFinite(chatIndex)) continue;
			if (chatIndex >= deletionStart) toRemove.push(child);
		}
		for (const node of toRemove) node.remove();
	}

	const attachments = cloneFilesToFileList(message.parts[0]?.attachments);

	try {
		await send(message.parts[0]?.text || "", {
			targetChatId,
			selectedPersonalityId: targetPersonalityId,
			attachmentFiles: attachments
		});
	} catch (error: any) {
		console.error(error);
		danger({ title: "Error regenerating message", text: JSON.stringify(error.message || error) });
		helpers.messageContainerScrollToBottom(true);
	}
}

export async function deleteRound(roundIndex: number): Promise<void> {
	const targetChatId = chatsService.getCurrentChatId();
	if (!targetChatId) return;

	await chatsService.waitForPendingWrites(targetChatId);
	await ensureChatFullyHydratedForWrite(targetChatId);
	const chat = await getChatForWrite(targetChatId);
	if (!chat) return;

	const beforeLen = chat.content.length;
	chat.content = (chat.content || []).filter((m) => m.roundIndex !== roundIndex);
	if (chat.content.length === beforeLen) return;

	pruneTrailingPersonalityMarkers(chat);
	await chatsService.saveChat(chat as any);
	if (isViewingChat(targetChatId)) {
		await chatsService.loadChat((chat as any).id, db);
	}
}

export async function regenerateRound(roundIndex: number): Promise<void> {
	const targetChatId = chatsService.getCurrentChatId();
	if (!targetChatId) return;

	await chatsService.waitForPendingWrites(targetChatId);
	await ensureChatFullyHydratedForWrite(targetChatId);
	const chat = await getChatForWrite(targetChatId);
	if (!chat) return;

	const startIndex = (chat.content || []).findIndex((m) => m.roundIndex === roundIndex);
	if (startIndex < 0) return;

	chat.content = chat.content.slice(0, startIndex);
	pruneTrailingPersonalityMarkers(chat);
	await chatsService.saveChat(chat as any);
	if (isViewingChat(targetChatId)) {
		await chatsService.loadChat((chat as any).id, db);
	}

	try {
		if (!settingsService.getSettings().rpgGroupChatsProgressAutomatically) {
			await send("", { targetChatId });
		}
	} catch (error: any) {
		console.error(error);
		danger({ title: "Error regenerating round", text: JSON.stringify(error.message || error) });
	}
}

// ================================================================================
// SEND INTERNALS - VALIDATION & CONTEXT
// ================================================================================

interface EarlyValidationSuccess {
	canProceed: true;
	settings: ReturnType<typeof settingsService.getSettings>;
	selectedPersonalityId: string;
	attachmentFiles: FileList;
	historyImageDataUri: string | null;
	isInternetSearchEnabled: boolean;
	isPremiumEndpointPreferred: boolean;
	isImagePremiumEndpointPreferred: boolean;
	isGroupChat: boolean;
	shouldUseSkipThoughtSignature: boolean;
	shouldEnforceThoughtSignaturesInHistory: boolean;
}

interface EarlyValidationFailure {
	canProceed: false;
}

type EarlyValidationResult = EarlyValidationSuccess | EarlyValidationFailure;

interface SendOptions {
	targetChatId?: string;
	selectedPersonalityId?: string;
	attachmentFiles?: FileList;
	historyImageDataUri?: string | null;
}

function isViewingChat(chatId: string): boolean {
	return chatsService.getCurrentChatId() === chatId;
}

async function performEarlyValidation(msg: string, options: SendOptions = {}): Promise<EarlyValidationResult> {
	await ensureChatFullyHydratedForWrite(options.targetChatId);
	const settings = settingsService.getSettings();
	const shouldUseSkipThoughtSignature = settings.model === ChatModel.NANO_BANANA;
	const shouldEnforceThoughtSignaturesInHistory = requiresThoughtSignaturesInHistory(settings.model);
	const selectedPersonalityId = options.selectedPersonalityId ?? getSelectedPersonalityId();
	const selectedPersonality = await personalityService.get(selectedPersonalityId);
	const isInternetSearchEnabled =
		document.querySelector<HTMLButtonElement>("#btn-internet")?.classList.contains("btn-toggled") ?? false;

	const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
	if (!attachmentsInput) {
		console.error("Missing #attachments input in the DOM");
		throw new Error("Missing DOM element");
	}

	const historyImageDataUri = options.historyImageDataUri ?? getCurrentHistoryImageDataUri();

	const attachmentFiles: FileList = options.attachmentFiles ?? cloneFilesToFileList(attachmentsInput.files);

	if (!options.attachmentFiles) {
		attachmentsInput.value = "";
		attachmentsInput.files = new DataTransfer().files;
		clearAttachmentPreviews();
	}

	if (!selectedPersonality) {
		return { canProceed: false };
	}

	const subscription = await supabaseService.getUserSubscription();
	const tier = await supabaseService.getSubscriptionTier(subscription);
	const hasSubscription = tier === "pro" || tier === "pro_plus" || tier === "max";
	const isPremiumEndpointPreferred = hasSubscription && shouldPreferPremiumEndpoint();
	const isImagePremiumEndpointPreferred = (await supabaseService.isImageGenerationAvailable()).type === "all";

	if (!isPremiumEndpointPreferred && !hasLocalApiKeyForModel(settings.model, settings)) {
		const providerName = isOpenRouterModel(settings.model) ? "OpenRouter" : "Gemini";
		warn({
			title: `${providerName} API Key Required`,
			text: `Please enter your ${providerName} API key in settings, switch to a model from a provider you already configured, or subscribe to Pro for unlimited access.`,
			actions: isOpenRouterModel(settings.model)
				? [
						{
							label: "Open API Settings",
							onClick(dismiss) {
								openApiKeySettings();
								dismiss();
							}
						}
					]
				: []
		});
		return { canProceed: false };
	}

	const existingChat = options.targetChatId
		? await getChatForWrite(options.targetChatId)
		: await chatsService.getCurrentChat();
	const groupMode = (existingChat as any)?.groupChat?.mode as "rpg" | "dynamic" | undefined;
	const isGroupChat = groupMode === "rpg" || groupMode === "dynamic";
	const allowsEmptyMessage = groupMode === "rpg";

	if (!msg && !allowsEmptyMessage && (attachmentFiles?.length ?? 0) === 0) {
		return { canProceed: false };
	}

	return {
		canProceed: true,
		settings,
		selectedPersonalityId,
		attachmentFiles,
		historyImageDataUri,
		isInternetSearchEnabled,
		isPremiumEndpointPreferred,
		isImagePremiumEndpointPreferred,
		isGroupChat,
		shouldUseSkipThoughtSignature,
		shouldEnforceThoughtSignaturesInHistory
	};
}

interface SendContext {
	chatId: string;
	userIndex: number;
	modelIndex: number;
	msg: string;
	userMessage: Message;
	modelPlaceholder: Message;
	userMessageElement: HTMLElement;
	responseElement: HTMLElement;
	selectedPersonalityId: string;
	settings: ReturnType<typeof settingsService.getSettings>;
	config: GenerateContentConfig;
	ai?: GoogleGenAI;
	chatHistory: Content[];
	pinnedHistoryIndices: number[];
	attachmentFiles: FileList;
	historyImageDataUri: string | null;
	isPremiumEndpointPreferred: boolean;
	isImagePremiumEndpointPreferred: boolean;
	shouldUseSkipThoughtSignature: boolean;
	abortController: AbortController;
	messageContent: Element;
	groundingRendered: Element;
	thinkingWrapper: HTMLElement | null;
	thinkingContentElm: HTMLElement | null;
	ensureThinkingElements: () => void;
}

async function buildSendContext(
	msg: string,
	validation: EarlyValidationSuccess,
	options: SendOptions = {}
): Promise<SendContext | null> {
	const {
		settings,
		selectedPersonalityId,
		attachmentFiles,
		historyImageDataUri,
		isInternetSearchEnabled,
		isPremiumEndpointPreferred,
		isImagePremiumEndpointPreferred,
		shouldUseSkipThoughtSignature,
		shouldEnforceThoughtSignaturesInHistory
	} = validation;

	const thinkingConfig = generateThinkingConfig(settings.model, settings.enableThinking, settings);
	const ai = isGeminiModel(settings.model)
		? new GoogleGenAI({ apiKey: getLocalApiKeyForModel(settings.model, settings) })
		: undefined;

	const config: GenerateContentConfig = {
		maxOutputTokens: parseInt(settings.maxTokens),
		temperature: modelSupportsTemperature(settings.model) ? parseInt(settings.temperature) / 100 : undefined,
		systemInstruction: await settingsService.getSystemPrompt("chat"),
		safetySettings: settings.safetySettings,
		responseMimeType: "text/plain",
		tools: isInternetSearchEnabled ? [{ googleSearch: {} }] : undefined,
		thinkingConfig: thinkingConfig,
		imageConfig: settings.model === ChatModel.NANO_BANANA_PRO ? { imageSize: "4K" } : undefined
	};

	const currentChat = options.targetChatId
		? await getChatForWrite(options.targetChatId)
		: isPremiumEndpointPreferred
			? await createChatIfAbsentPremium(msg)
			: await createChatIfAbsentLocal(settings, msg);

	if (!currentChat) {
		console.error("No current chat found");
		return null;
	}

	const chatId = currentChat.id;

	const selectedPersonality = await personalityService.get(selectedPersonalityId);
	const selectedPersonaForHistory = {
		id: selectedPersonalityId,
		dateAdded: Date.now(),
		lastModified: Date.now(),
		...selectedPersonality!
	};
	const { history: chatHistory, pinnedHistoryIndices } = await constructGeminiChatHistoryFromLocalChat(
		currentChat,
		selectedPersonaForHistory,
		{ enforceThoughtSignatures: shouldEnforceThoughtSignaturesInHistory }
	);

	const userMessage: Message = {
		role: "user",
		parts: [{ text: msg, attachments: attachmentFiles }],
		debugInfo: buildUserMessageDebugInfo({
			settings,
			isPremiumEndpointPreferred,
			isImagePremiumEndpointPreferred
		})
	};

	const pendingOriginModel = getPendingOriginModel(settings);
	const modelPlaceholder = createModelPlaceholderMessage(selectedPersonalityId, "", undefined, pendingOriginModel);
	const persistedIndices = await persistMessagesToChat(chatId, [userMessage, modelPlaceholder]);
	if (!persistedIndices) {
		console.error("Failed to persist pending messages");
		return null;
	}

	moveSendInFlight(NEW_CHAT_SEND_LOCK_KEY, chatId);
	const abortController = startGeneration(chatId);
	const userMessageElement = isViewingChat(chatId)
		? await insertMessage(userMessage, persistedIndices.startIndex)
		: await messageElement(userMessage, persistedIndices.startIndex);
	if (isViewingChat(chatId)) {
		hljs.highlightAll();
		helpers.messageContainerScrollToBottom(true);
	}

	const responseElement = isViewingChat(chatId)
		? await insertMessage(modelPlaceholder, persistedIndices.startIndex + 1)
		: await messageElement(modelPlaceholder, persistedIndices.startIndex + 1);
	if (isViewingChat(chatId)) {
		helpers.messageContainerScrollToBottom(true);
	}

	const ctx: SendContext = {
		chatId,
		userIndex: persistedIndices.startIndex,
		modelIndex: persistedIndices.startIndex + 1,
		msg,
		userMessage,
		modelPlaceholder,
		userMessageElement,
		responseElement,
		selectedPersonalityId,
		settings,
		config,
		ai,
		chatHistory,
		pinnedHistoryIndices,
		attachmentFiles,
		historyImageDataUri,
		isPremiumEndpointPreferred,
		isImagePremiumEndpointPreferred,
		shouldUseSkipThoughtSignature,
		abortController,
		messageContent: responseElement.querySelector(".message-text .message-text-content")!,
		groundingRendered: responseElement.querySelector(".message-grounding-rendered-content")!,
		thinkingWrapper: responseElement.querySelector<HTMLElement>(".message-thinking"),
		thinkingContentElm: responseElement.querySelector<HTMLElement>(".thinking-content"),
		ensureThinkingElements: () => {}
	};

	ctx.ensureThinkingElements = () => {
		rebindResponseElement(ctx);
		ctx.thinkingWrapper ??= ctx.responseElement.querySelector<HTMLElement>(".message-thinking");
		ctx.thinkingContentElm ??= ctx.responseElement.querySelector<HTMLElement>(".thinking-content");

		if (!ctx.thinkingWrapper || !ctx.thinkingContentElm) {
			const header = ctx.responseElement.querySelector(".message-header");
			const { wrapper, content } = createThinkingUiElements();
			ctx.thinkingWrapper = wrapper;
			ctx.thinkingContentElm = content;
			header?.insertAdjacentElement("afterend", ctx.thinkingWrapper);
		}
	};

	return ctx;
}

// ================================================================================
// SEND HANDLERS - TEXT CHAT
// ================================================================================

interface TextChatResponseState {
	thinking: string;
	rawText: string;
	textSignature: string | undefined;
	finishReason: unknown;
	groundingContent: string;
	generatedImages: GeneratedImage[];
}

async function handleTextChat(ctx: SendContext): Promise<HTMLElement | undefined> {
	const state: TextChatResponseState = {
		thinking: "",
		rawText: "",
		textSignature: undefined,
		finishReason: undefined,
		groundingContent: "",
		generatedImages: []
	};

	const ensureTextSignature = () => {
		if (ctx.shouldUseSkipThoughtSignature && !state.textSignature && state.rawText.trim().length > 0) {
			state.textSignature = SKIP_THOUGHT_SIGNATURE_VALIDATOR;
		}
	};

	if (ctx.settings.streamResponses) {
		activeStreamingSessionByChatId.set(ctx.chatId, {
			render: async () => {
				await renderStreamingTextState(ctx, state);
			}
		});
	}

	try {
		if (ctx.isPremiumEndpointPreferred) {
			await handleTextChatPremium(ctx, state);
		} else if (isOpenRouterModel(ctx.settings.model)) {
			await handleTextChatOpenRouter(ctx, state);
		} else {
			await handleTextChatLocalSdk(ctx, state);
		}
	} catch (err: any) {
		activeStreamingSessionByChatId.delete(ctx.chatId);
		if (isAbortError(err, ctx.abortController)) {
			return await handleAbort(ctx, state, ensureTextSignature);
		}
		return await handleError(ctx, err);
	}

	activeStreamingSessionByChatId.delete(ctx.chatId);

	if (
		state.finishReason === FinishReason.PROHIBITED_CONTENT ||
		state.finishReason === FinishReason.OTHER ||
		state.finishReason === BlockedReason.PROHIBITED_CONTENT
	) {
		showGeminiProhibitedContentToast({ finishReason: state.finishReason });
	}

	return await finalizeTextChatSuccess(ctx, state, ensureTextSignature);
}

async function handleAbort(
	ctx: SendContext,
	state: TextChatResponseState,
	ensureTextSignature: () => void
): Promise<HTMLElement> {
	ensureTextSignature();
	const modelMessage = createInterruptedModelMessage({
		personalityId: ctx.selectedPersonalityId,
		text: state.rawText,
		textSignature: state.textSignature,
		thinking: state.thinking,
		groundingContent: state.groundingContent,
		generatedImages: state.generatedImages,
		originModel: ctx.settings.model
	});
	await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
	await finalizeResponseElement({
		chatId: ctx.chatId,
		messageIndex: ctx.modelIndex,
		responseElement: ctx.responseElement,
		message: modelMessage
	});
	ctx.responseElement.querySelector(".message-text")?.classList.remove("is-loading");
	endGeneration(ctx.chatId);
	return ctx.userMessageElement;
}

async function handleError(ctx: SendContext, error: unknown): Promise<never> {
	console.error(error);
	const modelMessage = createModelErrorMessage(ctx.selectedPersonalityId, ctx.settings.model);
	await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
	await finalizeResponseElement({
		chatId: ctx.chatId,
		messageIndex: ctx.modelIndex,
		responseElement: ctx.responseElement,
		message: modelMessage
	});
	endGeneration(ctx.chatId);
	throw error;
}

async function finalizeTextChatSuccess(
	ctx: SendContext,
	state: TextChatResponseState,
	ensureTextSignature: () => void
): Promise<HTMLElement> {
	ensureTextSignature();

	const modelMessage: Message = {
		role: "model",
		personalityid: ctx.selectedPersonalityId,
		parts:
			state.rawText.trim().length > 0 || state.textSignature
				? [{ text: state.rawText, thoughtSignature: state.textSignature }]
				: [],
		groundingContent: state.groundingContent || "",
		thinking: state.thinking || undefined,
		generatedImages: state.generatedImages.length > 0 ? state.generatedImages : undefined,
		originModel: ctx.settings.model
	};

	await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
	await finalizeResponseElement({
		chatId: ctx.chatId,
		messageIndex: ctx.modelIndex,
		responseElement: ctx.responseElement,
		message: modelMessage,
		scroll: false
	});
	hljs.highlightAll();
	helpers.messageContainerScrollToBottom();
	endGeneration(ctx.chatId);

	return ctx.userMessageElement;
}

async function handleTextChatPremium(ctx: SendContext, state: TextChatResponseState): Promise<void> {
	const payloadSettings: PremiumEndpoint.RequestSettings = {
		model: ctx.settings.model,
		streamResponses: ctx.settings.streamResponses,
		...ctx.config
	};

	const hasFiles = (ctx.attachmentFiles?.length ?? 0) > 0;
	const endpoint = `${SUPABASE_URL}/functions/v1/handle-pro-request`;

	let res: Response;
	if (hasFiles) {
		const form = new FormData();
		form.append("message", ctx.msg);
		form.append("settings", JSON.stringify(payloadSettings));
		form.append("history", JSON.stringify(ctx.chatHistory));
		form.append("pinnedHistoryIndices", JSON.stringify(ctx.pinnedHistoryIndices));
		for (const f of Array.from(ctx.attachmentFiles || [])) {
			form.append("files", f);
		}
		res = await fetch(endpoint, {
			method: "POST",
			headers: await getAuthHeaders(),
			body: form,
			signal: ctx.abortController?.signal
		});
	} else {
		res = await fetch(endpoint, {
			method: "POST",
			headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
			body: JSON.stringify({
				message: ctx.msg,
				settings: payloadSettings,
				history: ctx.chatHistory,
				pinnedHistoryIndices: ctx.pinnedHistoryIndices
			}),
			signal: ctx.abortController?.signal
		});
	}

	if (!res.ok) {
		let responseError = `Edge function error: ${res.status}`;
		try {
			const errorJson = await res.json();
			setUserMessageRequestSlug(ctx.userMessage, errorJson?.requestId);
			await appendRequestSlugToStoredMessage({
				chatId: ctx.chatId,
				messageIndex: ctx.userIndex,
				requestSlug: errorJson?.requestId
			});
			if (errorJson?.error) {
				responseError = `Edge function error: ${res.status} - ${String(errorJson.error)}`;
			}
		} catch {
			// noop
		}
		throw new Error(responseError);
	}

	if (ctx.config.thinkingConfig?.includeThoughts) {
		ctx.ensureThinkingElements();
	}

	if (ctx.settings.streamResponses) {
		const result = await processPremiumEndpointSse({
			res,
			process: {
				signal: ctx.abortController?.signal ?? undefined,
				abortMode: "return",
				includeThoughts: !!ctx.config.thinkingConfig?.includeThoughts,
				useSkipThoughtSignature: ctx.shouldUseSkipThoughtSignature,
				skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
				throwOnBlocked: () => false,
				onBlocked: () => {
					throw new Error("Blocked");
				},
				callbacks: {
					onRequestId: (requestId) =>
						void (async () => {
							setUserMessageRequestSlug(ctx.userMessage, requestId);
							await appendRequestSlugToStoredMessage({
								chatId: ctx.chatId,
								messageIndex: ctx.userIndex,
								requestSlug: requestId
							});
						})(),
					onFallbackStart: () => {
						state.finishReason = undefined;
						state.groundingContent = "";
						state.generatedImages = [];
						ctx.groundingRendered.innerHTML = "";
					},
					onText: async ({ text }) => {
						state.rawText = text;
						await renderStreamingTextState(ctx, state);
					},
					onThinking: async ({ thinking: thinkingSoFar }) => {
						state.thinking = thinkingSoFar;
						await renderStreamingTextState(ctx, state);
					},
					onGrounding: ({ renderedContent }) => {
						state.groundingContent = renderedContent;
						void renderStreamingTextState(ctx, state);
					},
					onImage: (img) => {
						state.generatedImages.push(img);
					}
				}
			}
		});

		state.finishReason = result.finishReason as any;
		setUserMessageRequestSlug(ctx.userMessage, result.requestId);
		await appendRequestSlugToStoredMessage({
			chatId: ctx.chatId,
			messageIndex: ctx.userIndex,
			requestSlug: result.requestId
		});
		state.thinking = result.thinking;
		state.rawText = result.text;
		state.textSignature = result.textSignature;
		state.groundingContent = result.groundingContent;
		state.generatedImages = result.images;

		if (result.wasAborted) {
			throwAbortError();
		}
	} else {
		const json = await res.json();
		setUserMessageRequestSlug(ctx.userMessage, json?.requestId);
		await appendRequestSlugToStoredMessage({
			chatId: ctx.chatId,
			messageIndex: ctx.userIndex,
			requestSlug: json?.requestId
		});
		if (json) {
			if (json.decensored) {
				state.thinking += json.reasoning ?? "";
				state.rawText += json.text;
				if (ctx.thinkingContentElm) ctx.thinkingContentElm.textContent = state.thinking;
				state.finishReason = json.finishReason;
			} else {
				state.finishReason = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason;
				for (const part of json.candidates?.[0]?.content?.parts || []) {
					if (part.thought && part.text) {
						// Never allow thought content to spill into the main answer.
						state.thinking += part.text;
						if (ctx.config.thinkingConfig?.includeThoughts) {
							ctx.ensureThinkingElements();
							if (ctx.thinkingContentElm) ctx.thinkingContentElm.textContent = state.thinking;
						}
					} else if (part.text) {
						if (!state.textSignature) {
							state.textSignature =
								part.thoughtSignature ??
								(ctx.shouldUseSkipThoughtSignature ? SKIP_THOUGHT_SIGNATURE_VALIDATOR : undefined);
						}
						state.rawText += part.text;
					} else if (part.inlineData) {
						state.generatedImages.push({
							mimeType: part.inlineData.mimeType || "image/png",
							base64: part.inlineData.data || "",
							thoughtSignature:
								part.thoughtSignature ??
								(ctx.shouldUseSkipThoughtSignature ? SKIP_THOUGHT_SIGNATURE_VALIDATOR : undefined),
							thought: part.thought
						});
					}
				}
				if (json.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) {
					state.groundingContent = json.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
					renderGroundingToShadowDom(ctx.groundingRendered, state.groundingContent);
				}
			}
		}

		if (ctx.config.thinkingConfig?.includeThoughts && state.thinking.trim()) {
			ctx.ensureThinkingElements();
			if (ctx.thinkingContentElm) ctx.thinkingContentElm.textContent = state.thinking;
		}
		ctx.responseElement.querySelector(".message-text")?.classList.remove("is-loading");
		ctx.messageContent.innerHTML = await parseMarkdownToHtml(state.rawText);
	}
}

async function handleTextChatOpenRouter(ctx: SendContext, state: TextChatResponseState): Promise<void> {
	const systemInstructionText = (
		(ctx.config.systemInstruction as Content | undefined)?.parts?.[0]?.text || ""
	).toString();
	const messages = await buildOpenRouterRequestMessages({
		history: ctx.chatHistory,
		systemInstructionText,
		userText: ctx.msg,
		attachments: ctx.attachmentFiles
	});

	const request = buildOpenRouterRequest({
		model: ctx.settings.model,
		messages,
		stream: ctx.settings.streamResponses,
		maxTokens: parseInt(ctx.settings.maxTokens),
		temperature: parseInt(ctx.settings.temperature) / 100,
		enableThinking: ctx.settings.enableThinking,
		thinkingBudget: ctx.settings.thinkingBudget,
		isInternetSearchEnabled:
			document.querySelector<HTMLButtonElement>("#btn-internet")?.classList.contains("btn-toggled") ?? false
	});

	if (request.reasoning && modelSupportsThinking(ctx.settings.model) && ctx.settings.enableThinking) {
		ctx.ensureThinkingElements();
	}

	const result = await requestOpenRouterCompletion({
		apiKey: getLocalApiKeyForModel(ctx.settings.model, ctx.settings),
		request,
		signal: ctx.abortController?.signal,
		onText: async ({ text }) => {
			state.rawText = text;
			await renderStreamingTextState(ctx, state);
		},
		onThinking: async ({ thinking }) => {
			state.thinking = thinking;
			await renderStreamingTextState(ctx, state);
		}
	});

	state.rawText = result.text;
	state.thinking = result.thinking;
	state.finishReason = result.finishReason;
}

async function handleTextChatLocalSdk(ctx: SendContext, state: TextChatResponseState): Promise<void> {
	const ai = ctx.ai;
	if (!ai) {
		throw new Error("Gemini client is not available for the selected model.");
	}

	const chat = ai.chats.create({
		model: ctx.settings.model,
		history: ctx.chatHistory,
		config: ctx.config
	});

	const uploadedFiles = await Promise.all(
		Array.from(ctx.attachmentFiles || []).map(async (file) => {
			return await ai.files.upload({ file });
		})
	);

	const messagePayload = {
		message: [{ text: ctx.msg }, ...uploadedFiles.map((file) => createPartFromUri(file.uri!, file.mimeType!))]
	};

	if (ctx.config.thinkingConfig?.includeThoughts) {
		ctx.ensureThinkingElements();
	}

	if (ctx.settings.streamResponses) {
		const result = await processGeminiLocalSdkStream({
			stream: await chat.sendMessageStream(messagePayload),
			process: {
				includeThoughts: !!ctx.config.thinkingConfig?.includeThoughts,
				useSkipThoughtSignature: ctx.shouldUseSkipThoughtSignature,
				skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
				signal: ctx.abortController?.signal ?? undefined,
				abortMode: "return",
				throwOnBlocked: false,
				callbacks: {
					onThinking: ({ thinking: thinkingSoFar }) => {
						state.thinking = thinkingSoFar;
						void renderStreamingTextState(ctx, state);
					},
					onText: async ({ text }) => {
						state.rawText = text;
						await renderStreamingTextState(ctx, state);
					},
					onGrounding: ({ renderedContent }) => {
						state.groundingContent = renderedContent;
						void renderStreamingTextState(ctx, state);
					}
				}
			}
		});

		state.finishReason = result.finishReason as any;
		state.thinking = result.thinking;
		state.rawText = result.text;
		state.textSignature = result.textSignature;
		state.groundingContent = result.groundingContent;
		state.generatedImages = result.images;

		if (result.wasAborted) {
			throwAbortError();
		}
	} else {
		const response = await chat.sendMessage(messagePayload);
		const result = await processGeminiLocalSdkResponse({
			response,
			process: {
				includeThoughts: !!ctx.config.thinkingConfig?.includeThoughts,
				useSkipThoughtSignature: ctx.shouldUseSkipThoughtSignature,
				skipThoughtSignatureValidator: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
				signal: ctx.abortController?.signal ?? undefined,
				abortMode: "return",
				throwOnBlocked: false
			}
		});

		state.finishReason = result.finishReason as any;
		state.thinking = result.thinking;
		state.rawText = result.text;
		state.textSignature = result.textSignature;
		state.groundingContent = result.groundingContent;
		state.generatedImages = result.images;

		if (ctx.config.thinkingConfig?.includeThoughts && ctx.thinkingContentElm) {
			ctx.thinkingContentElm.textContent = state.thinking;
		}

		renderGroundingToShadowDom(ctx.groundingRendered, state.groundingContent);
	}
}

// ================================================================================
// SEND HANDLERS - IMAGE GENERATION
// ================================================================================

async function handleImageGeneration(ctx: SendContext): Promise<HTMLElement | undefined> {
	const imageGenerationModel = ctx.settings.imageModel || "imagen-4.0-ultra-generate-001";
	const payload = {
		model: imageGenerationModel,
		prompt: ctx.msg,
		config: {
			numberOfImages: 1,
			outputMimeType: "image/jpeg",
			personGeneration: PersonGeneration.ALLOW_ADULT,
			aspectRatio: "1:1",
			safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE
		},
		loras: loraService.getLoraState()
	};

	let b64: string;
	let returnedMimeType: string;

	if (ctx.isImagePremiumEndpointPreferred) {
		const endpoint = `${SUPABASE_URL}/functions/v1/handle-max-request`;
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: ctx.abortController?.signal
		});

		if (!response.ok) {
			const errorData = await response.json();
			setUserMessageRequestSlug(ctx.userMessage, errorData?.requestId);
			await appendRequestSlugToStoredMessage({
				chatId: ctx.chatId,
				messageIndex: ctx.userIndex,
				requestSlug: errorData?.requestId
			});
			const responseError = errorData.error;
			danger({ text: responseError, title: "Image generation failed" });
			const modelMessage = createImageGenerationErrorMessage(ctx.selectedPersonalityId, imageGenerationModel);
			await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
			await finalizeResponseElement({
				chatId: ctx.chatId,
				messageIndex: ctx.modelIndex,
				responseElement: ctx.responseElement,
				message: modelMessage
			});
			endGeneration(ctx.chatId);
			return ctx.userMessageElement;
		}

		const requestId = response.headers.get("X-Request-Id") ?? undefined;
		setUserMessageRequestSlug(ctx.userMessage, requestId);
		await appendRequestSlugToStoredMessage({
			chatId: ctx.chatId,
			messageIndex: ctx.userIndex,
			requestSlug: requestId
		});
		const arrayBuf = await response.arrayBuffer();
		b64 = await helpers.arrayBufferToBase64(arrayBuf);
		returnedMimeType = response.headers.get("Content-Type") || "image/png";
	} else {
		const ai = ctx.ai;
		if (!ai) {
			throw new Error("Gemini client is not available for image generation.");
		}

		const response = await ai.models.generateImages(payload);
		if (!response || !response.generatedImages || !response.generatedImages[0]?.image?.imageBytes) {
			const extraMessage = response?.generatedImages?.[0]?.raiFilteredReason;
			danger({ text: `${extraMessage ? "Reason: " + extraMessage : ""}`, title: "Image generation failed" });
			const modelMessage = createImageGenerationErrorMessage(ctx.selectedPersonalityId, imageGenerationModel);
			await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
			await finalizeResponseElement({
				chatId: ctx.chatId,
				messageIndex: ctx.modelIndex,
				responseElement: ctx.responseElement,
				message: modelMessage
			});
			endGeneration(ctx.chatId);
			return ctx.userMessageElement;
		}
		b64 = response.generatedImages[0].image.imageBytes;
		returnedMimeType = response.generatedImages[0].image.mimeType || "image/png";
	}

	const modelMessage: Message = {
		role: "model",
		parts: [{ text: "Here's the image you requested~", thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }],
		personalityid: ctx.selectedPersonalityId,
		generatedImages: [
			{ mimeType: returnedMimeType, base64: b64, thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }
		],
		originModel: imageGenerationModel
	};

	await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
	await finalizeResponseElement({
		chatId: ctx.chatId,
		messageIndex: ctx.modelIndex,
		responseElement: ctx.responseElement,
		message: modelMessage
	});
	void supabaseService.refreshImageGenerationRecord();
	endGeneration(ctx.chatId);
	return ctx.userMessageElement;
}

// ================================================================================
// SEND HANDLERS - IMAGE EDITING
// ================================================================================

async function handleImageEditing(ctx: SendContext): Promise<HTMLElement | undefined> {
	const imagesToEdit: string[] = [];

	const imageAttachments = Array.from(ctx.attachmentFiles).filter((f) => f.type.startsWith("image/"));
	if (imageAttachments.length > 0) {
		for (const file of imageAttachments) {
			const dataUri = await helpers.fileToBase64(file);
			const fullDataUri = `data:${file.type};base64,${dataUri}`;
			imagesToEdit.push(fullDataUri);
		}
	} else {
		if (ctx.historyImageDataUri) {
			imagesToEdit.push(ctx.historyImageDataUri);
		}
	}

	if (imagesToEdit.length === 0) {
		danger({ title: "No images to edit", text: "Please attach an image or select an image for editing." });
		await removeChatMessageRange(ctx.chatId, ctx.userIndex, 2);
		ctx.responseElement.remove();
		ctx.userMessageElement.remove();
		endGeneration(ctx.chatId);
		return;
	}

	const editingModel = getSelectedEditingModel();

	const maxImages = MODEL_IMAGE_LIMITS[editingModel];
	if (maxImages && imagesToEdit.length > maxImages) {
		const modelName = editingModel.charAt(0).toUpperCase() + editingModel.slice(1);
		warn({
			title: `${modelName} supports up to ${maxImages} image${maxImages > 1 ? "s" : ""}`,
			text: `Only the first ${maxImages} image${maxImages > 1 ? "s" : ""} will be used for editing.`
		});
		imagesToEdit.splice(maxImages);
	}

	try {
		const endpoint = `${SUPABASE_URL}/functions/v1/handle-edit-request`;
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
			body: JSON.stringify({ images: imagesToEdit, prompt: ctx.msg, editingModel }),
			signal: ctx.abortController?.signal
		});

		if (!response.ok) {
			const errorData = await response.json();
			setUserMessageRequestSlug(ctx.userMessage, errorData?.requestId);
			await appendRequestSlugToStoredMessage({
				chatId: ctx.chatId,
				messageIndex: ctx.userIndex,
				requestSlug: errorData?.requestId
			});
			danger({ text: errorData.error || "Unknown error", title: "Image editing failed" });
			const modelMessage = createImageEditingErrorMessage(ctx.selectedPersonalityId, editingModel);
			await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
			await finalizeResponseElement({
				chatId: ctx.chatId,
				messageIndex: ctx.modelIndex,
				responseElement: ctx.responseElement,
				message: modelMessage
			});
			endGeneration(ctx.chatId);
			return ctx.userMessageElement;
		}

		const result = await response.json();
		setUserMessageRequestSlug(ctx.userMessage, result?.requestId);
		await appendRequestSlugToStoredMessage({
			chatId: ctx.chatId,
			messageIndex: ctx.userIndex,
			requestSlug: result?.requestId
		});
		const editedImageBase64 = result.image;
		const mimeType = result.mimeType || "image/png";

		if (!editedImageBase64) {
			danger({ title: "Image editing failed", text: "No image data returned from server." });
			const modelMessage = createImageEditingErrorMessage(ctx.selectedPersonalityId, editingModel);
			await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
			await finalizeResponseElement({
				chatId: ctx.chatId,
				messageIndex: ctx.modelIndex,
				responseElement: ctx.responseElement,
				message: modelMessage
			});
			endGeneration(ctx.chatId);
			return ctx.userMessageElement;
		}

		const modelMessage: Message = {
			role: "model",
			parts: [{ text: "Here's your edited image~", thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }],
			personalityid: ctx.selectedPersonalityId,
			generatedImages: [
				{ mimeType, base64: editedImageBase64, thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR }
			],
			originModel: editingModel
		};

		await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
		await finalizeResponseElement({
			chatId: ctx.chatId,
			messageIndex: ctx.modelIndex,
			responseElement: ctx.responseElement,
			message: modelMessage
		});
		void supabaseService.refreshImageGenerationRecord();
		endGeneration(ctx.chatId);
		return ctx.userMessageElement;
	} catch (error: any) {
		console.error("Image editing error:", error);
		danger({ title: "Image editing failed", text: error.message || "An unexpected error occurred" });
		const modelMessage = createImageEditingErrorMessage(ctx.selectedPersonalityId, editingModel);
		await updateChatMessage(ctx.chatId, ctx.modelIndex, modelMessage);
		await finalizeResponseElement({
			chatId: ctx.chatId,
			messageIndex: ctx.modelIndex,
			responseElement: ctx.responseElement,
			message: modelMessage
		});
		endGeneration(ctx.chatId);
		return ctx.userMessageElement;
	}
}

// ================================================================================
// EXPORTS FOR RPG GROUP CHAT MODULE
// ================================================================================

export {
	startGeneration,
	endGeneration,
	persistMessages,
	createModelPlaceholderMessage,
	createModelErrorMessage,
	buildMessageDebugInfo,
	buildUserMessageDebugInfo,
	showGeminiProhibitedContentToast,
	generateThinkingConfig,
	finalizeResponseElement,
	ensureThinkingUiOnMessageElement,
	isPersonalityMarker,
	getPersonalityMarkerInfo,
	isLegacyPersonalityIntro,
	pruneTrailingPersonalityMarkers,
	buildPersonalityInstructionMessages,
	SKIP_THOUGHT_SIGNATURE_VALIDATOR as SKIP_THOUGHT_SIGNATURE
};

export type { RpgInputArgs };

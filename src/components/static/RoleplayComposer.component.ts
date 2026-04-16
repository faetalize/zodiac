import { GoogleGenAI } from "@google/genai";
import { onAppEvent } from "../../events";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import * as chatsService from "../../services/Chats.service";
import * as messageService from "../../services/Message.service";
import * as personalityService from "../../services/Personality.service";
import * as settingsService from "../../services/Settings.service";
import * as supabaseService from "../../services/Supabase.service";
import * as toastService from "../../services/Toast.service";
import { shouldPreferPremiumEndpoint } from "./ApiKeyInput.component";
import { buildOpenRouterRequest, requestOpenRouterCompletion } from "../../services/OpenRouter.service";
import {
	formatChatModelLabel,
	getAccessibleChatModels,
	getValidChatModel,
	isOpenRouterModel,
	modelRequiresThinking,
	modelSupportsTemperature
} from "../../types/Models";
import { SUPABASE_URL } from "../../services/Supabase.service";
import type { PremiumEndpoint } from "../../types/PremiumEndpoint";
import { UNRESTRICTED_SAFETY_SETTINGS } from "../../utils/chatHistoryBuilder";

const roleplayButton = document.querySelector<HTMLButtonElement>("#btn-roleplay");
const messageBox = document.querySelector<HTMLDivElement>("#message-box");
const sendButton = document.querySelector<HTMLButtonElement>("#btn-send");
const roleplayComposer = document.querySelector<HTMLDivElement>("#roleplay-composer");
const roleplaySuggestions = document.querySelector<HTMLDivElement>("#roleplay-suggestions");
const roleplayActionsRoot = document.querySelector<HTMLDivElement>("#roleplay-actions-root");
const roleplaySelectedActions = document.querySelector<HTMLDivElement>("#roleplay-selected-actions");
const roleplayClearActionsButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-clear-actions");
const roleplayRefreshButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-refresh");
const roleplayCustomPayload = document.querySelector<HTMLTextAreaElement>("#roleplay-custom-payload");
const roleplaySendCustomButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-send-custom");
const roleplayCustomActionInput = document.querySelector<HTMLInputElement>("#roleplay-custom-action-input");
const roleplayAddActionButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-add-action");
const roleplayTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-roleplay-tab]"));
const roleplayPanels = Array.from(document.querySelectorAll<HTMLDivElement>("[data-roleplay-panel]"));
const roleplaySuggestionModelSelect = document.querySelector<HTMLSelectElement>("#roleplaySuggestionModel");

if (
	!roleplayButton ||
	!messageBox ||
	!sendButton ||
	!roleplayComposer ||
	!roleplaySuggestions ||
	!roleplayActionsRoot ||
	!roleplaySelectedActions ||
	!roleplayClearActionsButton ||
	!roleplayRefreshButton ||
	!roleplayCustomPayload ||
	!roleplaySendCustomButton ||
	!roleplayCustomActionInput ||
	!roleplayAddActionButton ||
	!roleplaySuggestionModelSelect ||
	roleplayTabButtons.length === 0 ||
	roleplayPanels.length === 0
) {
	console.error("Roleplay composer component initialization failed.");
	throw new Error("Missing roleplay composer DOM elements.");
}

const ensuredRoleplayButton = roleplayButton;
const ensuredMessageBox = messageBox;
const ensuredSendButton = sendButton;
const ensuredRoleplayComposer = roleplayComposer;
const ensuredRoleplaySuggestions = roleplaySuggestions;
const ensuredRoleplayActionsRoot = roleplayActionsRoot;
const ensuredRoleplaySelectedActions = roleplaySelectedActions;
const ensuredRoleplayClearActionsButton = roleplayClearActionsButton;
const ensuredRoleplayRefreshButton = roleplayRefreshButton;
const ensuredRoleplayCustomPayload = roleplayCustomPayload;
const ensuredRoleplaySendCustomButton = roleplaySendCustomButton;
const ensuredRoleplayCustomActionInput = roleplayCustomActionInput;
const ensuredRoleplayAddActionButton = roleplayAddActionButton;
const ensuredRoleplaySuggestionModelSelect = roleplaySuggestionModelSelect;

type RoleplayTab = "dialogue" | "actions" | "custom";
type ActionCategory = "favorites" | "mood" | "body-language" | "scene" | "intimacy" | "custom";

type RoleplayAction = {
	id: string;
	label: string;
	text: string;
	category: ActionCategory;
	custom?: boolean;
};

const ROLEPLAY_SUGGESTIONS_SCHEMA: any = {
	type: "object",
	additionalProperties: false,
	properties: {
		options: {
			type: "array",
			minItems: 4,
			maxItems: 4,
			items: {
				type: "string",
				minLength: 1
			}
		}
	},
	required: ["options"]
};

const ROLEPLAY_SUGGESTIONS_MAX_OUTPUT_TOKENS = 5000;

const PRESET_ACTIONS: RoleplayAction[] = [
	{ id: "mood-tease", label: "Tease", text: "teases them with a sly smile", category: "mood" },
	{ id: "mood-soften", label: "Soften", text: "lets their guard down a little", category: "mood" },
	{ id: "mood-fluster", label: "Fluster", text: "goes a little pink at the reaction", category: "mood" },
	{ id: "body-step-closer", label: "Step closer", text: "steps a little closer", category: "body-language" },
	{
		id: "body-lean-in",
		label: "Lean in",
		text: "leans in until their voices are nearly shared",
		category: "body-language"
	},
	{
		id: "body-cross-arms",
		label: "Cross arms",
		text: "crosses their arms and studies them",
		category: "body-language"
	},
	{ id: "scene-pause", label: "Pause", text: "lets the silence linger for a beat", category: "scene" },
	{
		id: "scene-glance-away",
		label: "Glance away",
		text: "glances away before looking back again",
		category: "scene"
	},
	{
		id: "scene-close-door",
		label: "Close the distance",
		text: "closes the distance between them",
		category: "scene"
	},
	{
		id: "intimacy-touch-hand",
		label: "Touch hand",
		text: "brushes their fingers lightly against their hand",
		category: "intimacy"
	},
	{ id: "intimacy-whisper", label: "Whisper", text: "drops to a softer whisper", category: "intimacy" },
	{ id: "intimacy-smirk", label: "Smirk", text: "answers with a knowing smirk", category: "intimacy" }
];

const ACTION_CATEGORY_LABELS: Record<ActionCategory, string> = {
	favorites: "Favorites",
	mood: "Mood",
	"body-language": "Body language",
	scene: "Scene beats",
	intimacy: "Intimacy",
	custom: "Custom"
};

let activeTab: RoleplayTab = "dialogue";
let activeActionCategory: ActionCategory = "favorites";
let composerEnabled = false;
const selectedActionIds = new Set<string>();
let favoriteActionIds = new Set<string>();
let customActions: RoleplayAction[] = [];
let suggestionOptions: string[] = [];
let lastSuggestionSignature = "";
let lastLoadedChatId: string | null = null;
let isGenerating = false;
let hasPremiumModelAccess = false;

type StoredCustomAction = string | { id?: string; text?: string };

function parseStoredArray(key: string): string[] {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
	} catch {
		return [];
	}
}

function saveStoredArray(key: string, values: string[]): void {
	localStorage.setItem(key, JSON.stringify(values));
}

function buildCustomActionId(text: string): string {
	return `custom-${encodeURIComponent(text.trim().toLowerCase())}`;
}

function createCustomAction(text: string, id = buildCustomActionId(text)): RoleplayAction {
	return {
		id,
		label: text.length > 22 ? `${text.slice(0, 22)}...` : text,
		text,
		category: "custom",
		custom: true
	};
}

function parseStoredCustomActions(): RoleplayAction[] {
	try {
		const raw = localStorage.getItem(SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.flatMap((value) => {
			if (typeof value === "string") {
				const text = value.trim();
				return text ? [createCustomAction(text)] : [];
			}

			if (!value || typeof value !== "object") {
				return [];
			}

			const stored = value as Exclude<StoredCustomAction, string>;
			const text = typeof stored.text === "string" ? stored.text.trim() : "";
			if (!text) return [];

			const id = typeof stored.id === "string" && stored.id.trim() ? stored.id.trim() : buildCustomActionId(text);

			return [createCustomAction(text, id)];
		});
	} catch {
		return [];
	}
}

function hasSuggestionModelAccess(): boolean {
	return getAccessibleChatModels(buildAccess()).length > 0;
}

function syncSuggestionControls(): void {
	const hasAccess = hasSuggestionModelAccess();
	ensuredRoleplaySuggestionModelSelect.disabled = !hasAccess;
	ensuredRoleplayRefreshButton.disabled = isGenerating || !hasAccess;
}

function loadActionState(): void {
	customActions = parseStoredCustomActions();

	const allActionIds = new Set(getAllActions().map((action) => action.id));
	favoriteActionIds = new Set(
		parseStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS).filter((actionId) =>
			allActionIds.has(actionId)
		)
	);
}

function persistCustomActions(): void {
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS,
		JSON.stringify(customActions.map((action) => ({ id: action.id, text: action.text })))
	);
}

function getAllActions(): RoleplayAction[] {
	return [...PRESET_ACTIONS, ...customActions];
}

function getAvailableActionCategories(actions = getAllActions()): ActionCategory[] {
	const ordered: ActionCategory[] = ["favorites", "mood", "body-language", "scene", "intimacy", "custom"];
	return ordered.filter((category) => {
		if (category === "favorites") return actions.some((action) => favoriteActionIds.has(action.id));
		return actions.some((action) => action.category === category);
	});
}

function ensureActiveActionCategory(actions = getAllActions()): ActionCategory | null {
	const available = getAvailableActionCategories(actions);
	if (available.length === 0) return null;
	if (!available.includes(activeActionCategory)) {
		activeActionCategory = available[0];
	}
	return activeActionCategory;
}

function isRoleplayPersonaAvailable(
	personality: Awaited<ReturnType<typeof personalityService.getSelected>> | null,
	chat: Awaited<ReturnType<typeof chatsService.getCurrentChat>> | null
): boolean {
	return !!personality?.roleplayEnabled && !chat?.groupChat;
}

function syncComposerVisibility(): void {
	ensuredRoleplayComposer.classList.toggle("hidden", !composerEnabled);
	ensuredMessageBox.classList.toggle("roleplay-composer-active", composerEnabled);
	ensuredRoleplayButton.classList.toggle("btn-toggled", composerEnabled);
	ensuredSendButton.title = composerEnabled ? "Send current roleplay composition" : "";
}

function setActiveTab(nextTab: RoleplayTab): void {
	activeTab = nextTab;
	roleplayTabButtons.forEach((button) => {
		const isActive = button.dataset.roleplayTab === nextTab;
		button.classList.toggle("active", isActive);
		button.setAttribute("aria-selected", String(isActive));
	});
	roleplayPanels.forEach((panel) => {
		panel.classList.toggle("hidden", panel.dataset.roleplayPanel !== nextTab);
	});
}

function updateSelectedActionsSummary(): void {
	const actions = getAllActions().filter((action) => selectedActionIds.has(action.id));
	if (actions.length === 0) {
		ensuredRoleplaySelectedActions.textContent = "No actions selected.";
		ensuredRoleplayClearActionsButton.classList.add("hidden");
		return;
	}

	ensuredRoleplaySelectedActions.textContent = `Queued actions: ${actions.map((action) => action.label).join(", ")}`;
	ensuredRoleplayClearActionsButton.classList.remove("hidden");
}

function toggleFavorite(actionId: string): void {
	if (favoriteActionIds.has(actionId)) {
		favoriteActionIds.delete(actionId);
	} else {
		favoriteActionIds.add(actionId);
	}
	saveStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS, Array.from(favoriteActionIds));
	renderActions();
}

function toggleActionSelection(actionId: string): void {
	if (selectedActionIds.has(actionId)) {
		selectedActionIds.delete(actionId);
	} else {
		selectedActionIds.add(actionId);
	}
	renderActions();
	updateSelectedActionsSummary();
}

function renderActions(): void {
	const actions = getAllActions();
	const activeCategory = ensureActiveActionCategory(actions);
	ensuredRoleplayActionsRoot.replaceChildren();

	if (!activeCategory) {
		const emptyState = document.createElement("div");
		emptyState.className = "roleplay-empty-state";
		emptyState.textContent = "Add a custom action to start building your quick menu.";
		ensuredRoleplayActionsRoot.append(emptyState);
		return;
	}

	const availableCategories = getAvailableActionCategories(actions);
	const nav = document.createElement("div");
	nav.className = "roleplay-action-category-nav";
	nav.setAttribute("role", "tablist");
	nav.setAttribute("aria-label", "Roleplay action categories");

	for (const category of availableCategories) {
		const count =
			category === "favorites"
				? actions.filter((action) => favoriteActionIds.has(action.id)).length
				: actions.filter((action) => action.category === category).length;

		const button = document.createElement("button");
		button.type = "button";
		button.className = "btn roleplay-action-category-pill";
		button.classList.toggle("active", category === activeCategory);
		button.setAttribute("role", "tab");
		button.setAttribute("aria-selected", String(category === activeCategory));
		button.textContent = `${ACTION_CATEGORY_LABELS[category]} (${count})`;
		button.addEventListener("click", () => {
			activeActionCategory = category;
			renderActions();
		});
		nav.append(button);
	}

	const section = document.createElement("section");
	section.className = "roleplay-action-category";

	const header = document.createElement("div");
	header.className = "roleplay-action-category-header";

	const title = document.createElement("div");
	title.className = "roleplay-action-category-title";
	title.textContent = ACTION_CATEGORY_LABELS[activeCategory];

	const hint = document.createElement("div");
	hint.className = "roleplay-action-category-hint";
	hint.textContent =
		activeCategory === "favorites"
			? "Your starred beats stay one tap away."
			: "Scroll sideways and tap any beat to queue it.";

	header.append(title, hint);

	const strip = document.createElement("div");
	strip.className = "roleplay-action-strip";

	const relevant =
		activeCategory === "favorites"
			? actions.filter((action) => favoriteActionIds.has(action.id))
			: actions.filter((action) => action.category === activeCategory);

	for (const action of relevant) {
		const chip = document.createElement("div");
		chip.className = "roleplay-action-chip";
		chip.classList.toggle("selected", selectedActionIds.has(action.id));
		chip.classList.toggle("favorite", favoriteActionIds.has(action.id));

		const selectButton = document.createElement("button");
		selectButton.type = "button";
		selectButton.className = "roleplay-action-chip__select";
		selectButton.textContent = action.label;
		selectButton.title = action.text;
		selectButton.addEventListener("click", () => toggleActionSelection(action.id));

		const favoriteButton = document.createElement("button");
		favoriteButton.type = "button";
		favoriteButton.className = "roleplay-action-chip__favorite material-symbols-outlined";
		favoriteButton.textContent = favoriteActionIds.has(action.id) ? "star" : "star_outline";
		favoriteButton.title = favoriteActionIds.has(action.id) ? "Remove favorite" : "Favorite action";
		favoriteButton.addEventListener("click", () => toggleFavorite(action.id));

		chip.append(selectButton, favoriteButton);
		strip.append(chip);
	}

	section.append(header, strip);
	ensuredRoleplayActionsRoot.append(nav, section);
}

function getSelectedActionPayload(): string[] {
	return getAllActions()
		.filter((action) => selectedActionIds.has(action.id))
		.map((action) => settingsService.formatRoleplayAction(action.text));
}

function buildPayload(text: string, options: { treatAsRaw?: boolean } = {}): string {
	const parts = [...getSelectedActionPayload()];
	const trimmed = text.trim();
	if (trimmed) {
		parts.push(options.treatAsRaw ? trimmed : settingsService.formatRoleplayDialogue(trimmed));
	}
	return parts.filter(Boolean).join("\n");
}

async function sendRoleplayPayload(payload: string): Promise<void> {
	if (!payload.trim()) {
		toastService.warn({
			title: "Nothing to send",
			text: "Choose a suggestion, queue an action, or write a custom reply first."
		});
		return;
	}

	await messageService.send(payload);
	ensuredRoleplayCustomPayload.value = "";
	selectedActionIds.clear();
	updateSelectedActionsSummary();
	renderActions();
}

function renderSuggestions(): void {
	ensuredRoleplaySuggestions.replaceChildren();

	if (suggestionOptions.length === 0) {
		const emptyState = document.createElement("div");
		emptyState.className = "roleplay-empty-state";
		emptyState.textContent = "Refresh to generate four quick roleplay replies.";
		ensuredRoleplaySuggestions.append(emptyState);
		return;
	}

	for (const option of suggestionOptions) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "btn roleplay-suggestion";
		button.textContent = option;
		button.addEventListener("click", () => {
			void (async () => {
				try {
					await sendRoleplayPayload(buildPayload(option));
				} catch (error: any) {
					toastService.danger({
						title: "Couldn't send roleplay reply",
						text: error?.message || String(error)
					});
				}
			})();
		});
		ensuredRoleplaySuggestions.append(button);
	}
}

function buildTranscript(
	chat: Awaited<ReturnType<typeof chatsService.getCurrentChat>> | null,
	personaName: string
): string {
	const visibleMessages = (chat?.content || []).filter((message) => !message.hidden).slice(-8);
	if (visibleMessages.length === 0) return "No prior dialogue yet.";

	return visibleMessages
		.map((message) => {
			const speaker = message.role === "user" ? "User" : personaName;
			const text = message.parts
				.map((part) => part.text || "")
				.join("\n")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			return `${speaker}: ${text}`;
		})
		.join("\n");
}

function buildSuggestionSignature(chatId: string | null, personaId: string | undefined, transcript: string): string {
	return JSON.stringify({ chatId, personaId, transcript });
}

function sanitizeOptions(options: string[]): string[] {
	const unique = new Set<string>();
	for (const option of options) {
		const cleaned = option.trim().replace(/^[-*0-9.)\s]+/, "");
		if (!cleaned) continue;
		unique.add(cleaned);
		if (unique.size === 4) break;
	}
	return Array.from(unique).slice(0, 4);
}

function parseRoleplaySuggestionsJson(text: string): string[] {
	const parseOptions = (raw: unknown): string[] => {
		const parsed = raw as { options?: unknown } | null;
		if (!Array.isArray(parsed?.options)) return [];
		return sanitizeOptions(parsed.options.map((value: unknown) => String(value ?? "")));
	};

	try {
		return parseOptions(JSON.parse(text));
	} catch {
		// continue
	}

	const lastJsonStart = text.lastIndexOf('{"options"');
	if (lastJsonStart >= 0) {
		const lastPart = text.slice(lastJsonStart);
		let braceCount = 0;
		let endIndex = -1;

		for (let i = 0; i < lastPart.length; i++) {
			if (lastPart[i] === "{") braceCount++;
			else if (lastPart[i] === "}") {
				braceCount--;
				if (braceCount === 0) {
					endIndex = i + 1;
					break;
				}
			}
		}

		if (endIndex > 0) {
			try {
				return parseOptions(JSON.parse(lastPart.slice(0, endIndex)));
			} catch {
				// continue
			}
		}
	}

	return [];
}

function extractOptionsFromResponse(text: string): string[] {
	return parseRoleplaySuggestionsJson(text);
}

function buildSuggestionPrompts(args: { transcript: string; personaName: string; personaPrompt: string }): {
	systemInstruction: string;
	userPrompt: string;
} {
	const systemInstruction = [
		"You generate exactly four concise roleplay reply options for the user in a visual-novel composer.",
		'Return strict JSON only in the form {"options":["...","...","...","..."]}.',
		"Each option must be a single user reply, 4 to 18 words, with no numbering or commentary.",
		"Write options that feel distinct in tone and intent.",
		"Keep formatting consistent with the active roleplay delimiter settings."
	].join(" ");

	const userPrompt = [
		`Active persona: ${args.personaName}.`,
		`Persona guidance: ${args.personaPrompt || "No extra guidance provided."}`,
		"Conversation transcript:",
		args.transcript,
		"Generate the next four things the user could say."
	].join("\n\n");

	return { systemInstruction, userPrompt };
}

function buildAccess() {
	return {
		hasGeminiAccess:
			hasPremiumModelAccess || (localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "").trim().length > 0,
		hasOpenRouterAccess:
			hasPremiumModelAccess ||
			(localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "").trim().length > 0
	};
}

function buildRoleplaySuggestionThinkingConfig(
	model: string
): { includeThoughts: false; thinkingBudget: 0 } | undefined {
	return modelRequiresThinking(model) ? undefined : { includeThoughts: false, thinkingBudget: 0 };
}

function buildRoleplaySuggestionOpenRouterResponseFormat() {
	return {
		type: "json_schema" as const,
		json_schema: {
			name: "roleplay_suggestions",
			strict: true,
			schema: ROLEPLAY_SUGGESTIONS_SCHEMA
		}
	};
}

function buildRoleplaySuggestionBaseConfig(model: string) {
	return {
		maxOutputTokens: ROLEPLAY_SUGGESTIONS_MAX_OUTPUT_TOKENS,
		temperature: modelSupportsTemperature(model) ? 0.9 : 0,
		responseMimeType: "application/json" as const,
		responseJsonSchema: ROLEPLAY_SUGGESTIONS_SCHEMA,
		safetySettings: [...UNRESTRICTED_SAFETY_SETTINGS],
		thinkingConfig: buildRoleplaySuggestionThinkingConfig(model)
	};
}

function populateRoleplayModelOptions(): void {
	const access = buildAccess();
	const available = getAccessibleChatModels(access);
	const currentValue =
		ensuredRoleplaySuggestionModelSelect.value ||
		localStorage.getItem(SETTINGS_STORAGE_KEYS.ROLEPLAY_SUGGESTION_MODEL) ||
		localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL) ||
		"";

	ensuredRoleplaySuggestionModelSelect.replaceChildren();

	if (available.length === 0) {
		const option = document.createElement("option");
		option.value = "";
		option.disabled = true;
		option.selected = true;
		option.textContent = "Add access to enable roleplay suggestions";
		ensuredRoleplaySuggestionModelSelect.append(option);
		syncSuggestionControls();
		return;
	}

	for (const model of available) {
		const option = document.createElement("option");
		option.value = model.id;
		option.textContent = formatChatModelLabel(model);
		ensuredRoleplaySuggestionModelSelect.append(option);
	}

	ensuredRoleplaySuggestionModelSelect.value = getValidChatModel(currentValue, access);
	syncSuggestionControls();
}

async function requestWithPremiumEndpoint(
	model: string,
	systemInstruction: string,
	userPrompt: string
): Promise<string> {
	const baseConfig = buildRoleplaySuggestionBaseConfig(model);

	const payloadSettings: PremiumEndpoint.RequestSettings = {
		model,
		streamResponses: false,
		generate: true,
		systemInstruction,
		...baseConfig
	};

	const response = await fetch(`${SUPABASE_URL}/functions/v1/handle-pro-request`, {
		method: "POST",
		headers: { ...(await supabaseService.getAuthHeaders()), "Content-Type": "application/json" },
		body: JSON.stringify({ message: userPrompt, settings: payloadSettings, history: [] })
	});

	if (!response.ok) {
		throw new Error(`Suggestion request failed (${response.status})`);
	}

	const json = await response.json();
	return String(json?.text || "");
}

async function requestWithLocalModel(model: string, systemInstruction: string, userPrompt: string): Promise<string> {
	const settings = settingsService.getSettings();
	const baseConfig = buildRoleplaySuggestionBaseConfig(model);

	if (isOpenRouterModel(model)) {
		const apiKey = settings.openRouterApiKey.trim();
		if (!apiKey) throw new Error("OpenRouter API key required for the selected suggestion model.");
		const request = buildOpenRouterRequest({
			model,
			messages: [
				{ role: "system", content: systemInstruction },
				{ role: "user", content: userPrompt }
			],
			stream: false,
			maxTokens: baseConfig.maxOutputTokens,
			temperature: baseConfig.temperature,
			enableThinking: false,
			thinkingBudget: 0,
			isInternetSearchEnabled: false,
			responseFormat: buildRoleplaySuggestionOpenRouterResponseFormat()
		});
		const result = await requestOpenRouterCompletion({
			apiKey,
			request
		});
		return result.text;
	}

	const apiKey = settings.geminiApiKey.trim();
	if (!apiKey) throw new Error("Gemini API key required for the selected suggestion model.");
	const ai = new GoogleGenAI({ apiKey });
	const result = await ai.models.generateContent({
		model,
		config: {
			systemInstruction,
			...baseConfig
		},
		contents: userPrompt
	});
	return result.text || "";
}

async function refreshSuggestions(force = false): Promise<void> {
	if (!composerEnabled || isGenerating) return;

	const chat = await chatsService.getCurrentChat();
	const personality = await personalityService.getSelected();
	if (!personality || !isRoleplayPersonaAvailable(personality, chat)) return;

	const transcript = buildTranscript(chat, personality.name);
	const signature = buildSuggestionSignature(chat?.id || null, personality.name, transcript);
	if (!force && signature === lastSuggestionSignature) return;

	if (!hasSuggestionModelAccess()) {
		suggestionOptions = [];
		renderSuggestions();
		syncSuggestionControls();
		return;
	}

	ensuredRoleplayRefreshButton.disabled = true;

	try {
		const settings = settingsService.getSettings();
		const model = getValidChatModel(settings.roleplaySuggestionModel || settings.model, buildAccess());
		const { systemInstruction, userPrompt } = buildSuggestionPrompts({
			transcript,
			personaName: personality.name,
			personaPrompt: personality.prompt
		});

		const subscription = await supabaseService.getUserSubscription();
		const tier = supabaseService.getSubscriptionTier(subscription);
		const canUsePremium =
			(tier === "pro" || tier === "pro_plus" || tier === "max") && shouldPreferPremiumEndpoint();
		const hasLocalKey = isOpenRouterModel(model)
			? settings.openRouterApiKey.trim().length > 0
			: settings.geminiApiKey.trim().length > 0;

		const raw =
			canUsePremium && !hasLocalKey
				? await requestWithPremiumEndpoint(model, systemInstruction, userPrompt)
				: await requestWithLocalModel(model, systemInstruction, userPrompt);

		const options = extractOptionsFromResponse(raw);
		suggestionOptions = options;
		lastSuggestionSignature = signature;
		renderSuggestions();
	} catch (error: any) {
		suggestionOptions = [];
		renderSuggestions();
		console.error(error);
		toastService.warn({ title: "Roleplay suggestions unavailable", text: error?.message || String(error) });
	} finally {
		syncSuggestionControls();
	}
}

async function refreshComposerAvailability(): Promise<void> {
	const chat = await chatsService.getCurrentChat();
	const personality = await personalityService.getSelected();
	const available = !!personality && isRoleplayPersonaAvailable(personality, chat);

	ensuredRoleplayButton.classList.toggle("hidden", !available);
	if (!available) {
		composerEnabled = false;
		lastSuggestionSignature = "";
		syncComposerVisibility();
		return;
	}

	if (chat?.id !== lastLoadedChatId) {
		lastLoadedChatId = chat?.id || null;
		lastSuggestionSignature = "";
	}

	if (!composerEnabled) {
		composerEnabled = true;
		syncComposerVisibility();
	}

	await refreshSuggestions();
}

ensuredRoleplayButton.addEventListener("click", () => {
	void (async () => {
		composerEnabled = !composerEnabled;
		syncComposerVisibility();
		if (composerEnabled) {
			await refreshComposerAvailability();
		}
	})();
});

roleplayTabButtons.forEach((button) => {
	button.addEventListener("click", () => {
		setActiveTab(button.dataset.roleplayTab as RoleplayTab);
	});
});

ensuredRoleplayClearActionsButton.addEventListener("click", () => {
	selectedActionIds.clear();
	renderActions();
	updateSelectedActionsSummary();
});

ensuredRoleplayRefreshButton.addEventListener("click", () => {
	void refreshSuggestions(true);
});

ensuredRoleplayAddActionButton.addEventListener("click", () => {
	const text = ensuredRoleplayCustomActionInput.value.trim();
	if (!text) return;
	if (customActions.some((action) => action.text.toLowerCase() === text.toLowerCase())) {
		toastService.warn({ title: "Action already exists", text: "That custom action is already in your list." });
		return;
	}
	customActions.unshift(createCustomAction(text));
	ensuredRoleplayCustomActionInput.value = "";
	activeActionCategory = "custom";
	persistCustomActions();
	renderActions();
});

ensuredRoleplaySendCustomButton.addEventListener("click", () => {
	void (async () => {
		try {
			await sendRoleplayPayload(buildPayload(ensuredRoleplayCustomPayload.value, { treatAsRaw: true }));
		} catch (error: any) {
			toastService.danger({ title: "Couldn't send custom roleplay", text: error?.message || String(error) });
		}
	})();
});

window.addEventListener("roleplay-send-requested", (event) => {
	void (async () => {
		if (!composerEnabled || isGenerating) return;
		event.preventDefault();

		try {
			if (activeTab === "custom") {
				await sendRoleplayPayload(buildPayload(ensuredRoleplayCustomPayload.value, { treatAsRaw: true }));
				return;
			}
			await sendRoleplayPayload(buildPayload(""));
		} catch (error: any) {
			toastService.danger({ title: "Couldn't send roleplay action", text: error?.message || String(error) });
		}
	})();
});

window.addEventListener("generation-state-changed", (event: Event) => {
	void (async () => {
		const detail = (event as CustomEvent<{ isGenerating: boolean }>).detail;
		const wasGenerating = isGenerating;
		isGenerating = !!detail?.isGenerating;

		if (composerEnabled) {
			syncSuggestionControls();
			ensuredRoleplaySendCustomButton.disabled = isGenerating;
		}

		if (wasGenerating && !isGenerating) {
			lastSuggestionSignature = "";
			await refreshSuggestions(true);
		}
	})();
});

onAppEvent("chat-loaded", () => {
	void refreshComposerAvailability();
});

onAppEvent("auth-state-changed", (event) => {
	const tier = supabaseService.getSubscriptionTier(event.detail.subscription ?? null);
	hasPremiumModelAccess = tier === "pro" || tier === "pro_plus" || tier === "max";
	populateRoleplayModelOptions();
});

onAppEvent("subscription-updated", (event) => {
	hasPremiumModelAccess =
		event.detail.tier === "pro" || event.detail.tier === "pro_plus" || event.detail.tier === "max";
	populateRoleplayModelOptions();
});

document.querySelector<HTMLDivElement>("#personalitiesDiv")?.addEventListener("change", () => {
	void refreshComposerAvailability();
});

ensuredRoleplaySuggestionModelSelect.addEventListener("change", () => {
	lastSuggestionSignature = "";
	void refreshSuggestions(true);
});

loadActionState();
populateRoleplayModelOptions();
renderActions();
renderSuggestions();
updateSelectedActionsSummary();
setActiveTab("dialogue");
syncComposerVisibility();
void refreshComposerAvailability();

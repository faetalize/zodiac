import { GoogleGenAI } from "@google/genai";
import { onAppEvent } from "../../events";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import * as chatsService from "../../services/Chats.service";
import * as messageService from "../../services/Message.service";
import * as personalityService from "../../services/Personality.service";
import * as settingsService from "../../services/Settings.service";
import * as supabaseService from "../../services/Supabase.service";
import * as syncService from "../../services/Sync.service";
import * as toastService from "../../services/Toast.service";
import * as surfaceService from "../../services/Surface.service";
import { confirmDialogDanger } from "../../utils/helpers";
import { shouldPreferPremiumEndpoint } from "./ApiKeyInput.component";
import { buildOpenRouterRequest, requestOpenRouterCompletion } from "../../services/OpenRouter.service";
import {
	formatChatModelLabel,
	getAccessibleRoleplaySuggestionModels,
	getValidRoleplaySuggestionModel,
	isOpenRouterModel,
	modelRequiresThinking,
	getRoleplaySuggestionThinkingCap,
	modelSupportsTemperature,
	type ChatModelAccess
} from "../../types/Models";
import { PRO_REQUEST_ENDPOINT } from "../../services/Supabase.service";
import type { PremiumEndpoint } from "../../types/PremiumEndpoint";
import { UNRESTRICTED_SAFETY_SETTINGS } from "../../utils/chatHistoryBuilder";

const roleplayButton = document.querySelector<HTMLButtonElement>("#btn-roleplay");
const messageBox = document.querySelector<HTMLDivElement>("#message-box");
const sendButton = document.querySelector<HTMLButtonElement>("#btn-send");
const roleplayComposer = document.querySelector<HTMLDivElement>("#roleplay-composer");
const roleplaySuggestions = document.querySelector<HTMLDivElement>("#roleplay-suggestions");
const roleplayActionsRoot = document.querySelector<HTMLDivElement>("#roleplay-actions-root");
const roleplayRefreshSpinner = document.querySelector<HTMLElement>(".roleplay-refresh-spinner");
const roleplaySelectionBar = document.querySelector<HTMLDivElement>(".roleplay-composer__selection-bar");
const roleplaySelectedActions = document.querySelector<HTMLDivElement>("#roleplay-selected-actions");
const roleplayClearActionsButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-clear-actions");
const roleplayRefreshButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-refresh");
const roleplayAddModal = document.querySelector<HTMLDivElement>("#modal-roleplay-add");
const roleplayAddModalTitle = document.querySelector<HTMLHeadingElement>("#roleplay-add-modal-title");
const roleplayAddModalLabelInput = document.querySelector<HTMLInputElement>("#roleplay-add-modal-label-input");
const roleplayAddModalInput = document.querySelector<HTMLInputElement>("#roleplay-add-modal-input");
const roleplayAddModalError = document.querySelector<HTMLDivElement>("#roleplay-add-modal-error");
const roleplayAddModalErrorMessage = document.querySelector<HTMLSpanElement>("#roleplay-add-modal-error-message");
const roleplayAddModalSubmitButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-add-modal-submit");
const roleplayAddModalCancelButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-add-modal-cancel");
const roleplayTabs = document.querySelector<HTMLDivElement>(".roleplay-composer__tabs");
const roleplayTabHighlight = roleplayTabs?.querySelector<HTMLElement>(".navbar-tab-highlight") ?? null;
const roleplayTabButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-roleplay-tab]"));
const roleplayPanels = Array.from(document.querySelectorAll<HTMLDivElement>("[data-roleplay-panel]"));
const roleplaySuggestionModelSelect = document.querySelector<HTMLSelectElement>("#roleplaySuggestionModel");

if (
	!roleplayButton ||
	!messageBox ||
	!sendButton ||
	!roleplayComposer ||
	!roleplaySuggestions ||
	!roleplayActionsRoot ||
	!roleplayRefreshSpinner ||
	!roleplaySelectionBar ||
	!roleplaySelectedActions ||
	!roleplayClearActionsButton ||
	!roleplayRefreshButton ||
	!roleplayAddModal ||
	!roleplayAddModalTitle ||
	!roleplayAddModalLabelInput ||
	!roleplayAddModalInput ||
	!roleplayAddModalError ||
	!roleplayAddModalErrorMessage ||
	!roleplayAddModalSubmitButton ||
	!roleplayAddModalCancelButton ||
	!roleplayTabs ||
	!roleplayTabHighlight ||
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
const ensuredRoleplayRefreshSpinner = roleplayRefreshSpinner;
const ensuredRoleplaySelectionBar = roleplaySelectionBar;
const ensuredRoleplaySelectedActions = roleplaySelectedActions;
const ensuredRoleplayClearActionsButton = roleplayClearActionsButton;
const ensuredRoleplayRefreshButton = roleplayRefreshButton;
const ensuredRoleplayAddModal = roleplayAddModal;
const ensuredRoleplayAddModalTitle = roleplayAddModalTitle;
const ensuredRoleplayAddModalLabelInput = roleplayAddModalLabelInput;
const ensuredRoleplayAddModalInput = roleplayAddModalInput;
const ensuredRoleplayAddModalError = roleplayAddModalError;
const ensuredRoleplayAddModalErrorMessage = roleplayAddModalErrorMessage;
const ensuredRoleplayAddModalSubmitButton = roleplayAddModalSubmitButton;
const ensuredRoleplayAddModalCancelButton = roleplayAddModalCancelButton;
const ensuredRoleplayTabHighlight = roleplayTabHighlight;
const ensuredRoleplaySuggestionModelSelect = roleplaySuggestionModelSelect;

type RoleplayTab = "dialogue" | "actions";
type BuiltInActionCategory = "favorites" | "neutral" | "body-language" | "intimacy" | "aggression" | "expressions";
type CustomActionCategoryId = `custom:${string}`;
type ActionCategory = BuiltInActionCategory | CustomActionCategoryId;

type CustomActionCategory = {
	id: CustomActionCategoryId;
	label: string;
};

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
	{ id: "neutral-shake-hand-r", label: "Shake Hand (R)", text: "shakes their right hand", category: "neutral" },
	{ id: "neutral-shake-hand-l", label: "Shake Hand (L)", text: "shakes their left hand", category: "neutral" },
	{ id: "neutral-push", label: "Push", text: "pushes them", category: "neutral" },
	{ id: "neutral-pull", label: "Pull", text: "pulls them", category: "neutral" },
	{ id: "body-look-away", label: "Look away", text: "looks away", category: "body-language" },
	{ id: "body-eye-contact", label: "Eye contact", text: "makes eye contact", category: "body-language" },
	{ id: "body-shrug", label: "Shrug", text: "shrugs", category: "body-language" },
	{ id: "intimacy-hug", label: "Hug", text: "hugs them", category: "intimacy" },
	{ id: "intimacy-pat-back", label: "Pat on the back", text: "pats them on the back", category: "intimacy" },
	{ id: "intimacy-kiss", label: "Kiss", text: "kisses them", category: "intimacy" },
	{ id: "intimacy-hold-hands", label: "Hold hands", text: "holds their hand", category: "intimacy" },
	{ id: "intimacy-pat-head", label: "Pat on the head", text: "pats them on the head", category: "intimacy" },
	{ id: "aggression-punch", label: "Punch", text: "punches them", category: "aggression" },
	{ id: "aggression-kick", label: "Kick", text: "kicks them", category: "aggression" },
	{ id: "aggression-spit", label: "Spit", text: "spits at them", category: "aggression" },
	{
		id: "aggression-pull-aggressively",
		label: "Pull aggressively",
		text: "pulls them aggressively",
		category: "aggression"
	},
	{
		id: "aggression-push-aggressively",
		label: "Push aggressively",
		text: "pushes them aggressively",
		category: "aggression"
	},
	{ id: "expression-disgusted", label: "Disgusted", text: "looks disgusted", category: "expressions" },
	{ id: "expression-hopeful", label: "Hopeful", text: "looks hopeful", category: "expressions" },
	{ id: "expression-anxious", label: "Anxious", text: "looks anxious", category: "expressions" },
	{ id: "expression-fearful", label: "Fearful", text: "looks fearful", category: "expressions" },
	{ id: "expression-in-love", label: "In love", text: "looks in love", category: "expressions" },
	{ id: "expression-shocked", label: "Shocked", text: "looks shocked", category: "expressions" },
	{ id: "expression-surprised", label: "Surprised", text: "looks surprised", category: "expressions" },
	{ id: "expression-angry", label: "Angry", text: "looks angry", category: "expressions" },
	{ id: "expression-happy", label: "Happy", text: "looks happy", category: "expressions" },
	{ id: "expression-frown", label: "Frown", text: "frowns", category: "expressions" }
];

const ACTION_CATEGORY_LABELS: Record<BuiltInActionCategory, string> = {
	favorites: "Favorites",
	neutral: "Neutral",
	"body-language": "Body language",
	intimacy: "Intimacy",
	aggression: "Aggression",
	expressions: "Expressions"
};

let activeActionCategory: ActionCategory = "favorites";
let composerEnabled = false;
const selectedActionIds = new Set<string>();
let favoriteActionIds = new Set<string>();
let customCategories: CustomActionCategory[] = [];
let customActions: RoleplayAction[] = [];
let suggestionOptions: string[] = [];
let lastSuggestionSignature = "";
let lastLoadedChatId: string | null = null;
let isGenerating = false;
let isGeneratingSuggestions = false;
let hasPremiumModelAccess = false;
let pendingAddMode: "category" | "action" | "edit-category" | "edit-action" | null = null;
let pendingEditCategoryId: CustomActionCategoryId | null = null;
let pendingEditActionId: string | null = null;

type StoredCustomAction = string | { id?: string; label?: string; text?: string; category?: string };

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

function slugifyCategoryLabel(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

function buildCustomCategoryId(label: string): CustomActionCategoryId {
	const slug = slugifyCategoryLabel(label) || "custom";
	return `custom:${slug}`;
}

function createCustomCategory(label: string, id = buildCustomCategoryId(label)): CustomActionCategory {
	return {
		id,
		label: label.trim()
	};
}

function createCustomAction(
	text: string,
	category: ActionCategory,
	label = text,
	id = buildCustomActionId(text)
): RoleplayAction {
	return {
		id,
		label,
		text,
		category,
		custom: true
	};
}

function isBuiltInCategory(category: ActionCategory): category is BuiltInActionCategory {
	return category in ACTION_CATEGORY_LABELS;
}

function getCategoryLabel(category: ActionCategory): string {
	if (isBuiltInCategory(category)) {
		return ACTION_CATEGORY_LABELS[category];
	}

	const stored = customCategories.find((entry) => entry.id === category);
	return stored?.label ?? category.replace(/^custom:/, "");
}

function getCategoryCount(category: ActionCategory, actions = getAllActions()): number {
	return category === "favorites"
		? actions.filter((action) => favoriteActionIds.has(action.id)).length
		: actions.filter((action) => action.category === category).length;
}

function isCustomCategory(category: ActionCategory): category is CustomActionCategoryId {
	return !isBuiltInCategory(category);
}

function isCategoryLabelAvailable(label: string, ignoredCategoryId?: CustomActionCategoryId): boolean {
	const normalized = label.trim().toLowerCase();
	if (!normalized) return false;

	if (Object.values(ACTION_CATEGORY_LABELS).some((existing) => existing.toLowerCase() === normalized)) {
		return false;
	}

	return !customCategories.some(
		(category) => category.id !== ignoredCategoryId && category.label.toLowerCase() === normalized
	);
}

function isActionTextAvailable(text: string, category: ActionCategory, ignoredActionId?: string): boolean {
	const normalized = text.trim().toLowerCase();
	if (!normalized) return false;

	return !customActions.some((action) => action.id !== ignoredActionId && action.text.toLowerCase() === normalized);
}

function parseStoredCustomCategories(): CustomActionCategory[] {
	try {
		const raw = localStorage.getItem(SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		const seen = new Set<string>();
		return parsed.flatMap((value) => {
			const label =
				typeof value === "string" ? value.trim() : typeof value?.label === "string" ? value.label.trim() : "";
			if (!label) return [];

			const rawId = typeof value === "object" && value && typeof value.id === "string" ? value.id.trim() : "";
			const id = (rawId || buildCustomCategoryId(label)) as CustomActionCategoryId;
			if (seen.has(id)) return [];

			seen.add(id);
			return [createCustomCategory(label, id)];
		});
	} catch {
		return [];
	}
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
				const legacyCategory = buildCustomCategoryId("Custom");
				return text ? [createCustomAction(text, legacyCategory)] : [];
			}

			if (!value || typeof value !== "object") {
				return [];
			}

			const stored = value as Exclude<StoredCustomAction, string>;
			const text = typeof stored.text === "string" ? stored.text.trim() : "";
			if (!text) return [];
			const label = typeof stored.label === "string" && stored.label.trim() ? stored.label.trim() : text;

			const id = typeof stored.id === "string" && stored.id.trim() ? stored.id.trim() : buildCustomActionId(text);
			const category =
				typeof stored.category === "string" && stored.category.trim()
					? (stored.category.trim() as ActionCategory)
					: buildCustomCategoryId("Custom");

			return [createCustomAction(text, category, label, id)];
		});
	} catch {
		return [];
	}
}

function hasSuggestionModelAccess(): boolean {
	return getAccessibleRoleplaySuggestionModels(buildAccess()).length > 0;
}

function syncSuggestionControls(): void {
	const hasAccess = hasSuggestionModelAccess();
	ensuredRoleplaySuggestionModelSelect.disabled = !hasAccess;
	ensuredRoleplayRefreshButton.disabled = isGenerating || isGeneratingSuggestions || !hasAccess;
	ensuredRoleplayRefreshSpinner.classList.toggle("hidden", !isGeneratingSuggestions);
	ensuredRoleplayRefreshButton
		.querySelector(".material-symbols-outlined")
		?.classList.toggle("hidden", isGeneratingSuggestions);
}

function loadActionState(): void {
	customCategories = parseStoredCustomCategories();
	customActions = parseStoredCustomActions();

	for (const action of customActions) {
		if (
			!isBuiltInCategory(action.category) &&
			!customCategories.some((category) => category.id === action.category)
		) {
			customCategories.push(createCustomCategory(getCategoryLabel(action.category), action.category));
		}
	}

	const allActionIds = new Set(getAllActions().map((action) => action.id));
	favoriteActionIds = new Set(
		parseStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS).filter((actionId) =>
			allActionIds.has(actionId)
		)
	);
}

function persistCustomCategories(): void {
	localStorage.setItem(SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES, JSON.stringify(customCategories));
}

function persistCustomActions(): void {
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS,
		JSON.stringify(
			customActions.map((action) => ({
				id: action.id,
				label: action.label,
				text: action.text,
				category: action.category
			}))
		)
	);
}

function persistFavoriteActions(): void {
	saveStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS, Array.from(favoriteActionIds));
}

function queueRoleplaySettingsSync(): void {
	if (!syncService.isSyncActive()) return;
	syncService.pushCurrentSettings().catch((error) => {
		console.warn("Failed to sync roleplay settings", error);
	});
}

function discardActionState(actionIds: Iterable<string>): void {
	let changedFavorites = false;
	for (const actionId of actionIds) {
		selectedActionIds.delete(actionId);
		if (favoriteActionIds.delete(actionId)) {
			changedFavorites = true;
		}
	}
	if (changedFavorites) persistFavoriteActions();
	updateSelectedActionsSummary();
}

function getAllActions(): RoleplayAction[] {
	return [...PRESET_ACTIONS, ...customActions];
}

function getAvailableActionCategories(actions = getAllActions()): ActionCategory[] {
	const ordered: BuiltInActionCategory[] = [
		"favorites",
		"neutral",
		"body-language",
		"intimacy",
		"aggression",
		"expressions"
	];
	const available: ActionCategory[] = ordered.filter((category) => {
		if (category === "favorites") return actions.some((action) => favoriteActionIds.has(action.id));
		return actions.some((action) => action.category === category);
	});

	for (const category of customCategories) {
		available.push(category.id);
	}

	return available;
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
	const targetIndex = roleplayTabButtons.findIndex((button) => button.dataset.roleplayTab === nextTab);
	const highlightInset = "0.1875rem";
	const availableWidth = `calc(100% - (${highlightInset} * 2))`;
	ensuredRoleplayTabHighlight.style.width = `calc(${availableWidth} / ${roleplayTabButtons.length})`;
	ensuredRoleplayTabHighlight.style.left = `calc(${highlightInset} + ((${availableWidth} / ${roleplayTabButtons.length}) * ${Math.max(targetIndex, 0)}))`;

	roleplayTabButtons.forEach((button) => {
		const isActive = button.dataset.roleplayTab === nextTab;
		button.classList.toggle("navbar-tab-active", isActive);
		button.setAttribute("aria-selected", String(isActive));
		button.tabIndex = isActive ? 0 : -1;
	});
	roleplayPanels.forEach((panel) => {
		panel.classList.toggle("hidden", panel.dataset.roleplayPanel !== nextTab);
	});
}

function updateSelectedActionsSummary(): void {
	const actions = getAllActions().filter((action) => selectedActionIds.has(action.id));
	if (actions.length === 0) {
		ensuredRoleplaySelectionBar.classList.add("hidden");
		ensuredRoleplaySelectedActions.textContent = "";
		ensuredRoleplayClearActionsButton.classList.add("hidden");
		return;
	}

	ensuredRoleplaySelectionBar.classList.remove("hidden");
	ensuredRoleplaySelectedActions.textContent = `Queued actions: ${actions.map((action) => action.label).join(", ")}`;
	ensuredRoleplayClearActionsButton.classList.remove("hidden");
}

function toggleFavorite(actionId: string): void {
	if (favoriteActionIds.has(actionId)) {
		favoriteActionIds.delete(actionId);
	} else {
		favoriteActionIds.add(actionId);
	}
	persistFavoriteActions();
	queueRoleplaySettingsSync();
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

function renderInlineAddCategory(nav: HTMLDivElement): void {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn roleplay-action-category-pill roleplay-add-entry";
	button.textContent = "+";
	button.title = "Add category";
	button.setAttribute("data-roleplay-add-category-toggle", "true");
	button.addEventListener("click", () => openRoleplayAddModal("category"));
	nav.append(button);
}

function createRoleplayIconButton(args: {
	icon: string;
	title: string;
	onClick: () => void;
	danger?: boolean;
}): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "roleplay-action-chip__icon material-symbols-outlined";
	button.classList.toggle("roleplay-action-chip__icon--danger", !!args.danger);
	button.textContent = args.icon;
	button.title = args.title;
	button.setAttribute("aria-label", args.title);
	button.addEventListener("click", args.onClick);
	return button;
}

function appendCustomCategoryControls(wrapper: HTMLDivElement, category: CustomActionCategoryId): void {
	const editButton = document.createElement("button");
	editButton.type = "button";
	editButton.className = "btn-textual material-symbols-outlined roleplay-category-control";
	editButton.textContent = "edit";
	editButton.title = `Rename ${getCategoryLabel(category)}`;
	editButton.setAttribute("aria-label", editButton.title);
	editButton.addEventListener("click", () => openRoleplayEditCategoryModal(category));

	const deleteButton = document.createElement("button");
	deleteButton.type = "button";
	deleteButton.className =
		"btn-textual material-symbols-outlined roleplay-category-control roleplay-category-control--danger";
	deleteButton.textContent = "delete";
	deleteButton.title = `Delete ${getCategoryLabel(category)}`;
	deleteButton.setAttribute("aria-label", deleteButton.title);
	deleteButton.addEventListener("click", () => void deleteCustomCategory(category));

	wrapper.append(editButton, deleteButton);
}

function renderInlineAddAction(strip: HTMLDivElement, activeCategory: ActionCategory): void {
	if (activeCategory === "favorites") return;

	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn roleplay-action-chip roleplay-action-chip--add roleplay-add-entry";
	button.textContent = "+";
	button.title = `Add action to ${getCategoryLabel(activeCategory)}`;
	button.setAttribute("data-roleplay-add-action-toggle", "true");
	button.addEventListener("click", () => openRoleplayAddModal("action"));
	strip.append(button);
}

function addCustomAction(rawLabel: string, rawText: string, category: ActionCategory): boolean {
	const label = rawLabel.trim();
	const text = rawText.trim();
	if (!label || !text || category === "favorites") return false;

	if (!isActionTextAvailable(text, category)) {
		toastService.warn({ title: "Action already exists", text: "That custom action is already in your list." });
		return false;
	}

	customActions.unshift(createCustomAction(text, category, label));
	activeActionCategory = category;
	persistCustomActions();
	queueRoleplaySettingsSync();
	renderActions();
	return true;
}

function updateCustomAction(actionId: string, rawLabel: string, rawText: string): boolean {
	const label = rawLabel.trim();
	const text = rawText.trim();
	const action = customActions.find((entry) => entry.id === actionId);
	if (!label || !text || !action) return false;

	if (!isActionTextAvailable(text, action.category, actionId)) {
		toastService.warn({ title: "Action already exists", text: "That custom action is already in your list." });
		return false;
	}

	action.text = text;
	action.label = label;
	persistCustomActions();
	queueRoleplaySettingsSync();
	renderActions();
	updateSelectedActionsSummary();
	return true;
}

async function deleteCustomAction(actionId: string): Promise<void> {
	const action = customActions.find((entry) => entry.id === actionId);
	if (!action) return;
	const confirmed = await confirmDialogDanger(`Delete action "${action.label}"?`);
	if (!confirmed) return;

	customActions = customActions.filter((entry) => entry.id !== actionId);
	discardActionState([actionId]);
	persistCustomActions();
	queueRoleplaySettingsSync();
	renderActions();
}

function createRoleplayCategoryEntry(
	category: ActionCategory,
	activeCategory: ActionCategory,
	actions: RoleplayAction[]
): HTMLDivElement {
	const wrapper = document.createElement("div");
	wrapper.className = "roleplay-action-category-entry";
	wrapper.classList.toggle("is-custom", isCustomCategory(category));

	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn roleplay-action-category-pill";
	button.classList.toggle("active", category === activeCategory);
	button.setAttribute("role", "tab");
	button.setAttribute("aria-selected", String(category === activeCategory));
	button.textContent = `${getCategoryLabel(category)} (${getCategoryCount(category, actions)})`;
	button.addEventListener("click", () => {
		activeActionCategory = category;
		renderActions();
	});
	wrapper.append(button);

	if (isCustomCategory(category)) {
		appendCustomCategoryControls(wrapper, category);
	}

	return wrapper;
}

function createRoleplayActionChip(action: RoleplayAction): HTMLDivElement {
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

	const favoriteButton = createRoleplayIconButton({
		icon: favoriteActionIds.has(action.id) ? "star" : "star_outline",
		title: favoriteActionIds.has(action.id) ? "Remove favorite" : "Favorite action",
		onClick: () => toggleFavorite(action.id)
	});
	favoriteButton.classList.add("roleplay-action-chip__favorite");

	const controls = document.createElement("div");
	controls.className = "roleplay-action-chip__controls";
	controls.append(favoriteButton);

	if (action.custom) {
		controls.append(
			createRoleplayIconButton({
				icon: "edit",
				title: `Edit ${action.label}`,
				onClick: () => openRoleplayEditActionModal(action.id)
			}),
			createRoleplayIconButton({
				icon: "delete",
				title: `Delete ${action.label}`,
				onClick: () => void deleteCustomAction(action.id),
				danger: true
			})
		);
	}

	chip.append(selectButton, controls);

	return chip;
}

function renderActions(): void {
	const actions = getAllActions();
	const activeCategory = ensureActiveActionCategory(actions);
	ensuredRoleplayActionsRoot.replaceChildren();

	const availableCategories = getAvailableActionCategories(actions);
	if (!activeCategory || availableCategories.length === 0) return;

	const nav = document.createElement("div");
	nav.className = "roleplay-action-category-nav";
	nav.setAttribute("role", "tablist");
	nav.setAttribute("aria-label", "Roleplay action categories");

	for (const category of availableCategories) {
		nav.append(createRoleplayCategoryEntry(category, activeCategory, actions));
	}

	renderInlineAddCategory(nav);

	const strip = document.createElement("div");
	strip.className = "roleplay-action-strip";

	const relevant =
		activeCategory === "favorites"
			? actions.filter((action) => favoriteActionIds.has(action.id))
			: actions.filter((action) => action.category === activeCategory);

	for (const action of relevant) {
		strip.append(createRoleplayActionChip(action));
	}

	renderInlineAddAction(strip, activeCategory);

	ensuredRoleplayActionsRoot.append(nav, strip);
}

function addCustomCategory(rawLabel: string): boolean {
	const label = rawLabel.trim();
	if (!label) return false;

	if (!isCategoryLabelAvailable(label)) {
		toastService.warn({ title: "Category already exists", text: "That category name is already in use." });
		return false;
	}

	const category = createCustomCategory(label);
	customCategories.unshift(category);
	persistCustomCategories();
	activeActionCategory = category.id;
	queueRoleplaySettingsSync();
	renderActions();
	return true;
}

function updateCustomCategory(categoryId: CustomActionCategoryId, rawLabel: string): boolean {
	const label = rawLabel.trim();
	const category = customCategories.find((entry) => entry.id === categoryId);
	if (!label || !category) return false;

	if (!isCategoryLabelAvailable(label, categoryId)) {
		toastService.warn({ title: "Category already exists", text: "That category name is already in use." });
		return false;
	}

	category.label = label;
	persistCustomCategories();
	queueRoleplaySettingsSync();
	renderActions();
	return true;
}

async function deleteCustomCategory(categoryId: CustomActionCategoryId): Promise<void> {
	const category = customCategories.find((entry) => entry.id === categoryId);
	if (!category) return;
	const actionIds = customActions.filter((action) => action.category === categoryId).map((action) => action.id);
	const confirmed = await confirmDialogDanger(
		`Delete category "${category.label}" and ${actionIds.length} action(s)?`
	);
	if (!confirmed) return;

	customCategories = customCategories.filter((entry) => entry.id !== categoryId);
	customActions = customActions.filter((action) => action.category !== categoryId);
	discardActionState(actionIds);
	persistCustomCategories();
	persistCustomActions();
	queueRoleplaySettingsSync();

	if (activeActionCategory === categoryId) {
		activeActionCategory = getAvailableActionCategories(getAllActions())[0] ?? "favorites";
	}

	renderActions();
}

function hideAddModalError(): void {
	ensuredRoleplayAddModalError.classList.add("hidden");
	ensuredRoleplayAddModalErrorMessage.textContent = "";
}

function showAddModalError(message: string): void {
	ensuredRoleplayAddModalErrorMessage.textContent = message;
	ensuredRoleplayAddModalError.classList.remove("hidden");
}

function closeRoleplayAddModal(): void {
	surfaceService.close("modal-roleplay-add");
}

function resetRoleplayAddModal(): void {
	pendingAddMode = null;
	pendingEditCategoryId = null;
	pendingEditActionId = null;
	hideAddModalError();
	ensuredRoleplayAddModalLabelInput.value = "";
	ensuredRoleplayAddModalLabelInput.classList.add("hidden");
	ensuredRoleplayAddModalInput.value = "";
}

function openRoleplayAddModal(mode: "category" | "action"): void {
	pendingAddMode = mode;
	pendingEditCategoryId = null;
	pendingEditActionId = null;
	hideAddModalError();
	ensuredRoleplayAddModalLabelInput.value = "";
	ensuredRoleplayAddModalLabelInput.classList.toggle("hidden", mode === "category");
	ensuredRoleplayAddModalInput.value = "";
	ensuredRoleplayAddModalTitle.textContent =
		mode === "category" ? "Add Category" : `Add Action to ${getCategoryLabel(activeActionCategory)}`;
	ensuredRoleplayAddModalLabelInput.placeholder = "Action label, e.g. Pet head";
	ensuredRoleplayAddModalInput.placeholder = mode === "category" ? "New category" : "Payload, e.g. pets her head";
	ensuredRoleplayAddModalSubmitButton.textContent = "Add";
	surfaceService.show("modal-roleplay-add");
	requestAnimationFrame(() =>
		(mode === "category" ? ensuredRoleplayAddModalInput : ensuredRoleplayAddModalLabelInput).focus()
	);
}

function openRoleplayEditCategoryModal(categoryId: CustomActionCategoryId): void {
	const category = customCategories.find((entry) => entry.id === categoryId);
	if (!category) return;
	pendingAddMode = "edit-category";
	pendingEditCategoryId = categoryId;
	pendingEditActionId = null;
	hideAddModalError();
	ensuredRoleplayAddModalLabelInput.value = "";
	ensuredRoleplayAddModalLabelInput.classList.add("hidden");
	ensuredRoleplayAddModalInput.value = category.label;
	ensuredRoleplayAddModalTitle.textContent = "Rename Category";
	ensuredRoleplayAddModalInput.placeholder = "Category name";
	ensuredRoleplayAddModalSubmitButton.textContent = "Save";
	surfaceService.show("modal-roleplay-add");
	requestAnimationFrame(() => ensuredRoleplayAddModalInput.select());
}

function openRoleplayEditActionModal(actionId: string): void {
	const action = customActions.find((entry) => entry.id === actionId);
	if (!action) return;
	pendingAddMode = "edit-action";
	pendingEditActionId = actionId;
	pendingEditCategoryId = null;
	hideAddModalError();
	ensuredRoleplayAddModalLabelInput.classList.remove("hidden");
	ensuredRoleplayAddModalLabelInput.value = action.label;
	ensuredRoleplayAddModalInput.value = action.text;
	ensuredRoleplayAddModalTitle.textContent = "Edit Action";
	ensuredRoleplayAddModalLabelInput.placeholder = "Action label";
	ensuredRoleplayAddModalInput.placeholder = "Action payload";
	ensuredRoleplayAddModalSubmitButton.textContent = "Save";
	surfaceService.show("modal-roleplay-add");
	requestAnimationFrame(() => ensuredRoleplayAddModalLabelInput.select());
}

function submitRoleplayAddModal(): void {
	if (pendingAddMode === "category") {
		const success = addCustomCategory(ensuredRoleplayAddModalInput.value);
		if (success) {
			closeRoleplayAddModal();
			return;
		}
		if (!ensuredRoleplayAddModalInput.value.trim()) {
			showAddModalError("Enter a category name.");
		}
		return;
	}

	if (pendingAddMode === "action") {
		if (activeActionCategory === "favorites") {
			showAddModalError("Choose a category before adding an action.");
			return;
		}
		const success = addCustomAction(
			ensuredRoleplayAddModalLabelInput.value,
			ensuredRoleplayAddModalInput.value,
			activeActionCategory
		);
		if (success) {
			closeRoleplayAddModal();
			return;
		}
		if (!ensuredRoleplayAddModalLabelInput.value.trim()) {
			showAddModalError("Enter an action label.");
			return;
		}
		if (!ensuredRoleplayAddModalInput.value.trim()) {
			showAddModalError("Enter an action payload.");
		}
	}

	if (pendingAddMode === "edit-category") {
		if (!pendingEditCategoryId) return;
		const success = updateCustomCategory(pendingEditCategoryId, ensuredRoleplayAddModalInput.value);
		if (success) {
			closeRoleplayAddModal();
			return;
		}
		if (!ensuredRoleplayAddModalInput.value.trim()) {
			showAddModalError("Enter a category name.");
		}
	}

	if (pendingAddMode === "edit-action") {
		if (!pendingEditActionId) return;
		const success = updateCustomAction(
			pendingEditActionId,
			ensuredRoleplayAddModalLabelInput.value,
			ensuredRoleplayAddModalInput.value
		);
		if (success) {
			closeRoleplayAddModal();
			return;
		}
		if (!ensuredRoleplayAddModalLabelInput.value.trim()) {
			showAddModalError("Enter an action label.");
			return;
		}
		if (!ensuredRoleplayAddModalInput.value.trim()) {
			showAddModalError("Enter an action payload.");
		}
	}
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
	selectedActionIds.clear();
	updateSelectedActionsSummary();
	renderActions();
}

function renderSuggestions(): void {
	ensuredRoleplaySuggestions.replaceChildren();

	if (isGeneratingSuggestions) {
		const emptyState = document.createElement("div");
		emptyState.className = "roleplay-empty-state";
		const text = document.createElement("span");
		text.textContent = "Generating suggestions...";
		emptyState.append(text);
		ensuredRoleplaySuggestions.append(emptyState);
		return;
	}

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
	const visibleMessages = (chat?.content || []).filter((message) => !message.hidden).slice(-4);
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

function buildSuggestionPrompts(args: {
	transcript: string;
	personaName: string;
	personaPrompt: string;
	delimiterPreset: string;
	customDelimiterInstructions: { dialogue: string; action: string; thought: string };
}): {
	systemInstruction: string;
	userPrompt: string;
} {
	const delimiterContext =
		args.delimiterPreset === "custom"
			? [
					"Active response delimiter preset: custom.",
					`Dialogue: ${args.customDelimiterInstructions.dialogue || "(none)"}.`,
					`Action: ${args.customDelimiterInstructions.action || "(none)"}.`,
					`Thought: ${args.customDelimiterInstructions.thought || "(none)"}.`
				].join(" ")
			: `Active response delimiter preset: ${args.delimiterPreset}.`;

	const systemInstruction = [
		"You generate exactly four concise Visual Novel-like reply options.",
		'Return strict JSON only in the form {"options":["...","...","...","..."]}.',
		"Each option must be a single user reply, 4 to 18 words, with no numbering or commentary.",
		"Write options that feel distinct in tone and intent.",
		delimiterContext
	].join(" ");

	const userPrompt = [
		`Active persona: ${args.personaName}.`,
		`Persona guidance: ${args.personaPrompt || "No extra guidance provided."}`,
		"Conversation transcript:",
		args.transcript,
		"Generate the next four things the user could say. They need to be distinct and lead the conversation in different directions. At least one option should be adversarial, and at least one option should explore intimacy."
	].join("\n\n");

	return { systemInstruction, userPrompt };
}

function buildAccess(): ChatModelAccess {
	const usePremiumEndpoint = hasPremiumModelAccess && shouldPreferPremiumEndpoint();
	return {
		hasGeminiAccess:
			hasPremiumModelAccess || (localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "").trim().length > 0,
		hasOpenRouterAccess:
			hasPremiumModelAccess ||
			(localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "").trim().length > 0,
		isPremiumEndpointPreferred: usePremiumEndpoint
	};
}

function buildRoleplaySuggestionThinkingConfig(
	model: string
): { includeThoughts: false; thinkingBudget: number } | undefined {
	return modelRequiresThinking(model)
		? { includeThoughts: false, thinkingBudget: getRoleplaySuggestionThinkingCap(model) ?? 128 }
		: undefined;
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
	const available = getAccessibleRoleplaySuggestionModels(access);
	const usePremiumLabel = access.isPremiumEndpointPreferred === true;
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
		option.textContent = formatChatModelLabel(model, { usePremiumLabel });
		ensuredRoleplaySuggestionModelSelect.append(option);
	}

	ensuredRoleplaySuggestionModelSelect.value = getValidRoleplaySuggestionModel(currentValue, access);
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
		generatePurpose: "roleplay_suggestion",
		systemInstruction,
		...baseConfig
	};

	const response = await fetch(PRO_REQUEST_ENDPOINT, {
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
			enableThinking: modelRequiresThinking(model),
			thinkingBudget: modelRequiresThinking(model) ? (getRoleplaySuggestionThinkingCap(model) ?? 128) : 0,
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
	isGeneratingSuggestions = true;
	renderSuggestions();
	syncSuggestionControls();

	try {
		const settings = settingsService.getSettings();
		const model = getValidRoleplaySuggestionModel(
			settings.roleplaySuggestionModel || settings.model,
			buildAccess()
		);
		const { systemInstruction, userPrompt } = buildSuggestionPrompts({
			transcript,
			personaName: personality.name,
			personaPrompt: personality.prompt,
			delimiterPreset: settings.delimiterPreset,
			customDelimiterInstructions: settings.customDelimiterInstructions
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
		isGeneratingSuggestions = false;
		renderSuggestions();
	} catch (error: any) {
		suggestionOptions = [];
		isGeneratingSuggestions = false;
		renderSuggestions();
		console.error(error);
		toastService.warn({ title: "Roleplay suggestions unavailable", text: error?.message || String(error) });
	} finally {
		isGeneratingSuggestions = false;
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

	if (composerEnabled) {
		suggestionOptions = [];
		renderSuggestions();
	}
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

ensuredRoleplayAddModalSubmitButton.addEventListener("click", () => {
	submitRoleplayAddModal();
});

ensuredRoleplayAddModalCancelButton.addEventListener("click", () => {
	closeRoleplayAddModal();
});

ensuredRoleplayAddModal.addEventListener("surface-closed", () => {
	resetRoleplayAddModal();
});

function handleRoleplayEditorKeydown(event: KeyboardEvent): void {
	if (event.key === "Enter") {
		event.preventDefault();
		submitRoleplayAddModal();
	}
	if (event.key === "Escape") {
		event.preventDefault();
		closeRoleplayAddModal();
	}
}

ensuredRoleplayAddModalLabelInput.addEventListener("keydown", handleRoleplayEditorKeydown);
ensuredRoleplayAddModalInput.addEventListener("keydown", handleRoleplayEditorKeydown);

window.addEventListener("roleplay-send-requested", (event) => {
	void (async () => {
		if (!composerEnabled || isGenerating) return;
		event.preventDefault();

		try {
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

onAppEvent("api-keys-changed", () => {
	populateRoleplayModelOptions();
});

onAppEvent("premium-endpoint-preference-changed", () => {
	populateRoleplayModelOptions();
});

onAppEvent("sync-data-pulled", () => {
	loadActionState();
	renderActions();
	updateSelectedActionsSummary();
});

onAppEvent("settings-loaded-from-storage", () => {
	loadActionState();
	populateRoleplayModelOptions();
	renderActions();
	updateSelectedActionsSummary();
});

document.querySelector<HTMLDivElement>("#personalitiesDiv")?.addEventListener("change", () => {
	void refreshComposerAvailability();
});

ensuredRoleplaySuggestionModelSelect.addEventListener("change", () => {
	lastSuggestionSignature = "";
});

loadActionState();
populateRoleplayModelOptions();
renderActions();
renderSuggestions();
updateSelectedActionsSummary();
setActiveTab("dialogue");
syncComposerVisibility();
void refreshComposerAvailability();

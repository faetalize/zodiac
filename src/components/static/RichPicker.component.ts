import * as surfaceService from "../../services/Surface.service";
import * as pinningService from "../../services/Pinning.service";
import { onAppEvent, onDocumentEvent } from "../../events";
import * as helpers from "../../utils/helpers";
import { getChatModelDefinition, type ChatModelDefinition } from "../../types/Models";
import { transitionSheetHeight } from "./AdaptiveSheet.component";
import claudeIconUrl from "../../assets/model-family-icons/claude.svg?url";
import deepseekIconUrl from "../../assets/model-family-icons/deepseek.svg?url";
import googleIconUrl from "../../assets/model-family-icons/google.svg?url";
import grokIconUrl from "../../assets/model-family-icons/grok.svg?url";
import inceptionIconUrl from "../../assets/model-family-icons/inception.png?url";
import openAiIconUrl from "../../assets/model-family-icons/openai.svg?url";
import openRouterIconUrl from "../../assets/model-family-icons/openrouter.svg?url";
import qwenIconUrl from "../../assets/model-family-icons/qwen.svg?url";
import zhipuIconUrl from "../../assets/model-family-icons/zhipu.svg?url";

const SHEET_ID = "model-picker-sheet";

const modelSelect = document.querySelector<HTMLSelectElement>("#selectedModel");
const trigger = document.querySelector<HTMLButtonElement>("#model-picker-trigger");
const triggerLabel = trigger?.querySelector<HTMLElement>(".model-picker-trigger__label") ?? null;
const sheet = document.querySelector<HTMLElement>("#model-picker-sheet");
const familiesView = document.querySelector<HTMLElement>("#model-picker-families");
const familyList = document.querySelector<HTMLElement>("#model-picker-family-list");
const detailView = document.querySelector<HTMLElement>("#model-picker-family-detail");
const backButton = document.querySelector<HTMLButtonElement>("#model-picker-back");
const familyTitle = document.querySelector<HTMLElement>("#model-picker-family-title");
const searchInput = document.querySelector<HTMLInputElement>("#model-picker-search-input");
const megaToggle = document.querySelector<HTMLButtonElement>("#model-picker-mega-toggle");
const modelList = document.querySelector<HTMLElement>("#model-picker-model-list");

if (
	!modelSelect ||
	!trigger ||
	!triggerLabel ||
	!sheet ||
	!familiesView ||
	!familyList ||
	!detailView ||
	!backButton ||
	!familyTitle ||
	!searchInput ||
	!megaToggle ||
	!modelList
) {
	console.error("Rich model picker initialization failed");
	throw new Error("Missing DOM element for the rich model picker");
}

const ensuredSelect = modelSelect;
const ensuredTrigger = trigger;
const ensuredTriggerLabel = triggerLabel;
const ensuredSheet = sheet;
const ensuredFamiliesView = familiesView;
const ensuredFamilyList = familyList;
const ensuredDetailView = detailView;
const ensuredBack = backButton;
const ensuredFamilyTitle = familyTitle;
const ensuredSearchInput = searchInput;
const ensuredMegaToggle = megaToggle;
const ensuredModelList = modelList;

interface CapabilityDescriptor {
	label: string;
	icon: string;
	test: (definition: ChatModelDefinition) => boolean;
}

type ModelFamilyIcon =
	| {
			alt: string;
			src: string;
			type: "image" | "mask";
	  }
	| {
			name: string;
			type: "symbol";
	  };

interface ModelFamily {
	key: string;
	label: string;
	icon: ModelFamilyIcon;
	/** Matched against the lowercased model id. */
	test: (id: string) => boolean;
}

interface ModelEntry {
	id: string;
	label: string;
	definition: ChatModelDefinition | undefined;
}

interface FamilyGroup {
	family: ModelFamily;
	models: ModelEntry[];
}

const CAPABILITIES: CapabilityDescriptor[] = [
	{ label: "Vision", icon: "visibility", test: (model) => model.supportsImageInput },
	{ label: "Image gen", icon: "image", test: (model) => model.supportsImageOutput },
	{ label: "Thinking", icon: "neurology", test: (model) => model.supportsThinking },
	{ label: "Files", icon: "description", test: (model) => model.supportsFileInput }
];

const OPENROUTER_SUFFIX_PATTERN = /\s+via OpenRouter$/i;
const MEGA_SUFFIX_PATTERN = /\s*\[MEGA\]\s*$/i;
const FUZZY_MATCH_THRESHOLD = 0.1;

// Families are matched in order; the first hit wins. Anything unmatched lands in OTHER_FAMILY.
const FAMILIES: ModelFamily[] = [
	{
		key: "google",
		label: "Google",
		icon: { alt: "Google", src: googleIconUrl, type: "image" },
		// Google's families: Gemini and the open Gemma models.
		test: (id) => id.includes("gemini") || id.includes("gemma")
	},
	{
		key: "gpt",
		label: "GPT",
		icon: { alt: "OpenAI", src: openAiIconUrl, type: "mask" },
		test: (id) => id.includes("gpt") || id.startsWith("openai/")
	},
	{
		key: "claude",
		label: "Claude",
		icon: { alt: "Claude", src: claudeIconUrl, type: "image" },
		test: (id) => id.includes("claude") || id.startsWith("anthropic/")
	},
	{
		key: "qwen",
		label: "Qwen",
		icon: { alt: "Qwen", src: qwenIconUrl, type: "image" },
		test: (id) => id.includes("qwen")
	},
	{
		key: "deepseek",
		label: "DeepSeek",
		icon: { alt: "DeepSeek", src: deepseekIconUrl, type: "image" },
		test: (id) => id.includes("deepseek")
	},
	{
		key: "grok",
		label: "Grok",
		icon: { alt: "Grok", src: grokIconUrl, type: "mask" },
		test: (id) => id.includes("grok") || id.startsWith("x-ai/")
	},
	{
		key: "glm",
		label: "GLM",
		icon: { alt: "Zhipu", src: zhipuIconUrl, type: "image" },
		test: (id) => id.includes("glm") || id.startsWith("z-ai/")
	},
	{
		key: "mercury",
		label: "Mercury",
		icon: { alt: "Inception", src: inceptionIconUrl, type: "image" },
		test: (id) => id.includes("mercury") || id.startsWith("inception/")
	}
];

const OTHER_FAMILY: ModelFamily = {
	key: "other",
	label: "Other",
	icon: { name: "category", type: "symbol" },
	test: () => true
};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const MODEL_PICKER_GROUP_ORDER = ["Flash Lite", "Flash", "Pro", "Haiku", "Sonnet", "Opus"];

// Which family page is currently shown, and whether we skipped the family list because only one exists.
let activeFamily: string | null = null;
let singleFamilyMode = false;
let searchTerm = "";
let detailMegaOnly = false;
let searchDebounceTimer: number;

function readEntries(): ModelEntry[] {
	const entries: ModelEntry[] = [];
	for (const option of Array.from(ensuredSelect.options)) {
		if (option.disabled || option.value === "") continue;
		entries.push({
			id: option.value,
			label: (option.textContent ?? option.value).trim(),
			definition: getChatModelDefinition(option.value)
		});
	}
	return entries;
}

function familyKeyOf(entry: ModelEntry): string {
	const id = entry.id.toLowerCase();
	for (const family of FAMILIES) {
		if (family.test(id)) return family.key;
	}
	return OTHER_FAMILY.key;
}

function groupByFamily(entries: ModelEntry[]): FamilyGroup[] {
	const groups: FamilyGroup[] = [];
	for (const family of [...FAMILIES, OTHER_FAMILY]) {
		const models = entries
			.filter((entry) => familyKeyOf(entry) === family.key)
			// Newer/high-version models should appear first inside each provider.
			.sort((a, b) => collator.compare(getEntryDisplayLabel(b), getEntryDisplayLabel(a)));
		if (models.length > 0) groups.push({ family, models });
	}
	return groups;
}

function getFamilyByKey(key: string): ModelFamily {
	return [...FAMILIES, OTHER_FAMILY].find((family) => family.key === key) ?? OTHER_FAMILY;
}

function getEntrySearchText(entry: ModelEntry): string {
	const family = getFamilyByKey(familyKeyOf(entry));
	return [
		entry.id,
		entry.label,
		getEntryDisplayLabel(entry),
		entry.definition?.premiumLabel,
		entry.definition?.modelPickerGroup,
		family.label
	]
		.filter(Boolean)
		.join(" ");
}

function getSearchScore(entry: ModelEntry): number | null {
	if (!searchTerm) return null;
	return helpers.fuzzySearch(searchTerm, getEntrySearchText(entry));
}

function matchesSearch(entry: ModelEntry): boolean {
	if (!searchTerm) return true;
	const score = getSearchScore(entry);
	return score !== null && score > FUZZY_MATCH_THRESHOLD;
}

function filterEntries(entries: ModelEntry[], options: { megaOnly?: boolean } = {}): ModelEntry[] {
	return entries.filter((entry) => {
		if (options.megaOnly && entry.definition?.mega !== true) return false;
		return matchesSearch(entry);
	});
}

function getSearchResults(entries: ModelEntry[]): ModelEntry[] {
	return entries
		.map((entry) => ({ entry, score: getSearchScore(entry) }))
		.filter((item): item is { entry: ModelEntry; score: number } => {
			return item.score !== null && item.score > FUZZY_MATCH_THRESHOLD;
		})
		.sort(
			(a, b) =>
				b.score - a.score || collator.compare(getEntryDisplayLabel(b.entry), getEntryDisplayLabel(a.entry))
		)
		.map((item) => item.entry);
}

function getPinnedEntries(entries: ModelEntry[]): ModelEntry[] {
	const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
	return pinningService
		.getPinnedModelIds()
		.map((id) => entriesById.get(id))
		.filter((entry): entry is ModelEntry => Boolean(entry));
}

function formatModelDisplayLabel(label: string, definition: ChatModelDefinition | undefined): string {
	let displayLabel = label;
	if (definition?.mega) displayLabel = displayLabel.replace(MEGA_SUFFIX_PATTERN, "");
	if (definition?.provider === "openrouter") displayLabel = displayLabel.replace(OPENROUTER_SUFFIX_PATTERN, "");
	return displayLabel.trim();
}

function getEntryDisplayLabel(entry: ModelEntry): string {
	return formatModelDisplayLabel(entry.label, entry.definition);
}

function createFamilyIcon(icon: ModelFamilyIcon): HTMLElement {
	if (icon.type === "symbol") {
		const element = document.createElement("span");
		element.className = "settings-list-item-icon material-symbols-outlined model-picker-family-icon";
		element.textContent = icon.name;
		element.setAttribute("aria-hidden", "true");
		return element;
	}

	if (icon.type === "image") {
		const element = document.createElement("img");
		element.className = "settings-list-item-icon model-picker-family-icon model-picker-family-icon--image";
		element.src = icon.src;
		element.alt = "";
		element.title = icon.alt;
		element.setAttribute("aria-hidden", "true");
		return element;
	}

	const element = document.createElement("span");
	element.className = "settings-list-item-icon model-picker-family-icon model-picker-family-icon--mask";
	element.style.setProperty("--model-picker-family-icon-url", `url("${icon.src}")`);
	element.title = icon.alt;
	element.setAttribute("aria-hidden", "true");
	return element;
}

function createChip(className: string, label: string, iconUrl?: string): HTMLSpanElement {
	const chip = document.createElement("span");
	chip.className = `model-picker-chip ${className}`;

	if (iconUrl) {
		const icon = document.createElement("span");
		icon.className = "model-picker-chip__icon";
		icon.style.setProperty("--model-picker-chip-icon-url", `url("${iconUrl}")`);
		icon.setAttribute("aria-hidden", "true");
		chip.append(icon);
	}

	const text = document.createElement("span");
	text.textContent = label;
	chip.append(text);

	return chip;
}

function createFamilyRow(group: FamilyGroup): HTMLButtonElement {
	const { family, models } = group;
	const row = document.createElement("button");
	row.type = "button";
	row.className = "settings-list-item model-picker-family";
	row.dataset.familyKey = family.key;

	const selectedModel = models.find((entry) => entry.id === ensuredSelect.value);
	row.classList.toggle("selected", Boolean(selectedModel));

	row.append(createFamilyIcon(family.icon));

	const text = document.createElement("span");
	text.className = "settings-list-item-text";

	const title = document.createElement("span");
	title.className = "settings-list-item-title";
	title.textContent = family.label;
	text.append(title);

	const subtitle = document.createElement("span");
	subtitle.className = "settings-list-item-subtitle";
	subtitle.textContent = selectedModel
		? getEntryDisplayLabel(selectedModel)
		: `${models.length} ${models.length === 1 ? "model" : "models"}`;
	text.append(subtitle);

	row.append(text);

	const chevron = document.createElement("span");
	chevron.className = "settings-list-item-chevron material-symbols-outlined";
	chevron.textContent = "chevron_right";
	chevron.setAttribute("aria-hidden", "true");
	row.append(chevron);

	row.addEventListener("click", () => navigateToFamily(family.key));

	return row;
}

function createGroupDivider(label: string): HTMLDivElement {
	const divider = document.createElement("div");
	divider.className = "sidebar-group-divider model-picker-group-divider";
	divider.textContent = label;
	return divider;
}

function createEmptyState(message: string): HTMLDivElement {
	const empty = document.createElement("div");
	empty.className = "model-picker-empty";
	empty.textContent = message;
	return empty;
}

function createModelRow(entry: ModelEntry): HTMLDivElement {
	const row = document.createElement("div");
	row.className = "settings-list-item model-picker-row";
	row.dataset.modelId = entry.id;
	row.setAttribute("role", "option");
	row.tabIndex = 0;

	const isSelected = entry.id === ensuredSelect.value;
	row.classList.toggle("selected", isSelected);
	row.setAttribute("aria-selected", isSelected ? "true" : "false");

	const icon = document.createElement("span");
	icon.className = "settings-list-item-icon material-symbols-outlined";
	icon.textContent = isSelected ? "check_circle" : "radio_button_unchecked";
	icon.setAttribute("aria-hidden", "true");
	row.append(icon);

	const text = document.createElement("span");
	text.className = "settings-list-item-text";

	const title = document.createElement("span");
	title.className = "settings-list-item-title model-picker-row__title";

	const name = document.createElement("span");
	name.textContent = getEntryDisplayLabel(entry);
	title.append(name);

	text.append(title);

	if (entry.definition) {
		const supported = CAPABILITIES.filter((capability) => capability.test(entry.definition!));
		const hasChips = entry.definition.mega || entry.definition.provider === "openrouter";

		if (supported.length > 0 || hasChips) {
			const meta = document.createElement("span");
			meta.className = "settings-list-item-subtitle model-picker-meta";

			for (const capability of supported) {
				const capIcon = document.createElement("span");
				capIcon.className = "material-symbols-outlined";
				capIcon.textContent = capability.icon;
				capIcon.title = capability.label;
				capIcon.setAttribute("aria-hidden", "true");
				meta.append(capIcon);
			}

			if (entry.definition.mega) {
				meta.append(createChip("model-picker-mega", "MEGA"));
			}

			if (entry.definition.provider === "openrouter") {
				meta.append(createChip("model-picker-openrouter", "OpenRouter", openRouterIconUrl));
			}

			text.append(meta);
		}
	}

	row.append(text);
	row.addEventListener("click", () => selectModel(entry.id));

	const isPinned = pinningService.isModelPinned(entry.id);
	const pinButton = document.createElement("button");
	pinButton.type = "button";
	pinButton.className = "model-picker-pin material-symbols-outlined";
	pinButton.classList.toggle("selected", isPinned);
	pinButton.textContent = "star";
	pinButton.title = isPinned ? "Unpin model" : "Pin model";
	pinButton.setAttribute("aria-label", `${isPinned ? "Unpin" : "Pin"} ${getEntryDisplayLabel(entry)}`);
	pinButton.setAttribute("aria-pressed", isPinned ? "true" : "false");
	pinButton.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		void pinningService.toggleModelPinned(entry.id).then(() => refreshOpenSheet());
	});

	row.append(pinButton);
	row.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		selectModel(entry.id);
	});

	return row;
}

function createPinnedSection(entries: ModelEntry[]): HTMLDivElement {
	const section = document.createElement("div");
	section.className = "model-picker-pinned-section";
	section.append(createGroupDivider("Pinned"));
	for (const entry of entries) section.append(createModelRow(entry));
	return section;
}

function showView(view: "families" | "detail"): void {
	transitionSheetHeight(ensuredSheet, () => {
		ensuredFamiliesView.classList.toggle("hidden", view !== "families");
		ensuredDetailView.classList.toggle("hidden", view !== "detail");
	});
}

function renderFamilyList(): void {
	const entries = readEntries();
	const groups = groupByFamily(filterEntries(entries));
	const pinnedEntries = getPinnedEntries(filterEntries(entries));

	ensuredFamilyList.classList.toggle("model-picker-search-results", Boolean(searchTerm));
	ensuredFamilyList.replaceChildren();

	if (searchTerm) {
		const results = getSearchResults(entries);
		const pinnedResults = getPinnedEntries(results);
		const pinnedIds = new Set(pinnedResults.map((entry) => entry.id));
		const unpinnedResults = results.filter((entry) => !pinnedIds.has(entry.id));

		if (results.length === 0) {
			ensuredFamilyList.append(createEmptyState("No matching models"));
			return;
		}

		if (pinnedResults.length > 0) ensuredFamilyList.append(createPinnedSection(pinnedResults));
		if (pinnedResults.length > 0 && unpinnedResults.length > 0) {
			ensuredFamilyList.append(createGroupDivider("All models"));
		}
		for (const entry of unpinnedResults) ensuredFamilyList.append(createModelRow(entry));
		return;
	}

	if (groups.length === 0 && pinnedEntries.length === 0) {
		ensuredFamilyList.append(createEmptyState("No matching providers"));
		return;
	}

	if (pinnedEntries.length > 0) ensuredFamilyList.append(createPinnedSection(pinnedEntries));
	if (pinnedEntries.length > 0 && groups.length > 0) ensuredFamilyList.append(createGroupDivider("All models"));
	for (const group of groups) ensuredFamilyList.append(createFamilyRow(group));
}

function renderFamilyDetail(): boolean {
	const groups = groupByFamily(filterEntries(readEntries(), { megaOnly: detailMegaOnly }));
	const group = groups.find((candidate) => candidate.family.key === activeFamily);

	const family = activeFamily ? getFamilyByKey(activeFamily) : OTHER_FAMILY;
	ensuredFamilyTitle.textContent = family.label;
	ensuredBack.classList.toggle("hidden", singleFamilyMode);
	updateMegaToggle();

	ensuredModelList.replaceChildren();

	if (!group || group.models.length === 0) {
		ensuredModelList.append(createEmptyState(detailMegaOnly ? "No mega models match" : "No matching models"));
		return true;
	}

	activeFamily = group.family.key;
	renderGroupedModels(group.models);

	return true;
}

function renderGroupedModels(models: ModelEntry[]): void {
	const groupedModels = models.filter((entry) => entry.definition?.modelPickerGroup);
	const hasGroups = groupedModels.length > 0;

	if (!hasGroups) {
		for (const entry of models) ensuredModelList.append(createModelRow(entry));
		return;
	}

	const remaining = new Set(models);
	const groupNames = Array.from(new Set(groupedModels.map((entry) => entry.definition!.modelPickerGroup!))).sort(
		(a, b) => {
			const aIndex = MODEL_PICKER_GROUP_ORDER.indexOf(a);
			const bIndex = MODEL_PICKER_GROUP_ORDER.indexOf(b);
			if (aIndex !== -1 || bIndex !== -1) {
				if (aIndex === -1) return 1;
				if (bIndex === -1) return -1;
				return aIndex - bIndex;
			}
			return collator.compare(a, b);
		}
	);

	for (const groupName of groupNames) {
		const entries = models.filter((entry) => entry.definition?.modelPickerGroup === groupName);
		if (entries.length === 0) continue;
		ensuredModelList.append(createGroupDivider(groupName));
		for (const entry of entries) {
			remaining.delete(entry);
			ensuredModelList.append(createModelRow(entry));
		}
	}

	if (remaining.size > 0) {
		ensuredModelList.append(createGroupDivider("Other"));
		for (const entry of remaining) ensuredModelList.append(createModelRow(entry));
	}
}

function navigateToFamily(key: string): void {
	activeFamily = key;
	if (renderFamilyDetail()) showView("detail");
}

function navigateToFamilyList(): void {
	activeFamily = null;
	renderFamilyList();
	showView("families");
}

function updateMegaToggle(): void {
	ensuredMegaToggle.classList.toggle("selected", detailMegaOnly);
	ensuredMegaToggle.setAttribute("aria-pressed", detailMegaOnly ? "true" : "false");
}

function selectModel(id: string): void {
	ensuredSelect.value = id;
	if (ensuredSelect.value !== id) return; // option not selectable (e.g. lost access)

	ensuredSelect.dispatchEvent(new Event("change", { bubbles: true }));
	updateTrigger();
	surfaceService.close(SHEET_ID);
}

function updateTrigger(): void {
	const selected = ensuredSelect.selectedOptions[0];
	const selectedLabel = selected?.textContent?.trim();
	ensuredTriggerLabel.textContent = selectedLabel
		? formatModelDisplayLabel(selectedLabel, getChatModelDefinition(selected.value))
		: "Select a model";
	ensuredTrigger.disabled = ensuredSelect.disabled;
}

function openSheet(): void {
	searchTerm = ensuredSearchInput.value.trim();
	const entries = readEntries();
	const groups = groupByFamily(filterEntries(entries));
	const hasPinnedModels = getPinnedEntries(entries).length > 0;
	singleFamilyMode = !searchTerm && !hasPinnedModels && groups.length === 1;

	if (singleFamilyMode) {
		// Skip the family list when there is nothing to choose between; drill straight in.
		activeFamily = groups[0].family.key;
		renderFamilyDetail();
		showView("detail");
	} else {
		navigateToFamilyList();
	}

	surfaceService.show(SHEET_ID);
	ensuredTrigger.setAttribute("aria-expanded", "true");
}

// Keep an open sheet in sync when the underlying option list changes (access gating, premium endpoint, etc.).
function refreshOpenSheet(): void {
	if (ensuredSheet.classList.contains("hidden")) return;

	const entries = readEntries();
	const groups = groupByFamily(filterEntries(entries));
	const hasPinnedModels = getPinnedEntries(entries).length > 0;
	singleFamilyMode = !searchTerm && !hasPinnedModels && groups.length === 1;

	if (searchTerm) {
		activeFamily = null;
		renderFamilyList();
		showView("families");
		return;
	}

	if (singleFamilyMode) {
		activeFamily = groups[0].family.key;
		renderFamilyDetail();
		showView("detail");
		return;
	}

	renderFamilyList();
	if (activeFamily && renderFamilyDetail()) showView("detail");
	else navigateToFamilyList();
}

ensuredTrigger.addEventListener("click", openSheet);
ensuredBack.addEventListener("click", navigateToFamilyList);
ensuredMegaToggle.addEventListener("click", () => {
	detailMegaOnly = !detailMegaOnly;
	renderFamilyDetail();
});
ensuredSearchInput.addEventListener("input", () => {
	clearTimeout(searchDebounceTimer);
	searchDebounceTimer = window.setTimeout(() => {
		searchTerm = ensuredSearchInput.value.trim();
		refreshOpenSheet();
	}, 200);
});

ensuredSheet.addEventListener("surface-closed", () => {
	ensuredTrigger.setAttribute("aria-expanded", "false");
});

ensuredSelect.addEventListener("change", () => {
	updateTrigger();
	refreshOpenSheet();
});
onDocumentEvent("chat-model-changed", () => {
	updateTrigger();
	refreshOpenSheet();
});
onAppEvent("settings-loaded-from-storage", refreshOpenSheet);

// The native select is rebuilt when access changes (API keys, auth, premium endpoint).
// Mirror those updates: keep the trigger label correct and refresh the picker if it's open.
const selectObserver = new MutationObserver(() => {
	updateTrigger();
	refreshOpenSheet();
});
selectObserver.observe(ensuredSelect, { childList: true, attributes: true, attributeFilter: ["disabled"] });

// Reveal the button-based picker and retire the native select as the visible control.
ensuredSelect.classList.add("model-picker-native-hidden");
ensuredTrigger.classList.remove("hidden");

updateTrigger();

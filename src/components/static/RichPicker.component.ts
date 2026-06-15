import * as surfaceService from "../../services/Surface.service";
import { onDocumentEvent } from "../../events";
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

// Which family page is currently shown, and whether we skipped the family list because only one exists.
let activeFamily: string | null = null;
let singleFamilyMode = false;

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
			.sort((a, b) => collator.compare(getEntryDisplayLabel(b), getEntryDisplayLabel(a)));
		if (models.length > 0) groups.push({ family, models });
	}
	return groups;
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
	row.append(chevron);

	row.addEventListener("click", () => navigateToFamily(family.key));

	return row;
}

function createModelRow(entry: ModelEntry): HTMLButtonElement {
	const row = document.createElement("button");
	row.type = "button";
	row.className = "settings-list-item model-picker-row";
	row.dataset.modelId = entry.id;
	row.setAttribute("role", "option");

	const isSelected = entry.id === ensuredSelect.value;
	row.classList.toggle("selected", isSelected);
	row.setAttribute("aria-selected", isSelected ? "true" : "false");

	const icon = document.createElement("span");
	icon.className = "settings-list-item-icon material-symbols-outlined";
	icon.textContent = isSelected ? "check_circle" : "radio_button_unchecked";
	row.append(icon);

	const text = document.createElement("span");
	text.className = "settings-list-item-text";

	const title = document.createElement("span");
	title.className = "settings-list-item-title model-picker-row__title";

	const name = document.createElement("span");
	name.textContent = getEntryDisplayLabel(entry);
	title.append(name);

	if (entry.definition?.mega) {
		title.append(createChip("model-picker-mega", "MEGA"));
	}

	if (entry.definition?.provider === "openrouter") {
		title.append(createChip("model-picker-openrouter", "OpenRouter", openRouterIconUrl));
	}

	text.append(title);

	if (entry.definition) {
		const supported = CAPABILITIES.filter((capability) => capability.test(entry.definition!));
		if (supported.length > 0) {
			const caps = document.createElement("span");
			caps.className = "settings-list-item-subtitle model-picker-caps";
			for (const capability of supported) {
				const capIcon = document.createElement("span");
				capIcon.className = "material-symbols-outlined";
				capIcon.textContent = capability.icon;
				capIcon.title = capability.label;
				caps.append(capIcon);
			}
			text.append(caps);
		}
	}

	row.append(text);
	row.addEventListener("click", () => selectModel(entry.id));

	return row;
}

function showView(view: "families" | "detail"): void {
	transitionSheetHeight(ensuredSheet, () => {
		ensuredFamiliesView.classList.toggle("hidden", view !== "families");
		ensuredDetailView.classList.toggle("hidden", view !== "detail");
	});
}

function renderFamilyList(): void {
	const groups = groupByFamily(readEntries());
	ensuredFamilyList.replaceChildren();
	for (const group of groups) ensuredFamilyList.append(createFamilyRow(group));
}

function renderFamilyDetail(): boolean {
	const groups = groupByFamily(readEntries());
	const group = groups.find((candidate) => candidate.family.key === activeFamily);
	if (!group) return false;

	activeFamily = group.family.key;
	ensuredFamilyTitle.textContent = group.family.label;
	ensuredBack.classList.toggle("hidden", singleFamilyMode);

	ensuredModelList.replaceChildren();
	for (const entry of group.models) ensuredModelList.append(createModelRow(entry));

	return true;
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
	const groups = groupByFamily(readEntries());
	singleFamilyMode = groups.length === 1;

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

	const groups = groupByFamily(readEntries());
	singleFamilyMode = groups.length === 1;

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

import * as surfaceService from "../../services/Surface.service";
import { onDocumentEvent } from "../../events";
import { getChatModelDefinition, type ChatModelDefinition } from "../../types/Models";

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

interface ModelFamily {
	key: string;
	label: string;
	icon: string;
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

// Families are matched in order; the first hit wins. Anything unmatched lands in OTHER_FAMILY.
const FAMILIES: ModelFamily[] = [
	{ key: "gemini", label: "Gemini", icon: "auto_awesome", test: (id) => id.includes("gemini") },
	{ key: "gpt", label: "GPT", icon: "blur_on", test: (id) => id.includes("gpt") || id.startsWith("openai/") },
	{
		key: "claude",
		label: "Claude",
		icon: "psychology",
		test: (id) => id.includes("claude") || id.startsWith("anthropic/")
	},
	{ key: "qwen", label: "Qwen", icon: "language", test: (id) => id.includes("qwen") },
	{ key: "glm", label: "GLM", icon: "hub", test: (id) => id.includes("glm") || id.startsWith("z-ai/") },
	{
		key: "mercury",
		label: "Mercury",
		icon: "bolt",
		test: (id) => id.includes("mercury") || id.startsWith("inception/")
	}
];

const OTHER_FAMILY: ModelFamily = { key: "other", label: "Other", icon: "category", test: () => true };

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
		const models = entries.filter((entry) => familyKeyOf(entry) === family.key);
		if (models.length > 0) groups.push({ family, models });
	}
	return groups;
}

function createFamilyRow(group: FamilyGroup): HTMLButtonElement {
	const { family, models } = group;
	const row = document.createElement("button");
	row.type = "button";
	row.className = "settings-list-item model-picker-family";
	row.dataset.familyKey = family.key;

	const selectedModel = models.find((entry) => entry.id === ensuredSelect.value);
	row.classList.toggle("selected", Boolean(selectedModel));

	const icon = document.createElement("span");
	icon.className = "settings-list-item-icon material-symbols-outlined";
	icon.textContent = family.icon;
	row.append(icon);

	const text = document.createElement("span");
	text.className = "settings-list-item-text";

	const title = document.createElement("span");
	title.className = "settings-list-item-title";
	title.textContent = family.label;
	text.append(title);

	const subtitle = document.createElement("span");
	subtitle.className = "settings-list-item-subtitle";
	subtitle.textContent = selectedModel
		? selectedModel.label
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
	name.textContent = entry.label;
	title.append(name);

	if (entry.definition?.mega) {
		const mega = document.createElement("span");
		mega.className = "model-picker-mega";
		mega.textContent = "MEGA";
		title.append(mega);
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
	ensuredFamiliesView.classList.toggle("hidden", view !== "families");
	ensuredDetailView.classList.toggle("hidden", view !== "detail");
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
	ensuredTriggerLabel.textContent = selected?.textContent?.trim() || "Select a model";
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

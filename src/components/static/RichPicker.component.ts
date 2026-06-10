import * as surfaceService from "../../services/Surface.service";
import { onDocumentEvent } from "../../events";
import { getChatModelDefinition, type ChatModelDefinition } from "../../types/Models";

const SHEET_ID = "model-picker-sheet";

const modelSelect = document.querySelector<HTMLSelectElement>("#selectedModel");
const trigger = document.querySelector<HTMLButtonElement>("#model-picker-trigger");
const triggerLabel = trigger?.querySelector<HTMLElement>(".model-picker-trigger__label") ?? null;
const sheet = document.querySelector<HTMLElement>("#model-picker-sheet");
const searchInput = document.querySelector<HTMLInputElement>("#model-picker-search");
const filtersContainer = document.querySelector<HTMLElement>("#model-picker-filters");
const grid = document.querySelector<HTMLElement>("#model-picker-grid");
const emptyState = document.querySelector<HTMLElement>("#model-picker-empty");

if (!modelSelect || !trigger || !triggerLabel || !sheet || !searchInput || !filtersContainer || !grid || !emptyState) {
	console.error("Rich model picker initialization failed");
	throw new Error("Missing DOM element for the rich model picker");
}

const ensuredSelect = modelSelect;
const ensuredTrigger = trigger;
const ensuredTriggerLabel = triggerLabel;
const ensuredSearch = searchInput;
const ensuredFilters = filtersContainer;
const ensuredGrid = grid;
const ensuredEmpty = emptyState;

type ProviderFilter = "all" | "gemini" | "openrouter";

type CapabilityKey = "vision" | "imageOut" | "thinking" | "files";

interface CapabilityDescriptor {
	key: CapabilityKey;
	label: string;
	icon: string;
	test: (definition: ChatModelDefinition) => boolean;
}

interface ModelEntry {
	id: string;
	label: string;
	definition: ChatModelDefinition | undefined;
}

const PROVIDER_FILTERS: { key: ProviderFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "gemini", label: "Gemini" },
	{ key: "openrouter", label: "OpenRouter" }
];

const CAPABILITIES: CapabilityDescriptor[] = [
	{ key: "vision", label: "Vision", icon: "visibility", test: (model) => model.supportsImageInput },
	{ key: "imageOut", label: "Image gen", icon: "image", test: (model) => model.supportsImageOutput },
	{ key: "thinking", label: "Thinking", icon: "neurology", test: (model) => model.supportsThinking },
	{ key: "files", label: "Files", icon: "description", test: (model) => model.supportsFileInput }
];

const filterState = {
	search: "",
	provider: "all" as ProviderFilter,
	capabilities: new Set<CapabilityKey>(),
	megaOnly: false
};

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

function matchesFilters(entry: ModelEntry): boolean {
	const { definition } = entry;

	if (filterState.search) {
		const haystack = `${entry.label} ${entry.id}`.toLowerCase();
		if (!haystack.includes(filterState.search)) return false;
	}

	if (filterState.provider !== "all" && definition?.provider !== filterState.provider) return false;

	if (filterState.megaOnly && !definition?.mega) return false;

	if (filterState.capabilities.size > 0) {
		if (!definition) return false;
		for (const key of filterState.capabilities) {
			const capability = CAPABILITIES.find((candidate) => candidate.key === key);
			if (capability && !capability.test(definition)) return false;
		}
	}

	return true;
}

function createCapabilityBadge(capability: CapabilityDescriptor): HTMLElement {
	const badge = document.createElement("span");
	badge.className = "model-card__cap";
	badge.title = capability.label;

	const icon = document.createElement("span");
	icon.className = "material-symbols-outlined";
	icon.textContent = capability.icon;
	badge.append(icon);

	return badge;
}

function createCard(entry: ModelEntry): HTMLButtonElement {
	const card = document.createElement("button");
	card.type = "button";
	card.className = "model-card";
	card.dataset.modelId = entry.id;
	card.setAttribute("role", "option");

	const isSelected = entry.id === ensuredSelect.value;
	card.classList.toggle("selected", isSelected);
	card.setAttribute("aria-selected", isSelected ? "true" : "false");

	const header = document.createElement("span");
	header.className = "model-card__header";

	const name = document.createElement("span");
	name.className = "model-card__name";
	name.textContent = entry.label;
	header.append(name);

	if (entry.definition?.mega) {
		const mega = document.createElement("span");
		mega.className = "model-card__mega";
		mega.textContent = "MEGA";
		header.append(mega);
	}

	card.append(header);

	if (entry.definition) {
		const provider = document.createElement("span");
		provider.className = "model-card__provider";
		provider.textContent = entry.definition.provider === "gemini" ? "Gemini" : "OpenRouter";
		card.append(provider);

		const supported = CAPABILITIES.filter((capability) => capability.test(entry.definition!));
		if (supported.length > 0) {
			const caps = document.createElement("span");
			caps.className = "model-card__caps";
			for (const capability of supported) caps.append(createCapabilityBadge(capability));
			card.append(caps);
		}
	}

	card.addEventListener("click", () => selectModel(entry.id));

	return card;
}

function renderGrid(): void {
	const entries = readEntries();
	const visible = entries.filter(matchesFilters);

	ensuredGrid.replaceChildren();
	for (const entry of visible) ensuredGrid.append(createCard(entry));

	ensuredEmpty.classList.toggle("hidden", visible.length > 0);
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

function buildFilters(): void {
	const row = document.createElement("div");
	row.className = "model-picker-filter-row";

	row.append(buildProviderSelect(), buildCapabilitiesDropdown());

	ensuredFilters.replaceChildren(row);
}

function buildProviderSelect(): HTMLSelectElement {
	const select = document.createElement("select");
	select.className = "input-field model-picker-provider";
	select.setAttribute("aria-label", "Filter by provider");

	for (const provider of PROVIDER_FILTERS) {
		const option = document.createElement("option");
		option.value = provider.key;
		option.textContent = provider.key === "all" ? "All providers" : provider.label;
		select.append(option);
	}

	select.value = filterState.provider;
	select.addEventListener("change", () => {
		filterState.provider = select.value as ProviderFilter;
		renderGrid();
	});

	return select;
}

function buildCapabilitiesDropdown(): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = "model-picker-dropdown";

	const button = document.createElement("button");
	button.type = "button";
	button.className = "input-field model-picker-dropdown__button";
	button.setAttribute("aria-haspopup", "true");
	button.setAttribute("aria-expanded", "false");

	const label = document.createElement("span");
	label.className = "model-picker-dropdown__label";
	label.textContent = "Capabilities";

	const badge = document.createElement("span");
	badge.className = "model-picker-dropdown__badge hidden";

	const chevron = document.createElement("span");
	chevron.className = "material-symbols-outlined model-picker-dropdown__chevron";
	chevron.textContent = "expand_more";

	button.append(label, badge, chevron);

	const panel = document.createElement("div");
	panel.className = "model-picker-dropdown__panel hidden";
	panel.setAttribute("role", "group");
	panel.setAttribute("aria-label", "Filter by capability");

	const updateBadge = () => {
		const count = filterState.capabilities.size + (filterState.megaOnly ? 1 : 0);
		badge.textContent = String(count);
		badge.classList.toggle("hidden", count === 0);
	};

	for (const capability of CAPABILITIES) {
		panel.append(
			buildCapabilityOption(
				capability.label,
				capability.icon,
				() => filterState.capabilities.has(capability.key),
				(checked) => {
					if (checked) filterState.capabilities.add(capability.key);
					else filterState.capabilities.delete(capability.key);
					updateBadge();
					renderGrid();
				}
			)
		);
	}

	const divider = document.createElement("span");
	divider.className = "model-picker-dropdown__divider";
	divider.setAttribute("aria-hidden", "true");
	panel.append(divider);

	panel.append(
		buildCapabilityOption(
			"MEGA tier only",
			"bolt",
			() => filterState.megaOnly,
			(checked) => {
				filterState.megaOnly = checked;
				updateBadge();
				renderGrid();
			}
		)
	);

	const setOpen = (open: boolean) => {
		panel.classList.toggle("hidden", !open);
		wrap.classList.toggle("open", open);
		button.setAttribute("aria-expanded", open ? "true" : "false");
	};

	button.addEventListener("click", (event) => {
		event.stopPropagation();
		setOpen(panel.classList.contains("hidden"));
	});

	// Keep the panel open while toggling checkboxes; close on outside click or Escape.
	panel.addEventListener("click", (event) => event.stopPropagation());
	document.addEventListener("click", () => setOpen(false));
	wrap.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && !panel.classList.contains("hidden")) {
			event.stopPropagation();
			setOpen(false);
			button.focus();
		}
	});

	wrap.append(button, panel);
	return wrap;
}

function buildCapabilityOption(
	text: string,
	icon: string,
	isChecked: () => boolean,
	onToggle: (checked: boolean) => void
): HTMLLabelElement {
	const option = document.createElement("label");
	option.className = "model-picker-dropdown__option";

	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.checked = isChecked();
	checkbox.addEventListener("change", () => onToggle(checkbox.checked));

	const iconEl = document.createElement("span");
	iconEl.className = "material-symbols-outlined";
	iconEl.textContent = icon;

	const textEl = document.createElement("span");
	textEl.textContent = text;

	option.append(checkbox, iconEl, textEl);
	return option;
}

function openSheet(): void {
	renderGrid();
	surfaceService.show(SHEET_ID);
	ensuredTrigger.setAttribute("aria-expanded", "true");
	requestAnimationFrame(() => ensuredSearch.focus());
}

ensuredTrigger.addEventListener("click", openSheet);

ensuredSearch.addEventListener("input", () => {
	filterState.search = ensuredSearch.value.trim().toLowerCase();
	renderGrid();
});

sheet.addEventListener("surface-closed", () => {
	ensuredTrigger.setAttribute("aria-expanded", "false");
});

ensuredSelect.addEventListener("change", updateTrigger);
onDocumentEvent("chat-model-changed", updateTrigger);

// The native select is rebuilt when access changes (API keys, auth, premium endpoint).
// Mirror those updates: keep the trigger label correct and refresh the grid if it's open.
const selectObserver = new MutationObserver(() => {
	updateTrigger();
	if (!sheet.classList.contains("hidden")) renderGrid();
});
selectObserver.observe(ensuredSelect, { childList: true, attributes: true, attributeFilter: ["disabled"] });

// Reveal the button-based picker and retire the native select as the visible control.
ensuredSelect.classList.add("model-picker-native-hidden");
ensuredTrigger.classList.remove("hidden");

buildFilters();
updateTrigger();

import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";
import { DEFAULT_IMAGE_EDIT_MODEL } from "../../constants/ImageModels";
import type { ImageModelId } from "../../types/Models";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { getVisibleImageModels } from "../../utils/imageModelVisibility";
import { isImageModelProviderRouteAvailable } from "./ApiKeyInput.component";

const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel")!;
if (!imageEditModelSelector) {
	console.error("Image edit model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageEditingModel");
}

function getSelectableImageEditModels() {
	return getVisibleImageModels(isImageModelProviderRouteAvailable).filter((candidate) => candidate.editing);
}

function getOptionValues(): string[] {
	return Array.from(imageEditModelSelector.options).map((option) => option.value);
}

function hasSelectableOptions(): boolean {
	return Array.from(imageEditModelSelector.options).some((option) => option.value && !option.disabled);
}

function optionValuesMatch(nextValues: string[]): boolean {
	const currentValues = getOptionValues();
	return (
		currentValues.length === nextValues.length && currentValues.every((value, index) => value === nextValues[index])
	);
}

function hasUnavailableOption(): boolean {
	return imageEditModelSelector.options.length === 1 && imageEditModelSelector.options[0]?.value === "";
}

function appendUnavailableOption(): void {
	const option = document.createElement("option");
	option.value = "";
	option.textContent = "Enable a model provider to unlock image editing";
	option.disabled = true;
	option.selected = true;
	imageEditModelSelector.append(option);
}

export function reconcileImageEditModelSelector(): void {
	const currentValue =
		imageEditModelSelector.value || localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL) || "";
	const selectableModels = getSelectableImageEditModels();
	const nextValues = selectableModels.map((model) => model.id);

	if (!optionValuesMatch(nextValues) || (selectableModels.length === 0 && !hasUnavailableOption())) {
		imageEditModelSelector.replaceChildren();
		for (const model of selectableModels) {
			const option = document.createElement("option");
			option.value = model.id;
			option.textContent = model.label;
			imageEditModelSelector.append(option);
		}

		if (selectableModels.length === 0) {
			appendUnavailableOption();
		}
	}

	const nextValue = selectableModels.some((model) => model.id === currentValue)
		? currentValue
		: selectableModels.find((model) => model.id === localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL))
				?.id ||
			selectableModels.find((model) => model.id === DEFAULT_IMAGE_EDIT_MODEL)?.id ||
			selectableModels[0]?.id ||
			"";

	imageEditModelSelector.value = nextValue;
	void updateImageEditModelSelectorState();

	if (nextValue !== currentValue) {
		imageEditModelSelector.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

// Dispatch event when model changes
imageEditModelSelector.addEventListener("change", () => {
	dispatchAppEvent("edit-model-changed", { model: imageEditModelSelector.value });
});

async function updateImageEditModelSelectorState() {
	const imageGenStatus = await isImageGenerationAvailable();
	const hasOptions = hasSelectableOptions();

	// Image edit model selector is always enabled when image generation is available
	if (imageGenStatus.enabled && hasOptions) {
		imageEditModelSelector.disabled = false;
		imageEditModelSelector.style.opacity = "1";
		imageEditModelSelector.style.cursor = "initial";
		imageEditModelSelector.title = "";
	} else {
		imageEditModelSelector.disabled = true;
		imageEditModelSelector.style.opacity = "0.6";
		imageEditModelSelector.style.cursor = "not-allowed";
		imageEditModelSelector.title = hasOptions
			? "Image editing not available"
			: "No image editing model provider is currently available";
	}
}

reconcileImageEditModelSelector();

// Initial check
void updateImageEditModelSelectorState();

onAppEvent("auth-state-changed", reconcileImageEditModelSelector);
onAppEvent("subscription-updated", reconcileImageEditModelSelector);
onAppEvent("image-generation-record-refreshed", reconcileImageEditModelSelector);
onAppEvent("api-keys-changed", reconcileImageEditModelSelector);
onAppEvent("premium-endpoint-preference-changed", reconcileImageEditModelSelector);
onAppEvent("settings-loaded-from-storage", reconcileImageEditModelSelector);

/**
 * Get the currently selected image editing model
 */
export function getSelectedEditingModel(): ImageModelId {
	const selectedModel = imageEditModelSelector.value;
	if (getSelectableImageEditModels().some((model) => model.id === selectedModel)) {
		return selectedModel as ImageModelId;
	}

	return (getSelectableImageEditModels().find((model) => model.id === DEFAULT_IMAGE_EDIT_MODEL)?.id ||
		getSelectableImageEditModels()[0]?.id ||
		DEFAULT_IMAGE_EDIT_MODEL) as ImageModelId;
}

import { DEFAULT_IMAGE_MODEL } from "../../constants/ImageModels";
import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { onAppEvent } from "../../events";
import { getVisibleImageModels } from "../../utils/imageModelVisibility";
import { isImageModelProviderRouteAvailable } from "./ApiKeyInput.component";

const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel")!;
if (!imageModelSelector) {
	console.error("Image model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageModel");
}

function getSelectableImageModels() {
	return getVisibleImageModels(isImageModelProviderRouteAvailable).filter((candidate) => candidate.generation);
}

function getOptionValues(): string[] {
	return Array.from(imageModelSelector.options).map((option) => option.value);
}

function hasSelectableOptions(): boolean {
	return Array.from(imageModelSelector.options).some((option) => option.value && !option.disabled);
}

function optionValuesMatch(nextValues: string[]): boolean {
	const currentValues = getOptionValues();
	return (
		currentValues.length === nextValues.length && currentValues.every((value, index) => value === nextValues[index])
	);
}

function hasUnavailableOption(): boolean {
	return imageModelSelector.options.length === 1 && imageModelSelector.options[0]?.value === "";
}

function appendUnavailableOption(): void {
	const option = document.createElement("option");
	option.value = "";
	option.textContent = "Enable a model provider to unlock image generation";
	option.disabled = true;
	option.selected = true;
	imageModelSelector.append(option);
}

export function reconcileImageModelSelector(): void {
	const currentValue = imageModelSelector.value || localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL) || "";
	const selectableModels = getSelectableImageModels();
	const nextValues = selectableModels.map((model) => model.id);

	if (!optionValuesMatch(nextValues) || (selectableModels.length === 0 && !hasUnavailableOption())) {
		imageModelSelector.replaceChildren();
		for (const model of selectableModels) {
			const option = document.createElement("option");
			option.value = model.id;
			option.textContent = model.label;
			imageModelSelector.append(option);
		}

		if (selectableModels.length === 0) {
			appendUnavailableOption();
		}
	}

	const nextValue = selectableModels.some((model) => model.id === currentValue)
		? currentValue
		: selectableModels.find((model) => model.id === localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL))?.id ||
			selectableModels.find((model) => model.id === DEFAULT_IMAGE_MODEL)?.id ||
			selectableModels[0]?.id ||
			"";

	imageModelSelector.value = nextValue;
	void updateImageModelSelectorState();

	if (nextValue !== currentValue) {
		imageModelSelector.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

async function updateImageModelSelectorState() {
	// Check if image generation is available based on current user settings
	const { enabled: isAvailable } = await isImageGenerationAvailable();
	const hasOptions = hasSelectableOptions();

	// Enable/disable the selector based on availability
	imageModelSelector.disabled = !isAvailable || !hasOptions;

	// Add visual indication when disabled
	if (isAvailable && hasOptions) {
		imageModelSelector.style.opacity = "1";
		imageModelSelector.style.cursor = "pointer";
		imageModelSelector.title = "";
	} else {
		imageModelSelector.style.opacity = "0.6";
		imageModelSelector.style.cursor = "not-allowed";
		imageModelSelector.title = hasOptions
			? "Image generation not available with current settings"
			: "No image generation model provider is currently available";
	}
}

reconcileImageModelSelector();

// Update state on initialization
void updateImageModelSelectorState();

// Listen for auth and subscription changes
onAppEvent("auth-state-changed", reconcileImageModelSelector);
onAppEvent("subscription-updated", reconcileImageModelSelector);
onAppEvent("image-generation-record-refreshed", reconcileImageModelSelector);
onAppEvent("api-keys-changed", reconcileImageModelSelector);
onAppEvent("premium-endpoint-preference-changed", reconcileImageModelSelector);
onAppEvent("settings-loaded-from-storage", reconcileImageModelSelector);

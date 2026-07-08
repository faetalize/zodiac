import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";
import { DEFAULT_IMAGE_EDIT_MODEL, IMAGE_MODELS, getImageModelDefinition } from "../../constants/ImageModels";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import type { ImageModelId } from "../../types/Models";

const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel");
if (!imageEditModelSelector) {
	console.error("Image edit model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageEditingModel");
}

const ensuredImageEditModelSelector = imageEditModelSelector;

function getFallbackImageEditModel(currentValue: string | null | undefined): string {
	const editingModels = IMAGE_MODELS.filter((model) => model.editing);
	if (editingModels.some((model) => model.id === currentValue)) {
		return currentValue as string;
	}

	return editingModels[0]?.id ?? DEFAULT_IMAGE_EDIT_MODEL;
}

function populateImageEditModelOptions(): void {
	const currentValue =
		ensuredImageEditModelSelector.value ||
		localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL) ||
		DEFAULT_IMAGE_EDIT_MODEL;

	ensuredImageEditModelSelector.replaceChildren();

	for (const model of IMAGE_MODELS.filter((candidate) => candidate.editing)) {
		const option = document.createElement("option");
		option.value = model.id;
		option.textContent = model.label;
		ensuredImageEditModelSelector.append(option);
	}

	ensuredImageEditModelSelector.value = getFallbackImageEditModel(currentValue);
	if (ensuredImageEditModelSelector.value !== currentValue) {
		ensuredImageEditModelSelector.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

// Dispatch event when model changes
ensuredImageEditModelSelector.addEventListener("change", () => {
	dispatchAppEvent("edit-model-changed", { model: ensuredImageEditModelSelector.value });
});

async function updateImageEditModelSelectorState() {
	const imageGenStatus = await isImageGenerationAvailable();

	// Image edit model selector is always enabled when image generation is available
	if (imageGenStatus.enabled) {
		ensuredImageEditModelSelector.disabled = false;
		ensuredImageEditModelSelector.style.opacity = "1";
		ensuredImageEditModelSelector.style.cursor = "initial";
		ensuredImageEditModelSelector.title = "";
	} else {
		ensuredImageEditModelSelector.disabled = true;
		ensuredImageEditModelSelector.style.opacity = "0.6";
		ensuredImageEditModelSelector.style.cursor = "not-allowed";
		ensuredImageEditModelSelector.title = "Image editing not available";
	}
}

populateImageEditModelOptions();

// Initial check
void updateImageEditModelSelectorState();

onAppEvent("auth-state-changed", () => {
	void updateImageEditModelSelectorState();
});
onAppEvent("subscription-updated", () => {
	void updateImageEditModelSelectorState();
});

/**
 * Get the currently selected image editing model
 */
export function getSelectedEditingModel(): ImageModelId {
	const selectedModel = ensuredImageEditModelSelector.value;
	if (getImageModelDefinition(selectedModel)?.editing) {
		return selectedModel as ImageModelId;
	}

	return DEFAULT_IMAGE_EDIT_MODEL;
}

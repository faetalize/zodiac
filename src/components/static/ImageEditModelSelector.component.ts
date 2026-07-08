import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";
import { DEFAULT_IMAGE_EDIT_MODEL, IMAGE_MODELS } from "../../constants/ImageModels";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import type { ImageModelId } from "../../types/Models";

const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel")!;
if (!imageEditModelSelector) {
	console.error("Image edit model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageEditingModel");
}

function populateImageEditModelOptions(): void {
	const editingModels = IMAGE_MODELS.filter((model) => model.editing);
	const currentValue =
		imageEditModelSelector.value ||
		localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL) ||
		DEFAULT_IMAGE_EDIT_MODEL;

	imageEditModelSelector.replaceChildren();

	for (const model of editingModels) {
		const option = document.createElement("option");
		option.value = model.id;
		option.textContent = model.label;
		imageEditModelSelector.append(option);
	}

	imageEditModelSelector.value = editingModels.some((model) => model.id === currentValue)
		? currentValue
		: (editingModels[0]?.id ?? DEFAULT_IMAGE_EDIT_MODEL);
	if (imageEditModelSelector.value !== currentValue) {
		imageEditModelSelector.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

// Dispatch event when model changes
imageEditModelSelector.addEventListener("change", () => {
	dispatchAppEvent("edit-model-changed", { model: imageEditModelSelector.value });
});

async function updateImageEditModelSelectorState() {
	const imageGenStatus = await isImageGenerationAvailable();

	// Image edit model selector is always enabled when image generation is available
	if (imageGenStatus.enabled) {
		imageEditModelSelector.disabled = false;
		imageEditModelSelector.style.opacity = "1";
		imageEditModelSelector.style.cursor = "initial";
		imageEditModelSelector.title = "";
	} else {
		imageEditModelSelector.disabled = true;
		imageEditModelSelector.style.opacity = "0.6";
		imageEditModelSelector.style.cursor = "not-allowed";
		imageEditModelSelector.title = "Image editing not available";
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
	const selectedModel = imageEditModelSelector.value;
	if (IMAGE_MODELS.some((model) => model.id === selectedModel && model.editing)) {
		return selectedModel as ImageModelId;
	}

	return DEFAULT_IMAGE_EDIT_MODEL;
}

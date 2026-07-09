import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";
import { DEFAULT_IMAGE_EDIT_MODEL, IMAGE_MODELS } from "../../constants/ImageModels";
import type { ImageModelId } from "../../types/Models";

const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel")!;
if (!imageEditModelSelector) {
	console.error("Image edit model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageEditingModel");
}

function populateImageEditModelOptions(): void {
	for (const model of IMAGE_MODELS.filter((candidate) => candidate.editing)) {
		const option = document.createElement("option");
		option.value = model.id;
		option.textContent = model.label;
		imageEditModelSelector.append(option);
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

onAppEvent("auth-state-changed", () => void updateImageEditModelSelectorState());
onAppEvent("subscription-updated", () => void updateImageEditModelSelectorState());
onAppEvent("image-generation-record-refreshed", () => void updateImageEditModelSelectorState());

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

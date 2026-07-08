import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "../../constants/ImageModels";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { isImageGenerationAvailable } from "../../services/Supabase.service";

const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel");
if (!imageModelSelector) {
	console.error("Image model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageModel");
}

const ensuredImageModelSelector = imageModelSelector;

function getFallbackImageModel(currentValue: string | null | undefined): string {
	const generationModels = IMAGE_MODELS.filter((model) => model.generation);
	if (generationModels.some((model) => model.id === currentValue)) {
		return currentValue as string;
	}

	return generationModels[0]?.id ?? DEFAULT_IMAGE_MODEL;
}

function populateImageModelOptions(): void {
	const currentValue =
		ensuredImageModelSelector.value ||
		localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL) ||
		DEFAULT_IMAGE_MODEL;

	ensuredImageModelSelector.replaceChildren();

	for (const model of IMAGE_MODELS.filter((candidate) => candidate.generation)) {
		const option = document.createElement("option");
		option.value = model.id;
		option.textContent = model.label;
		ensuredImageModelSelector.append(option);
	}

	ensuredImageModelSelector.value = getFallbackImageModel(currentValue);
	if (ensuredImageModelSelector.value !== currentValue) {
		ensuredImageModelSelector.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

async function updateImageModelSelectorState() {
	// Check if image generation is available based on current user settings
	const { enabled: isAvailable } = await isImageGenerationAvailable();

	// Enable/disable the selector based on availability
	ensuredImageModelSelector.disabled = !isAvailable;

	// Add visual indication when disabled
	if (isAvailable) {
		ensuredImageModelSelector.style.opacity = "1";
		ensuredImageModelSelector.style.cursor = "pointer";
		ensuredImageModelSelector.title = "";
	} else {
		ensuredImageModelSelector.style.opacity = "0.6";
		ensuredImageModelSelector.style.cursor = "not-allowed";
		ensuredImageModelSelector.title = "Image generation not available with current settings";
	}
}

populateImageModelOptions();

// Update state on initialization
void updateImageModelSelectorState();

// Listen for auth and subscription changes
window.addEventListener("auth-state-changed", () => {
	void updateImageModelSelectorState();
});
window.addEventListener("subscription-updated", () => {
	void updateImageModelSelectorState();
});

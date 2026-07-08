import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "../../constants/ImageModels";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { isImageGenerationAvailable } from "../../services/Supabase.service";

const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel")!;
if (!imageModelSelector) {
	console.error("Image model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageModel");
}

function populateImageModelOptions(): void {
	const generationModels = IMAGE_MODELS.filter((model) => model.generation);
	const currentValue =
		imageModelSelector.value || localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL) || DEFAULT_IMAGE_MODEL;

	imageModelSelector.replaceChildren();

	for (const model of generationModels) {
		const option = document.createElement("option");
		option.value = model.id;
		option.textContent = model.label;
		imageModelSelector.append(option);
	}

	imageModelSelector.value = generationModels.some((model) => model.id === currentValue)
		? currentValue
		: (generationModels[0]?.id ?? DEFAULT_IMAGE_MODEL);
	if (imageModelSelector.value !== currentValue) {
		imageModelSelector.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

async function updateImageModelSelectorState() {
	// Check if image generation is available based on current user settings
	const { enabled: isAvailable } = await isImageGenerationAvailable();

	// Enable/disable the selector based on availability
	imageModelSelector.disabled = !isAvailable;

	// Add visual indication when disabled
	if (isAvailable) {
		imageModelSelector.style.opacity = "1";
		imageModelSelector.style.cursor = "pointer";
		imageModelSelector.title = "";
	} else {
		imageModelSelector.style.opacity = "0.6";
		imageModelSelector.style.cursor = "not-allowed";
		imageModelSelector.title = "Image generation not available with current settings";
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

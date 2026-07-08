import { IMAGE_MODELS } from "../../constants/ImageModels";
import { isImageGenerationAvailable } from "../../services/Supabase.service";

const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel")!;
if (!imageModelSelector) {
	console.error("Image model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageModel");
}

function populateImageModelOptions(): void {
	for (const model of IMAGE_MODELS.filter((candidate) => candidate.generation)) {
		const option = document.createElement("option");
		option.value = model.id;
		option.textContent = model.label;
		imageModelSelector.append(option);
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

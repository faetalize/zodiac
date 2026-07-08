import { IMAGE_MODELS } from "../../types/Models";
import { isImageGenerationAvailable } from "../../services/Supabase.service";

const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel");
if (!imageModelSelector) {
	console.error("Image model selector component initialization failed");
	throw new Error("Missing DOM element: #selectedImageModel");
}

async function updateImageModelSelectorState() {
	if (!imageModelSelector) return;
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

	// Ensure all model options are always present
	IMAGE_MODELS.filter((model) => model.generation).forEach((model) => {
		if (!Array.from(imageModelSelector.options).some((opt) => opt.value === model.id)) {
			const option = document.createElement("option");
			option.value = model.id;
			option.text = model.label;
			imageModelSelector.add(option);
		}
	});
}

// Update state on initialization
void updateImageModelSelectorState();

// Listen for auth and subscription changes
window.addEventListener("auth-state-changed", () => {
	void updateImageModelSelectorState();
});
window.addEventListener("subscription-updated", () => {
	void updateImageModelSelectorState();
});

import { isImageGenerationAvailable } from "../../services/Supabase.service";

const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel");
if (!imageModelSelector) {
    console.error("Image model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedImageModel");
}


async function updateImageModelSelectorState() {
    if(!imageModelSelector) return;
    // Check if image generation is available based on current user settings
    const isAvailable = await isImageGenerationAvailable();

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

// Update state on initialization
updateImageModelSelectorState();

// Listen for auth and subscription changes
window.addEventListener('auth-state-changed', () => {
    updateImageModelSelectorState();
});
window.addEventListener('subscription-updated', () => {
    updateImageModelSelectorState();
});

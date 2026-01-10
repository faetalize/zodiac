import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";

const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel");
if (!imageEditModelSelector) {
    console.error("Image edit model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedImageEditingModel");
}

// Dispatch event when model changes
imageEditModelSelector.addEventListener("change", () => {
    dispatchAppEvent('edit-model-changed', { model: imageEditModelSelector.value });
});

async function updateImageEditModelSelectorState() {
    if (!imageEditModelSelector) return;
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

    return;


    // // Check if image generation is available based on current user settings
    // const { enabled: isAvailable, type: imageGenType } = await isImageGenerationAvailable();

    // // Enable/disable the selector based on availability
    // imageEditModelSelector.disabled = !isAvailable || imageGenType === "google_only";

    // // Add visual indication when disabled
    // if (isAvailable && imageGenType === "all") {
    //     imageEditModelSelector.style.opacity = "1";
    //     imageEditModelSelector.style.cursor = "pointer";
    //     imageEditModelSelector.title = "";
    // } else {
    //     imageEditModelSelector.style.opacity = "0.6";
    //     imageEditModelSelector.style.cursor = "not-allowed";
    //     imageEditModelSelector.title = "Image generation not available with current settings";
    // }

}

// Initial check
updateImageEditModelSelectorState();

onAppEvent('auth-state-changed', () => {
    updateImageEditModelSelectorState();
});
onAppEvent('subscription-updated', () => {
    updateImageEditModelSelectorState();
});

/**
 * Get the currently selected image editing model
 */
export function getSelectedEditingModel(): string {
    return imageEditModelSelector?.value || "seedream";
}
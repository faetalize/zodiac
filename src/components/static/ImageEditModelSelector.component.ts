import { isImageGenerationAvailable } from "../../services/Supabase.service";

const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel");
if (!imageEditModelSelector) {
    console.error("Image edit model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedImageEditingModel");
}

// Dispatch event when model changes
imageEditModelSelector.addEventListener("change", () => {
    window.dispatchEvent(new CustomEvent('edit-model-changed', {
        detail: { model: imageEditModelSelector.value }
    }));
});

async function updateImageEditModelSelectorState() {
    if (!imageEditModelSelector) return;
    const imageGenStatus = await isImageGenerationAvailable();
    if(imageGenStatus.type === "google_only"){
        imageEditModelSelector.disabled = true;
        imageEditModelSelector.style.opacity = "0.6";
        imageEditModelSelector.style.cursor = "not-allowed";
        imageEditModelSelector.title = "Image editing not available with current settings";
    }
    else if(imageGenStatus.type=== "all"){
        imageEditModelSelector.disabled = false;
        imageEditModelSelector.style.opacity = "1";
        imageEditModelSelector.style.cursor = "initial";
        imageEditModelSelector.title = "";
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

window.addEventListener('auth-state-changed', () => {
    updateImageEditModelSelectorState();
});
window.addEventListener('subscription-updated', () => {
    updateImageEditModelSelectorState();
});

/**
 * Get the currently selected image editing model
 */
export function getSelectedEditingModel(): string {
    return imageEditModelSelector?.value || "seedream";
}
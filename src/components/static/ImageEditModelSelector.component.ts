const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel");
if (!imageEditModelSelector) {
    console.error("Image edit model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedImageEditingModel");
}

async function updateImageEditModelSelectorState() {
    if (!imageEditModelSelector) return;
    //for now disable always
    imageEditModelSelector.disabled = true;
    imageEditModelSelector.style.opacity = "0.6";
    imageEditModelSelector.style.cursor = "not-allowed";
    imageEditModelSelector.title = "Image editing models are currently disabled";
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
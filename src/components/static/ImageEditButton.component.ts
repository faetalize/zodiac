import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";

const imageEditingButton = document.querySelector<HTMLButtonElement>("#btn-edit");
if (!imageEditingButton) {
    console.error("Image button component initialization failed");
    throw new Error("Missing DOM element: #btn-edit");
}

let imageEditingEnabled = false;

imageEditingButton.addEventListener("click", () => {
    if (imageEditingButton.disabled) return;

    imageEditingEnabled = !imageEditingEnabled;
    imageEditingButton.classList.toggle("btn-toggled");

    // Dispatch event to notify other components
    dispatchAppEvent('image-editing-toggled', { enabled: imageEditingEnabled });
});

//listen for image-toggled event to disable button if needed
onAppEvent('image-generation-toggled', (event) => {
    if (event.detail.enabled && imageEditingEnabled) {
        imageEditingEnabled = false;
        imageEditingButton.classList.remove("btn-toggled");
        dispatchAppEvent('image-editing-toggled', { enabled: false });
    }
});

// Listen for auth and subscription changes
onAppEvent('auth-state-changed', () => {
    updateImageEditingState();
});
onAppEvent('subscription-updated', () => {
    updateImageEditingState();
});

async function updateImageEditingState() {
    if (!imageEditingButton) return;
    try {
        const imageGenStatus = await isImageGenerationAvailable();
        // Image editing is available when image generation is enabled
        if (imageGenStatus.enabled) {
            imageEditingButton.style.display = "";
        } else {
            imageEditingButton.style.display = "none";
            // If image mode was enabled, disable it
            if (imageEditingEnabled) {
                imageEditingEnabled = false;
                imageEditingButton.classList.remove("btn-toggled");
            }
        }

    } catch {
        // If not logged in or error, hide by default
        imageEditingButton.style.display = "none";
    }
}

export function isImageEditingActive(): boolean {
    return imageEditingEnabled;
}

// Update state on initialization
updateImageEditingState();



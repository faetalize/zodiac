import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";

const imageButton = document.querySelector<HTMLButtonElement>("#btn-image");
if (!imageButton) {
    console.error("Image button component initialization failed");
    throw new Error("Missing DOM element: #btn-image");
}

let isImageModeEnabled = false;

imageButton.addEventListener("click", () => {
    if (imageButton.disabled) return;

    isImageModeEnabled = !isImageModeEnabled;
    imageButton.classList.toggle("btn-toggled");

    // If image mode is enabled, disable image editing mode
    dispatchAppEvent('image-generation-toggled', { enabled: isImageModeEnabled });
});

//listen for image-editing-toggled event to disable button if needed
onAppEvent('image-editing-toggled', (event) => {
    if (event.detail.enabled && isImageModeEnabled) {
        isImageModeEnabled = false;
        imageButton.classList.remove("btn-toggled");
        dispatchAppEvent('image-generation-toggled', { enabled: false });
    }
});

// Listen for auth and subscription changes
onAppEvent('auth-state-changed', () => {
    updateImageButtonState();
});
onAppEvent('subscription-updated', () => {
    updateImageButtonState();
});

async function updateImageButtonState() {
    if (!imageButton) return;
    try {
        if ((await isImageGenerationAvailable()).enabled) {
            imageButton.style.display = "";
        } else {
            imageButton.style.display = "none";
            // If image mode was enabled, disable it
            if (isImageModeEnabled) {
                isImageModeEnabled = false;
                imageButton.classList.remove("btn-toggled");
            }
        }

    } catch {
        // If not logged in or error, show by default (probably Free tier)
        imageButton.style.display = "";
    }
}

export function isImageModeActive(): boolean {
    return isImageModeEnabled;
}

// Update state on initialization
updateImageButtonState();



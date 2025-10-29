
import { isImageGenerationAvailable } from "../../services/Supabase.service";

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
    window.dispatchEvent(new CustomEvent('image-editing-toggled', {
        detail: { enabled: imageEditingEnabled }
    }));
});

//listen for image-toggled event to disable button if needed
window.addEventListener('image-generation-toggled', (event: any) => {
    if (event.detail.enabled && imageEditingEnabled) {
        imageEditingEnabled = false;
        imageEditingButton.classList.remove("btn-toggled");
    }
});

// Listen for auth and subscription changes
window.addEventListener('auth-state-changed', () => {
    updateImageEditingState();
});
window.addEventListener('subscription-updated', () => {
    updateImageEditingState();
});

async function updateImageEditingState() {
    if (!imageEditingButton) return;
    try {
        if ((await isImageGenerationAvailable()).enabled) {
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
        // If not logged in or error, show by default (probably Free tier)
        imageEditingButton.style.display = "";
    }
}

export function isImageEditingActive(): boolean {
    return imageEditingEnabled;
}

// Update state on initialization
updateImageEditingState();



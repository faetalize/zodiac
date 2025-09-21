
import { getSubscriptionTier, getUserSubscription, type SubscriptionTier, isImageGenerationAvailable } from "../../services/Supabase.service";

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
});

// Listen for auth and subscription changes
window.addEventListener('auth-state-changed', () => {
    updateImageButtonState();
});
window.addEventListener('subscription-updated', () => {
    updateImageButtonState();
});

async function updateImageButtonState() {
    if (!imageButton) return;

    try {
        if (await isImageGenerationAvailable()) {
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



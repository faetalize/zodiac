import { getUseEdgeFunction } from "../../services/Settings.service";
import { getSubscriptionTier, getUserSubscription, type SubscriptionTier } from "../../services/Supabase.service";

const imageButton = document.querySelector<HTMLButtonElement>("#btn-image");
if (!imageButton) {
    console.error("Image button component initialization failed");
    throw new Error("Missing DOM element: #btn-image");
}

let isImageModeEnabled = false;

async function updateImageButtonState() {
    if (!imageButton) return;
    
    try {
        const sub = await getUserSubscription();
        const tier: SubscriptionTier = getSubscriptionTier(sub);
        const useEdge = getUseEdgeFunction();
        
        // For Pro users, image generation is only available when using API key (not Edge Function)
        if (tier === 'pro') {
            if (useEdge) {
                // Edge Function is enabled for Pro user - hide image generation
                imageButton.style.display = "none";
                // If image mode was active, turn it off
                if (isImageModeEnabled) {
                    isImageModeEnabled = false;
                    imageButton.classList.remove("btn-toggled");
                }
            } else {
                // Using API key - show image generation
                imageButton.style.display = "";
            }
        } else {
            // Free or Max users - always show
            imageButton.style.display = "";
        }
    } catch {
        // If not logged in or error, show by default (probably Free tier)
        imageButton.style.display = "";
    }
}

imageButton.addEventListener("click", () => {
    if (imageButton.disabled) return;
    
    isImageModeEnabled = !isImageModeEnabled;
    imageButton.classList.toggle("btn-toggled");
});

export function isImageModeActive(): boolean {
    return isImageModeEnabled;
}

// Update state on initialization
updateImageButtonState();

// Listen for auth and subscription changes
window.addEventListener('auth-state-changed', () => {
    updateImageButtonState();
});
window.addEventListener('subscription-updated', () => {
    updateImageButtonState();
});

// Listen for edge function toggle changes
window.addEventListener('storage', (e) => {
    if (e.key === 'settings') {
        updateImageButtonState();
    }
});

// Also need to listen for settings changes from the ApiKeyInput component
// Create a custom event listener for when useEdgeFunction changes
window.addEventListener('edge-function-changed', () => {
    updateImageButtonState();
});
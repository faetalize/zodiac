import { getUseMaxEndpoint } from "../../services/Settings.service";
import { getSubscriptionTier, getUserSubscription, type SubscriptionTier } from "../../services/Supabase.service";

const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel");
if (!imageModelSelector) {
    console.error("Image model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedImageModel");
}

/**
 * Determines if image generation is available based on subscription and settings.
 * This matches the same logic used for image button visibility.
 */
export async function isImageGenerationAvailable(): Promise<boolean> {
    try {
        const sub = await getUserSubscription();
        const tier: SubscriptionTier = getSubscriptionTier(sub);
        const useMax = getUseMaxEndpoint();

        // For Pro users, image generation is only available when using API key (not Edge Function)
        if (tier === 'pro') {
            return !useMax; // Available only when NOT using edge function (using API key)
        } else {
            // Free or Max users - always available
            return true;
        }
    } catch {
        // If not logged in or error, assume available (probably Free tier with API key)
        return true;
    }
}

async function updateImageModelSelectorState() {
    if (!imageModelSelector) return;
    const illustriousOption = imageModelSelector.querySelector('option[value="models/illustrious"]');

    const isAvailable = await isImageGenerationAvailable();
    const useMax = getUseMaxEndpoint();

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

    if (!useMax) {
        //if not using our max endpoint, remove illustrious option
        if (illustriousOption) {
            illustriousOption.classList.add('hidden');
        }
    }
    else {
        if (illustriousOption) {
            illustriousOption.classList.remove('hidden');
        }
    }
}

// Get the currently selected image model
export function getSelectedImageModel(): string {
    return imageModelSelector?.value || "models/imagen-4.0-ultra-generate-001";
}

// Set the selected image model
export function setSelectedImageModel(model: string): void {
    if (imageModelSelector) {
        imageModelSelector.value = model;
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

// Listen for edge function toggle changes
window.addEventListener('storage', (e) => {
    if (e.key === 'settings') {
        updateImageModelSelectorState();
    }
});

// Also listen for the custom edge function change event
window.addEventListener('edge-function-changed', () => {
    updateImageModelSelectorState();
});

import { GoogleGenAI } from "@google/genai";
import { getSubscriptionTier, type SubscriptionTier } from "../../services/Supabase.service";

const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const apiKeyGroup = document.querySelector<HTMLDivElement>(".api-key");
const preferPremiumToggle = document.querySelector<HTMLDivElement>("#prefer-premium-endpoint-toggle");
const preferPremiumCheckbox = document.querySelector<HTMLInputElement>("#preferPremiumEndpoint");

if (!apiKeyInput || !apiKeyGroup || !preferPremiumToggle || !preferPremiumCheckbox) {
    console.error("One or more API key input elements are missing.");
    throw new Error("API key input initialization failed.");
}

// API key input is always editable regardless of subscription status

// Load saved preference - default to true for subscribers
const savedPreference = localStorage.getItem('preferPremiumEndpoint');
if (savedPreference !== null) {
    preferPremiumCheckbox.checked = savedPreference === 'true';
} else {
    // Default to true (prefer premium ON by default)
    preferPremiumCheckbox.checked = true;
}

// Save preference when changed
preferPremiumCheckbox.addEventListener('change', () => {
    localStorage.setItem('preferPremiumEndpoint', preferPremiumCheckbox.checked.toString());
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('premium-endpoint-preference-changed', {
        detail: { preferPremium: preferPremiumCheckbox.checked }
    }));
});

// Show/hide the toggle based on subscription status
window.addEventListener('auth-state-changed', (event: CustomEventInit) => {
    const { subscription: sub } = event.detail;
    if (!sub) {
        preferPremiumToggle.classList.add('hidden');
        preferPremiumCheckbox.checked = false; // Turn OFF for free users
        return;
    }
    
    const tier: SubscriptionTier = getSubscriptionTier(sub);
    if (tier === 'pro' || tier === 'max') {
        preferPremiumToggle.classList.remove('hidden');
        // Set default to ON for subscribers if not previously saved
        if (savedPreference === null) {
            preferPremiumCheckbox.checked = true;
            localStorage.setItem('preferPremiumEndpoint', 'true');
        }
    } else {
        preferPremiumToggle.classList.add('hidden');
        preferPremiumCheckbox.checked = false; // Turn OFF for free users
    }
});


let debounceTimer: NodeJS.Timeout;
apiKeyInput?.addEventListener("input", () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();
        const ai = new GoogleGenAI({ apiKey: apiKey });
        try {
            // Test the API key with a simple query
            await ai.models.generateContent({
                model: "gemini-2.5-flash-lite",
                contents: "test"
            });
            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            document.querySelector<HTMLElement>(".api-key-error")!.classList.add("hidden");
        } catch (error) {
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            document.querySelector<HTMLElement>(".api-key-error")!.classList.remove("hidden");
        }
    }, 750);
});

/**
 * Check if user prefers to use premium endpoint over their API key
 * @returns true if premium endpoint should be preferred (default), false otherwise
 */
export function shouldPreferPremiumEndpoint(): boolean {
    const saved = localStorage.getItem('preferPremiumEndpoint');
    // Default to true (prefer premium) if not set
    return saved === null ? true : saved === 'true';
}


import { GoogleGenAI } from "@google/genai";
import { getUseMaxEndpoint, setUseMaxEndpoint  } from "../../services/Settings.service";
import * as settingsService from "../../services/Settings.service";
import { getSubscriptionTier, getUserSubscription, type SubscriptionTier } from "../../services/Supabase.service";

const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const apiKeyGroup = document.querySelector<HTMLDivElement>(".api-key");
const noNeedMsg = document.querySelector<HTMLElement>("#apiKeyNoNeedMsg");

export function updateApiKeyInputState() {
    const settings = settingsService.getSettings();

    if (apiKeyInput) {
        if (settings.useMaxEndpoint) {
            apiKeyInput.disabled = true;
            apiKeyInput.placeholder = "API key not needed when using Edge Function";
        } else {
            apiKeyInput.disabled = false;
            apiKeyInput.placeholder = "Paste API key here";
        }
    }
}

function ensureToggle(): HTMLInputElement | null {
    if (!apiKeyGroup) return null;
    const wrap = document.querySelector<HTMLSpanElement>("#use-api-key-wrap");
    // If the wrapper isn't present for some reason, gracefully bail
    if (!wrap) return null;
    return wrap.querySelector<HTMLInputElement>("#use-api-key");
}

export async function refreshSwitch() {
    try {
        const sub = await getUserSubscription();
        const tier: SubscriptionTier = getSubscriptionTier(sub);
        const toggle = ensureToggle();
        const useEdge = getUseMaxEndpoint();
        console.log(tier)
        const isEligible = tier === 'pro' || tier === 'max';
        // Visibility: only for logged-in Pro/Max
        if (toggle) (toggle.parentElement as HTMLElement).style.display = isEligible ? "inline-flex" : "none";
        if (noNeedMsg) noNeedMsg.classList.toggle('hidden', !isEligible || !useEdge);
        // Input stays enabled; clear errors in hosted mode
        if (apiKeyInput && useEdge && isEligible) {
            apiKeyInput.classList.remove('api-key-invalid');
            document.querySelector<HTMLElement>(".api-key-error")?.classList.add('hidden');
        }
        if (!toggle || !isEligible) return;
        // Toggle reflects current route: checked => local API key
        toggle.checked = !useEdge;
        toggle.onchange = () => {
            setUseMaxEndpoint(!toggle.checked);
            refreshSwitch();
            // Dispatch custom event for other components to listen to
            window.dispatchEvent(new CustomEvent('edge-function-changed'));
        };
        // Input enabled state reflects route: disabled when using Edge Function
        updateApiKeyInputState();
    } catch {
        const toggle = ensureToggle();
        if (toggle) (toggle.parentElement as HTMLElement).style.display = "none";
        if (noNeedMsg) noNeedMsg.classList.add('hidden');
        // Logged out: ensure API key input is enabled and force local route
        if (apiKeyInput) apiKeyInput.disabled = false;
        // Force switch to local API key when logged out
        setUseMaxEndpoint(false);
    }
}
window.addEventListener('auth-state-changed', () => {
    getUserSubscription().then((sub) => {
        if (getSubscriptionTier(sub) === 'free') {
            setUseMaxEndpoint(false);
        }
    });
    refreshSwitch();
});
window.addEventListener('subscription-updated', () => {
    refreshSwitch();
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
            // If the user typed a valid key, auto-switch to local key route
            setUseMaxEndpoint(false);
            refreshSwitch();
        } catch (error) {
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            document.querySelector<HTMLElement>(".api-key-error")!.classList.remove("hidden");
        }
    }, 750);
});


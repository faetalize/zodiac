import { GoogleGenAI } from "@google/genai";
import { getSubscriptionTier, getUserSubscription, type SubscriptionTier } from "../../services/Supabase.service";

const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const apiKeyGroup = document.querySelector<HTMLDivElement>(".api-key");
const noNeedMsg = document.querySelector<HTMLElement>("#apiKeyNoNeedMsg");

if (!apiKeyInput || !apiKeyGroup || !noNeedMsg) {
    console.error("One or more API key input elements are missing.");
    throw new Error("API key input initialization failed.");
}



window.addEventListener('auth-state-changed', (event: CustomEventInit) => {
    const { subscription: sub } = event.detail;
    if (!sub) {
        apiKeyInput.placeholder = "Paste API key here";
        return;
    }
    else {
        // we blur/disable the api key input if we're on pro/max
        const tier: SubscriptionTier = getSubscriptionTier(sub);
        if (tier === 'pro' || tier === 'max') {
            if (apiKeyInput) {
                apiKeyInput.disabled = true;
                apiKeyInput.placeholder = "API key not needed!";
                // Clear any existing error states
                apiKeyInput.classList.remove('api-key-invalid');
                document.querySelector<HTMLElement>(".api-key-error")?.classList.add('hidden');
            }
            if (noNeedMsg) {
                noNeedMsg.classList.remove('hidden');
            }
        }
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


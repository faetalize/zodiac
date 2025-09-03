import { GoogleGenAI } from "@google/genai";
import { getUseEdgeFunction, setUseEdgeFunction } from "../../services/Settings.service";
import { getSubscriptionTier, getUserSubscription, type SubscriptionTier } from "../../services/Supabase.service";

const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const apiKeyGroup = document.querySelector<HTMLDivElement>(".api-key");
const noNeedMsg = document.querySelector<HTMLElement>("#apiKeyNoNeedMsg");

function ensureToggle(): HTMLInputElement | null {
    if (!apiKeyGroup) return null;
    // Search in the entire document since the toggle might be placed outside apiKeyGroup
    let wrap = document.querySelector<HTMLSpanElement>("#use-api-key-wrap");
    if (!wrap) {
        wrap = document.createElement("span");
        wrap.id = "use-api-key-wrap";
        wrap.style.display = "inline-flex";
        wrap.style.marginTop = "0.25rem";
        wrap.style.alignItems = "center";
        wrap.style.gap = "0.5rem";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "use-api-key";
        const label = document.createElement("label");
        label.htmlFor = "use-api-key";
        label.textContent = "Use API Key";
        wrap.appendChild(cb);
        wrap.appendChild(label);
        if (noNeedMsg) {
            noNeedMsg.insertAdjacentElement("afterend", wrap);
        } else {
            apiKeyGroup.appendChild(wrap);
        }
    }
    return wrap.querySelector<HTMLInputElement>("#use-api-key");
}

async function refreshSwitch() {
    try {
        const sub = await getUserSubscription();
        const tier: SubscriptionTier = getSubscriptionTier(sub);
        const toggle = ensureToggle();
        const useEdge = getUseEdgeFunction();
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
            setUseEdgeFunction(!toggle.checked);
            refreshSwitch();
        };
    } catch {
        const toggle = ensureToggle();
        if (toggle) (toggle.parentElement as HTMLElement).style.display = "none";
        if (noNeedMsg) noNeedMsg.classList.add('hidden');
        // Logged out: ensure API key input is enabled and force local route
        if (apiKeyInput) apiKeyInput.disabled = false;
        // Force switch to local API key when logged out
        setUseEdgeFunction(false);
    }
}

refreshSwitch();
window.addEventListener('auth-state-changed', () => {
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
                model: "gemini-2.0-flash",
                contents: "test"
            });
            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            document.querySelector<HTMLElement>(".api-key-error")!.classList.add("hidden");
            // If the user typed a valid key, auto-switch to local key route
            setUseEdgeFunction(false);
            refreshSwitch();
        } catch (error) {
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            document.querySelector<HTMLElement>(".api-key-error")!.classList.remove("hidden");
        }
    }, 2000);
});
import { createEvent, dispatchDocumentEvent, onAppEvent } from "../../events";
import { getSubscriptionTier } from "../../services/Supabase.service";
import {
    GEMINI_CHAT_MODELS,
    OPENROUTER_CHAT_MODELS,
    getAccessibleChatModels,
    getDefaultChatModel,
    getValidChatModel,
    type ChatModelAccess,
} from "../../types/Models";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";

export const modelSelect = document.querySelector<HTMLSelectElement>("#selectedModel");
const geminiApiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const openRouterApiKeyInput = document.querySelector<HTMLInputElement>("#openRouterApiKeyInput");

if (!modelSelect || !geminiApiKeyInput || !openRouterApiKeyInput) {
    console.error("Model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedModel, #apiKeyInput, or #openRouterApiKeyInput");
}

const ensuredModelSelect = modelSelect;
const ensuredGeminiApiKeyInput = geminiApiKeyInput;
const ensuredOpenRouterApiKeyInput = openRouterApiKeyInput;

let hasPremiumModelAccess = false;

function buildAccess(): ChatModelAccess {
    return {
        hasGeminiAccess: hasPremiumModelAccess || ensuredGeminiApiKeyInput.value.trim().length > 0 || (localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "").trim().length > 0,
        hasOpenRouterAccess: hasPremiumModelAccess || ensuredOpenRouterApiKeyInput.value.trim().length > 0 || (localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "").trim().length > 0,
    };
}

function setOptGroup(label: string, options: { id: string; label: string }[]): HTMLOptGroupElement {
    const optGroup = document.createElement("optgroup");
    optGroup.label = label;

    for (const option of options) {
        const element = document.createElement("option");
        element.value = option.id;
        element.textContent = option.label;
        optGroup.append(element);
    }

    return optGroup;
}

export function refreshModelSelectorOptions(): void {
    const access = buildAccess();
    const currentValue = ensuredModelSelect.value || localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL) || "";
    const available = getAccessibleChatModels(access);

    ensuredModelSelect.replaceChildren();

    const geminiModels = available.filter((model) => GEMINI_CHAT_MODELS.some((candidate) => candidate.id === model.id));
    const openRouterModels = available.filter((model) => OPENROUTER_CHAT_MODELS.some((candidate) => candidate.id === model.id));

    if (geminiModels.length > 0) {
        ensuredModelSelect.append(setOptGroup("Gemini", geminiModels));
    }

    if (openRouterModels.length > 0) {
        ensuredModelSelect.append(setOptGroup("OpenRouter", openRouterModels));
    }

    if (available.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Add a Gemini or OpenRouter key to unlock models";
        option.disabled = true;
        option.selected = true;
        ensuredModelSelect.append(option);
        ensuredModelSelect.disabled = true;
        return;
    }

    ensuredModelSelect.disabled = false;
    ensuredModelSelect.value = getValidChatModel(currentValue, access) || getDefaultChatModel(access);

    if (ensuredModelSelect.value !== currentValue) {
        ensuredModelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

export const createChatModelChangedEvent = () => createEvent("chat-model-changed", {
    model: ensuredModelSelect.value,
}, { bubbles: true });

ensuredModelSelect.addEventListener("change", () => {
    dispatchDocumentEvent("chat-model-changed", { model: ensuredModelSelect.value });
});

ensuredGeminiApiKeyInput.addEventListener("input", refreshModelSelectorOptions);
ensuredOpenRouterApiKeyInput.addEventListener("input", refreshModelSelectorOptions);

onAppEvent("auth-state-changed", (event) => {
    const tier = getSubscriptionTier(event.detail.subscription ?? null);
    hasPremiumModelAccess = tier === "pro" || tier === "max";
    refreshModelSelectorOptions();
});

refreshModelSelectorOptions();

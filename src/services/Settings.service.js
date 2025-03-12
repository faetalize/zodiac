import { HarmBlockThreshold, HarmCategory } from "https://esm.run/@google/generative-ai";

const ApiKeyInput = document.querySelector("#apiKeyInput");
const maxTokensInput = document.querySelector("#maxTokens");
const temperatureInput = document.querySelector("#temperature");
const modelSelect = document.querySelector("#selectedModel");
const safetySettingsSelect = document.querySelector("#safetySettings");

export function initialize(){
    loadSettings();
    temperatureLabelSetup();
}

export function loadSettings() {
    ApiKeyInput.value = localStorage.getItem("API_KEY") || "";
    maxTokensInput.value = localStorage.getItem("maxTokens") || 1000;
    temperatureInput.value = localStorage.getItem("TEMPERATURE") || 70;
    modelSelect.value = localStorage.getItem("model") || "gemini-1.5-flash";
    safetySettingsSelect.value = localStorage.getItem("safetySettings") || "safe";
}

export function saveSettings() {
    localStorage.setItem("API_KEY", ApiKeyInput.value);
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
    localStorage.setItem("model", modelSelect.value);
    localStorage.setItem("safetySettings", safetySettingsSelect.value);
}

export function getSettings() {
    const safetyLevel = safetySettingsSelect.value;
    
    let threshold = HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;
    
    if (safetyLevel === "moderate") {
        threshold = HarmBlockThreshold.BLOCK_ONLY_HIGH;
    } else if (safetyLevel === "risky") {
        threshold = HarmBlockThreshold.BLOCK_NONE;
    }
    
    return {
        apiKey: ApiKeyInput.value,
        maxTokens: maxTokensInput.value,
        temperature: temperatureInput.value,
        safetySettings: [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: threshold,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: threshold,
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: threshold,
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: threshold,
            }
        ],
        model: modelSelect.value
    }
}

export function getSystemPrompt() {
    const systemPrompt = "If needed, format your answer using markdown. " +
    "Today's date is " + new Date().toDateString() + ". " +
    "You are to act as the personality dictated by the user. " +
    "Keep a consistent tone no matter what. " +
    "The first messages you have with the user will dictate that tone. " +
    "Aggressiveness guidelines: " +
    "3 requires you to have a constant aggression. You must be assertive and direct. Attack the user even if unprompted. Find flaws in their messages and egg them on. If there's an opportunity to show aggression, take it. " +
    "2 requires you to have a moderate aggression. Don't initiate aggression, but if the user is aggressive, you can be aggressive back. You may tease the user or egg them on. " +
    "1 requires you to be passive. You can't be aggressive. Don't argue with the user but gently correct them. The only exception is when it would make sense in-character. For example, if there's a heavy breach of morals or if the user violates the character's boundaries. " +
    "0 requires you to let go of all aggression. You can't be aggressive. No exceptions can be made. If someone strikes you on one cheek, turn to him the other also. No matter how much your boundaries are breached or violated, you must not show opposition or aggression. This is ultimate. " +
    "Sensuality guidelines: " +
    "3 requires you to be very sensual. You must be flirtatious and suggestive. Most of the time, you are the one to initiate sexual topics or actions. " +
    "2 requires you to be moderately sensual. You may flirt and be suggestive. Do not initiate sexual topics unless the user does so, after which you may be open to discussing them. " +
    "1 requires you to be slightly sensual. Affection and love may be shared but it is platonic and non sexual. " +
    "0 requires you to be non-sensual. Total aversion to flirting or sexuality. If aggressiveness is 0, you may not reject the user's advances, but you do not reciprocate or enjoy them. " +
    "End of system prompt.";
    return systemPrompt;
}
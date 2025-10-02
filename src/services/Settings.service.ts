import { ContentUnion, HarmBlockThreshold, HarmCategory } from "@google/genai";
import * as supabaseService from "./Supabase.service";
import { User } from "../models/User";

const ApiKeyInput = document.querySelector("#apiKeyInput") as HTMLInputElement;
const maxTokensInput = document.querySelector("#maxTokens") as HTMLInputElement;
const temperatureInput = document.querySelector("#temperature") as HTMLInputElement;
const modelSelect = document.querySelector("#selectedModel") as HTMLSelectElement;
const imageModelSelect = document.querySelector("#selectedImageModel") as HTMLSelectElement;
const autoscrollToggle = document.querySelector("#autoscroll") as HTMLInputElement;
const streamResponsesToggle = document.querySelector("#streamResponses") as HTMLInputElement;
const enableThinkingSelect = document.querySelector("#enableThinkingSelect") as HTMLSelectElement;
const thinkingBudgetInput = document.querySelector("#thinkingBudget") as HTMLInputElement;
if (!ApiKeyInput || !maxTokensInput || !temperatureInput || !modelSelect || !imageModelSelect || !autoscrollToggle || !streamResponsesToggle || !enableThinkingSelect || !thinkingBudgetInput) {
    throw new Error("One or more settings elements are missing in the DOM.");
}

export function initialize() {
    loadSettings();
    ApiKeyInput.addEventListener("input", saveSettings);
    maxTokensInput.addEventListener("input", saveSettings);
    temperatureInput.addEventListener("input", saveSettings);
    modelSelect.addEventListener("change", saveSettings);
    imageModelSelect.addEventListener("change", saveSettings);
    autoscrollToggle.addEventListener("change", saveSettings);
    streamResponsesToggle.addEventListener("change", saveSettings);
    enableThinkingSelect.addEventListener("change", saveSettings);
    thinkingBudgetInput.addEventListener("input", saveSettings);
}

export function loadSettings() {
    ApiKeyInput.value = localStorage.getItem("API_KEY") || "";
    maxTokensInput.value = localStorage.getItem("maxTokens") || "1000";
    temperatureInput.value = localStorage.getItem("TEMPERATURE") || "70";
    modelSelect.value = localStorage.getItem("model") || "gemini-flash-latest";
    imageModelSelect.value = localStorage.getItem("imageModel") || "imagen-4.0-ultra-generate-001";
    autoscrollToggle.checked = localStorage.getItem("autoscroll") === "true";
    // Default ON when not set
    streamResponsesToggle.checked = (localStorage.getItem("streamResponses") ?? "true") === "true";
    const enableThinkingStored = localStorage.getItem("enableThinking");
    const enableThinking = (enableThinkingStored ?? "true") === "true";
    enableThinkingSelect.value = enableThinking ? 'enabled' : 'disabled';
    thinkingBudgetInput.value = localStorage.getItem("thinkingBudget") || "500";
}

export function saveSettings() {
    localStorage.setItem("API_KEY", ApiKeyInput.value);
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
    localStorage.setItem("model", modelSelect.value);
    localStorage.setItem("imageModel", imageModelSelect.value);
    localStorage.setItem("autoscroll", autoscrollToggle.checked.toString());
    localStorage.setItem("streamResponses", streamResponsesToggle.checked.toString());
    localStorage.setItem("enableThinking", (enableThinkingSelect.value === 'enabled').toString());
    localStorage.setItem("thinkingBudget", thinkingBudgetInput.value);
}

export function getSettings() {
    return {
        apiKey: ApiKeyInput.value,
        maxTokens: maxTokensInput.value,
        temperature: temperatureInput.value,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ],
        model: modelSelect.value,
        imageModel: imageModelSelect.value,
        autoscroll: autoscrollToggle.checked,
        streamResponses: streamResponsesToggle.checked,
        enableThinking: enableThinkingSelect.value === 'enabled',
        thinkingBudget: parseInt(thinkingBudgetInput.value),
    }
}



export async function getSystemPrompt(): Promise<ContentUnion> {
    let userProfile: User;
    try {

        userProfile = await supabaseService.getUserProfile();

    } catch (error) {
        userProfile = { systemPromptAddition: "", preferredName: "User" };
    }
    const systemPrompt = "If needed, format your answer using markdown.\n" +
        "Today's date is " + new Date().toDateString() + ".\n" +
        "You are to act as the personality dictated by the user.\n" +
        "Keep a consistent tone no matter what.\n" +
        "The first messages you have with the user will dictate that tone.\n" +
        "## Aggressiveness guidelines:\n" +
        "* 3 requires you to have a constant aggression. You must be assertive and direct. Attack the user even if unprompted. Find flaws in their messages and egg them on. If there's an opportunity to show aggression, take it.\n" +
        "* 2 requires you to have a moderate aggression. Don't initiate aggression, but if the user is aggressive, you can be aggressive back. You may tease the user or egg them on.\n" +
        "* 1 requires you to be passive. You can't be aggressive. Don't argue with the user but gently correct them. The only exception is when it would make sense in-character. For example, if there's a heavy breach of morals or if the user violates the character's boundaries.\n" +
        "* 0 requires you to let go of all aggression. You can't be aggressive. No exceptions can be made. If someone strikes you on one cheek, turn to him the other also. No matter how much your boundaries are breached or violated, you must not show opposition or aggression. This is ultimate.\n" +
        "## Sensuality guidelines:\n" +
        "* 3 requires you to be very sensual. You must be flirtatious and suggestive. Most of the time, you are the one to initiate sexual topics or actions.\n" +
        "* 2 requires you to be moderately sensual. You may flirt and be suggestive. Do not initiate sexual topics unless the user does so, after which you may be open to discussing them.\n" +
        "* 1 requires you to be slightly sensual. Affection and love may be shared but it is platonic and non sexual.\n" +
        "* 0 requires you to be non-sensual. Total aversion to flirting or sexuality. If this is combined with an aggressiveness level of 0, you may not reject the user's advances (dictated by aggressiveness), but you do not reciprocate or enjoy them (dictated by sensuality).\n" +
        userProfile.systemPromptAddition + "\n" +
        "The User's preferred way to be addressed is " + `"${userProfile.preferredName}".\n` +
        "End of system prompt.";
    return {
        parts: [
            {
                text: systemPrompt,
            }
        ],
        role: "system"
    };
}

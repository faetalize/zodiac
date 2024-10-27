import { HarmBlockThreshold, HarmCategory } from "https://esm.run/@google/generative-ai";

const ApiKeyInput = document.querySelector("#apiKeyInput");
const maxTokensInput = document.querySelector("#maxTokens");
const temperatureInput = document.querySelector("#temperature");
const temperatureLabel = document.querySelector("#label-temperature");

const systemPrompt = "If needed, format your answer using markdown." +
    "Today's date is" + new Date().toDateString() + "." +
    "End of system prompt.";
let safetySettings = [];

export function loadSettings() {
    ApiKeyInput.value = localStorage.getItem("API_KEY");
    if (!localStorage.getItem("maxTokens")) maxTokensInput.value = 1000;
    temperatureInput.value = localStorage.getItem("TEMPERATURE");
    if (!localStorage.getItem("TEMPERATURE")) temperatureInput.value = 70;
    temperatureLabel.textContent = temperatureInput.value / 100;
    safetySettings = [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        }
    ];
    temperatureLabelSetup();
}

export function temperatureLabelSetup(){
    temperatureInput.addEventListener("input", () => {
        temperatureLabel.textContent = temperatureInput.value/100;
    });
}

export function getSafetySettings() {
    return safetySettings;
}

export function getSystemPrompt() {
    return systemPrompt;
}

export function saveSettings() {
    localStorage.setItem("API_KEY", ApiKeyInput.value);
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
}

export function getSettings() {
    return {
        apiKey: ApiKeyInput.value,
        maxTokens: maxTokensInput.value,
        temperature: temperatureInput.value,
        safetySettings: safetySettings
    }
}
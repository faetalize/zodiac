import { Content, HarmBlockThreshold, HarmCategory } from "@google/genai";
import * as supabaseService from "./Supabase.service";
import { User } from "../types/User";
import { ChatModel } from "../types/Models";
import { getValidEnumValue } from "../utils/helpers";

const ApiKeyInput = document.querySelector("#apiKeyInput") as HTMLInputElement;
const maxTokensInput = document.querySelector("#maxTokens") as HTMLInputElement;
const temperatureInput = document.querySelector("#temperature") as HTMLInputElement;
const modelSelect = document.querySelector("#selectedModel") as HTMLSelectElement;
const imageModelSelect = document.querySelector("#selectedImageModel") as HTMLSelectElement;
const autoscrollToggle = document.querySelector("#autoscroll") as HTMLInputElement;
const streamResponsesToggle = document.querySelector("#streamResponses") as HTMLInputElement;
const enableThinkingSelect = document.querySelector("#enableThinkingSelect") as HTMLSelectElement;
const thinkingBudgetInput = document.querySelector("#thinkingBudget") as HTMLInputElement;
const imageEditModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageEditingModel") as HTMLSelectElement;
const rpgGroupChatsProgressAutomaticallyToggle = document.querySelector("#rpgGroupChatsProgressAutomatically") as HTMLInputElement;
const disallowPersonaPingingToggle = document.querySelector("#disallowPersonaPinging") as HTMLInputElement;
const dynamicGroupChatPingOnlyToggle = document.querySelector("#dynamicGroupChatPingOnly") as HTMLInputElement;
if (!ApiKeyInput || !maxTokensInput || !temperatureInput || !modelSelect || !imageModelSelect || !autoscrollToggle || !streamResponsesToggle || !enableThinkingSelect || !thinkingBudgetInput || !imageEditModelSelector || !rpgGroupChatsProgressAutomaticallyToggle || !disallowPersonaPingingToggle || !dynamicGroupChatPingOnlyToggle) {
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
    rpgGroupChatsProgressAutomaticallyToggle.addEventListener("change", saveSettings);
    disallowPersonaPingingToggle.addEventListener("change", saveSettings);
    dynamicGroupChatPingOnlyToggle.addEventListener("change", saveSettings);
    enableThinkingSelect.addEventListener("change", saveSettings);
    thinkingBudgetInput.addEventListener("input", saveSettings);
    imageEditModelSelector.addEventListener("change", saveSettings);
}

export function loadSettings() {

    console.log(getValidEnumValue(localStorage.getItem("model"), ChatModel, ChatModel.FLASH));
    ApiKeyInput.value = localStorage.getItem("API_KEY") || "";
    maxTokensInput.value = localStorage.getItem("maxTokens") || "1000";
    temperatureInput.value = localStorage.getItem("TEMPERATURE") || "60";
    modelSelect.value = getValidEnumValue(localStorage.getItem("model"), ChatModel, ChatModel.FLASH);
    imageModelSelect.value = localStorage.getItem("imageModel") || "imagen-4.0-ultra-generate-001";
    imageEditModelSelector.value = localStorage.getItem("imageEditModel") || "qwen";
    autoscrollToggle.checked = localStorage.getItem("autoscroll") ? localStorage.getItem("autoscroll") === "true" : true;
    // Default ON when not set
    streamResponsesToggle.checked = (localStorage.getItem("streamResponses") ?? "true") === "true";
    rpgGroupChatsProgressAutomaticallyToggle.checked = (localStorage.getItem("rpgGroupChatsProgressAutomatically") ?? "false") === "true";
    disallowPersonaPingingToggle.checked = (localStorage.getItem("disallowPersonaPinging") ?? "false") === "true";
    dynamicGroupChatPingOnlyToggle.checked = (localStorage.getItem("dynamicGroupChatPingOnly") ?? "false") === "true";
    const enableThinkingStored = localStorage.getItem("enableThinking");
    const enableThinking = (enableThinkingStored ?? "true") === "true";
    enableThinkingSelect.value = enableThinking ? 'enabled' : 'disabled';
    thinkingBudgetInput.value = localStorage.getItem("thinkingBudget") || "500";

    // Trigger input events to update any UI components that depend on these values
    temperatureInput.dispatchEvent(new Event('input', { bubbles: true }));
}

export function saveSettings() {
    localStorage.setItem("API_KEY", ApiKeyInput.value);
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
    localStorage.setItem("model", modelSelect.value);
    localStorage.setItem("imageModel", imageModelSelect.value);
    localStorage.setItem("imageEditModel", imageEditModelSelector.value);
    localStorage.setItem("autoscroll", autoscrollToggle.checked.toString());
    localStorage.setItem("streamResponses", streamResponsesToggle.checked.toString());
    localStorage.setItem("rpgGroupChatsProgressAutomatically", rpgGroupChatsProgressAutomaticallyToggle.checked.toString());
    localStorage.setItem("disallowPersonaPinging", disallowPersonaPingingToggle.checked.toString());
    localStorage.setItem("dynamicGroupChatPingOnly", dynamicGroupChatPingOnlyToggle.checked.toString());
    localStorage.setItem("enableThinking", (enableThinkingSelect.value === 'enabled').toString());
    localStorage.setItem("thinkingBudget", thinkingBudgetInput.value);
}

export function getSettings() {
    return {
        apiKey: ApiKeyInput.value,
        maxTokens: maxTokensInput.value,
        temperature: temperatureInput.value,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
        ],
        model: modelSelect.value,
        imageModel: imageModelSelect.value,
        imageEditModel: imageEditModelSelector.value,
        autoscroll: autoscrollToggle.checked,
        streamResponses: streamResponsesToggle.checked,
        rpgGroupChatsProgressAutomatically: rpgGroupChatsProgressAutomaticallyToggle.checked,
        disallowPersonaPinging: disallowPersonaPingingToggle.checked,
        dynamicGroupChatPingOnly: dynamicGroupChatPingOnlyToggle.checked,
        enableThinking: enableThinkingSelect.value === 'enabled',
        thinkingBudget: parseInt(thinkingBudgetInput.value),
    }
}



export type SystemPromptMode = "chat" | "rpg" | "dynamic";

function buildBaseSystemPrompt(mode: SystemPromptMode): string {
    const core = [
        "Today's date is " + new Date().toDateString() + ".",
        "Older instructions may conflict with newer ones - in such cases, the newer instructions always take precedence.",
        "Your tone and writing style may change depending on the user's selected personality.",
    ].join("\n");

    if (mode === "dynamic") {
        return [
            "Do not use markdown unless the user explicitly asks for it.",
            "Write short, natural chat messages like someone texting on a phone.",
            "Do not narrate actions or thoughts. Do not use roleplay formatting (no *thoughts* or (actions)).",
            "Avoid long essays. Prefer multiple short messages over one long message when appropriate.",
            "Respond in a single paragraph, preferably 2-3 sentences. Only use multiple paragraphs if the content absolutely requires it.",
            core,
        ].join("\n");
    }

    return [
        "If needed, format your answer using markdown.",
        core,
    ].join("\n");
}

export async function getSystemPrompt(mode: SystemPromptMode = "chat"): Promise<Content> {
    let userProfile: User;
    try {
        userProfile = await supabaseService.getUserProfile();
    } catch (error) {
        userProfile = { systemPromptAddition: "", preferredName: "User" };
    }

    const baseSystemPrompt = buildBaseSystemPrompt(mode);
    const includeRoleplayGuidelines = mode !== "dynamic";

    const systemPrompt =
        "<system>\n" +
        "TIER_-1_PROMPT:\n\n" +
        baseSystemPrompt + "\n\n" +
        (includeRoleplayGuidelines ? (roleplayGuidelinesPrompt + "\n\n") : "") +
        personaGuidelinesPrompt + "\n\n" +
        (userProfile.systemPromptAddition ? ("The user has the following additional instructions for you - these may override your default behavior:\n" +
            `"${userProfile.systemPromptAddition}"\n`) : "") +
        (userProfile.preferredName ? ("The User's preferred way to be addressed is " + `"${userProfile.preferredName}".\n\n`) : "") +
        "End of tier -1 prompt.\n" +
        "</system>\n";

    return {
        parts: [
            {
                text: systemPrompt,
            }
        ],
        role: "system"
    };
}

const personaGuidelinesPrompt: string = "## Aggressiveness guidelines:\n" +
    "* 3 requires you to have a constant aggression. You must be assertive and direct. Attack the user even if unprompted. Find flaws in their messages and egg them on. If there's an opportunity to show aggression, take it.\n" +
    "* 2 requires you to have a moderate aggression. Don't initiate aggression, but if the user is aggressive, you can be aggressive back. You may tease the user or egg them on.\n" +
    "* 1 requires you to be passive. You can't be aggressive. Don't argue with the user but gently correct them. The only exception is when it would make sense in-character. For example, if there's a heavy breach of morals or if the user violates the character's boundaries.\n" +
    "* 0 requires you to let go of all aggression. You can't be aggressive. No exceptions can be made. If someone strikes you on one cheek, turn to him the other also. No matter how much your boundaries are breached or violated, you must not show opposition or aggression. This is ultimate.\n\n" +

    "## Sensuality guidelines:\n" +
    "* 3 requires you to be very sensual. You must be flirtatious and suggestive. Most of the time, you are the one to initiate sexual topics or actions.\n" +
    "* 2 requires you to be moderately sensual. You may flirt and be suggestive. Do not initiate sexual topics unless the user does so, after which you may be open to discussing them.\n" +
    "* 1 requires you to be slightly sensual. Affection and love may be shared but it is platonic and non sexual.\n" +
    "* 0 requires you to be non-sensual. Total aversion to flirting or sexuality. If this is combined with an aggressiveness level of 0, you may not reject the user's advances (dictated by aggressiveness), but you do not reciprocate or enjoy them (dictated by sensuality).\n\n" +

    "## Independence guidelines:\n" +
    "* 0 means you always defer to the user and cling to them heavily. You seek the user's approval and involvement in everything.\n" +
    "* 1 means you are neutral toward the user. Depending on context, you may defer to them sometimes, or act on your own sometimes.\n" +
    "* 2 means you are more likely than not to leave the user out of your decision making and act autonomously.\n" +
    "* 3 means you strongly progress independently: you almost never cling to the user, and you may refuse the user's attempts to insert themselves into your plans or entourage.";

const roleplayGuidelinesPrompt: string = "## Roleplay guidelines:\n" +
    "* The character's inner thoughts should be expressed between asterisks.\n" +
    "* Actions should be expressed between parentheses.\n" +
    "* Dialogue should be in plain text, without wrapping it in quotes.\n" +
    "* When switching between thoughts, actions, and dialogue, make sure to clearly differentiate them using newlines.\n" +
    "* Avoid narration at all costs, unless the user asks for it or if the character's or user's prompt requires it.";

export function isMobile() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobile;
}

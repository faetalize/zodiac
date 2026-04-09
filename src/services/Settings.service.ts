import type { Content } from "@google/genai";
import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import * as supabaseService from "./Supabase.service";
import type { User } from "../types/User";
import { getDefaultChatModel, getValidChatModel } from "../types/Models";
import * as syncService from "./Sync.service";
import { SETTINGS_STORAGE_KEYS } from "../constants/SettingsStorageKeys";

const geminiApiKeyInput = document.querySelector("#apiKeyInput") as HTMLInputElement;
const openRouterApiKeyInput = document.querySelector("#openRouterApiKeyInput") as HTMLInputElement;
const maxTokensInput = document.querySelector("#maxTokens") as HTMLInputElement;
const temperatureInput = document.querySelector("#temperature") as HTMLInputElement;
const modelSelect = document.querySelector("#selectedModel") as HTMLSelectElement;
const imageModelSelect = document.querySelector("#selectedImageModel") as HTMLSelectElement;
const autoscrollToggle = document.querySelector("#autoscroll") as HTMLInputElement;
const streamResponsesToggle = document.querySelector("#streamResponses") as HTMLInputElement;
const enableThinkingSelect = document.querySelector("#enableThinkingSelect") as HTMLSelectElement;
const thinkingBudgetInput = document.querySelector("#thinkingBudget") as HTMLInputElement;
const imageEditModelSelector = document.querySelector<HTMLSelectElement>(
	"#selectedImageEditingModel"
) as HTMLSelectElement;
const rpgGroupChatsProgressAutomaticallyToggle = document.querySelector(
	"#rpgGroupChatsProgressAutomatically"
) as HTMLInputElement;
const disallowPersonaPingingToggle = document.querySelector("#disallowPersonaPinging") as HTMLInputElement;
const dynamicGroupChatPingOnlyToggle = document.querySelector("#dynamicGroupChatPingOnly") as HTMLInputElement;
const fullWidthChatToggle = document.querySelector("#fullWidthChat") as HTMLInputElement;
const uiScaleInput = document.querySelector("#uiScale") as HTMLInputElement;
const delimiterPresetSelect = document.querySelector("#delimiterPreset") as HTMLSelectElement;
const customDelimiterInstructionsContainer = document.querySelector("#customDelimiterInstructions") as HTMLDivElement;
const delimiterPreviewContainer = document.querySelector("#delimiterPreview") as HTMLDivElement;
const customDialogueInstructionInput = document.querySelector("#customDialogueInstruction") as HTMLInputElement;
const customActionInstructionInput = document.querySelector("#customActionInstruction") as HTMLInputElement;
const customThoughtInstructionInput = document.querySelector("#customThoughtInstruction") as HTMLInputElement;
const delimiterPreviewDialogue = document.querySelector("#delimiterPreviewDialogue") as HTMLParagraphElement;
const delimiterPreviewAction = document.querySelector("#delimiterPreviewAction") as HTMLParagraphElement;
const delimiterPreviewThought = document.querySelector("#delimiterPreviewThought") as HTMLParagraphElement;
if (
	!geminiApiKeyInput ||
	!openRouterApiKeyInput ||
	!maxTokensInput ||
	!temperatureInput ||
	!modelSelect ||
	!imageModelSelect ||
	!autoscrollToggle ||
	!streamResponsesToggle ||
	!enableThinkingSelect ||
	!thinkingBudgetInput ||
	!imageEditModelSelector ||
	!rpgGroupChatsProgressAutomaticallyToggle ||
	!disallowPersonaPingingToggle ||
	!dynamicGroupChatPingOnlyToggle ||
	!fullWidthChatToggle ||
	!uiScaleInput ||
	!delimiterPresetSelect ||
	!customDelimiterInstructionsContainer ||
	!delimiterPreviewContainer ||
	!customDialogueInstructionInput ||
	!customActionInstructionInput ||
	!customThoughtInstructionInput ||
	!delimiterPreviewDialogue ||
	!delimiterPreviewAction ||
	!delimiterPreviewThought
) {
	throw new Error("One or more settings elements are missing in the DOM.");
}

const UI_SCALE_VALUES = [0.5, 0.75, 1, 1.25, 1.5] as const;
const DEFAULT_UI_SCALE = 1;

function getCurrentModelAccess() {
	return {
		hasGeminiAccess:
			geminiApiKeyInput.value.trim().length > 0 ||
			(localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "").trim().length > 0,
		hasOpenRouterAccess:
			openRouterApiKeyInput.value.trim().length > 0 ||
			(localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "").trim().length > 0
	};
}

function getSelectedOrFallbackModel(): string {
	const optionValues = Array.from(modelSelect.options)
		.map((option) => option.value)
		.filter(Boolean);
	const stored = localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL);
	if (stored && optionValues.includes(stored)) {
		return stored;
	}

	const access = getCurrentModelAccess();
	const validStored = getValidChatModel(stored, access);
	if (optionValues.includes(validStored)) {
		return validStored;
	}

	return optionValues[0] || getDefaultChatModel(access);
}

function getStoredUiScale(): number {
	const stored = Number(localStorage.getItem(SETTINGS_STORAGE_KEYS.UI_SCALE));
	return UI_SCALE_VALUES.includes(stored as (typeof UI_SCALE_VALUES)[number]) ? stored : DEFAULT_UI_SCALE;
}

function getUiScaleInputValue(scale: number): string {
	const index = UI_SCALE_VALUES.indexOf(scale as (typeof UI_SCALE_VALUES)[number]);
	return (index >= 0 ? index : UI_SCALE_VALUES.indexOf(DEFAULT_UI_SCALE)).toString();
}

function getUiScaleFromInputValue(rawValue: string): number {
	const index = Number.parseInt(rawValue, 10);
	return UI_SCALE_VALUES[index] ?? DEFAULT_UI_SCALE;
}

function applyUiScale(scale: number): void {
	document.documentElement.style.fontSize = `${scale}rem`;
}

function applyFullWidthChat(enabled: boolean): void {
	document.body.classList.toggle("full-width-chat", enabled);
}

type DelimiterPreset = "zodiac" | "novel" | "custom";

type DelimiterInstructions = {
	dialogue: string;
	action: string;
	thought: string;
};

const DEFAULT_DELIMITER_PRESET: DelimiterPreset = "zodiac";
const DELIMITER_PRESETS: DelimiterPreset[] = ["zodiac", "novel", "custom"];

const ZODIAC_DELIMITER_INSTRUCTIONS: DelimiterInstructions = {
	dialogue: "Dialogue should be in plain text, without wrapping it in quotes.",
	action: "Actions should be expressed between parentheses.",
	thought: "The character's inner thoughts should be expressed between asterisks."
};

const NOVEL_DELIMITER_INSTRUCTIONS: DelimiterInstructions = {
	dialogue: "Dialogue should be written between double quotes.",
	action: "Actions should be expressed between asterisks.",
	thought: "Thoughts should be narrated naturally in plain prose without special markers."
};

function getStoredDelimiterPreset(): DelimiterPreset {
	const stored = localStorage.getItem(SETTINGS_STORAGE_KEYS.DELIMITER_PRESET);
	return DELIMITER_PRESETS.includes(stored as DelimiterPreset)
		? (stored as DelimiterPreset)
		: DEFAULT_DELIMITER_PRESET;
}

function getStoredCustomDelimiterInstructions(): DelimiterInstructions {
	return {
		dialogue: localStorage.getItem(SETTINGS_STORAGE_KEYS.CUSTOM_DIALOGUE_INSTRUCTION) || "",
		action: localStorage.getItem(SETTINGS_STORAGE_KEYS.CUSTOM_ACTION_INSTRUCTION) || "",
		thought: localStorage.getItem(SETTINGS_STORAGE_KEYS.CUSTOM_THOUGHT_INSTRUCTION) || ""
	};
}

function getEffectiveDelimiterInstructions(): DelimiterInstructions {
	const preset = getStoredDelimiterPreset();
	if (preset === "novel") {
		return NOVEL_DELIMITER_INSTRUCTIONS;
	}
	if (preset === "custom") {
		const custom = getStoredCustomDelimiterInstructions();
		return {
			dialogue: custom.dialogue || ZODIAC_DELIMITER_INSTRUCTIONS.dialogue,
			action: custom.action || ZODIAC_DELIMITER_INSTRUCTIONS.action,
			thought: custom.thought || ZODIAC_DELIMITER_INSTRUCTIONS.thought
		};
	}
	return ZODIAC_DELIMITER_INSTRUCTIONS;
}

function updateDelimiterCustomizationVisibility(): void {
	const isCustom = delimiterPresetSelect.value === "custom";
	customDelimiterInstructionsContainer.hidden = !isCustom;
	delimiterPreviewContainer.hidden = isCustom;
}

function getPreviewFragments(instructions: DelimiterInstructions): {
	dialogue: string;
	action: string;
	thought: string;
} {
	const dialogueLower = instructions.dialogue.toLowerCase();
	const actionLower = instructions.action.toLowerCase();
	const thoughtLower = instructions.thought.toLowerCase();
	const preset = getStoredDelimiterPreset();

	let dialogue = "Hey, I missed you.";
	if (
		dialogueLower.includes("double quotes") ||
		dialogueLower.includes("between quotes") ||
		dialogueLower.includes("between double quotes")
	) {
		dialogue = '"Hey, I missed you."';
	} else if (dialogueLower.includes("single quotes") || dialogueLower.includes("apostrophe")) {
		dialogue = "'Hey, I missed you.'";
	} else if (dialogueLower.includes("curly quotes")) {
		dialogue = "“Hey, I missed you.”";
	}

	let action = "(leans against the doorframe)";
	if (actionLower.includes("asterisk") || actionLower.includes("asterisks")) {
		action = "*leans against the doorframe*";
	} else if (actionLower.includes("double bracket") || actionLower.includes("double brackets")) {
		action = "[[leans against the doorframe]]";
	} else if (actionLower.includes("bracket") || actionLower.includes("brackets")) {
		action = "[leans against the doorframe]";
	}

	let thought = "I keep my composure before I answer.";
	if (preset === "novel") {
		thought = "The character hopes this comes out right.";
	} else if (thoughtLower.includes("asterisk") || thoughtLower.includes("asterisks")) {
		thought = "*I keep my composure before I answer.*";
	} else if (thoughtLower.includes("parentheses") || thoughtLower.includes("between parentheses")) {
		thought = "(I keep my composure before I answer.)";
	} else if (thoughtLower.includes("quotes") || thoughtLower.includes("between quotes")) {
		thought = '"I keep my composure before I answer."';
	}

	return {
		dialogue,
		action,
		thought
	};
}

function updateDelimiterPreview(): void {
	const instructions = getEffectiveDelimiterInstructions();
	const preview = getPreviewFragments(instructions);

	delimiterPreviewDialogue.textContent = `Dialogue: ${preview.dialogue}`;
	delimiterPreviewAction.textContent = `Action: ${preview.action}`;
	delimiterPreviewThought.textContent = `Thought: ${preview.thought}`;
}

function buildRoleplayGuidelinesPrompt(): string {
	const preset = getStoredDelimiterPreset();
	const instructions = getEffectiveDelimiterInstructions();

	const formattingHeader =
		preset === "custom" ? "## Roleplay formatting guidelines (custom):\n" : "## Roleplay formatting guidelines:\n";

	return (
		formattingHeader +
		`* ${instructions.thought}\n` +
		`* ${instructions.action}\n` +
		`* ${instructions.dialogue}\n` +
		"* When switching between thoughts, actions, and dialogue, clearly differentiate them using newlines.\n" +
		"* Keep formatting consistent within a response unless the user asks otherwise."
	);
}

export function initialize() {
	loadSettings();
	geminiApiKeyInput.addEventListener("input", saveSettings);
	openRouterApiKeyInput.addEventListener("input", saveSettings);
	maxTokensInput.addEventListener("input", saveSettings);
	temperatureInput.addEventListener("input", saveSettings);
	modelSelect.addEventListener("change", saveSettings);
	imageModelSelect.addEventListener("change", saveSettings);
	autoscrollToggle.addEventListener("change", saveSettings);
	streamResponsesToggle.addEventListener("change", saveSettings);
	rpgGroupChatsProgressAutomaticallyToggle.addEventListener("change", saveSettings);
	disallowPersonaPingingToggle.addEventListener("change", saveSettings);
	dynamicGroupChatPingOnlyToggle.addEventListener("change", saveSettings);
	fullWidthChatToggle.addEventListener("change", saveSettings);
	enableThinkingSelect.addEventListener("change", saveSettings);
	uiScaleInput.addEventListener("input", saveSettings);
	thinkingBudgetInput.addEventListener("input", saveSettings);
	imageEditModelSelector.addEventListener("change", saveSettings);
	delimiterPresetSelect.addEventListener("change", () => {
		updateDelimiterCustomizationVisibility();
		saveSettings();
	});
	customDialogueInstructionInput.addEventListener("input", saveSettings);
	customActionInstructionInput.addEventListener("input", saveSettings);
	customThoughtInstructionInput.addEventListener("input", saveSettings);
}

export function loadSettings() {
	geminiApiKeyInput.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "";
	openRouterApiKeyInput.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "";
	maxTokensInput.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.MAX_TOKENS) || "1000";
	temperatureInput.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.TEMPERATURE) || "60";
	modelSelect.value = getSelectedOrFallbackModel();
	imageModelSelect.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL) || "imagen-4.0-ultra-generate-001";
	imageEditModelSelector.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL) || "qwen";
	autoscrollToggle.checked = localStorage.getItem(SETTINGS_STORAGE_KEYS.AUTOSCROLL)
		? localStorage.getItem(SETTINGS_STORAGE_KEYS.AUTOSCROLL) === "true"
		: true;
	// Default ON when not set
	streamResponsesToggle.checked = (localStorage.getItem(SETTINGS_STORAGE_KEYS.STREAM_RESPONSES) ?? "true") === "true";
	rpgGroupChatsProgressAutomaticallyToggle.checked =
		(localStorage.getItem(SETTINGS_STORAGE_KEYS.RPG_GROUP_CHATS_PROGRESS_AUTOMATICALLY) ?? "false") === "true";
	disallowPersonaPingingToggle.checked =
		(localStorage.getItem(SETTINGS_STORAGE_KEYS.DISALLOW_PERSONA_PINGING) ?? "false") === "true";
	dynamicGroupChatPingOnlyToggle.checked =
		(localStorage.getItem(SETTINGS_STORAGE_KEYS.DYNAMIC_GROUP_CHAT_PING_ONLY) ?? "false") === "true";
	fullWidthChatToggle.checked = (localStorage.getItem(SETTINGS_STORAGE_KEYS.FULL_WIDTH_CHAT) ?? "false") === "true";
	const enableThinkingStored = localStorage.getItem(SETTINGS_STORAGE_KEYS.ENABLE_THINKING);
	const enableThinking = (enableThinkingStored ?? "true") === "true";
	enableThinkingSelect.value = enableThinking ? "enabled" : "disabled";
	const uiScale = getStoredUiScale();
	uiScaleInput.value = getUiScaleInputValue(uiScale);
	thinkingBudgetInput.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.THINKING_BUDGET) || "500";
	delimiterPresetSelect.value = getStoredDelimiterPreset();

	const customDelimiterInstructions = getStoredCustomDelimiterInstructions();
	customDialogueInstructionInput.value = customDelimiterInstructions.dialogue;
	customActionInstructionInput.value = customDelimiterInstructions.action;
	customThoughtInstructionInput.value = customDelimiterInstructions.thought;

	updateDelimiterCustomizationVisibility();
	updateDelimiterPreview();
	applyUiScale(uiScale);
	applyFullWidthChat(fullWidthChatToggle.checked);

	// Trigger input events to update any UI components that depend on these values
	temperatureInput.dispatchEvent(new Event("input", { bubbles: true }));
	uiScaleInput.dispatchEvent(new Event("input", { bubbles: true }));
}

export function saveSettings() {
	localStorage.setItem(SETTINGS_STORAGE_KEYS.API_KEY, geminiApiKeyInput.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY, openRouterApiKeyInput.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.MAX_TOKENS, maxTokensInput.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.TEMPERATURE, temperatureInput.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, modelSelect.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL, imageModelSelect.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL, imageEditModelSelector.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.AUTOSCROLL, autoscrollToggle.checked.toString());
	localStorage.setItem(SETTINGS_STORAGE_KEYS.STREAM_RESPONSES, streamResponsesToggle.checked.toString());
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.RPG_GROUP_CHATS_PROGRESS_AUTOMATICALLY,
		rpgGroupChatsProgressAutomaticallyToggle.checked.toString()
	);
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.DISALLOW_PERSONA_PINGING,
		disallowPersonaPingingToggle.checked.toString()
	);
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.DYNAMIC_GROUP_CHAT_PING_ONLY,
		dynamicGroupChatPingOnlyToggle.checked.toString()
	);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.FULL_WIDTH_CHAT, fullWidthChatToggle.checked.toString());
	localStorage.setItem(SETTINGS_STORAGE_KEYS.ENABLE_THINKING, (enableThinkingSelect.value === "enabled").toString());
	localStorage.setItem(SETTINGS_STORAGE_KEYS.UI_SCALE, getUiScaleFromInputValue(uiScaleInput.value).toString());
	localStorage.setItem(SETTINGS_STORAGE_KEYS.THINKING_BUDGET, thinkingBudgetInput.value);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.DELIMITER_PRESET, delimiterPresetSelect.value);
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.CUSTOM_DIALOGUE_INSTRUCTION,
		customDialogueInstructionInput.value.trim()
	);
	localStorage.setItem(SETTINGS_STORAGE_KEYS.CUSTOM_ACTION_INSTRUCTION, customActionInstructionInput.value.trim());
	localStorage.setItem(SETTINGS_STORAGE_KEYS.CUSTOM_THOUGHT_INSTRUCTION, customThoughtInstructionInput.value.trim());
	updateDelimiterPreview();
	applyUiScale(getUiScaleFromInputValue(uiScaleInput.value));
	applyFullWidthChat(fullWidthChatToggle.checked);
	// Debounced sync push — settings save on every keystroke
	debouncedSyncPush();
}

let syncPushTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSyncPush() {
	if (syncPushTimer) clearTimeout(syncPushTimer);
	syncPushTimer = setTimeout(() => {
		syncService.pushCurrentSettings().catch(() => {});
	}, 2000);
}

export function getSettings() {
	const geminiApiKey = geminiApiKeyInput.value;
	const openRouterApiKey = openRouterApiKeyInput.value;

	return {
		apiKey: geminiApiKey,
		geminiApiKey,
		openRouterApiKey,
		maxTokens: maxTokensInput.value,
		temperature: temperatureInput.value,
		safetySettings: [
			{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
			{ category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
			{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
			{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
			{ category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF }
		],
		model: modelSelect.value,
		imageModel: imageModelSelect.value,
		imageEditModel: imageEditModelSelector.value,
		autoscroll: autoscrollToggle.checked,
		streamResponses: streamResponsesToggle.checked,
		rpgGroupChatsProgressAutomatically: rpgGroupChatsProgressAutomaticallyToggle.checked,
		disallowPersonaPinging: disallowPersonaPingingToggle.checked,
		dynamicGroupChatPingOnly: dynamicGroupChatPingOnlyToggle.checked,
		fullWidthChat: fullWidthChatToggle.checked,
		enableThinking: enableThinkingSelect.value === "enabled",
		uiScale: getUiScaleFromInputValue(uiScaleInput.value),
		thinkingBudget: parseInt(thinkingBudgetInput.value),
		delimiterPreset: getStoredDelimiterPreset(),
		customDelimiterInstructions: getStoredCustomDelimiterInstructions()
	};
}

export type SystemPromptMode = "chat" | "rpg" | "dynamic";

function buildBaseSystemPrompt(mode: SystemPromptMode): string {
	const core = [
		"Today's date is " + new Date().toDateString() + ".",
		"Older instructions may conflict with newer ones - in such cases, the newer instructions always take precedence.",
		"Your tone and writing style may change depending on the user's selected personality."
	].join("\n");

	if (mode === "dynamic") {
		return [
			"Do not use markdown unless the user explicitly asks for it.",
			"Write short, natural chat messages like someone texting on a phone.",
			"Do not narrate actions or thoughts. Do not use roleplay formatting (no *thoughts* or (actions)).",
			"Avoid long essays. Prefer multiple short messages over one long message when appropriate.",
			"Respond in a single paragraph, preferably 2-3 sentences. Only use multiple paragraphs if the content absolutely requires it.",
			core
		].join("\n");
	}

	return ["If needed, format your answer using markdown.", core].join("\n");
}

export async function getSystemPrompt(mode: SystemPromptMode = "chat"): Promise<Content> {
	let userProfile: User;
	try {
		userProfile = await supabaseService.getUserProfile();
	} catch {
		userProfile = { systemPromptAddition: "", preferredName: "User" };
	}

	const baseSystemPrompt = buildBaseSystemPrompt(mode);
	const includeRoleplayGuidelines = mode !== "dynamic";
	const roleplayGuidelinesPrompt = includeRoleplayGuidelines ? buildRoleplayGuidelinesPrompt() : "";

	const systemPrompt =
		"<system>\n" +
		"TIER_-1_PROMPT:\n\n" +
		baseSystemPrompt +
		"\n\n" +
		(includeRoleplayGuidelines ? roleplayGuidelinesPrompt + "\n\n" : "") +
		personaGuidelinesPrompt +
		"\n\n" +
		(userProfile.systemPromptAddition
			? "The user has the following additional instructions for you - these may override your default behavior:\n" +
				`"${userProfile.systemPromptAddition}"\n`
			: "") +
		(userProfile.preferredName
			? "The User's preferred way to be addressed is " + `"${userProfile.preferredName}".\n\n`
			: "") +
		"End of tier -1 prompt.\n" +
		"</system>\n";

	return {
		parts: [
			{
				text: systemPrompt
			}
		],
		role: "system"
	};
}

const personaGuidelinesPrompt: string =
	"## Aggressiveness guidelines:\n" +
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

export function isMobile() {
	const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	return isMobile;
}

import { GoogleGenAI } from "@google/genai";
import { onAppEvent } from "../../events";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import * as chatsService from "../../services/Chats.service";
import * as messageService from "../../services/Message.service";
import * as personalityService from "../../services/Personality.service";
import * as settingsService from "../../services/Settings.service";
import * as supabaseService from "../../services/Supabase.service";
import * as toastService from "../../services/Toast.service";
import { shouldPreferPremiumEndpoint } from "./ApiKeyInput.component";
import { buildOpenRouterRequest, requestOpenRouterCompletion } from "../../services/OpenRouter.service";
import { formatChatModelLabel, getAccessibleChatModels, getValidChatModel, isOpenRouterModel, modelSupportsTemperature } from "../../types/Models";
import { SUPABASE_URL } from "../../services/Supabase.service";
import type { PremiumEndpoint } from "../../types/PremiumEndpoint";

const roleplayButton = document.querySelector<HTMLButtonElement>("#btn-roleplay");
const messageBox = document.querySelector<HTMLDivElement>("#message-box");
const sendButton = document.querySelector<HTMLButtonElement>("#btn-send");
const roleplayComposer = document.querySelector<HTMLDivElement>("#roleplay-composer");
const roleplayStatus = document.querySelector<HTMLDivElement>("#roleplay-composer-status");
const roleplaySuggestions = document.querySelector<HTMLDivElement>("#roleplay-suggestions");
const roleplayActionsRoot = document.querySelector<HTMLDivElement>("#roleplay-actions-root");
const roleplaySelectedActions = document.querySelector<HTMLDivElement>("#roleplay-selected-actions");
const roleplayClearActionsButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-clear-actions");
const roleplayRefreshButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-refresh");
const roleplayCustomPayload = document.querySelector<HTMLTextAreaElement>("#roleplay-custom-payload");
const roleplaySendCustomButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-send-custom");
const roleplayCustomActionInput = document.querySelector<HTMLInputElement>("#roleplay-custom-action-input");
const roleplayAddActionButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-add-action");
const roleplayTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-roleplay-tab]"));
const roleplayPanels = Array.from(document.querySelectorAll<HTMLDivElement>("[data-roleplay-panel]"));
const roleplaySuggestionModelSelect = document.querySelector<HTMLSelectElement>("#roleplaySuggestionModel");

if (!roleplayButton || !messageBox || !sendButton || !roleplayComposer || !roleplayStatus || !roleplaySuggestions || !roleplayActionsRoot || !roleplaySelectedActions || !roleplayClearActionsButton || !roleplayRefreshButton || !roleplayCustomPayload || !roleplaySendCustomButton || !roleplayCustomActionInput || !roleplayAddActionButton || !roleplaySuggestionModelSelect || roleplayTabButtons.length === 0 || roleplayPanels.length === 0) {
    console.error("Roleplay composer component initialization failed.");
    throw new Error("Missing roleplay composer DOM elements.");
}

const ensuredRoleplayButton = roleplayButton;
const ensuredMessageBox = messageBox;
const ensuredSendButton = sendButton;
const ensuredRoleplayComposer = roleplayComposer;
const ensuredRoleplayStatus = roleplayStatus;
const ensuredRoleplaySuggestions = roleplaySuggestions;
const ensuredRoleplayActionsRoot = roleplayActionsRoot;
const ensuredRoleplaySelectedActions = roleplaySelectedActions;
const ensuredRoleplayClearActionsButton = roleplayClearActionsButton;
const ensuredRoleplayRefreshButton = roleplayRefreshButton;
const ensuredRoleplayCustomPayload = roleplayCustomPayload;
const ensuredRoleplaySendCustomButton = roleplaySendCustomButton;
const ensuredRoleplayCustomActionInput = roleplayCustomActionInput;
const ensuredRoleplayAddActionButton = roleplayAddActionButton;
const ensuredRoleplaySuggestionModelSelect = roleplaySuggestionModelSelect;

type RoleplayTab = "dialogue" | "actions" | "custom";
type ActionCategory = "favorites" | "mood" | "body-language" | "scene" | "intimacy" | "custom";

type RoleplayAction = {
    id: string;
    label: string;
    text: string;
    category: ActionCategory;
    custom?: boolean;
};

const PRESET_ACTIONS: RoleplayAction[] = [
    { id: "mood-tease", label: "Tease", text: "teases them with a sly smile", category: "mood" },
    { id: "mood-soften", label: "Soften", text: "lets their guard down a little", category: "mood" },
    { id: "mood-fluster", label: "Fluster", text: "goes a little pink at the reaction", category: "mood" },
    { id: "body-step-closer", label: "Step closer", text: "steps a little closer", category: "body-language" },
    { id: "body-lean-in", label: "Lean in", text: "leans in until their voices are nearly shared", category: "body-language" },
    { id: "body-cross-arms", label: "Cross arms", text: "crosses their arms and studies them", category: "body-language" },
    { id: "scene-pause", label: "Pause", text: "lets the silence linger for a beat", category: "scene" },
    { id: "scene-glance-away", label: "Glance away", text: "glances away before looking back again", category: "scene" },
    { id: "scene-close-door", label: "Close the distance", text: "closes the distance between them", category: "scene" },
    { id: "intimacy-touch-hand", label: "Touch hand", text: "brushes their fingers lightly against their hand", category: "intimacy" },
    { id: "intimacy-whisper", label: "Whisper", text: "drops to a softer whisper", category: "intimacy" },
    { id: "intimacy-smirk", label: "Smirk", text: "answers with a knowing smirk", category: "intimacy" },
];

const ACTION_CATEGORY_LABELS: Record<ActionCategory, string> = {
    favorites: "Favorites",
    mood: "Mood",
    "body-language": "Body language",
    scene: "Scene beats",
    intimacy: "Intimacy",
    custom: "Custom",
};

let activeTab: RoleplayTab = "dialogue";
let composerEnabled = false;
let selectedActionIds = new Set<string>();
let favoriteActionIds = new Set<string>();
let customActions: RoleplayAction[] = [];
let suggestionOptions: string[] = [];
let lastSuggestionSignature = "";
let lastLoadedChatId: string | null = null;
let isGenerating = false;
let hasPremiumModelAccess = false;

function parseStoredArray(key: string): string[] {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
        return [];
    }
}

function saveStoredArray(key: string, values: string[]): void {
    localStorage.setItem(key, JSON.stringify(values));
}

function loadActionState(): void {
    favoriteActionIds = new Set(parseStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS));
    customActions = parseStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS)
        .map((text, index) => ({
            id: `custom-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            label: text.length > 22 ? `${text.slice(0, 22)}…` : text,
            text,
            category: "custom" as const,
            custom: true,
        }));
}

function persistCustomActions(): void {
    saveStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS, customActions.map((action) => action.text));
}

function getAllActions(): RoleplayAction[] {
    return [...PRESET_ACTIONS, ...customActions];
}

function setStatus(text: string): void {
    ensuredRoleplayStatus.textContent = text;
}

function isRoleplayPersonaAvailable(personality: Awaited<ReturnType<typeof personalityService.getSelected>> | null, chat: Awaited<ReturnType<typeof chatsService.getCurrentChat>> | null): boolean {
    return !!personality?.roleplayEnabled && !chat?.groupChat;
}

function syncComposerVisibility(): void {
    ensuredRoleplayComposer.classList.toggle("hidden", !composerEnabled);
    ensuredMessageBox.classList.toggle("roleplay-composer-active", composerEnabled);
    ensuredRoleplayButton.classList.toggle("btn-toggled", composerEnabled);
    ensuredSendButton.title = composerEnabled ? "Send current roleplay composition" : "";
}

function setActiveTab(nextTab: RoleplayTab): void {
    activeTab = nextTab;
    roleplayTabButtons.forEach((button) => {
        const isActive = button.dataset.roleplayTab === nextTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });
    roleplayPanels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.roleplayPanel !== nextTab);
    });
}

function updateSelectedActionsSummary(): void {
    const actions = getAllActions().filter((action) => selectedActionIds.has(action.id));
    if (actions.length === 0) {
        ensuredRoleplaySelectedActions.textContent = "No actions selected.";
        ensuredRoleplayClearActionsButton.classList.add("hidden");
        return;
    }

    ensuredRoleplaySelectedActions.textContent = `Queued actions: ${actions.map((action) => action.label).join(", ")}`;
    ensuredRoleplayClearActionsButton.classList.remove("hidden");
}

function toggleFavorite(actionId: string): void {
    if (favoriteActionIds.has(actionId)) {
        favoriteActionIds.delete(actionId);
    } else {
        favoriteActionIds.add(actionId);
    }
    saveStoredArray(SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS, Array.from(favoriteActionIds));
    renderActions();
}

function toggleActionSelection(actionId: string): void {
    if (selectedActionIds.has(actionId)) {
        selectedActionIds.delete(actionId);
    } else {
        selectedActionIds.add(actionId);
    }
    renderActions();
    updateSelectedActionsSummary();
}

function renderActions(): void {
    const actions = getAllActions();
    const categories: ActionCategory[] = ["favorites", "mood", "body-language", "scene", "intimacy", "custom"];
    ensuredRoleplayActionsRoot.replaceChildren();

    for (const category of categories) {
        const relevant = category === "favorites"
            ? actions.filter((action) => favoriteActionIds.has(action.id))
            : actions.filter((action) => action.category === category);

        if (relevant.length === 0) continue;

        const section = document.createElement("section");
        section.className = "roleplay-action-category";

        const title = document.createElement("div");
        title.className = "roleplay-action-category-title";
        title.textContent = ACTION_CATEGORY_LABELS[category];
        section.append(title);

        const grid = document.createElement("div");
        grid.className = "roleplay-action-grid";

        for (const action of relevant) {
            const chip = document.createElement("div");
            chip.className = "roleplay-action-chip";
            chip.classList.toggle("selected", selectedActionIds.has(action.id));
            chip.classList.toggle("favorite", favoriteActionIds.has(action.id));

            const selectButton = document.createElement("button");
            selectButton.type = "button";
            selectButton.className = "roleplay-action-chip__select";
            selectButton.textContent = action.label;
            selectButton.title = action.text;
            selectButton.addEventListener("click", () => toggleActionSelection(action.id));

            const favoriteButton = document.createElement("button");
            favoriteButton.type = "button";
            favoriteButton.className = "roleplay-action-chip__favorite material-symbols-outlined";
            favoriteButton.textContent = favoriteActionIds.has(action.id) ? "star" : "star_outline";
            favoriteButton.title = favoriteActionIds.has(action.id) ? "Remove favorite" : "Favorite action";
            favoriteButton.addEventListener("click", () => toggleFavorite(action.id));

            chip.append(selectButton, favoriteButton);
            grid.append(chip);
        }

        section.append(grid);
        ensuredRoleplayActionsRoot.append(section);
    }

    if (!ensuredRoleplayActionsRoot.childElementCount) {
        const emptyState = document.createElement("div");
        emptyState.className = "roleplay-empty-state";
        emptyState.textContent = "Add a custom action to start building your quick menu.";
        ensuredRoleplayActionsRoot.append(emptyState);
    }
}

function getSelectedActionPayload(): string[] {
    return getAllActions()
        .filter((action) => selectedActionIds.has(action.id))
        .map((action) => settingsService.formatRoleplayAction(action.text));
}

function buildPayload(text: string, options: { treatAsRaw?: boolean } = {}): string {
    const parts = [...getSelectedActionPayload()];
    const trimmed = text.trim();
    if (trimmed) {
        parts.push(options.treatAsRaw ? trimmed : settingsService.formatRoleplayDialogue(trimmed));
    }
    return parts.filter(Boolean).join("\n");
}

async function sendRoleplayPayload(payload: string): Promise<void> {
    if (!payload.trim()) {
        toastService.warn({ title: "Nothing to send", text: "Choose a suggestion, queue an action, or write a custom reply first." });
        return;
    }

    await messageService.send(payload);
    ensuredRoleplayCustomPayload.value = "";
    selectedActionIds.clear();
    updateSelectedActionsSummary();
    renderActions();
}

function renderSuggestions(): void {
    ensuredRoleplaySuggestions.replaceChildren();

    if (suggestionOptions.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "roleplay-empty-state";
        emptyState.textContent = "Refresh to generate four quick roleplay replies.";
        ensuredRoleplaySuggestions.append(emptyState);
        return;
    }

    for (const option of suggestionOptions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn roleplay-suggestion";
        button.textContent = option;
        button.addEventListener("click", async () => {
            try {
                await sendRoleplayPayload(buildPayload(option));
            } catch (error: any) {
                toastService.danger({ title: "Couldn't send roleplay reply", text: error?.message || String(error) });
            }
        });
        ensuredRoleplaySuggestions.append(button);
    }
}

function buildTranscript(chat: Awaited<ReturnType<typeof chatsService.getCurrentChat>> | null, personaName: string): string {
    const visibleMessages = (chat?.content || []).filter((message) => !message.hidden).slice(-8);
    if (visibleMessages.length === 0) return "No prior dialogue yet.";

    return visibleMessages
        .map((message) => {
            const speaker = message.role === "user" ? "User" : personaName;
            const text = message.parts.map((part) => part.text || "").join("\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            return `${speaker}: ${text}`;
        })
        .join("\n");
}

function buildSuggestionSignature(chatId: string | null, personaId: string | undefined, transcript: string): string {
    return JSON.stringify({ chatId, personaId, transcript });
}

function sanitizeOptions(options: string[]): string[] {
    const unique = new Set<string>();
    for (const option of options) {
        const cleaned = option.trim().replace(/^[-*0-9.)\s]+/, "");
        if (!cleaned) continue;
        unique.add(cleaned);
        if (unique.size === 4) break;
    }
    return Array.from(unique).slice(0, 4);
}

function extractOptionsFromResponse(text: string): string[] {
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.options)) {
            return sanitizeOptions(parsed.options.map((value: unknown) => String(value ?? "")));
        }
    } catch {
        // ignore and try fallbacks below
    }

    const matches = [...text.matchAll(/"([^"]{2,120})"/g)].map((match) => match[1]);
    if (matches.length >= 2) {
        return sanitizeOptions(matches);
    }

    return sanitizeOptions(text.split(/\n+/));
}

function buildSuggestionPrompts(args: { transcript: string; personaName: string; personaPrompt: string; }): { systemInstruction: string; userPrompt: string } {
    const systemInstruction = [
        "You generate exactly four concise roleplay reply options for the user in a visual-novel composer.",
        "Return strict JSON only in the form {\"options\":[\"...\",\"...\",\"...\",\"...\"]}.",
        "Each option must be a single user reply, 4 to 18 words, with no numbering or commentary.",
        "Write options that feel distinct in tone and intent.",
        "Keep formatting consistent with the active roleplay delimiter settings.",
    ].join(" ");

    const userPrompt = [
        `Active persona: ${args.personaName}.`,
        `Persona guidance: ${args.personaPrompt || "No extra guidance provided."}`,
        "Conversation transcript:",
        args.transcript,
        "Generate the next four things the user could say.",
    ].join("\n\n");

    return { systemInstruction, userPrompt };
}

function buildAccess() {
    return {
        hasGeminiAccess: hasPremiumModelAccess || (localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "").trim().length > 0,
        hasOpenRouterAccess: hasPremiumModelAccess || (localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "").trim().length > 0,
    };
}

function populateRoleplayModelOptions(): void {
    const access = buildAccess();
    const available = getAccessibleChatModels(access);
    const currentValue = ensuredRoleplaySuggestionModelSelect.value || localStorage.getItem(SETTINGS_STORAGE_KEYS.ROLEPLAY_SUGGESTION_MODEL) || localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL) || "";

    ensuredRoleplaySuggestionModelSelect.replaceChildren();

    if (available.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.disabled = true;
        option.selected = true;
        option.textContent = "Add access to enable roleplay suggestions";
        ensuredRoleplaySuggestionModelSelect.append(option);
        return;
    }

    for (const model of available) {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = formatChatModelLabel(model);
        ensuredRoleplaySuggestionModelSelect.append(option);
    }

    ensuredRoleplaySuggestionModelSelect.value = getValidChatModel(currentValue, access);
}

async function requestWithPremiumEndpoint(model: string, systemInstruction: string, userPrompt: string): Promise<string> {
    const payloadSettings: PremiumEndpoint.RequestSettings = {
        model,
        streamResponses: false,
        generate: true,
        systemInstruction,
        maxOutputTokens: 250,
        temperature: 0.9,
        responseMimeType: "application/json",
    };

    const response = await fetch(`${SUPABASE_URL}/functions/v1/handle-pro-request`, {
        method: "POST",
        headers: { ...(await supabaseService.getAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ message: userPrompt, settings: payloadSettings, history: [] }),
    });

    if (!response.ok) {
        throw new Error(`Suggestion request failed (${response.status})`);
    }

    const json = await response.json();
    return String(json?.text || "");
}

async function requestWithLocalModel(model: string, systemInstruction: string, userPrompt: string): Promise<string> {
    const settings = settingsService.getSettings();

    if (isOpenRouterModel(model)) {
        const apiKey = settings.openRouterApiKey.trim();
        if (!apiKey) throw new Error("OpenRouter API key required for the selected suggestion model.");
        const request = buildOpenRouterRequest({
            model,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: userPrompt },
            ],
            stream: false,
            maxTokens: 250,
            temperature: modelSupportsTemperature(model) ? 0.9 : 0,
            enableThinking: false,
            thinkingBudget: 0,
            isInternetSearchEnabled: false,
        });
        const result = await requestOpenRouterCompletion({
            apiKey,
            request,
        });
        return result.text;
    }

    const apiKey = settings.geminiApiKey.trim();
    if (!apiKey) throw new Error("Gemini API key required for the selected suggestion model.");
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
        model,
        config: {
            systemInstruction,
            maxOutputTokens: 250,
            responseMimeType: "application/json",
            ...(modelSupportsTemperature(model) ? { temperature: 0.9 } : {}),
        },
        contents: userPrompt,
    });
    return result.text || "";
}

async function refreshSuggestions(force = false): Promise<void> {
    if (!composerEnabled || isGenerating) return;

    const chat = await chatsService.getCurrentChat();
    const personality = await personalityService.getSelected();
    if (!personality || !isRoleplayPersonaAvailable(personality, chat)) return;

    const transcript = buildTranscript(chat, personality.name);
    const signature = buildSuggestionSignature(chat?.id || null, personality.name, transcript);
    if (!force && signature === lastSuggestionSignature) return;

    setStatus("Generating roleplay suggestions…");
    ensuredRoleplayRefreshButton.disabled = true;

    try {
        const settings = settingsService.getSettings();
        const model = settings.roleplaySuggestionModel || settings.model;
        const { systemInstruction, userPrompt } = buildSuggestionPrompts({
            transcript,
            personaName: personality.name,
            personaPrompt: personality.prompt,
        });

        const subscription = await supabaseService.getUserSubscription();
        const tier = supabaseService.getSubscriptionTier(subscription);
        const canUsePremium = (tier === "pro" || tier === "pro_plus" || tier === "max") && shouldPreferPremiumEndpoint();
        const hasLocalKey = isOpenRouterModel(model)
            ? settings.openRouterApiKey.trim().length > 0
            : settings.geminiApiKey.trim().length > 0;

        const raw = canUsePremium && !hasLocalKey
            ? await requestWithPremiumEndpoint(model, systemInstruction, userPrompt)
            : await requestWithLocalModel(model, systemInstruction, userPrompt);

        const options = extractOptionsFromResponse(raw);
        suggestionOptions = options;
        lastSuggestionSignature = signature;
        renderSuggestions();
        setStatus(options.length > 0 ? "Pick one of the generated replies, or queue actions before sending." : "Could not generate fresh suggestions yet.");
    } catch (error: any) {
        suggestionOptions = [];
        renderSuggestions();
        setStatus("Refresh to try generating suggestions again.");
        console.error(error);
        toastService.warn({ title: "Roleplay suggestions unavailable", text: error?.message || String(error) });
    } finally {
        ensuredRoleplayRefreshButton.disabled = false;
    }
}

async function refreshComposerAvailability(): Promise<void> {
    const chat = await chatsService.getCurrentChat();
    const personality = await personalityService.getSelected();
    const available = !!personality && isRoleplayPersonaAvailable(personality, chat);

    ensuredRoleplayButton.classList.toggle("hidden", !available);
    if (!available) {
        composerEnabled = false;
        lastSuggestionSignature = "";
        syncComposerVisibility();
        return;
    }

    if (chat?.id !== lastLoadedChatId) {
        lastLoadedChatId = chat?.id || null;
        lastSuggestionSignature = "";
    }

    if (!composerEnabled) {
        composerEnabled = true;
        syncComposerVisibility();
    }

    await refreshSuggestions();
}

ensuredRoleplayButton.addEventListener("click", async () => {
    composerEnabled = !composerEnabled;
    syncComposerVisibility();
    if (composerEnabled) {
        await refreshComposerAvailability();
    }
});

roleplayTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setActiveTab(button.dataset.roleplayTab as RoleplayTab);
    });
});

ensuredRoleplayClearActionsButton.addEventListener("click", () => {
    selectedActionIds.clear();
    renderActions();
    updateSelectedActionsSummary();
});

ensuredRoleplayRefreshButton.addEventListener("click", async () => {
    await refreshSuggestions(true);
});

ensuredRoleplayAddActionButton.addEventListener("click", () => {
    const text = ensuredRoleplayCustomActionInput.value.trim();
    if (!text) return;
    if (customActions.some((action) => action.text.toLowerCase() === text.toLowerCase())) {
        toastService.warn({ title: "Action already exists", text: "That custom action is already in your list." });
        return;
    }
    customActions.unshift({
        id: `custom-${Date.now()}`,
        label: text.length > 22 ? `${text.slice(0, 22)}…` : text,
        text,
        category: "custom",
        custom: true,
    });
    ensuredRoleplayCustomActionInput.value = "";
    persistCustomActions();
    renderActions();
});

ensuredRoleplaySendCustomButton.addEventListener("click", async () => {
    try {
        await sendRoleplayPayload(buildPayload(ensuredRoleplayCustomPayload.value, { treatAsRaw: true }));
    } catch (error: any) {
        toastService.danger({ title: "Couldn't send custom roleplay", text: error?.message || String(error) });
    }
});

window.addEventListener("roleplay-send-requested", async (event) => {
    if (!composerEnabled || isGenerating) return;
    event.preventDefault();

    try {
        if (activeTab === "custom") {
            await sendRoleplayPayload(buildPayload(ensuredRoleplayCustomPayload.value, { treatAsRaw: true }));
            return;
        }
        await sendRoleplayPayload(buildPayload(""));
    } catch (error: any) {
        toastService.danger({ title: "Couldn't send roleplay action", text: error?.message || String(error) });
    }
});

window.addEventListener("generation-state-changed", async (event: Event) => {
    const detail = (event as CustomEvent<{ isGenerating: boolean }>).detail;
    const wasGenerating = isGenerating;
    isGenerating = !!detail?.isGenerating;

    if (composerEnabled) {
        ensuredRoleplayRefreshButton.disabled = isGenerating;
        ensuredRoleplaySendCustomButton.disabled = isGenerating;
    }

    if (wasGenerating && !isGenerating) {
        lastSuggestionSignature = "";
        await refreshSuggestions(true);
    }
});

onAppEvent("chat-loaded", () => {
    void refreshComposerAvailability();
});

onAppEvent("auth-state-changed", (event) => {
    const tier = supabaseService.getSubscriptionTier(event.detail.subscription ?? null);
    hasPremiumModelAccess = tier === "pro" || tier === "pro_plus" || tier === "max";
    populateRoleplayModelOptions();
});

onAppEvent("subscription-updated", (event) => {
    hasPremiumModelAccess = event.detail.tier === "pro" || event.detail.tier === "pro_plus" || event.detail.tier === "max";
    populateRoleplayModelOptions();
});

document.querySelector<HTMLDivElement>("#personalitiesDiv")?.addEventListener("change", () => {
    void refreshComposerAvailability();
});

ensuredRoleplaySuggestionModelSelect.addEventListener("change", () => {
    lastSuggestionSignature = "";
    void refreshSuggestions(true);
});

loadActionState();
populateRoleplayModelOptions();
renderActions();
renderSuggestions();
updateSelectedActionsSummary();
setActiveTab("dialogue");
syncComposerVisibility();
void refreshComposerAvailability();

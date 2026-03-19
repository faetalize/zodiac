import * as messageService from "../../services/Message.service";
import * as personalityService from "../../services/Personality.service";
import * as chatsService from "../../services/Chats.service";
import { generateRoleplaySuggestions } from "../../services/RoleplaySuggestions.service";
import { info, warn } from "../../services/Toast.service";
import { getChatModelDefinition, formatChatModelLabel } from "../../types/Models";

const roleplayButton = document.querySelector<HTMLButtonElement>("#btn-roleplay");
const roleplayPanel = document.querySelector<HTMLDivElement>("#roleplay-panel");
const dialogueTab = document.querySelector<HTMLButtonElement>("[data-roleplay-tab='dialogue']");
const actionsTab = document.querySelector<HTMLButtonElement>("[data-roleplay-tab='actions']");
const customTab = document.querySelector<HTMLButtonElement>("[data-roleplay-tab='custom']");
const dialoguePanel = document.querySelector<HTMLDivElement>("#roleplay-dialogue-panel");
const actionsPanel = document.querySelector<HTMLDivElement>("#roleplay-actions-panel");
const customPanel = document.querySelector<HTMLDivElement>("#roleplay-custom-panel");
const refreshButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-refresh");
const suggestionStatus = document.querySelector<HTMLParagraphElement>("#roleplay-suggestion-status");
const suggestionGrid = document.querySelector<HTMLDivElement>("#roleplay-suggestion-grid");
const selectedActionsContainer = document.querySelector<HTMLDivElement>("#roleplay-selected-actions");
const customInput = document.querySelector<HTMLTextAreaElement>("#roleplay-custom-input");
const preview = document.querySelector<HTMLParagraphElement>("#roleplay-preview");
const sendButton = document.querySelector<HTMLButtonElement>("#btn-roleplay-send");
const actionCatalog = document.querySelector<HTMLDivElement>("#roleplay-action-catalog");

if (!roleplayButton || !roleplayPanel || !dialogueTab || !actionsTab || !customTab || !dialoguePanel || !actionsPanel || !customPanel || !refreshButton || !suggestionStatus || !suggestionGrid || !selectedActionsContainer || !customInput || !preview || !sendButton || !actionCatalog) {
    throw new Error("Missing DOM elements for roleplay mode.");
}

const ensuredRoleplayButton = roleplayButton;
const ensuredRoleplayPanel = roleplayPanel;
const ensuredDialogueTab = dialogueTab;
const ensuredActionsTab = actionsTab;
const ensuredCustomTab = customTab;
const ensuredDialoguePanel = dialoguePanel;
const ensuredActionsPanel = actionsPanel;
const ensuredCustomPanel = customPanel;
const ensuredRefreshButton = refreshButton;
const ensuredSuggestionStatus = suggestionStatus;
const ensuredSuggestionGrid = suggestionGrid;
const ensuredSelectedActionsContainer = selectedActionsContainer;
const ensuredCustomInput = customInput;
const ensuredPreview = preview;
const ensuredSendButton = sendButton;
const ensuredActionCatalog = actionCatalog;

type RoleplayActionCategory = {
    label: string;
    actions: string[];
};

const ACTION_CATEGORIES: RoleplayActionCategory[] = [
    {
        label: "Body language",
        actions: ["step closer", "hold eye contact", "cross my arms", "tilt my head", "look away", "smile softly"],
    },
    {
        label: "Pacing",
        actions: ["pause for a moment", "change the subject", "ask for details", "stall for time", "test the waters", "end the scene here"],
    },
    {
        label: "Intensity",
        actions: ["tease them", "challenge them", "comfort them", "set a boundary", "admit the truth", "play it cool"],
    },
];

let selectedActions = new Set<string>();
let selectedSuggestionIndex = -1;
let suggestionOptions: string[] = [];
let activeTab: "dialogue" | "actions" | "custom" = "dialogue";
let lastFingerprint = "";
let isRefreshing = false;

function getMessageInput(): HTMLDivElement {
    const input = document.querySelector<HTMLDivElement>("#messageInput");
    if (!input) throw new Error("Missing DOM element: #messageInput");
    return input;
}

function getComposerPayload(): string {
    const actions = Array.from(selectedActions).map((action) => `(${action})`);
    const custom = ensuredCustomInput.value.trim();
    const suggestion = selectedSuggestionIndex >= 0 ? suggestionOptions[selectedSuggestionIndex] : "";
    const dialogue = custom || suggestion;
    return [...actions, dialogue].filter(Boolean).join("\n");
}

function updatePreview(): void {
    const payload = getComposerPayload();
    ensuredPreview.textContent = payload || "Pick one of the dialogue suggestions, combine it with actions, or write a custom turn.";
    ensuredSendButton.disabled = !payload.trim() || messageService.getIsGenerating();
}

function updateSuggestionButtons(): void {
    ensuredSuggestionGrid.replaceChildren();

    if (suggestionOptions.length === 0) {
        const empty = document.createElement("div");
        empty.className = "roleplay-empty-state";
        empty.textContent = "Send a message to get four AI-generated reply options.";
        ensuredSuggestionGrid.appendChild(empty);
        return;
    }

    suggestionOptions.forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "roleplay-suggestion-card";
        if (index === selectedSuggestionIndex) {
            button.classList.add("active");
        }
        button.textContent = option;
        button.addEventListener("click", () => {
            selectedSuggestionIndex = index;
            ensuredCustomInput.value = "";
            updateSuggestionButtons();
            updatePreview();
        });
        ensuredSuggestionGrid.appendChild(button);
    });
}

function updateSelectedActions(): void {
    ensuredSelectedActionsContainer.replaceChildren();

    if (selectedActions.size === 0) {
        const empty = document.createElement("span");
        empty.className = "roleplay-selected-actions-empty";
        empty.textContent = "No actions selected";
        ensuredSelectedActionsContainer.appendChild(empty);
        updatePreview();
        return;
    }

    Array.from(selectedActions).forEach((action) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "roleplay-selected-action";
        chip.textContent = action;
        chip.addEventListener("click", () => {
            selectedActions.delete(action);
            renderActionCatalog();
            updateSelectedActions();
        });
        ensuredSelectedActionsContainer.appendChild(chip);
    });

    updatePreview();
}

function renderActionCatalog(): void {
    ensuredActionCatalog.replaceChildren();

    ACTION_CATEGORIES.forEach((category) => {
        const wrapper = document.createElement("section");
        wrapper.className = "roleplay-action-group";

        const title = document.createElement("h5");
        title.textContent = category.label;
        wrapper.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "roleplay-action-grid";

        category.actions.forEach((action) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "roleplay-action-chip";
            if (selectedActions.has(action)) {
                button.classList.add("active");
            }
            button.textContent = action;
            button.addEventListener("click", () => {
                if (selectedActions.has(action)) {
                    selectedActions.delete(action);
                } else {
                    selectedActions.add(action);
                }
                renderActionCatalog();
                updateSelectedActions();
            });
            grid.appendChild(button);
        });

        wrapper.appendChild(grid);
        ensuredActionCatalog.appendChild(wrapper);
    });
}

function setActiveTab(tab: "dialogue" | "actions" | "custom"): void {
    activeTab = tab;
    ensuredDialogueTab.classList.toggle("active", tab === "dialogue");
    ensuredActionsTab.classList.toggle("active", tab === "actions");
    ensuredCustomTab.classList.toggle("active", tab === "custom");

    ensuredDialoguePanel.classList.toggle("hidden", tab !== "dialogue");
    ensuredActionsPanel.classList.toggle("hidden", tab !== "actions");
    ensuredCustomPanel.classList.toggle("hidden", tab !== "custom");
}

function openPanel(): void {
    ensuredRoleplayPanel.classList.remove("hidden");
    ensuredRoleplayButton.classList.add("btn-toggled");
    void refreshSuggestionsIfNeeded(false);
}

function closePanel(): void {
    ensuredRoleplayPanel.classList.add("hidden");
    ensuredRoleplayButton.classList.remove("btn-toggled");
}

function resetComposerState(): void {
    selectedActions = new Set<string>();
    selectedSuggestionIndex = -1;
    ensuredCustomInput.value = "";
    renderActionCatalog();
    updateSelectedActions();
    updateSuggestionButtons();
    updatePreview();
}

async function computeFingerprint(): Promise<string> {
    const chat = await chatsService.getCurrentChat();
    if (!chat) return "";

    const lastVisible = [...(chat.content || [])].reverse().find((message) => !message.hidden);
    const lastPartText = String(lastVisible?.parts?.map((part) => part.text || "").join("\n") || "").slice(-160);
    return `${chat.id}:${chat.content.length}:${lastVisible?.role || "none"}:${lastPartText}`;
}

async function refreshSuggestionsIfNeeded(force: boolean): Promise<void> {
    const personality = await personalityService.getSelected();
    const chat = await chatsService.getCurrentChat();
    if (!personality?.roleplayEnabled || !chat?.id) {
        suggestionOptions = [];
        selectedSuggestionIndex = -1;
        ensuredSuggestionStatus.textContent = "Roleplay suggestions are available for roleplay-enabled personas in one-on-one chats.";
        updateSuggestionButtons();
        updatePreview();
        return;
    }

    const nextFingerprint = await computeFingerprint();
    if (!force && nextFingerprint === lastFingerprint && suggestionOptions.length > 0) {
        return;
    }

    if (isRefreshing || messageService.getIsGenerating()) {
        return;
    }

    isRefreshing = true;
    ensuredRefreshButton.disabled = true;
    ensuredSuggestionStatus.textContent = "Generating reply options…";

    try {
        const result = await generateRoleplaySuggestions();
        suggestionOptions = result.options;
        selectedSuggestionIndex = suggestionOptions.length > 0 ? 0 : -1;
        lastFingerprint = nextFingerprint;

        const modelLabel = result.model ? formatChatModelLabel(getChatModelDefinition(result.model) || { label: result.model, mega: false }) : "";
        ensuredSuggestionStatus.textContent = suggestionOptions.length > 0
            ? `Generated ${suggestionOptions.length} options${modelLabel ? ` with ${modelLabel}` : ""}.`
            : "No suggestions yet. Send a message in the chat first.";
        updateSuggestionButtons();
        updatePreview();
    } catch (error: any) {
        suggestionOptions = [];
        selectedSuggestionIndex = -1;
        ensuredSuggestionStatus.textContent = error?.message || "Could not generate roleplay suggestions.";
        updateSuggestionButtons();
        updatePreview();
    } finally {
        isRefreshing = false;
        ensuredRefreshButton.disabled = false;
    }
}

async function syncAvailability(): Promise<void> {
    const personality = await personalityService.getSelected();
    const chat = await chatsService.getCurrentChat();
    const isSingleChat = !!chat && !chat.groupChat;
    const enabled = !!personality?.roleplayEnabled && isSingleChat;

    ensuredRoleplayButton.classList.toggle("hidden", !enabled);
    if (!enabled) {
        closePanel();
        resetComposerState();
        ensuredSuggestionStatus.textContent = "Roleplay mode is available on roleplay-enabled personas.";
        return;
    }

    if (!ensuredRoleplayPanel.classList.contains("hidden")) {
        void refreshSuggestionsIfNeeded(false);
    }
}

ensuredRoleplayButton.addEventListener("click", () => {
    if (ensuredRoleplayPanel.classList.contains("hidden")) {
        openPanel();
    } else {
        closePanel();
    }
});

ensuredDialogueTab.addEventListener("click", () => setActiveTab("dialogue"));
ensuredActionsTab.addEventListener("click", () => setActiveTab("actions"));
ensuredCustomTab.addEventListener("click", () => {
    setActiveTab("custom");
    ensuredCustomInput.focus();
});
ensuredRefreshButton.addEventListener("click", () => {
    void refreshSuggestionsIfNeeded(true);
});
ensuredCustomInput.addEventListener("input", () => {
    if (ensuredCustomInput.value.trim()) {
        selectedSuggestionIndex = -1;
        updateSuggestionButtons();
    }
    updatePreview();
});

ensuredSendButton.addEventListener("click", async () => {
    const payload = getComposerPayload().trim();
    if (!payload) {
        warn({ title: "Nothing to send", text: "Pick a dialogue option, add an action, or type a custom turn first." });
        return;
    }

    const input = getMessageInput();
    input.textContent = payload;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const sent = await messageService.send(payload);
    if (!sent) return;

    info({ title: "Roleplay turn sent", text: "Your selected actions and dialogue were sent to the chat." });
    resetComposerState();
    void refreshSuggestionsIfNeeded(true);
});

window.addEventListener("chat-loaded", () => {
    lastFingerprint = "";
    void syncAvailability();
});
window.addEventListener("generation-state-changed", (event: Event) => {
    const detail = (event as CustomEvent<{ isGenerating?: boolean }>).detail;
    updatePreview();
    if (!detail?.isGenerating) {
        void refreshSuggestionsIfNeeded(false);
    }
});
document.querySelector<HTMLDivElement>("#personalitiesDiv")?.addEventListener("change", () => {
    lastFingerprint = "";
    void syncAvailability();
});

setActiveTab(activeTab);
renderActionCatalog();
resetComposerState();
void syncAvailability();

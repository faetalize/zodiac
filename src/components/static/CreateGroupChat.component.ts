import * as overlayService from "../../services/Overlay.service";
import * as personalityService from "../../services/Personality.service";
import * as groupChatService from "../../services/GroupChat.service";
import * as stepperService from "../../services/Stepper.service";
import * as settingsService from "../../services/Settings.service";
import { warn, danger } from "../../services/Toast.service";
import { defaultGuardFromIndependence, normalizeGuardMap } from "../../utils/dynamicGroupChatGuards";

function must<T>(value: T | null, label: string): T {
    if (!value) {
        console.error(`Group chat creation UI element missing in DOM: ${label}`);
        throw new Error("Group chat creation initialization failed");
    }
    return value;
}

const openButton = must(document.querySelector<HTMLButtonElement>("#btn-new-group-chat"), "#btn-new-group-chat");
const form = must(document.querySelector<HTMLFormElement>("#form-create-group-chat"), "#form-create-group-chat");
const searchInput = must(document.querySelector<HTMLInputElement>("#group-chat-persona-search"), "#group-chat-persona-search");
const listContainer = must(document.querySelector<HTMLDivElement>("#group-chat-persona-list"), "#group-chat-persona-list");
const selectedCount = must(document.querySelector<HTMLDivElement>("#group-chat-selected-count"), "#group-chat-selected-count");
const turnOrderContainer = must(document.querySelector<HTMLDivElement>("#group-chat-turn-order"), "#group-chat-turn-order");
const scenarioInput = must(document.querySelector<HTMLTextAreaElement>("#group-chat-scenario"), "#group-chat-scenario");
const narratorToggle = must(document.querySelector<HTMLInputElement>("#group-chat-narrator"), "#group-chat-narrator");
const modeStep = must(document.querySelector<HTMLDivElement>("#group-chat-step-mode"), "#group-chat-step-mode");
const modeInputs = form.querySelectorAll<HTMLInputElement>("input[name='group-chat-mode']");

const dynamicSettingsSection = must(document.querySelector<HTMLDivElement>("#group-chat-dynamic-settings"), "#group-chat-dynamic-settings");
const rpgSettingsSection = must(document.querySelector<HTMLDivElement>("#group-chat-rpg-settings"), "#group-chat-rpg-settings");
const allowPingsToggle = must(document.querySelector<HTMLInputElement>("#group-chat-allow-pings"), "#group-chat-allow-pings");
const guardList = must(document.querySelector<HTMLDivElement>("#group-chat-guard-list"), "#group-chat-guard-list");
const guardApplyAll = must(document.querySelector<HTMLInputElement>("#group-chat-guard-apply-all"), "#group-chat-guard-apply-all");
const guardApplyAllValue = must(document.querySelector<HTMLSpanElement>("#group-chat-guard-apply-all-value"), "#group-chat-guard-apply-all-value");
const guardApplyAllBtn = must(document.querySelector<HTMLButtonElement>("#group-chat-guard-apply-all-btn"), "#group-chat-guard-apply-all-btn");

const stepper = stepperService.get("stepper-create-group-chat");
if (!stepper) {
    console.error("Group chat stepper not found");
    throw new Error("Group chat stepper initialization failed");
}

type PersonaListItem = {
    id: string;
    name: string;
    image: string;
    independence: number;
};

let allPersonas: PersonaListItem[] = [];
let selectedIds: string[] = [];
let turnOrder: string[] = [];
let editingChatId: number | null = null;
let editingMode: "dynamic" | "rpg" | null = null;
let maxMessageGuardById: Record<string, number> = {};

function updateLabels(): void {
    const title = form.querySelector("h1");
    const submitBtn = form.querySelector<HTMLButtonElement>(".btn-stepper-submit");
    if (title) {
        title.textContent = editingChatId ? "Edit Group Chat" : "Create Group Chat";
    }
    if (submitBtn) {
        submitBtn.textContent = editingChatId ? "Update" : "Create";
    }
}

function getSelectedMode(): "dynamic" | "rpg" {
    const modeInput = form.querySelector<HTMLInputElement>("input[name='group-chat-mode']:checked");
    const mode = (modeInput?.value || "rpg") as "dynamic" | "rpg";
    return mode === "dynamic" ? "dynamic" : "rpg";
}

function updateModeSettingsVisibility(): void {
    const mode = getSelectedMode();
    const isDynamic = mode === "dynamic";
    dynamicSettingsSection.classList.toggle("hidden", !isDynamic);
    rpgSettingsSection.classList.toggle("hidden", isDynamic);

    if (isDynamic) {
        renderGuardSliders();
        const settings = settingsService.getSettings();
        if (settings.disallowPersonaPinging) {
            allowPingsToggle.checked = false;
            allowPingsToggle.disabled = true;
            allowPingsToggle.title = "This setting is globally disabled in app settings.";
        } else {
            allowPingsToggle.disabled = false;
            allowPingsToggle.title = "";
        }
    }
}

function setModeStepState(isEditing: boolean): void {
    if (isEditing) {
        modeStep.setAttribute("data-stepper-skip", "true");
        modeStep.classList.add("hidden");
    } else {
        modeStep.removeAttribute("data-stepper-skip");
        modeStep.classList.remove("hidden");
    }
    modeInputs.forEach((input) => {
        input.disabled = isEditing;
    });
}

function setSelected(ids: string[]): void {
    selectedIds = Array.from(new Set(ids)).slice(0, 5);
    
    // Ensure "user" is always in the turn order if not present
    const nextOrder: string[] = [];
    
    // Keep existing order for selected personas and user
    for (const id of turnOrder) {
        if (selectedIds.includes(id) || id === "user") {
            nextOrder.push(id);
        }
    }
    
    // Add newly selected personas
    for (const id of selectedIds) {
        if (!nextOrder.includes(id)) {
            nextOrder.push(id);
        }
    }
    
    // If "user" is missing (e.g. new chat), add it at the end by default
    if (!nextOrder.includes("user")) {
        nextOrder.push("user");
    }

    turnOrder = nextOrder;

    // ensure guard map aligns with current selection
    const defaultsById: Record<string, number> = {};
    for (const id of selectedIds) {
        const persona = allPersonas.find(p => p.id === id);
        defaultsById[id] = persona ? defaultGuardFromIndependence(persona.independence) : 5;
    }

    maxMessageGuardById = normalizeGuardMap({
        participantIds: selectedIds,
        existing: maxMessageGuardById,
        defaultForId: (id) => defaultsById[id] ?? 5,
    });

    renderGuardSliders();
}

function updateSelectedCount(): void {
    selectedCount.textContent = `${selectedIds.length}/5 selected`;
}

function applySelectionLimits(): void {
    const atLimit = selectedIds.length >= 5;
    listContainer.querySelectorAll<HTMLInputElement>("input[type='checkbox'][data-persona-id]").forEach((input) => {
        const id = input.dataset.personaId || "";
        if (!id) return;
        input.disabled = atLimit && !selectedIds.includes(id);
    });
}

let draggedIndex: number | null = null;

function renderTurnOrder(): void {
    turnOrderContainer.innerHTML = "";

    for (let index = 0; index < turnOrder.length; index++) {
        const id = turnOrder[index];
        let nameText = "";
        
        if (id === "user") {
            nameText = "You";
        } else {
            const persona = allPersonas.find(p => p.id === id);
            if (!persona) continue;
            nameText = persona.name;
        }

        const row = document.createElement("div");
        row.className = "group-chat-turn-order-item";
        row.draggable = true;
        row.dataset.index = index.toString();

        const handle = document.createElement("span");
        handle.className = "material-symbols-outlined group-chat-turn-order-handle";
        handle.textContent = "drag_indicator";

        const name = document.createElement("div");
        name.className = "group-chat-persona-name";
        name.textContent = nameText;

        const actions = document.createElement("div");
        actions.className = "group-chat-turn-order-actions";

        const up = document.createElement("button");
        up.type = "button";
        up.className = "btn-textual material-symbols-outlined";
        up.textContent = "arrow_upward";
        up.disabled = index === 0;
        up.addEventListener("click", () => {
            if (index <= 0) return;
            const next = [...turnOrder];
            const tmp = next[index - 1];
            next[index - 1] = next[index];
            next[index] = tmp;
            turnOrder = next;
            renderTurnOrder();
        });

        const down = document.createElement("button");
        down.type = "button";
        down.className = "btn-textual material-symbols-outlined";
        down.textContent = "arrow_downward";
        down.disabled = index === turnOrder.length - 1;
        down.addEventListener("click", () => {
            if (index >= turnOrder.length - 1) return;
            const next = [...turnOrder];
            const tmp = next[index + 1];
            next[index + 1] = next[index];
            next[index] = tmp;
            turnOrder = next;
            renderTurnOrder();
        });

        // Drag and Drop Events
        row.addEventListener("dragstart", (e) => {
            draggedIndex = index;
            row.classList.add("dragging");
            turnOrderContainer.classList.add("is-dragging");
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                // Set a ghost image or just data
                e.dataTransfer.setData("text/plain", index.toString());
            }
        });

        row.addEventListener("dragend", () => {
            row.classList.remove("dragging");
            turnOrderContainer.classList.remove("is-dragging");
            draggedIndex = null;
            // Remove all drag-over classes just in case
            turnOrderContainer.querySelectorAll(".group-chat-turn-order-item").forEach(el => el.classList.remove("drag-over"));
        });

        row.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (draggedIndex === null || draggedIndex === index) return;
            row.classList.add("drag-over");
        });

        row.addEventListener("dragleave", () => {
            row.classList.remove("drag-over");
        });

        row.addEventListener("drop", (e) => {
            e.preventDefault();
            row.classList.remove("drag-over");
            if (draggedIndex === null || draggedIndex === index) return;
            
            const next = [...turnOrder];
            const item = next.splice(draggedIndex, 1)[0];
            next.splice(index, 0, item);
            turnOrder = next;
            renderTurnOrder();
        });

        // Mobile Touch Support
        let touchStartY = 0;
        row.addEventListener("touchstart", (e) => {
            // Only trigger if touching the handle
            if (!(e.target as HTMLElement).classList.contains("group-chat-turn-order-handle")) return;
            
            touchStartY = e.touches[0].clientY;
            draggedIndex = index;
            row.classList.add("dragging");
            turnOrderContainer.classList.add("is-dragging");
        }, { passive: true });

        row.addEventListener("touchmove", (e) => {
            if (draggedIndex === null) return;
            e.preventDefault(); // Prevent scrolling while dragging

            const touchY = e.touches[0].clientY;
            const target = document.elementFromPoint(e.touches[0].clientX, touchY);
            const targetRow = target?.closest(".group-chat-turn-order-item") as HTMLElement;
            
            if (targetRow && targetRow !== row) {
                const targetIndex = parseInt(targetRow.dataset.index || "-1");
                if (targetIndex !== -1 && targetIndex !== draggedIndex) {
                    // Swap items in turnOrder
                    const next = [...turnOrder];
                    const item = next.splice(draggedIndex, 1)[0];
                    next.splice(targetIndex, 0, item);
                    turnOrder = next;
                    draggedIndex = targetIndex;
                    renderTurnOrder();
                    
                    // Re-add dragging class to the new row at the new index
                    const newRow = turnOrderContainer.querySelector(`[data-index="${targetIndex}"]`);
                    newRow?.classList.add("dragging");
                    turnOrderContainer.classList.add("is-dragging");
                }
            }
        }, { passive: false });

        row.addEventListener("touchend", () => {
            row.classList.remove("dragging");
            turnOrderContainer.classList.remove("is-dragging");
            draggedIndex = null;
        });

        actions.append(up, down);
        row.append(handle, name, actions);
        turnOrderContainer.appendChild(row);
    }
}

function filterPersonaList(query: string): void {
    const q = query.trim().toLowerCase();
    listContainer.querySelectorAll<HTMLElement>(".group-chat-persona-item").forEach((row) => {
        const name = row.dataset.personaName || "";
        row.style.display = q === "" || name.includes(q) ? "" : "none";
    });
}

function renderPersonaList(): void {
    listContainer.innerHTML = "";

    for (const persona of allPersonas) {
        const row = document.createElement("label");
        row.className = "group-chat-persona-item";
        row.dataset.personaName = persona.name.toLowerCase();

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.personaId = persona.id;
        checkbox.checked = selectedIds.includes(persona.id);

        checkbox.addEventListener("change", () => {
            const wasChecked = selectedIds.includes(persona.id);
            if (checkbox.checked && !wasChecked) {
                if (selectedIds.length >= 5) {
                    checkbox.checked = false;
                    warn({ title: "Limit reached", text: "Group chats support up to 5 participants." });
                    return;
                }
                setSelected([...selectedIds, persona.id]);
            } else if (!checkbox.checked && wasChecked) {
                setSelected(selectedIds.filter(id => id !== persona.id));
            }

            updateSelectedCount();
            applySelectionLimits();
            renderTurnOrder();
            if (getSelectedMode() === "dynamic") {
                renderGuardSliders();
            }
        });

        const img = document.createElement("img");
        img.className = "group-chat-persona-avatar";
        img.src = persona.image;
        img.loading = "lazy";

        const name = document.createElement("div");
        name.className = "group-chat-persona-name";
        name.textContent = persona.name;

        // Layout: avatar - name (grows/truncates) - checkbox (toggle at right)
        row.append(img, name, checkbox);
        checkbox.className = "group-chat-persona-checkbox";
        listContainer.appendChild(row);
    }

    updateSelectedCount();
    applySelectionLimits();
    renderTurnOrder();
    filterPersonaList(searchInput.value);
}

function renderGuardSliders(): void {
    guardList.innerHTML = "";

    for (const id of selectedIds) {
        const persona = allPersonas.find(p => p.id === id);
        if (!persona) continue;

        const row = document.createElement("div");
        row.className = "group-chat-guard-row";

        const label = document.createElement("div");
        label.className = "group-chat-persona-name";
        label.textContent = persona.name;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "1";
        slider.max = "10";
        slider.value = String(maxMessageGuardById[id] ?? defaultGuardFromIndependence(persona.independence));
        slider.addEventListener("input", () => {
            maxMessageGuardById[id] = Number(slider.value);
            value.textContent = slider.value;
        });

        const value = document.createElement("span");
        value.className = "group-chat-guard-value";
        value.textContent = slider.value;

        row.append(label, slider, value);
        guardList.appendChild(row);
    }
}

async function loadPersonas(): Promise<void> {
    const local = await personalityService.getAll();
    const defaultPersona = personalityService.getDefault();

    const items: PersonaListItem[] = [
        { id: "-1", name: defaultPersona.name, image: defaultPersona.image, independence: Number((defaultPersona as any)?.independence ?? 0) },
        ...local.map(p => ({ id: p.id, name: p.name, image: p.image, independence: Number((p as any)?.independence ?? 0) }))
    ];

    // De-dupe by id
    const byId = new Map<string, PersonaListItem>();
    for (const item of items) {
        if (!byId.has(item.id)) {
            byId.set(item.id, item);
        }
    }

    allPersonas = Array.from(byId.values());
}

openButton.addEventListener("click", async () => {
    await loadPersonas();

    overlayService.show("form-create-group-chat");

    // Reset local state
    editingChatId = null;
    editingMode = null;
    selectedIds = [];
    turnOrder = [];
    searchInput.value = "";
    scenarioInput.value = "";
    narratorToggle.checked = false;
    allowPingsToggle.checked = false;
    maxMessageGuardById = {};
    guardApplyAll.value = "5";
    guardApplyAllValue.textContent = "5";

    const rpgMode = form.querySelector<HTMLInputElement>("input[name='group-chat-mode'][value='rpg']");
    if (rpgMode) rpgMode.checked = true;
    setModeStepState(false);
    updateModeSettingsVisibility();

    updateLabels();
    renderPersonaList();
    renderGuardSliders();

    // Ensure stepper resets to first step
    stepper.step = 0;
    stepperService.update(stepper);
});

window.addEventListener("open-group-chat-editor", async (e: any) => {
    const chatId = e.detail.chatId;
    const chat = await groupChatService.db.chats.get(chatId);
    if (!chat || !chat.groupChat) return;

    await loadPersonas();

    // Show overlay FIRST to avoid resetOverlayItems clearing our values
    overlayService.show("form-create-group-chat");

    editingChatId = chatId;
    setModeStepState(true);

    // Set mode selection
    const mode = (chat.groupChat.mode || "rpg") as "dynamic" | "rpg";
    editingMode = mode;
    const modeRadio = form.querySelector<HTMLInputElement>(`input[name='group-chat-mode'][value='${mode}']`);
    if (modeRadio) modeRadio.checked = true;
    updateModeSettingsVisibility();
    // Ensure IDs are strings and exist in current persona list
    selectedIds = chat.groupChat.participantIds
        .map(id => String(id))
        .filter(id => allPersonas.some(p => p.id === id));
    
    const savedOrder = (chat.groupChat.rpg?.turnOrder || chat.groupChat.participantIds).map(id => String(id));
    turnOrder = savedOrder.filter(id => id === "user" || allPersonas.some(p => p.id === id));

    // Ensure "user" is in the turn order even if it wasn't saved before
    if (!turnOrder.includes("user")) {
        turnOrder.push("user");
    }

    scenarioInput.value = mode === "rpg" ? (chat.groupChat.rpg?.scenarioPrompt || "") : "";
    narratorToggle.checked = mode === "rpg" ? !!chat.groupChat.rpg?.narratorEnabled : false;
    allowPingsToggle.checked = !!chat.groupChat.dynamic?.allowPings;

    const legacyGuard = chat.groupChat.dynamic?.maxMessageGuard;
    const existingMap = chat.groupChat.dynamic?.maxMessageGuardById;
    const defaultsById: Record<string, number> = {};
    for (const id of selectedIds) {
        const persona = allPersonas.find(p => p.id === id);
        defaultsById[id] = persona ? defaultGuardFromIndependence(persona.independence) : 5;
    }

    maxMessageGuardById = normalizeGuardMap({
        participantIds: selectedIds,
        existing: existingMap,
        legacyFallback: legacyGuard,
        defaultForId: (id) => defaultsById[id] ?? 5,
    });

    guardApplyAll.value = String(legacyGuard ?? 5);
    guardApplyAllValue.textContent = guardApplyAll.value;
    renderGuardSliders();
    searchInput.value = "";

    updateLabels();
    renderPersonaList();

    stepper.step = 0;
    stepperService.update(stepper);
});

searchInput.addEventListener("input", () => {
    filterPersonaList(searchInput.value);
});

form.querySelectorAll<HTMLInputElement>("input[name='group-chat-mode']").forEach((input) => {
    input.addEventListener("change", () => {
        updateModeSettingsVisibility();
    });
});

guardApplyAll.addEventListener("input", () => {
    guardApplyAllValue.textContent = guardApplyAll.value;
});

guardApplyAllBtn.addEventListener("click", () => {
    const value = Number(guardApplyAll.value || "5") || 5;
    for (const id of selectedIds) {
        maxMessageGuardById[id] = value;
    }
    renderGuardSliders();
});

// Step validation (undo step move if invalid)
const nextButton = form.querySelector<HTMLButtonElement>(".btn-stepper-next");
if (nextButton) {
    // Capture-phase guard: prevent Stepper.component from advancing if invalid
    nextButton.addEventListener("click", (e) => {
        if (stepper.step === 0 && selectedIds.length < 2) {
            e.stopImmediatePropagation();
            warn({ title: "Select participants", text: "Pick at least 2 participants to create a group chat." });
        }
    }, { capture: true });

    // After advancing, refresh any derived UI for the new step
    nextButton.addEventListener("click", () => {
        if (stepper.step === 2 && getSelectedMode() === "rpg") {
            renderTurnOrder();
        }
    });
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (selectedIds.length < 2) {
        warn({ title: "Select participants", text: "Pick at least 2 participants to create a group chat." });
        stepper.step = 0;
        stepperService.update(stepper);
        return;
    }

    const mode = editingChatId && editingMode ? editingMode : getSelectedMode();

    if (mode === "dynamic") {
        const defaultsById: Record<string, number> = {};
        for (const id of selectedIds) {
            const persona = allPersonas.find(p => p.id === id);
            defaultsById[id] = persona ? defaultGuardFromIndependence(persona.independence) : 5;
        }
        maxMessageGuardById = normalizeGuardMap({
            participantIds: selectedIds,
            existing: maxMessageGuardById,
            defaultForId: (id) => defaultsById[id] ?? 5,
        });
    }

    if (editingChatId) {
        const success = mode === "rpg"
            ? await groupChatService.updateRpgGroupChat(editingChatId, {
                participantIds: selectedIds,
                turnOrder,
                scenarioPrompt: scenarioInput.value,
                narratorEnabled: narratorToggle.checked,
            })
            : await groupChatService.updateDynamicGroupChat(editingChatId, {
                participantIds: selectedIds,
                maxMessageGuardById,
                allowPings: allowPingsToggle.checked,
            });

        if (!success) {
            danger({ title: "Failed to update", text: "Unable to update group chat settings." });
            return;
        }
    } else {
        const id = mode === "rpg"
            ? await groupChatService.createRpgGroupChat({
                participantIds: selectedIds,
                turnOrder,
                scenarioPrompt: scenarioInput.value,
                narratorEnabled: narratorToggle.checked,
            })
            : await groupChatService.createDynamicGroupChat({
                participantIds: selectedIds,
                maxMessageGuardById,
                allowPings: allowPingsToggle.checked,
            });

        if (!id) {
            danger({ title: "Failed to create", text: "Unable to create group chat." });
            return;
        }
    }

    overlayService.closeOverlay();
});

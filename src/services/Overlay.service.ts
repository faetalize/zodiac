import { DbPersonality, Personality } from '../types/Personality';
import type { MessageDebugInfo } from '../types/Message';
import { showElement, hideElement } from '../utils/helpers';
import * as stepperService from './Stepper.service';
import * as toastService from './Toast.service';
import { dispatchElementEvent, createEmptyEvent, createEvent } from '../events';

const overlay = document.querySelector<HTMLElement>(".overlay")!;
const overlayItems = overlay.querySelector<HTMLElement>(".overlay-content")!.children;
const personalityForm = document.querySelector<HTMLElement>("#form-add-personality")!;

function formatMessageDebugInfo(debugInfo?: MessageDebugInfo): string {
    if (!debugInfo) {
        return JSON.stringify({
            status: "unavailable",
            note: "This message does not have stored request debug info.",
        }, null, 2);
    }

    return JSON.stringify({
        mode: debugInfo.mode,
        premiumEndpointEnabled: debugInfo.premiumEndpointEnabled,
        requestSlug: debugInfo.requestSlug || null,
        chatSettings: debugInfo.chatSettings,
        modeSettings: debugInfo.modeSettings || null,
    }, null, 2);
}

function setCopyButtonState(button: HTMLButtonElement, copied: boolean): void {
    button.disabled = copied;
    button.textContent = copied ? "Copied" : "Copy debug info";
}

export function showEditChatTitleForm() {
    const editChatTitleForm = document.querySelector<HTMLElement>("#form-edit-chat-title");
    if (!editChatTitleForm) {
        console.error("Edit chat title form not found");
        throw new Error("Edit chat title form not found");
    }
    showElement(overlay, false);
    showElement(editChatTitleForm, false);
}

export function showAddPersonalityForm() {
    showElement(overlay, false);
    personalityForm.dispatchEvent(createEmptyEvent('toneExamples:reset'));
    personalityForm.dispatchEvent(createEmptyEvent('tags:reset'));
    showElement(personalityForm, false);
}

export function showEditPersonalityForm(personality: Personality, id?: string) {
    //populate the form with the personality data
    for (const key in personality) {

        if (key === 'toneExamples') {
            dispatchElementEvent(personalityForm, 'toneExamples:set', {
                toneExamples: personality.toneExamples ?? []
            });
            continue;
        }
        if (key === 'tags') {
            //dispatch event to populate chip input
            dispatchElementEvent(personalityForm, 'tags:set', {
                tags: personality.tags ?? []
            });
            continue;
        }
        //handle select elements (like category)
        const select = personalityForm.querySelector<HTMLSelectElement>(`select[name="${key}"]`);
        if (select) {
            select.value = String(personality[key as keyof Personality] ?? '');
            continue;
        }
        const input = personalityForm.querySelector<HTMLInputElement>(`[name="${key}"]`);
        if (!input) {
            continue;
        }
        input.value = (personality[key as keyof Personality] ?? '').toString();
        if (input.type === 'checkbox') {
            input.checked = Boolean(personality[key as keyof Personality]);
        }
    }
    // set hidden id field so submit can determine edit vs add
    const idInput = personalityForm.querySelector<HTMLInputElement>('input[name="id"]');
    if (idInput) {
        idInput.value = id !== undefined ? String(id) : '';
    }
    showElement(overlay, false);
    showElement(personalityForm, false);
}

export function showChangelog() {
    const whatsNew = document.querySelector<HTMLElement>("#whats-new")!;
    showElement(overlay, false);
    showElement(whatsNew, false);
}

export function showMessageDebugModal(debugInfo?: MessageDebugInfo) {
    const modal = document.querySelector<HTMLElement>("#modal-message-debug");
    const modeValue = document.querySelector<HTMLElement>("#message-debug-mode-value");
    const premiumValue = document.querySelector<HTMLElement>("#message-debug-premium-value");
    const slugValue = document.querySelector<HTMLElement>("#message-debug-slug-value");
    const payloadValue = document.querySelector<HTMLElement>("#message-debug-payload");
    const copyButton = document.querySelector<HTMLButtonElement>("#btn-copy-message-debug");

    if (!modal || !modeValue || !premiumValue || !slugValue || !payloadValue || !copyButton) {
        console.warn("Message debug modal elements are missing in the DOM");
        return;
    }

    const formatted = formatMessageDebugInfo(debugInfo);
    modeValue.textContent = debugInfo?.mode ?? "Unavailable";
    premiumValue.textContent = debugInfo ? (debugInfo.premiumEndpointEnabled ? "Enabled" : "Disabled") : "Unavailable";
    slugValue.textContent = debugInfo?.requestSlug || (debugInfo?.premiumEndpointEnabled ? "Pending or unavailable" : "Not used");
    payloadValue.textContent = formatted;
    setCopyButtonState(copyButton, false);
    copyButton.onclick = async () => {
        try {
            await navigator.clipboard.writeText(formatted);
            setCopyButtonState(copyButton, true);
            window.setTimeout(() => setCopyButtonState(copyButton, false), 1200);
        } catch (error) {
            console.error("Failed to copy message debug info", error);
            toastService.danger({
                title: "Copy failed",
                text: "Unable to copy the request debug info to your clipboard.",
            });
        }
    };

    show("modal-message-debug");
}

export function resetOverlayItems() {
    for (const item of overlayItems) {
        hideElement(item as HTMLElement, true);
        //reset the form and stepper
        if (item instanceof HTMLFormElement) {
            item.reset();
            if (item.id === 'form-add-personality') {
                item.dispatchEvent(createEmptyEvent('toneExamples:reset'));
            } else {
                item.querySelectorAll('.tone-example').forEach((element, index) => {
                    if (index !== 0) {
                        element.remove();
                    }
                });
            }
            const stepper = stepperService.get(item.firstElementChild!.id);
            if (stepper) {
                stepper.step = 0;
                stepperService.update(stepper);
            }
        }
    }
}

export function closeOverlay() {
    hideElement(overlay);
    resetOverlayItems();
}

export function show(elementId: string) {
    resetOverlayItems();
    const element = document.querySelector<HTMLElement>(`#${elementId}`);
    if (!element) {
        console.error(`Element with id ${elementId} not found`);
        return;
    }
    showElement(overlay, false);
    showElement(element, false);
}

/**
 * Show the sync update modal for an outdated marketplace persona.
 * Gives user options to update or duplicate before updating.
 */
export function showSyncUpdateModal(personality: DbPersonality, localId: string, remoteVersion: number) {
    const syncModal = document.querySelector<HTMLElement>("#modal-sync-update");
    if (!syncModal) {
        console.warn("Sync update modal not found in DOM");
        return;
    }
    
    //store data on modal for button handlers
    syncModal.dataset.localId = localId;
    syncModal.dataset.remoteId = personality.syncedFrom!;
    syncModal.dataset.remoteVersion = String(remoteVersion);
    
    //populate persona name
    const nameSpan = syncModal.querySelector<HTMLElement>("#sync-modal-persona-name");
    if (nameSpan) nameSpan.textContent = personality.name;
    
    showElement(overlay, false);
    showElement(syncModal, false);
}

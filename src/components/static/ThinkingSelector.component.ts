import { ChatModel } from "../../types/Models";
import { createChatModelChangedEvent, modelSelect } from "./ModelSelector.component";
import { createEvent, dispatchDocumentEvent, onDocumentEvent } from "../../events";

const thinkingSelector = document.querySelector<HTMLSelectElement>("#enableThinkingSelect");
const thinkingHint = document.querySelector<HTMLDivElement>("#thinking-required-hint");
if (!thinkingSelector || !thinkingHint) {
    console.error("Thinking selector component initialization failed");
    throw new Error("Missing DOM element: #enableThinkingSelect or #thinking-required-hint");
}

//notifies when thinking is toggled on or off
export const createThinkingToggledEvent = () => createEvent('thinking-toggled', {
    enabled: thinkingSelector.value === 'enabled'
}, { bubbles: true });

thinkingSelector.addEventListener("change", () => {
    dispatchDocumentEvent('thinking-toggled', { enabled: thinkingSelector.value === 'enabled' });
});

// if pro model is selected, force thinking to be enabled and disable selector
onDocumentEvent('chat-model-changed', (event) => {
    const { model } = event.detail;

    if (!model) return;

    if (model === ChatModel.PRO || model === ChatModel.PRO_LEGACY) {
        thinkingSelector.value = 'enabled';
        thinkingHint.style.display = '';
        thinkingSelector.dispatchEvent(new Event('change'));
        thinkingSelector.disabled = true; //prevent changes
    }
    else if (model === ChatModel.NANO_BANANA) {
        thinkingSelector.value = 'disabled';
        thinkingHint.style.display = '';
        thinkingHint.textContent = "Thinking is not available for the selected model.";
        thinkingSelector.dispatchEvent(new Event('change'));
        thinkingSelector.disabled = true; //prevent changes
    }
    else {
        thinkingSelector.disabled = false;
        thinkingHint.style.display = 'none';
        thinkingSelector.dispatchEvent(new Event('change'));
    }
});

//initial check
modelSelect?.dispatchEvent(createChatModelChangedEvent());
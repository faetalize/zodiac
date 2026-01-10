import { createEvent, dispatchDocumentEvent } from "../../events";

export const modelSelect = document.querySelector<HTMLSelectElement>("#selectedModel");

if (!modelSelect) {
    console.error("Model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedModel");
}

export const createChatModelChangedEvent = () => createEvent('chat-model-changed', {
    model: modelSelect.value
}, { bubbles: true });

// notify when chat model is changed
modelSelect.addEventListener("change", () => {
    dispatchDocumentEvent('chat-model-changed', { model: modelSelect.value });
});
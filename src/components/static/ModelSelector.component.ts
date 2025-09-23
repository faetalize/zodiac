export const modelSelect = document.querySelector<HTMLSelectElement>("#selectedModel");

if (!modelSelect) {
    console.error("Model selector component initialization failed");
    throw new Error("Missing DOM element: #selectedModel");
}

export const createChatModelChangedEvent = () => new CustomEvent('chat-model-changed', {
    bubbles: true,
    detail: {
        model: modelSelect.value
    }
});

// notify when chat model is changed
modelSelect.addEventListener("change", () => {
    document.dispatchEvent(createChatModelChangedEvent());
});
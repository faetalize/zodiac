import { ChatModel } from "../../models/Models";
import { createChatModelChangedEvent, modelSelect } from "./ModelSelector.component";

const thinkingSelector = document.querySelector<HTMLSelectElement>("#enableThinkingSelect");
const thinkingHint = document.querySelector<HTMLDivElement>("#thinking-required-hint");
if (!thinkingSelector || !thinkingHint) {
    console.error("Thinking selector component initialization failed");
    throw new Error("Missing DOM element: #enableThinkingSelect or #thinking-required-hint");
}

//notifies when thinking is toggled on or off
export const createThinkingToggledEvent = () => new CustomEvent('thinking-toggled', {
    bubbles: true, detail: {
        enabled: thinkingSelector.value === 'enabled'
    }
});

thinkingSelector.addEventListener("change", () => {
    document.dispatchEvent(createThinkingToggledEvent());
});

// if pro model is selected, force thinking to be enabled and disable selector
document.addEventListener("chat-model-changed", (event: CustomEventInit) => {
    const { model }: { model: ChatModel } = event.detail;

    if (!model) return;

    if (model === ChatModel.PRO) {
        thinkingSelector.value = 'enabled';
        thinkingHint.style.display = '';
        thinkingSelector.dispatchEvent(new Event('change'));
        thinkingSelector.disabled = true; //prevent changes
    }
    else {
        thinkingSelector.disabled = false;
    }
});

//initial check
modelSelect?.dispatchEvent(createChatModelChangedEvent());
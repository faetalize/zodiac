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
    console.log("Chat model changed event received in ThinkingSelector.component");
    const { model }: { model: ChatModel } = event.detail;
    console.log("Selected model:", model);

    if (!model) return;

    if (model === ChatModel.PRO) {
        console.log("Forcing thinking enabled for Pro model");
        thinkingSelector.value = 'enabled';
        thinkingHint.style.display = 'block';
        console.log(thinkingHint.style.display);
        console.log(window.getComputedStyle(thinkingHint).display);
        thinkingSelector.dispatchEvent(new Event('change'));
        thinkingSelector.disabled = true; //prevent changes
    }
    if (model === ChatModel.NANO_BANANA) {
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
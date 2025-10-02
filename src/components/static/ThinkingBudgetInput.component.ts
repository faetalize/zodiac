import { createThinkingToggledEvent } from "./ThinkingSelector.component";

const thinkingBudgetInput = document.querySelector<HTMLInputElement>("#thinkingBudget");

if (!thinkingBudgetInput) {
    console.error("Thinking budget input component initialization failed");
    throw new Error("Missing DOM element: #thinkingBudget");
}

//if thinking is disabled, disable budget input
document.addEventListener("thinking-toggled", (event: CustomEventInit) => {
    const { enabled } = event.detail;
    thinkingBudgetInput.disabled = !enabled;
});

//input validation: must be -1 (dynamic) or >= 128
thinkingBudgetInput.addEventListener("change", () => {
    const value = parseInt(thinkingBudgetInput.value);
    if (isNaN(value) || value < 128 && value !== -1) {
        thinkingBudgetInput.value = "128";
    }
});

//initial state, we trigger the event to set the correct state
thinkingBudgetInput.dispatchEvent(createThinkingToggledEvent());
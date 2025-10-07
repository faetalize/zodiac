const maxOutputTokensComponent = document.querySelector<HTMLInputElement>("#maxTokens");

if (!maxOutputTokensComponent) {
    console.error("Max Output Tokens component is missing.");
    throw new Error("Max Output Tokens component initialization failed.");
}

let timer: NodeJS.Timeout;

maxOutputTokensComponent.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
        const value = parseInt(maxOutputTokensComponent.value, 10);
        if (isNaN(value) || value < 100) {
            maxOutputTokensComponent.value = "100";
        } else if (value > 65536) {
            maxOutputTokensComponent.value = "65536";
        }
        localStorage.setItem("maxTokens", maxOutputTokensComponent.value);
    }, 1000);
});
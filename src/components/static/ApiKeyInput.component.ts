import { GoogleGenAI } from "@google/genai";

const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");

let debounceTimer: NodeJS.Timeout;
apiKeyInput?.addEventListener("input", () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();
        const ai = new GoogleGenAI({ apiKey: apiKey });
        try {
            // Test the API key with a simple query
            await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: "test"
            });
            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            document.querySelector<HTMLElement>(".api-key-error")!.classList.add("hidden");
        } catch (error) {
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            document.querySelector<HTMLElement>(".api-key-error")!.classList.remove("hidden");
        }
    }, 2000);
});
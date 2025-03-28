import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKeyInput = document.querySelector("#apiKeyInput");

let debounceTimer;
apiKeyInput.addEventListener("input", () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();
        const genAi = new GoogleGenerativeAI(apiKey);
        try {
            const model = genAi.getGenerativeModel({ model: "gemini-2.0-flash" });
            await model.generateContent("test");
            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            document.querySelector(".api-key-error").style.display = "none";
        } catch (error) {
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            document.querySelector(".api-key-error").style.display = "flex";
        }
    }, 2000);
});
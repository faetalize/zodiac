import * as supabaseService from "../../services/Supabase.service";
import * as overlayService from "../../services/Overlay.service";

const loginSubmit = document.querySelector("#btn-login-submit");
if (!loginSubmit) {
    console.error("Login submit button not found in the document");
    throw new Error("Login submit button not found in the document");
}

loginSubmit.addEventListener("click", async (e) => {
    e.preventDefault();
    const emailInput = document.querySelector("#email") as HTMLInputElement;
    const passwordInput = document.querySelector("#password") as HTMLInputElement;
    const loginError = document.querySelector("#login-error") as HTMLSpanElement;
    const errorMessage = loginError.querySelector("#login-error-message") as HTMLSpanElement;

    if (!emailInput || !passwordInput || !loginError || !errorMessage) {
        console.error("Email or password input not found");
        return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;
    
    if (!email || !password) {
        errorMessage.textContent = "Email and password are required";
        loginError.style.display = "flex";
        return;
    }

    try {
        await supabaseService.login(email, password);
        overlayService.closeOverlay();
        loginError.style.display = "none";
    } catch (error) {
        console.error("Login error:", error);
        errorMessage.textContent = (error as Error).message;
        loginError.style.display = "flex";
    }
});
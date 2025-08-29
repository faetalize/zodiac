import * as supabaseService from "../../services/Supabase.service";
import * as overlayService from "../../services/Overlay.service";

const registerSubmit = document.querySelector("#btn-register-submit");
if (!registerSubmit) {
    console.error("Register submit button not found in the document");
    throw new Error("Register submit button not found in the document");
}

registerSubmit.addEventListener("click", async (e) => {
    e.preventDefault();
    const emailInput = document.querySelector("#register-email") as HTMLInputElement;
    const passwordInput = document.querySelector("#register-password") as HTMLInputElement;
    const termsInput = document.querySelector("#register-terms") as HTMLInputElement;
    const passwordConfirmInput = document.querySelector("#register-password-confirm") as HTMLInputElement;
    const registerError = document.querySelector("#register-error") as HTMLSpanElement;
    const errorMessage = registerError.querySelector("#register-error-message");

    if (!emailInput || !passwordInput || !termsInput || !passwordConfirmInput || !registerError || !errorMessage) {
        console.error("Email, password, terms, password confirmation or error element not found");
        return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;
    const termsAccepted = termsInput.checked;
    const passwordConfirm = passwordConfirmInput.value;


    if (!email || !password) {
        errorMessage.textContent = "Email and password are required";
        registerError.classList.remove("hidden");
        return;
    }

    if (password !== passwordConfirm) {
        errorMessage.textContent = "Passwords do not match";
        registerError.classList.remove("hidden");
        return;
    }

    if (!termsAccepted) {
        errorMessage.textContent = "You must accept the terms and conditions";
        registerError.classList.remove("hidden");
        return;
    }

    try {
        await supabaseService.createAccount(email, password);
    } catch (error) {
        console.error("Error creating account:", (error as Error).message);
        errorMessage.textContent = (error as Error).message;
        registerError.classList.remove("hidden");
        return;
    }

    overlayService.closeOverlay();
    registerError.classList.add("hidden");
});
import * as supabaseService from "../../services/Supabase.service";
import * as overlayService from "../../services/Overlay.service";
import { openPasswordResetRequestForm } from "./PasswordReset.component";

const loginForm = document.querySelector<HTMLFormElement>("#login");
const forgotPasswordBtn = document.querySelector("#btn-forgot-password");

if (!loginForm) {
	console.error("Login form not found in the document");
	throw new Error("Login form not found in the document");
}

loginForm.addEventListener("submit", (e) => {
	void (async () => {
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
			loginError.classList.remove("hidden");
			return;
		}

		try {
			await supabaseService.login(email, password);
			overlayService.closeOverlay();
			loginError.classList.add("hidden");
		} catch (error) {
			console.error("Login error:", error);
			errorMessage.textContent = (error as Error).message;
			loginError.classList.remove("hidden");
		}
	})();
});

if (forgotPasswordBtn) {
	forgotPasswordBtn.addEventListener("click", () => {
		openPasswordResetRequestForm();
	});
}

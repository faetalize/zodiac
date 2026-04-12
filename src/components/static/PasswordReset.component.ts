import * as overlayService from "../../services/Overlay.service";
import * as supabaseService from "../../services/Supabase.service";
import * as toastService from "../../services/Toast.service";

const passwordResetForm = document.querySelector<HTMLFormElement>("#form-password-reset");
const newPasswordInput = document.querySelector<HTMLInputElement>("#password-reset-new");
const confirmPasswordInput = document.querySelector<HTMLInputElement>("#password-reset-confirm");
const errorContainer = document.querySelector<HTMLElement>("#password-reset-error");
const errorMessage = document.querySelector<HTMLElement>("#password-reset-error-message");
const submitButton = document.querySelector<HTMLButtonElement>("#btn-password-reset-submit");
const cancelButton = document.querySelector<HTMLButtonElement>("#btn-password-reset-cancel");

const requestForm = document.querySelector<HTMLFormElement>("#form-password-reset-request");
const requestEmailInput = document.querySelector<HTMLInputElement>("#password-reset-request-email");
const requestErrorContainer = document.querySelector<HTMLElement>("#password-reset-request-error");
const requestErrorMessage = document.querySelector<HTMLElement>("#password-reset-request-error-message");
const requestSubmitButton = document.querySelector<HTMLButtonElement>("#btn-password-reset-request-submit");
const requestCancelButton = document.querySelector<HTMLButtonElement>("#btn-password-reset-request-cancel");

const hideOverlayButton = document.querySelector<HTMLButtonElement>("#btn-hide-overlay");

if (
	!passwordResetForm ||
	!newPasswordInput ||
	!confirmPasswordInput ||
	!errorContainer ||
	!errorMessage ||
	!submitButton ||
	!cancelButton ||
	!hideOverlayButton ||
	!requestForm ||
	!requestEmailInput ||
	!requestErrorContainer ||
	!requestErrorMessage ||
	!requestSubmitButton ||
	!requestCancelButton
) {
	console.error("Password reset form elements are missing.");
	throw new Error("Password reset initialization failed.");
}

const passwordResetFormEl = passwordResetForm as HTMLFormElement;
const newPasswordInputEl = newPasswordInput as HTMLInputElement;
const confirmPasswordInputEl = confirmPasswordInput as HTMLInputElement;
const errorContainerEl = errorContainer as HTMLElement;
const errorMessageEl = errorMessage as HTMLElement;
const submitButtonEl = submitButton as HTMLButtonElement;
const cancelButtonEl = cancelButton as HTMLButtonElement;

const requestFormEl = requestForm as HTMLFormElement;
const requestEmailInputEl = requestEmailInput as HTMLInputElement;
const requestErrorContainerEl = requestErrorContainer as HTMLElement;
const requestErrorMessageEl = requestErrorMessage as HTMLElement;
const requestSubmitButtonEl = requestSubmitButton as HTMLButtonElement;
const requestCancelButtonEl = requestCancelButton as HTMLButtonElement;

const hideOverlayButtonEl = hideOverlayButton as HTMLButtonElement;

function clearRecoveryUrl() {
	if (typeof window === "undefined") {
		return;
	}
	// Clear the recovery query parameter but preserve any other query params and the hash
	const url = new URL(window.location.href);
	url.searchParams.delete("recovery");
	window.history.replaceState(null, "", url.toString());
}

function hideError() {
	errorContainerEl.classList.add("hidden");
	errorMessageEl.textContent = "";
}

function showError(message: string) {
	errorMessageEl.textContent = message;
	errorContainerEl.classList.remove("hidden");
}

function openPasswordResetForm() {
	if (!passwordResetFormEl.classList.contains("hidden")) {
		// Already open
		return;
	}
	hideError();
	passwordResetFormEl.reset();
	overlayService.show("form-password-reset");
	requestAnimationFrame(() => newPasswordInputEl.focus());
}

export function openPasswordResetRequestForm() {
	if (!requestFormEl.classList.contains("hidden")) {
		return;
	}
	requestErrorContainerEl.classList.add("hidden");
	requestErrorMessageEl.textContent = "";
	requestFormEl.reset();
	overlayService.show("form-password-reset-request");
	requestAnimationFrame(() => requestEmailInputEl.focus());
}

async function handleSubmit(event: SubmitEvent) {
	event.preventDefault();
	hideError();

	const newPassword = newPasswordInputEl.value;
	const confirmPassword = confirmPasswordInputEl.value;

	if (!newPassword || !confirmPassword) {
		showError("Please enter and confirm your new password.");
		return;
	}
	if (newPassword !== confirmPassword) {
		showError("Passwords do not match.");
		return;
	}

	submitButtonEl.disabled = true;
	try {
		await supabaseService.updatePassword(newPassword);
		toastService.info({
			title: "Password Updated",
			text: "Your password has been changed successfully."
		});
		clearRecoveryUrl();
		overlayService.closeOverlay();
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not update password.";
		showError(message);
	} finally {
		submitButtonEl.disabled = false;
		if (!passwordResetFormEl.classList.contains("hidden")) {
			passwordResetFormEl.reset();
			confirmPasswordInputEl.value = "";
			newPasswordInputEl.focus();
		}
	}
}

function hasRecoveryTrigger(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has("recovery");
}

function maybeOpenFromUrl() {
	if (!hasRecoveryTrigger()) {
		return;
	}
	openPasswordResetForm();
}

async function handleRequestSubmit(event: SubmitEvent) {
	event.preventDefault();
	requestErrorContainerEl.classList.add("hidden");
	requestErrorMessageEl.textContent = "";

	const email = requestEmailInputEl.value;
	if (!email) {
		requestErrorMessageEl.textContent = "Please enter your email address.";
		requestErrorContainerEl.classList.remove("hidden");
		return;
	}

	requestSubmitButtonEl.disabled = true;
	try {
		await supabaseService.sendPasswordResetEmail(email);
		toastService.info({
			title: "Email Sent",
			text: "Check your inbox for a link to reset your password."
		});
		overlayService.closeOverlay();
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not send reset email.";
		requestErrorMessageEl.textContent = message;
		requestErrorContainerEl.classList.remove("hidden");
	} finally {
		requestSubmitButtonEl.disabled = false;
	}
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
requestFormEl.addEventListener("submit", handleRequestSubmit);

requestCancelButtonEl.addEventListener("click", () => {
	overlayService.show("login-register-tabs");
});

// eslint-disable-next-line @typescript-eslint/no-misused-promises
passwordResetFormEl.addEventListener("submit", handleSubmit);

cancelButtonEl.addEventListener("click", () => {
	clearRecoveryUrl();
	overlayService.closeOverlay();
});

hideOverlayButtonEl.addEventListener("click", () => {
	if (!passwordResetFormEl.classList.contains("hidden")) {
		clearRecoveryUrl();
	}
});

window.addEventListener("password-recovery", () => {
	openPasswordResetForm();
});

maybeOpenFromUrl();

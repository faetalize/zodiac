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
const hideOverlayButton = document.querySelector<HTMLButtonElement>("#btn-hide-overlay");

if (!passwordResetForm || !newPasswordInput || !confirmPasswordInput || !errorContainer || !errorMessage || !submitButton || !cancelButton || !hideOverlayButton) {
    console.error("Password reset form elements are missing.");
    console.log({ passwordResetForm, newPasswordInput, confirmPasswordInput, errorContainer, errorMessage, submitButton, cancelButton, hideOverlayButton });
    throw new Error("Password reset initialization failed.");
}

const passwordResetFormEl = passwordResetForm as HTMLFormElement;
const newPasswordInputEl = newPasswordInput as HTMLInputElement;
const confirmPasswordInputEl = confirmPasswordInput as HTMLInputElement;
const errorContainerEl = errorContainer as HTMLElement;
const errorMessageEl = errorMessage as HTMLElement;
const submitButtonEl = submitButton as HTMLButtonElement;
const cancelButtonEl = cancelButton as HTMLButtonElement;
const hideOverlayButtonEl = hideOverlayButton as HTMLButtonElement;

function clearRecoveryHash() {
    if (typeof window === "undefined") {
        return;
    }
    if (!hasRecoveryHash()) {
        return;
    }
    const { origin, pathname, search } = window.location;
    window.history.replaceState(null, "", `${origin}${pathname}${search}`);
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
        clearRecoveryHash();
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

function hasRecoveryHash(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    const hash = window.location.hash || "";
    if (!hash) {
        return false;
    }
    return hash === supabaseService.PASSWORD_RECOVERY_HASH || hash.startsWith(`${supabaseService.PASSWORD_RECOVERY_HASH}&`) || hash.startsWith(`${supabaseService.PASSWORD_RECOVERY_HASH}#`);
}

function maybeOpenFromHash() {
    if (!hasRecoveryHash()) {
        return;
    }
    openPasswordResetForm();
}

passwordResetFormEl.addEventListener("submit", handleSubmit);

cancelButtonEl.addEventListener("click", () => {
    clearRecoveryHash();
    overlayService.closeOverlay();
});

hideOverlayButtonEl.addEventListener("click", () => {
    if (!passwordResetFormEl.classList.contains("hidden")) {
        clearRecoveryHash();
    }
});

window.addEventListener("password-recovery", () => {
    openPasswordResetForm();
});

window.addEventListener("hashchange", () => {
    maybeOpenFromHash();
});

maybeOpenFromHash();

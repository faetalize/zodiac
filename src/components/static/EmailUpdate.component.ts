import * as overlayService from "../../services/Overlay.service";
import * as supabaseService from "../../services/Supabase.service";
import * as toastService from "../../services/Toast.service";

const emailUpdateForm = document.querySelector<HTMLFormElement>("#form-email-update");
const newEmailInput = document.querySelector<HTMLInputElement>("#email-update-new");
const confirmEmailInput = document.querySelector<HTMLInputElement>("#email-update-confirm");
const errorContainer = document.querySelector<HTMLElement>("#email-update-error");
const errorMessage = document.querySelector<HTMLElement>("#email-update-error-message");
const submitButton = document.querySelector<HTMLButtonElement>("#btn-email-update-submit");
const cancelButton = document.querySelector<HTMLButtonElement>("#btn-email-update-cancel");
const hideOverlayButton = document.querySelector<HTMLButtonElement>("#btn-hide-overlay");

if (!emailUpdateForm || !newEmailInput || !confirmEmailInput || !errorContainer || !errorMessage || !submitButton || !cancelButton || !hideOverlayButton) {
    console.error("Email update form elements are missing.");
    console.log({ emailUpdateForm, newEmailInput, confirmEmailInput, errorContainer, errorMessage, submitButton, cancelButton, hideOverlayButton });
    throw new Error("Email update initialization failed.");
}

const emailUpdateFormEl = emailUpdateForm as HTMLFormElement;
const newEmailInputEl = newEmailInput as HTMLInputElement;
const confirmEmailInputEl = confirmEmailInput as HTMLInputElement;
const errorContainerEl = errorContainer as HTMLElement;
const errorMessageEl = errorMessage as HTMLElement;
const submitButtonEl = submitButton as HTMLButtonElement;
const cancelButtonEl = cancelButton as HTMLButtonElement;
const hideOverlayButtonEl = hideOverlayButton as HTMLButtonElement;

function showError(message: string) {
    errorMessageEl.textContent = message;
    errorContainerEl.classList.remove("hidden");
}

function hideError() {
    errorMessageEl.textContent = "";
    errorContainerEl.classList.add("hidden");
}

function resetForm() {
    emailUpdateFormEl.reset();
    hideError();
}

function openEmailUpdateForm(currentEmail?: string | null) {
    resetForm();
    if (currentEmail && currentEmail !== "—") {
        newEmailInputEl.value = currentEmail;
        confirmEmailInputEl.value = currentEmail;
    }
    overlayService.show("form-email-update");
    requestAnimationFrame(() => newEmailInputEl.focus());
}

async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    hideError();

    const newEmail = newEmailInputEl.value.trim();
    const confirmEmail = confirmEmailInputEl.value.trim();

    if (!newEmail || !confirmEmail) {
        showError("Please enter and confirm your new email address.");
        return;
    }
    if (newEmail !== confirmEmail) {
        showError("Emails do not match.");
        return;
    }

    submitButtonEl.disabled = true;
    try {
        await supabaseService.updateCurrentUserEmail(newEmail);
        toastService.info({
            title: "Email Update Requested",
            text: "Check your inbox to confirm the new email address."
        });
        window.dispatchEvent(new CustomEvent('account-email-changed', { detail: { email: newEmail } }));
        overlayService.closeOverlay();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update email address.";
        showError(message);
    } finally {
        submitButtonEl.disabled = false;
    }
}

emailUpdateFormEl.addEventListener("submit", handleSubmit);

cancelButtonEl.addEventListener("click", () => {
    resetForm();
    overlayService.closeOverlay();
});

hideOverlayButtonEl.addEventListener("click", () => {
    if (!emailUpdateFormEl.classList.contains("hidden")) {
        resetForm();
    }
});

window.addEventListener('open-email-update', (event: Event) => {
    const detail = (event as CustomEvent).detail ?? {};
    openEmailUpdateForm(detail.currentEmail ?? null);
});

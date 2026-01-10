import { ToastInstance, ToastSeverity } from "../../types/Toast";

const TOAST_CONTAINER_ID = "toast-container";
const AUTO_DISMISS_MS = 5000;

interface MountToastResult {
    element: HTMLElement;
    dismiss: () => void;
}

type DismissCallback = () => void;

function ensureContainer(): HTMLElement {
    let container = document.querySelector<HTMLElement>(`#${TOAST_CONTAINER_ID}`);
    if (!container) {
        container = document.createElement("div");
        container.id = TOAST_CONTAINER_ID;
        container.classList.add("toast-container");
        document.body.appendChild(container);
    }
    return container;
}

export function mountToast(instance: ToastInstance, onDismissed: DismissCallback): MountToastResult {
    const container = ensureContainer();
    const toast = document.createElement("div");
    toast.classList.add("toast", `toast--${instance.severity}`);
    toast.dataset.toastId = instance.id;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", instance.severity === ToastSeverity.Danger ? "assertive" : "polite");

    const header = document.createElement("div");
    header.classList.add("toast-header");

    const title = document.createElement("span");
    title.classList.add("toast-title");
    title.textContent = instance.title;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.classList.add("toast-close", "material-symbols-outlined");
    closeButton.setAttribute("aria-label", "Dismiss notification");
    closeButton.textContent = "close";

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = document.createElement("div");
    body.classList.add("toast-body");
    body.textContent = instance.text;

    toast.appendChild(header);
    toast.appendChild(body);

    if (instance.actions && instance.actions.length > 0) {
        const footer = document.createElement("div");
        footer.classList.add("toast-actions");
        for (const action of instance.actions) {
            const actionButton = document.createElement("button");
            actionButton.type = "button";
            actionButton.classList.add("toast-action");
            actionButton.textContent = action.label;
            actionButton.addEventListener("click", async () => {
                if (isDismissed) {
                    return;
                }
                try {
                    await action.onClick(triggerDismiss);
                } catch (error) {
                    console.error("Toast action handler failed", error);
                } finally {
                    triggerDismiss();
                }
            });
            footer.appendChild(actionButton);
        }
        toast.appendChild(footer);
    }

    container.prepend(toast);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => {
        toast.classList.add("toast--visible");
    });

    let remainingMs = AUTO_DISMISS_MS;
    let timerHandle: number | undefined;
    let timerStartedAt = performance.now();
    let isDismissed = false;

    const clearTimer = () => {
        if (timerHandle !== undefined) {
            window.clearTimeout(timerHandle);
            timerHandle = undefined;
        }
    };

    const startTimer = () => {
        clearTimer();
        timerStartedAt = performance.now();
        timerHandle = window.setTimeout(() => {
            triggerDismiss();
        }, remainingMs);
    };

    const pauseTimer = () => {
        if (timerHandle === undefined) {
            return;
        }
        const elapsed = performance.now() - timerStartedAt;
        remainingMs = Math.max(0, remainingMs - elapsed);
        clearTimer();
    };

    const resumeTimer = () => {
        if (isDismissed) {
            return;
        }
        if (remainingMs <= 0) {
            triggerDismiss();
            return;
        }
        startTimer();
    };

    const handlePointerEnter = () => {
        pauseTimer();
    };

    const handlePointerLeave = () => {
        resumeTimer();
    };

    const cleanup = () => {
        toast.removeEventListener("mouseenter", handlePointerEnter);
        toast.removeEventListener("mouseleave", handlePointerLeave);
        closeButton.removeEventListener("click", closeHandler);
        clearTimer();
    };

    const finalRemoval = () => {
        cleanup();
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
            if (toast && toast.parentElement && toast.parentElement.childElementCount === 0) {
                toast.parentElement.remove();
            }
        }
        onDismissed();
    };

    const triggerDismiss = () => {
        if (isDismissed) {
            return;
        }
        isDismissed = true;
        clearTimer();
        toast.classList.add("toast--leaving");
        const onTransitionEnd = () => {
            toast.removeEventListener("transitionend", onTransitionEnd);
            finalRemoval();
        };
        toast.addEventListener("transitionend", onTransitionEnd);
        // Fallback in case transitionend doesn't fire
        window.setTimeout(finalRemoval, 300);
    };

    const closeHandler = () => {
        triggerDismiss();
    };

    closeButton.addEventListener("click", closeHandler);
    toast.addEventListener("mouseenter", handlePointerEnter);
    toast.addEventListener("mouseleave", handlePointerLeave);

    startTimer();

    return {
        element: toast,
        dismiss: triggerDismiss
    };
}

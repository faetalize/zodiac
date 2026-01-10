import { ToastInstance, ToastOptions, ToastSeverity, ToastHandle } from "../types/Toast";
import { mountToast } from "../components/dynamic/Toast";

const MAX_TOASTS = 5;

const toastOrder: string[] = [];
const toastDismissers = new Map<string, () => void>();

export function show(options: ToastOptions): ToastHandle {
    const instance = buildInstance(options);

    const { dismiss } = mountToast(instance, () => finalizeDismiss(instance.id));

    toastOrder.push(instance.id);
    toastDismissers.set(instance.id, dismiss);

    enforceLimit();

    return {
        id: instance.id,
        dismiss: () => dismiss()
    };
}

export function info(options: Omit<ToastOptions, "severity">): ToastHandle {
    return show({ ...options, severity: ToastSeverity.Normal });
}

export function warn(options: Omit<ToastOptions, "severity">): ToastHandle {
    return show({ ...options, severity: ToastSeverity.Warning });
}

export function danger(options: Omit<ToastOptions, "severity">): ToastHandle {
    return show({ ...options, severity: ToastSeverity.Danger });
}

export function dismissAll(): void {
    while (toastOrder.length > 0) {
        const id = toastOrder.shift();
        if (!id) {
            continue;
        }
        const dismiss = toastDismissers.get(id);
        dismiss?.();
    }
}

function buildInstance(options: ToastOptions): ToastInstance {
    if (!options.title?.trim()) {
        throw new Error("Toast title is required");
    }
    if (!options.text?.trim()) {
        throw new Error("Toast text is required");
    }

    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return {
        id,
        createdAt: Date.now(),
        title: options.title,
        text: options.text,
        severity: options.severity ?? ToastSeverity.Normal,
        actions: options.actions ?? []
    };
}

function enforceLimit(): void {
    while (toastOrder.length > MAX_TOASTS) {
        const oldestId = toastOrder.shift();
        if (!oldestId) {
            continue;
        }
        const dismiss = toastDismissers.get(oldestId);
        dismiss?.();
    }
}

function finalizeDismiss(id: string): void {
    if (!toastDismissers.has(id)) {
        return;
    }
    toastDismissers.delete(id);
    const index = toastOrder.indexOf(id);
    if (index !== -1) {
        toastOrder.splice(index, 1);
    }
}

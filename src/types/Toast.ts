export enum ToastSeverity {
    Normal = "normal",
    Warning = "warning",
    Danger = "danger"
}

export interface ToastAction {
    label: string;
    onClick: (dismiss: () => void) => void | Promise<void>;
}

export interface ToastOptions {
    title: string;
    text: string;
    severity?: ToastSeverity;
    actions?: ToastAction[];
}

export interface ToastInstance extends ToastOptions {
    id: string;
    createdAt: number;
    severity: ToastSeverity;
}

export interface ToastHandle {
    id: string;
    dismiss: () => void;
}
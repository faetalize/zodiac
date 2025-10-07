import * as messageService from '../../services/Message.service';
import * as helpers from '../../utils/helpers';
import * as personalityService from '../../services/Personality.service';
import { attachmentPreviewElement } from './AttachmentPreview.component';
import * as toastService from '../../services/Toast.service';
import { formatFileListForToast, getFileSignature, isSupportedFileType, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, SUPPORTED_ACCEPT_ATTRIBUTE, SUPPORTED_TYPES_LABEL } from '../../utils/attachments';
import * as settingsService from '../../services/Settings.service';
interface AttachmentRemovedDetail {
    signature: string;
}

const messageInput = document.querySelector<HTMLDivElement>("#messageInput");
const messageBox = document.querySelector<HTMLDivElement>("#message-box");
const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
const attachmentPreview = document.querySelector<HTMLDivElement>("#attachment-preview");
const sendMessageButton = document.querySelector<HTMLButtonElement>("#btn-send");
const internetSearchToggle = document.querySelector<HTMLButtonElement>("#btn-internet");
const roleplayActionsMenu = document.querySelector<HTMLButtonElement>("#btn-roleplay");

if (!messageInput || !messageBox || !attachmentsInput || !attachmentPreview || !sendMessageButton || !internetSearchToggle || !roleplayActionsMenu) {
    console.error("Chat input component is missing some elements. Please check the HTML structure.");
    throw new Error("Chat input component is not properly initialized.");
}

const scrollbarWidth = helpers.getClientScrollbarWidth();
if (scrollbarWidth > 0) {
    document.documentElement.style.setProperty('--scroll-bar-width', `${scrollbarWidth}px`);
}

attachmentPreview.setAttribute("aria-live", "polite");
attachmentPreview.setAttribute("aria-atomic", "false");
messageBox.setAttribute("role", "group");
messageBox.setAttribute("aria-label", "Message input and attachment dropzone");

attachmentsInput.accept = SUPPORTED_ACCEPT_ATTRIBUTE;
attachmentsInput.multiple = true;

let attachmentState: File[] = Array.from(attachmentsInput.files || []);
let isInternetSearchEnabled = false;
let dragDepth = 0;

internetSearchToggle.addEventListener("click", () => {
    isInternetSearchEnabled = !isInternetSearchEnabled;
    internetSearchToggle.classList.toggle("btn-toggled");
});

//enter key to send message but support shift+enter for new line on PC only
messageInput.addEventListener("keydown", (e: KeyboardEvent) => {
    const isMobile = settingsService.isMobile();

    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        sendMessageButton.click();
    }
});

messageInput.addEventListener("blur", () => {
    /* no-op placeholder to mirror previous behaviour */
});

messageInput.addEventListener("focus", () => {
    if (!settingsService.isMobile()) {
        return;
    }

    window.requestAnimationFrame(() => {
        messageInput.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
});

messageInput.addEventListener("paste", (event: ClipboardEvent) => {
    const files = collectFilesFromClipboard(event);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const hasFiles = files.length > 0;
    const hasText = text.trim().length > 0;

    if (!hasFiles) {
        if (hasText) {
            event.preventDefault();
            document.execCommand("insertText", false, text.replace(/\r/g, ""));
        }
        return;
    }

    event.preventDefault();
    if (hasText) {
        document.execCommand("insertText", false, text.replace(/\r/g, ""));
    }
    addAttachments(files);
});

messageInput.addEventListener("input", () => {
    if (messageInput.innerHTML.trim() === "<br>" || messageInput.innerHTML.trim() === "<p><br></p>") {
        messageInput.innerHTML = "";
    }
});

attachmentsInput.addEventListener("change", (event) => {
    const files = Array.from(attachmentsInput.files || []);
    if (files.length === 0) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    addAttachments(files);
}, true);

attachmentPreview.addEventListener("attachmentremoved", (event: Event) => {
    const detail = (event as CustomEvent<AttachmentRemovedDetail>).detail;
    if (!detail?.signature) {
        return;
    }
    attachmentState = attachmentState.filter(file => getFileSignature(file) !== detail.signature);
    syncAttachmentInput();
});

messageBox.addEventListener("dragenter", handleDragEnter);
messageBox.addEventListener("dragover", handleDragOver);
messageBox.addEventListener("dragleave", handleDragLeave);
messageBox.addEventListener("drop", handleDrop);

messageInput.addEventListener("dragenter", handleDragEnter);
messageInput.addEventListener("dragover", handleDragOver);
messageInput.addEventListener("dragleave", handleDragLeave);
messageInput.addEventListener("drop", handleDrop);

sendMessageButton.addEventListener("click", async () => {
    let userMessageElement: HTMLElement | undefined;
    try {
        const message = helpers.getEncoded(messageInput.innerHTML);
        messageInput.innerHTML = "";
        userMessageElement = await messageService.send(message);
    } catch (error: any) {
        if (userMessageElement) {
            (userMessageElement as HTMLElement).classList.add("message-failure");
        }
        alert("Error, please report this to the developer. You might need to restart the page to continue normal usage: " + error);
        console.error(error);
        return;
    }
});

const setupBottomBar = async () => {
    const personality = await personalityService.getSelected();
    if (personality) {
        messageInput.setAttribute("placeholder", `Send a message to ${personality.name}`);
        if (personality.roleplayEnabled) {
            roleplayActionsMenu.classList.remove("hidden");
        }
        else {
            roleplayActionsMenu.classList.add("hidden");
        }
        if (personality.internetEnabled) {
            internetSearchToggle.classList.remove("hidden");
        }
        else {
            internetSearchToggle.classList.add("hidden");
        }
    }
    else {
        messageInput.setAttribute("placeholder", "Send a message");
    }

}


document.querySelector<HTMLDivElement>("#personalitiesDiv")!.addEventListener("change", async (e: Event) => {
    if ((e.target as HTMLSelectElement).name === "personality") {
        await setupBottomBar();
    }
});

await setupBottomBar();

function addAttachments(rawFiles: File[]): void {
    if (!rawFiles.length) {
        return;
    }

    const files = dedupeFiles(rawFiles);
    const duplicateNames: string[] = [];
    const oversizedNames: string[] = [];
    const unsupportedNames: string[] = [];
    let limitReached = false;
    const added: File[] = [];
    const existingSignatures = new Set(attachmentState.map(getFileSignature));

    for (const file of files) {
        if (attachmentState.length + added.length >= MAX_ATTACHMENTS) {
            limitReached = true;
            break;
        }

        const displayName = getDisplayName(file);

        if (!isSupportedFileType(file)) {
            unsupportedNames.push(displayName);
            continue;
        }

        if (file.size > MAX_ATTACHMENT_BYTES) {
            oversizedNames.push(displayName);
            continue;
        }

        const signature = getFileSignature(file);
        if (existingSignatures.has(signature)) {
            duplicateNames.push(displayName);
            continue;
        }

        existingSignatures.add(signature);
        added.push(file);
    }

    if (added.length > 0) {
        attachmentState = [...attachmentState, ...added];
        syncAttachmentInput();
        for (const file of added) {
            const preview = attachmentPreviewElement(file);
            preview.dataset.attachmentSignature = getFileSignature(file);
            attachmentPreview!.appendChild(preview);
        }
    } else {
        // ensure FileList is in sync even if we only removed/filtered files
        syncAttachmentInput();
    }

    if (duplicateNames.length) {
        toastService.warn({
            title: duplicateNames.length === 1 ? "Duplicate attachment skipped" : "Duplicate attachments skipped",
            text: formatFileListForToast(duplicateNames),
        });
    }

    if (oversizedNames.length) {
        toastService.warn({
            title: oversizedNames.length === 1 ? "File exceeds 5 MB limit" : "Files exceed 5 MB limit",
            text: formatFileListForToast(oversizedNames),
        });
    }

    if (unsupportedNames.length) {
        toastService.danger({
            title: unsupportedNames.length === 1 ? "Unsupported file type" : "Unsupported file types",
            text: `${formatFileListForToast(unsupportedNames)}\nSupported types: ${SUPPORTED_TYPES_LABEL}.`,
        });
    }

    if (limitReached) {
        toastService.warn({
            title: "Attachment limit reached",
            text: `You can attach up to ${MAX_ATTACHMENTS} files per message.`,
        });
    }
}

function syncAttachmentInput(): void {
    const dataTransfer = new DataTransfer();
    for (const file of attachmentState) {
        dataTransfer.items.add(file);
    }
    attachmentsInput!.files = dataTransfer.files;
}

function collectFilesFromClipboard(event: ClipboardEvent): File[] {
    const data = event.clipboardData;
    if (!data) {
        return [];
    }
    const files: File[] = [];
    for (const file of Array.from(data.files || [])) {
        if (file) {
            files.push(file);
        }
    }
    for (const item of Array.from(data.items || [])) {
        if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
                files.push(file);
            }
        }
    }
    return dedupeFiles(files);
}

function dedupeFiles(files: File[]): File[] {
    const seen = new Set<string>();
    const unique: File[] = [];
    for (const file of files) {
        const signature = getFileSignature(file);
        if (seen.has(signature)) {
            continue;
        }
        seen.add(signature);
        unique.push(file);
    }
    return unique;
}

function handleDragEnter(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (dragDepth === 0) {
        messageBox!.classList.add("drag-over");
    }
    dragDepth += 1;
}

function handleDragOver(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
    }
}

function handleDragLeave(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
        messageBox!.classList.remove("drag-over");
    }
}

function handleDrop(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const files = collectFilesFromDataTransfer(event.dataTransfer);
    if (files.length) {
        addAttachments(files);
    }
    resetDragState();
}

function collectFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
    if (!dataTransfer) {
        return [];
    }
    const files: File[] = [];
    for (const file of Array.from(dataTransfer.files || [])) {
        if (file) {
            files.push(file);
        }
    }
    for (const item of Array.from(dataTransfer.items || [])) {
        if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
                files.push(file);
            }
        }
    }
    return dedupeFiles(files);
}

function isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function resetDragState(): void {
    dragDepth = 0;
    messageBox!.classList.remove("drag-over");
}

function getDisplayName(file: File): string {
    return file.name?.trim() ? file.name : "Unnamed file";
}
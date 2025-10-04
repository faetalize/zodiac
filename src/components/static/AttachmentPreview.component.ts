import { getFileSignature } from "../../utils/attachments";

const input = document.querySelector<HTMLInputElement>("#attachments");
const attachmentPreview = document.querySelector<HTMLDivElement>("#attachment-preview");

if (!input || !attachmentPreview) {
    // If the input or preview element is not found, log an error and throw an exception
    console.error("Input element for attachments not found");
    throw new Error("Input element for attachments is not properly initialized.");
}

export const attachmentPreviewElement = (file: File) => {
    const container = document.createElement("div");
    container.classList.add("attachment-container");
    container.dataset.attachmentSignature = getFileSignature(file);
    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const removeButton = document.createElement("button");
            removeButton.classList.add("btn-textual", "material-symbols-outlined", "btn-remove-attachment");
            removeButton.addEventListener("click", () => {
                removeFileFromInput(file);
                container.remove(); // Remove the preview element
                dispatchAttachmentRemoved(file);
            });
            removeButton.textContent = "close";
            const img = document.createElement("img");
            img.src = e.target!.result as string;
            img.alt = file.name;
            container.appendChild(img);
            container.appendChild(removeButton);
            attachmentPreview.appendChild(container);
        };
        reader.readAsDataURL(file);
    }
    //text and pdf files
    else if (file.type === "application/pdf" || file.type === "text/plain") {
        container.classList.add("attachment-preview-container");
        const removeButton = document.createElement("button");
        removeButton.classList.add("btn-textual", "material-symbols-outlined", "btn-remove-attachment");
        removeButton.addEventListener("click", () => {
            removeFileFromInput(file);
            container.remove(); // Remove the preview element
            dispatchAttachmentRemoved(file);
        });
        removeButton.textContent = "close";
        const fileIcon = document.createElement("span");
        const fileDetailsDiv = document.createElement("div");
        const fileName = document.createElement("span");
        const fileType = document.createElement("span");
        fileName.textContent = file.name;
        fileType.textContent = file.type;
        fileName.classList.add("attachment-name");
        fileType.classList.add("attachment-type");
        fileIcon.classList.add("material-symbols-outlined", "attachment-icon");
        fileIcon.textContent = "text_snippet";
        fileDetailsDiv.classList.add("attachment-details");
        fileDetailsDiv.appendChild(fileName);
        fileDetailsDiv.appendChild(fileType);
        container.appendChild(fileIcon);
        container.appendChild(fileDetailsDiv);
        container.appendChild(removeButton);
    }


    return container;
}

input.addEventListener("change", (event) => {
    const filesToAdd = (event.target as HTMLInputElement).files;
    if (filesToAdd && filesToAdd.length > 0) {
        for (const file of filesToAdd) {
            attachmentPreview.appendChild(attachmentPreviewElement(file));
        }
    }
});

export function clearAttachmentPreviews(){
    const previews = attachmentPreview?.querySelectorAll(".attachment-container");
    previews?.forEach(preview => preview.querySelector<HTMLButtonElement>(".btn-remove-attachment")?.click());
}

function removeFileFromInput(file: File): void {
    const signatureToRemove = getFileSignature(file);
    const dataTransfer = new DataTransfer();
    for (const existing of Array.from(input!.files || [])) {
        if (getFileSignature(existing) === signatureToRemove) {
            continue;
        }
        dataTransfer.items.add(existing);
    }
    input!.files = dataTransfer.files;
}

function dispatchAttachmentRemoved(file: File): void {
    const detail = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        signature: getFileSignature(file),
    } as const;
    attachmentPreview!.dispatchEvent(new CustomEvent("attachmentremoved", {
        detail,
        bubbles: true,
    }));
}
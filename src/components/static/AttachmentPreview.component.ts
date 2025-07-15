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
    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const removeButton = document.createElement("button");
            removeButton.classList.add("btn-textual", "material-symbols-outlined", "btn-remove-attachment");
            removeButton.addEventListener("click", () => {
                //remove the current file from the input
                const fileList = Array.from(input.files || []).filter(f => f.name !== file.name);
                const dataTransfer = new DataTransfer();
                fileList.forEach(f => dataTransfer.items.add(f));
                input.files = dataTransfer.files; // Update the input's files property
                container.remove(); // Remove the preview element
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
            //remove the current file from the input
            const fileList = Array.from(input.files || []).filter(f => f.name !== file.name);
            const dataTransfer = new DataTransfer();
            fileList.forEach(f => dataTransfer.items.add(f));
            input.files = dataTransfer.files; // Update the input's files property
            container.remove(); // Remove the preview element
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
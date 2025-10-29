import { EditableImage, scrollToMessage } from "../../utils/imageHistory";

/**
 * Creates a history image preview element that shows an image from chat history
 * that will be used for editing.
 */
export function historyImagePreviewElement(image: EditableImage): HTMLElement {
    const container = document.createElement("div");
    container.classList.add("history-image-preview", "attachment-container");
    container.dataset.messageIndex = String(image.messageIndex);
    container.dataset.source = image.source;

    // Create image element
    const img = document.createElement("img");
    img.src = image.dataUri;
    img.alt = "Image from chat history";
    img.classList.add("history-image-thumbnail");
    
    // Create badge to indicate source
    const badge = document.createElement("span");
    badge.classList.add("history-image-badge");
    badge.textContent = "Local";
    
    // Create remove button
    const removeButton = document.createElement("button");
    removeButton.classList.add("btn-textual", "material-symbols-outlined", "btn-remove-attachment");
    removeButton.textContent = "close";
    removeButton.title = "Clear preview";
    removeButton.addEventListener("click", (e) => {
        e.stopPropagation();
        container.remove();
        dispatchHistoryImageRemoved();
    });

    // Make the container clickable to scroll to source message
    container.style.cursor = "pointer";
    container.title = "Click to view original message";
    container.addEventListener("click", (e) => {
        // Don't scroll if clicking the remove button
        if (e.target === removeButton) {
            return;
        }
        scrollToMessage(image.messageIndex);
    });

    container.appendChild(img);
    container.appendChild(badge);
    container.appendChild(removeButton);

    return container;
}

/**
 * Dispatches a custom event when history image preview is removed
 */
function dispatchHistoryImageRemoved(): void {
    window.dispatchEvent(new CustomEvent("history-image-removed"));
}

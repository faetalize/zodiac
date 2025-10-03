import { Message } from "../../models/Message";
import { Personality } from "../../models/Personality";
import { db } from "../../services/Db.service";
import hljs from 'highlight.js';
import * as helpers from "../../utils/helpers";
import * as personalityService from "../../services/Personality.service";
import * as messageService from "../../services/Message.service";
import * as parserService from "../../services/Parser.service";
import * as chatsService from "../../services/Chats.service";

export const messageElement = async (
    message: Message
): Promise<HTMLElement> => {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");
    // NOTE: Thinking (chain-of-thought) is optionally provided by the backend
    // and stored in message.thinking. It is rendered inside a collapsible
    // region so it does not overwhelm the main answer. We do not parse it
    // as Markdown (only escaped) to reduce any accidental HTML injection and
    // keep its raw reasoning form.
    //user message
    if (!message.personalityid) {
        messageDiv.innerHTML =
            `<div class="message-header">
            <h3 class="message-role">You:</h3>
            <div class="message-actions">
                <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
            </div>
        </div>
        <div class="message-role-api" style="display: none;">${message.role}</div>
        <div class="message-text">${helpers.getDecoded(message.parts[0].text)}</div>
        <div class="attachment-preview-container">
            ${Array.from(message.parts[0].attachments || []).map((attachment: File) => {
                if (attachment.type.startsWith("image/")) {
                    return `<div class="attachment-container">
                        <img src="${URL.createObjectURL(attachment)}" alt="${attachment.name}" class="attachment-image">
                        </div>`;
                }
                if (attachment.type === "application/pdf" || attachment.type === "text/plain") {
                    return `<div class="attachment-container">
                        <span class="material-symbols-outlined attachment-icon">text_snippet</span>
                        <div class="attachment-details">
                            <span class="attachment-name">${attachment.name}</span>
                            <span class="attachment-type">${attachment.type}</span>
                        </div>
                    </div>`;
                }
            }).join('')}
        </div>`
    }
    //model message
    else {
    const personality: Personality = await personalityService.get(String(message.personalityid)) || personalityService.getDefault();
        messageDiv.classList.add("message-model");
            const rawInitial = message.parts[0].text || "";
            const initialHtml = helpers.getDecoded(rawInitial) || "";
            // If we already have generated images, don't show loading spinner even if text is empty
            const hasImages = Array.isArray(message.generatedImages) && message.generatedImages.length > 0;
            const isLoading = rawInitial.trim().length === 0 && !hasImages;
        const hasThinking = !!message.thinking && message.thinking.trim().length > 0;
        messageDiv.innerHTML =
            `<div class="message-header">
            <img class="pfp" src="${personality.image}" loading="lazy"></img>
            <h3 class="message-role">${personality.name}</h3>
            <div class="message-actions">
                <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                <button class="btn-clipboard btn-textual material-symbols-outlined">content_copy</button>
                <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
            </div>
        </div>
        <div class="message-role-api" style="display: none;">${message.role}</div>
        ${hasThinking ? `<div class="message-thinking">` +
            `<button class="thinking-toggle btn-textual" aria-expanded="false">Show reasoning</button>` +
            `<div class="thinking-content" hidden>${message.thinking || ''}</div>` +
        `</div>` : ''}
            <div class="message-text${isLoading ? ' is-loading' : ''}">
                <span class="message-spinner"></span>
                <div class="message-text-content">${initialHtml}</div>
        </div>
        <div class="message-images">
            ${hasImages ? message.generatedImages!.map((img, idx) => `
                <div class="generated-image-wrapper" data-index="${idx}">
                    <img class="generated-image" src="data:${img.mimeType};base64,${img.base64}" loading="lazy" />
                    <div class="generated-image-overlay">
                        <button class="btn-textual btn-image-action btn-download material-symbols-outlined" title="Download">download</button>
                        <button class="btn-textual btn-image-action btn-expand material-symbols-outlined" title="Expand">open_in_full</button>
                    </div>
                </div>
            `).join("") : ""}
        </div>
        <div class="message-grounding-rendered-content"></div>`;
        if (hasThinking) {
            const toggle = messageDiv.querySelector<HTMLButtonElement>('.thinking-toggle');
            const content = messageDiv.querySelector<HTMLElement>('.thinking-content');
            toggle?.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.textContent = 'Show reasoning';
                    content?.setAttribute('hidden', '');
                } else {
                    toggle.setAttribute('aria-expanded', 'true');
                    toggle.textContent = 'Hide reasoning';
                    content?.removeAttribute('hidden');
                }
            });
        }
        if (message.groundingContent) {
            const shadow = messageDiv.querySelector<HTMLElement>(".message-grounding-rendered-content")!.attachShadow({ mode: "open" });
            shadow.innerHTML = message.groundingContent;
            shadow.querySelector<HTMLDivElement>(".carousel")!.style.scrollbarWidth = "unset";
        }
    }

    setupMessageRegeneration(messageDiv);
    setupMessageClipboard(messageDiv);
    setupMessageEditing(messageDiv);
    setupGeneratedImageInteractions(messageDiv);

    return messageDiv;

}

function setupMessageEditing(messageElement: HTMLElement) {
    const editButton = messageElement.querySelector<HTMLButtonElement>(".btn-edit");
    const saveButton = messageElement.querySelector<HTMLButtonElement>(".btn-save");
    const messageText = messageElement.querySelector<HTMLElement>(".message-text-content") || messageElement.querySelector<HTMLElement>(".message-text");

    if (!editButton || !saveButton || !messageText) return;
    
    let originalAttachments: FileList | undefined;
    let editingAttachments: File[] = [];

    // Handle edit button click
    editButton.addEventListener("click", async () => {
        // Store original content to allow cancellation
        messageText.dataset.originalContent = messageText.innerHTML;

        // Get current message's attachments
        const messageContainer = document.querySelector(".message-container");
        if (messageContainer) {
            const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
            const currentChat = await chatsService.getCurrentChat(db);
            if (currentChat && currentChat.content[messageIndex]) {
                originalAttachments = currentChat.content[messageIndex].parts[0].attachments;
                editingAttachments = originalAttachments ? Array.from(originalAttachments) : [];
            }
        }

        // Enable editing
        console.log(await parserService.parseHtmlToMarkdown(messageText.innerHTML));
        messageText.setAttribute("contenteditable", "true");
        messageText.innerText = await parserService.parseHtmlToMarkdown(messageText.innerHTML) || ""; // Convert HTML to Markdown for editing
        messageText.focus();

        // Show editable attachments
        const attachmentContainer = messageElement.querySelector<HTMLElement>(".attachment-preview-container");
        if (attachmentContainer && editingAttachments.length > 0) {
            // Clear current attachment display and show editable version
            attachmentContainer.innerHTML = '';
            editingAttachments.forEach((attachment, index) => {
                const container = document.createElement("div");
                container.classList.add("attachment-container", "editable-attachment");
                
                if (attachment.type.startsWith("image/")) {
                    const img = document.createElement("img");
                    img.src = URL.createObjectURL(attachment);
                    img.alt = attachment.name;
                    img.classList.add("attachment-image");
                    container.appendChild(img);
                } else if (attachment.type === "application/pdf" || attachment.type === "text/plain") {
                    const fileIcon = document.createElement("span");
                    fileIcon.classList.add("material-symbols-outlined", "attachment-icon");
                    fileIcon.textContent = "text_snippet";
                    
                    const fileDetailsDiv = document.createElement("div");
                    fileDetailsDiv.classList.add("attachment-details");
                    
                    const fileName = document.createElement("span");
                    fileName.classList.add("attachment-name");
                    fileName.textContent = attachment.name;
                    
                    const fileType = document.createElement("span");
                    fileType.classList.add("attachment-type");
                    fileType.textContent = attachment.type;
                    
                    fileDetailsDiv.appendChild(fileName);
                    fileDetailsDiv.appendChild(fileType);
                    container.appendChild(fileIcon);
                    container.appendChild(fileDetailsDiv);
                }
                
                // Add remove button for editing
                const removeButton = document.createElement("button");
                removeButton.classList.add("btn-textual", "material-symbols-outlined", "btn-remove-attachment");
                removeButton.textContent = "close";
                removeButton.addEventListener("click", () => {
                    // Remove from editingAttachments array
                    editingAttachments.splice(index, 1);
                    container.remove();
                    // Re-render all attachments with updated indices
                    rerenderEditingAttachments();
                });
                container.appendChild(removeButton);
                attachmentContainer.appendChild(container);
            });
        }

        // Show save button, hide edit button
        editButton.style.display = "none";
        saveButton.style.display = "inline-block";
    });

    function rerenderEditingAttachments() {
        const attachmentContainer = messageElement.querySelector<HTMLElement>(".attachment-preview-container");
        if (!attachmentContainer) return;
        
        attachmentContainer.innerHTML = '';
        editingAttachments.forEach((attachment, index) => {
            const container = document.createElement("div");
            container.classList.add("attachment-container", "editable-attachment");
            
            if (attachment.type.startsWith("image/")) {
                const img = document.createElement("img");
                img.src = URL.createObjectURL(attachment);
                img.alt = attachment.name;
                img.classList.add("attachment-image");
                container.appendChild(img);
            } else if (attachment.type === "application/pdf" || attachment.type === "text/plain") {
                const fileIcon = document.createElement("span");
                fileIcon.classList.add("material-symbols-outlined", "attachment-icon");
                fileIcon.textContent = "text_snippet";
                
                const fileDetailsDiv = document.createElement("div");
                fileDetailsDiv.classList.add("attachment-details");
                
                const fileName = document.createElement("span");
                fileName.classList.add("attachment-name");
                fileName.textContent = attachment.name;
                
                const fileType = document.createElement("span");
                fileType.classList.add("attachment-type");
                fileType.textContent = attachment.type;
                
                fileDetailsDiv.appendChild(fileName);
                fileDetailsDiv.appendChild(fileType);
                container.appendChild(fileIcon);
                container.appendChild(fileDetailsDiv);
            }
            
            // Add remove button for editing
            const removeButton = document.createElement("button");
            removeButton.classList.add("btn-textual", "material-symbols-outlined", "btn-remove-attachment");
            removeButton.textContent = "close";
            removeButton.addEventListener("click", () => {
                // Remove from editingAttachments array
                editingAttachments.splice(index, 1);
                rerenderEditingAttachments();
            });
            container.appendChild(removeButton);
            attachmentContainer.appendChild(container);
        });
    }

    // Handle save button click
    saveButton.addEventListener("click", async () => {
        const markdownContent = messageText.innerText!;
        console.log("Saving edited message:", markdownContent);
        messageText.innerHTML = await parserService.parseMarkdownToHtml(markdownContent) || ""; // Convert Markdown back to HTML
        hljs.highlightAll(); // Reapply syntax highlighting

        // Disable editing
        messageText.removeAttribute("contenteditable");

        // Show save button, hide edit button
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";

        // Get the message index to update the correct message in chat history
        const messageContainer = document.querySelector(".message-container");
        if (!messageContainer) return;
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);

        // Update the chat history in database with both text and attachments
        await updateMessageInDatabase(markdownContent, messageIndex, editingAttachments);
        
        // Re-render the message element to show the updated attachments without edit buttons
        const currentChat = await chatsService.getCurrentChat(db);
        if (currentChat && currentChat.content[messageIndex]) {
            const updatedMessage = currentChat.content[messageIndex];
            // Import the module to get a reference to the function
            const { messageElement: createMessageElementFunction } = await import("./message");
            const newMessageElement = await createMessageElementFunction(updatedMessage);
            messageElement.replaceWith(newMessageElement);
        }
    });

    // Handle keydown events in the editable message
    messageText.addEventListener("keydown", (e) => {
        // Save on Enter key (without shift for newlines)
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveButton.click();
        }

        // Cancel on Escape key
        if (e.key === "Escape") {
            messageText.innerHTML = messageText.dataset.originalContent || "";
            messageText.removeAttribute("contenteditable");
            editButton.style.display = "inline-block";
            saveButton.style.display = "none";
            
            // Restore original attachments display
            const attachmentContainer = messageElement.querySelector<HTMLElement>(".attachment-preview-container");
            if (attachmentContainer && originalAttachments) {
                attachmentContainer.innerHTML = '';
                Array.from(originalAttachments).forEach((attachment: File) => {
                    const container = document.createElement("div");
                    container.classList.add("attachment-container");
                    
                    if (attachment.type.startsWith("image/")) {
                        const img = document.createElement("img");
                        img.src = URL.createObjectURL(attachment);
                        img.alt = attachment.name;
                        img.classList.add("attachment-image");
                        container.appendChild(img);
                    } else if (attachment.type === "application/pdf" || attachment.type === "text/plain") {
                        const fileIcon = document.createElement("span");
                        fileIcon.classList.add("material-symbols-outlined", "attachment-icon");
                        fileIcon.textContent = "text_snippet";
                        
                        const fileDetailsDiv = document.createElement("div");
                        fileDetailsDiv.classList.add("attachment-details");
                        
                        const fileName = document.createElement("span");
                        fileName.classList.add("attachment-name");
                        fileName.textContent = attachment.name;
                        
                        const fileType = document.createElement("span");
                        fileType.classList.add("attachment-type");
                        fileType.textContent = attachment.type;
                        
                        fileDetailsDiv.appendChild(fileName);
                        fileDetailsDiv.appendChild(fileType);
                        container.appendChild(fileIcon);
                        container.appendChild(fileDetailsDiv);
                    }
                    
                    attachmentContainer.appendChild(container);
                });
            }
        }
    });
}

function setupMessageRegeneration(messageElement: HTMLElement) {
    const refreshButton = messageElement.querySelector<HTMLButtonElement>(".btn-refresh");
    if (!refreshButton) {
        console.error("Refresh button not found");
        return;
    }

    refreshButton.addEventListener("click", async () => {
        try {
            const confirmation = await helpers.confirmDialogDanger("This action will also clear messages after the response you wish to regenerate. This action cannot be undone!");
            if (confirmation) {
                await messageService.regenerate(messageElement);
            }

        } catch (error) {
            if ((error as any).status === 429) {
                alert("Error, you have reached the API's rate limit. Please try again later or use the Flash model.");
                return;
            }
            alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
            console.error(error);
        }
    });
}

function setupMessageClipboard(messageElement: HTMLElement) {
    const clipboardButton = messageElement.querySelector(".btn-clipboard");
    clipboardButton?.addEventListener("click", async () => {
    const messageContent = messageElement.querySelector<HTMLDivElement>(".message-text-content") || messageElement.querySelector<HTMLDivElement>(".message-text");
        await navigator.clipboard.writeText(await parserService.parseHtmlToMarkdown(messageContent!) || "");
        clipboardButton.innerHTML = "check";
        setTimeout(() => {
            clipboardButton.innerHTML = "content_copy";
        }, 1000);
    });
}

async function updateMessageInDatabase(markdownContent: string, messageIndex: number, attachments?: File[]) {
    if (!db) return;
    try {
        // Get the current chat and update the specific message
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex] || !markdownContent) return;

        // Update the message content in the parts array
        currentChat.content[messageIndex].parts[0].text = markdownContent;
        
        // Update attachments if provided
        if (attachments !== undefined) {
            // Convert File[] to FileList
            const dataTransfer = new DataTransfer();
            attachments.forEach(file => dataTransfer.items.add(file));
            currentChat.content[messageIndex].parts[0].attachments = dataTransfer.files;
        }

        // Save the updated chat back to the database
        await db.chats.put(currentChat);
        console.log("Message updated in database");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}

// Adds overlay button interactions (download + expand) & a lightweight lightbox
function setupGeneratedImageInteractions(root: HTMLElement) {
    const wrappers = root.querySelectorAll<HTMLElement>(".generated-image-wrapper");
    if (!wrappers.length) return;

    wrappers.forEach(wrap => {
        const img = wrap.querySelector<HTMLImageElement>(".generated-image");
        const downloadBtn = wrap.querySelector<HTMLButtonElement>(".btn-download");
        const expandBtn = wrap.querySelector<HTMLButtonElement>(".btn-expand");
        if (!img) return;

        downloadBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            try {
                const a = document.createElement('a');
                a.href = img.src;
                // attempt to infer extension from mime
                const ext = (img.src.match(/data:(.*?);/)?.[1] || 'image/png').split('/')[1];
                a.download = `zodiac-image-${Date.now()}.${ext}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (err) { console.error('Download failed', err); }
        });

        const openLightbox = () => {
            const existing = document.querySelector('.lightbox');
            if (existing) existing.remove();
            const overlay = document.createElement('div');
            overlay.className = 'lightbox';
            overlay.innerHTML = `
                <div class="lightbox-backdrop"></div>
                <div class="lightbox-content" role="dialog" aria-modal="true">
                    <button class="lightbox-close material-symbols-outlined" aria-label="Close">close</button>
                    <img class="lightbox-image" src="${img.src}" />
                </div>`;
            document.body.appendChild(overlay);

            const remove = () => overlay.remove();
            overlay.querySelector('.lightbox-backdrop')?.addEventListener('click', remove);
            overlay.querySelector('.lightbox-close')?.addEventListener('click', remove);
            document.addEventListener('keydown', function escListener(ev) {
                if (ev.key === 'Escape') { remove(); document.removeEventListener('keydown', escListener); }
            });

            // Dynamically adjust sizing to ensure containment within viewport preserving aspect
            const lightboxImg = overlay.querySelector<HTMLImageElement>('.lightbox-image');
            function fit() {
                if (!lightboxImg || !lightboxImg.naturalWidth) return;
                const vw = window.innerWidth * 0.95;
                const vh = window.innerHeight * 0.95;
                const { naturalWidth: iw, naturalHeight: ih } = lightboxImg;
                const ratio = Math.min(vw / iw, vh / ih, 1);
                lightboxImg.style.width = Math.round(iw * ratio) + 'px';
                lightboxImg.style.height = Math.round(ih * ratio) + 'px';
            }
            if (lightboxImg?.complete) {
                fit();
            } else {
                lightboxImg?.addEventListener('load', fit, { once: true });
            }
            window.addEventListener('resize', fit, { passive: true });
            // Cleanup resize listener when closed
            overlay.addEventListener('remove', () => window.removeEventListener('resize', fit));
        }

        expandBtn?.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(); });
        // also click image to expand
        img.addEventListener('click', openLightbox);
    });
}
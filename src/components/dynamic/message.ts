import { Message } from "../../types/Message";
import { Personality } from "../../types/Personality";
import { db } from "../../services/Db.service";
import hljs from 'highlight.js';
import * as helpers from "../../utils/helpers";
import * as personalityService from "../../services/Personality.service";
import * as messageService from "../../services/Message.service";
import * as parserService from "../../services/Parser.service";
import * as chatsService from "../../services/Chats.service";
import { enhanceCodeBlocks, stripCodeBlockEnhancements } from "../../utils/codeBlocks";
import * as settingsService from "../../services/Settings.service";
import { MENTION_RE, MENTION_RE_GLOBAL } from "../../utils/mentions";
import * as toastService from "../../services/Toast.service";
import { dispatchAppEvent } from "../../events";

function resolveChatIndex(element: HTMLElement): number {
    const attr = element.dataset.chatIndex;
    if (attr) {
        const parsed = Number.parseInt(attr, 10);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }

    const container = element.closest<HTMLDivElement>(".message-container");
    if (!container) {
        return -1;
    }

    return Array.from(container.children).indexOf(element);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function decorateMentions(html: string): Promise<string> {
    if (!MENTION_RE.test(html)) return html;

    const chat = await chatsService.getCurrentChat(db);
    if (!chat || chat.groupChat?.mode !== "dynamic") return html;

    const participantIds = Array.isArray(chat.groupChat.participantIds) ? chat.groupChat.participantIds : [];
    if (!participantIds.length) return html;

    const nameById = new Map<string, string>();
    for (const id of participantIds) {
        const persona = await personalityService.get(String(id));
        const resolved = persona || personalityService.getDefault();
        nameById.set(String(id), String(resolved?.name || "Unknown"));
    }

    const parser = new DOMParser();
    const wrapperDoc = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const root = wrapperDoc.body.firstElementChild as HTMLElement | null;
    if (!root) return html;

    const walker = wrapperDoc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const toProcess: Text[] = [];
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        toProcess.push(node);
    }

    for (const textNode of toProcess) {
        if (!textNode.nodeValue || !MENTION_RE.test(textNode.nodeValue)) continue;

        let parent: HTMLElement | null = textNode.parentElement;
        let insideCode = false;
        while (parent) {
            if (parent.tagName === "CODE" || parent.tagName === "PRE") {
                insideCode = true;
                break;
            }
            parent = parent.parentElement;
        }
        if (insideCode) continue;

        const fragment = wrapperDoc.createDocumentFragment();
        const text = textNode.nodeValue;
        let lastIndex = 0;
        for (const match of text.matchAll(MENTION_RE_GLOBAL)) {
            const full = match[0];
            const id = match[1];
            const name = nameById.get(id);
            if (!name) continue;

            const start = match.index ?? 0;
            if (start > lastIndex) {
                fragment.append(text.slice(lastIndex, start));
            }

            const span = wrapperDoc.createElement("span");
            span.className = "mention-chip";
            span.dataset.personaId = id;
            span.setAttribute("aria-label", `Mentioned ${escapeHtml(name)}`);
            span.textContent = name;
            fragment.append(span);

            lastIndex = start + full.length;
        }

        if (lastIndex < text.length) {
            fragment.append(text.slice(lastIndex));
        }

        textNode.replaceWith(fragment);
    }

    return root.innerHTML;
}

function unwrapMentionsToRaw(html: string): string {
    if (!html.includes("mention-chip")) return html;
    const parser = new DOMParser();
    const wrapperDoc = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const root = wrapperDoc.body.firstElementChild as HTMLElement | null;
    if (!root) return html;

    const chips = root.querySelectorAll<HTMLElement>(".mention-chip[data-persona-id]");
    chips.forEach(chip => {
        const id = chip.dataset.personaId;
        if (!id) return;
        chip.replaceWith(wrapperDoc.createTextNode(`@<${id}>`));
    });

    return root.innerHTML;
}

export const messageElement = async (
    message: Message,
    index: number,
): Promise<HTMLElement> => {
    const messageDiv = document.createElement("div");
    //keep the chat index on the DOM node so that downstream logic (e.g.
    //regeneration, pruning) can reliably map rendered elements back to
    //chat.content even when only a slice of messages is in the DOM.
    messageDiv.dataset.chatIndex = String(index);
    //add round index for visual grouping in RPG mode
    if (typeof message.roundIndex === "number") {
        messageDiv.dataset.roundIndex = String(message.roundIndex);
    }
    if (message.hidden) {
        messageDiv.style.display = "none"; //hide system messages from normal view
        return messageDiv;
    }
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
        <div class="message-text">${await helpers.getDecoded(message.parts[0]?.text || "")}</div>
        <div class="attachment-preview-container">
            ${Array.from(message.parts[0]?.attachments || []).map((attachment: File) => {
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
        const isNarrator = message.personalityid === "__narrator__";
        const personality: Personality = isNarrator
            ? { name: "Narrator", image: "" } as Personality
            : await personalityService.get(String(message.personalityid)) || personalityService.getDefault();
        messageDiv.classList.add("message-model");
        if (isNarrator) {
            messageDiv.classList.add("message-narrator");
        }
        const rawInitial = message.parts[0]?.text || "";
        const initialHtmlRaw = await helpers.getDecoded(rawInitial) || "";
        const initialHtml = await decorateMentions(initialHtmlRaw);
        // If we already have generated images, don't show loading spinner even if text is empty
        const hasImages = Array.isArray(message.generatedImages) && message.generatedImages.length > 0;
        const isLoading = rawInitial.trim().length === 0 && !hasImages;
        const hasThinking = !!message.thinking && message.thinking.trim().length > 0;

        if (isNarrator) {
            // Simplified narrator header - no pfp, no persona switching
            messageDiv.innerHTML =
                `<div class="message-header narrator-header">
                <span class="narrator-icon material-symbols-outlined">auto_stories</span>
                <h3 class="message-role">Narrator</h3>
            </div>
            <div class="message-role-api" style="display: none;">${message.role}</div>
            ${hasThinking ? `<div class="message-thinking">` +
                    `<button class="thinking-toggle btn-textual" aria-expanded="false">Show reasoning</button>` +
                    `<div class="thinking-content" hidden>${await helpers.getDecoded(message.thinking || '')}</div>` +
                    `</div>` : ''}
                <div class="message-text${isLoading ? ' is-loading' : ''}">
                    <span class="message-spinner"></span>
                    <div class="message-text-content">${initialHtml}</div>
            </div>`;
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
        } else {
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
                    `<div class="thinking-content" hidden>${await helpers.getDecoded(message.thinking || '')}</div>` +
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
                            <button class="btn-textual btn-image-action btn-edit material-symbols-outlined" title="Edit this image">edit</button>
                            <button class="btn-textual btn-image-action btn-attach material-symbols-outlined" title="Attach this image">attachment</button>
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
    }

    enhanceCodeBlocks(messageDiv);
    setupPersonaSwitching(messageDiv, message);

    setupMessageRegeneration(messageDiv, index);
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
        messageText.dataset.originalContent = unwrapMentionsToRaw(messageText.innerHTML);

        // Remove code block chrome before entering edit mode
        stripCodeBlockEnhancements(messageText);

        // Get current message's attachments
        const messageIndex = resolveChatIndex(messageElement);
        if (messageIndex >= 0) {
            const currentChat = await chatsService.getCurrentChat(db);
            if (currentChat && currentChat.content[messageIndex]) {
                originalAttachments = currentChat.content[messageIndex].parts[0]?.attachments;
                editingAttachments = originalAttachments ? Array.from(originalAttachments) : [];
            }
        }

        // Enable editing
        messageText.setAttribute("contenteditable", "true");
        messageText.innerText = parserService.parseHtmlToMarkdown(unwrapMentionsToRaw(messageText.innerHTML)) || ""; // Convert HTML to Markdown for editing
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
        const markdownWithMentions = unwrapMentionsToRaw(markdownContent);
        messageText.innerHTML = await parserService.parseMarkdownToHtml(markdownWithMentions) || ""; // Convert Markdown back to HTML
        messageText.innerHTML = await decorateMentions(messageText.innerHTML);
        hljs.highlightAll(); // Reapply syntax highlighting
        enhanceCodeBlocks(messageElement);

        // Disable editing
        messageText.removeAttribute("contenteditable");

        // Show save button, hide edit button
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";

        // Get the message index to update the correct message in chat history
        const messageIndex = resolveChatIndex(messageElement);
        if (messageIndex < 0) {
            console.error("Unable to resolve chat index during save");
            return;
        }

        // Update the chat history in database with both text and attachments
        await updateMessageInDatabase(markdownWithMentions, messageIndex, editingAttachments);

        // Re-render the message element to show the updated attachments without edit buttons
        const currentChat = await chatsService.getCurrentChat(db);
        if (currentChat && currentChat.content[messageIndex]) {
            const updatedMessage = currentChat.content[messageIndex];
            // Import the module to get a reference to the function
            const { messageElement: createMessageElementFunction } = await import("./message");
            const newMessageElement = await createMessageElementFunction(updatedMessage, messageIndex);

            messageElement.replaceWith(newMessageElement);
        }
        hljs.highlightAll(); // Reapply syntax highlighting
    });

    // Handle keydown events in the editable message
    messageText.addEventListener("keydown", (e) => {
        const isMobile = settingsService.isMobile();
        // Save on Enter key (without shift for newlines)
        if (e.key === "Enter" && !e.shiftKey && !isMobile) {
            e.preventDefault();
            saveButton.click();
        }

        // Cancel on Escape key
        if (e.key === "Escape") {
            messageText.innerHTML = messageText.dataset.originalContent || "";
            enhanceCodeBlocks(messageElement);
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

function setupMessageRegeneration(messageElement: HTMLElement, index: number) {
    const refreshButton = messageElement.querySelector<HTMLButtonElement>(".btn-refresh");
    if (!refreshButton) {
        console.error("Refresh button not found");
        return;
    }

    refreshButton.addEventListener("click", async () => {
        const confirmation = await helpers.confirmDialogDanger("This action will also clear messages after the response you wish to regenerate. This action cannot be undone!");
        if (confirmation) {
            await messageService.regenerate(index);
        }
    });
}

function setupMessageClipboard(messageElement: HTMLElement) {
    const clipboardButton = messageElement.querySelector<HTMLButtonElement>(".btn-clipboard");
    clipboardButton?.addEventListener("click", async () => {
        if (!clipboardButton) return;
        const messageContent = messageElement.querySelector<HTMLDivElement>(".message-text-content") || messageElement.querySelector<HTMLDivElement>(".message-text");
        try {
            let markdown = parserService.parseHtmlToMarkdown(messageContent!) || "";
            //remove any line that ends with 'content\_copy' EXACTLY (it's not content_copy, it needs to match the slash).(artifact of code block bottom bar)
            const lines = markdown.split('\n');
            const cleanedLines: string[] = [];
            for (let i = 0; i < lines.length; i++) {
                if (!/content\\_copy$/.test(lines[i])) {
                    cleanedLines.push(lines[i]);
                } else {
                    // Remove the previous line if it exists
                    if (cleanedLines.length > 0) {
                        cleanedLines.pop();
                    }
                }
            }
            markdown = cleanedLines.join('\n');
            await navigator.clipboard.writeText(markdown);
            clipboardButton.disabled = true;
            clipboardButton.innerHTML = "check";
            setTimeout(() => {
                clipboardButton.innerHTML = "content_copy";
                clipboardButton.disabled = false;
            }, 1000);
        } catch (error) {
            console.error("Failed to copy message", error);
        }
    });
}

async function updateMessageInDatabase(markdownContent: string, messageIndex: number, attachments?: File[]) {
    if (!db) return;
    try {
        // Get the current chat and update the specific message
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex] || !markdownContent) return;

         // Update the message content in the parts array
         if (currentChat.content[messageIndex].parts.length === 0) {
             currentChat.content[messageIndex].parts.push({ text: markdownContent });
         } else {
             currentChat.content[messageIndex].parts[0].text = markdownContent;
         }

        // Update attachments if provided
        if (attachments !== undefined) {
            // Convert File[] to FileList
            const dataTransfer = new DataTransfer();
            attachments.forEach(file => dataTransfer.items.add(file));
            if (currentChat.content[messageIndex].parts.length === 0) {
                currentChat.content[messageIndex].parts.push({ text: "", attachments: dataTransfer.files });
            } else {
                currentChat.content[messageIndex].parts[0].attachments = dataTransfer.files;
            }
        }

        // Save the updated chat back to the database
        await db.chats.put(currentChat);
        console.log("Message updated in database");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}

// Adds overlay button interactions (download + expand + edit + attach) & a lightweight lightbox
function setupGeneratedImageInteractions(root: HTMLElement) {
    const wrappers = root.querySelectorAll<HTMLElement>(".generated-image-wrapper");
    if (!wrappers.length) return;

    wrappers.forEach(wrap => {
        const img = wrap.querySelector<HTMLImageElement>(".generated-image");
        const editBtn = wrap.querySelector<HTMLButtonElement>(".btn-edit");
        const attachBtn = wrap.querySelector<HTMLButtonElement>(".btn-attach");
        const downloadBtn = wrap.querySelector<HTMLButtonElement>(".btn-download");
        const expandBtn = wrap.querySelector<HTMLButtonElement>(".btn-expand");
        if (!img) return;

        // Helper to convert base64 image to File
        const imageToFile = async (): Promise<File> => {
            const base64Data = img.src.split(',')[1];
            const mimeType = img.src.match(/data:(.*?);/)?.[1] || 'image/png';
            const byteString = atob(base64Data);
            const arrayBuffer = new ArrayBuffer(byteString.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < byteString.length; i++) {
                uint8Array[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([uint8Array], { type: mimeType });
            const ext = mimeType.split('/')[1];
            return new File([blob], `image-${Date.now()}.${ext}`, { type: mimeType });
        };

        // Edit button: attach image + toggle editing mode
        editBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const file = await imageToFile();

                // Dispatch custom event instead of manually modifying input
                dispatchAppEvent('attach-image-from-chat', { file, toggleEditing: true });
            } catch (err) {
                console.error('Failed to attach image for editing', err);
            }
        });

        // Attach button: just attach image without toggling editing
        attachBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const file = await imageToFile();

                // Dispatch custom event instead of manually modifying input
                dispatchAppEvent('attach-image-from-chat', { file, toggleEditing: false });
            } catch (err) {
                console.error('Failed to attach image', err);
            }
        });

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
        }

        expandBtn?.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(); });
        // also click image to expand
        img.addEventListener('click', openLightbox);
    });
}

function setupPersonaSwitching(container: HTMLElement, message: Message): void {
    const personalityId = message.personalityid;
    if (!personalityId) {
        return;
    }

    const avatar = container.querySelector<HTMLElement>(".pfp");
    const name = container.querySelector<HTMLElement>(".message-role");
    const personaName = name?.textContent?.trim() || "Selected persona";

    const triggerElements = [avatar, name].filter((node): node is HTMLElement => Boolean(node));
    if (!triggerElements.length) {
        return;
    }

    const handleClick = (event: Event) => {
        event.stopPropagation();
        attemptPersonaSwitch(String(personalityId), personaName);
    };

    triggerElements.forEach((element) => {
        element.classList.add("persona-switch-trigger");
        element.setAttribute("title", "Click to switch to this persona");
        element.addEventListener("click", handleClick);
    });
}

function attemptPersonaSwitch(personalityId: string, personaName: string): void {
    const targetInput = findPersonaInput(personalityId);
    if (!targetInput) {
        toastService.warn({
            title: "Persona unavailable",
            text: "This persona is no longer available in your library.",
        });
        return;
    }

    if (targetInput.checked) {
        toastService.info({
            title: "Persona already active",
            text: `${personaName} is already selected.`,
        });
        return;
    }

    targetInput.click();
    toastService.info({
        title: "Persona switched",
        text: `Now chatting as ${personaName}.`,
    });
}

function findPersonaInput(personalityId: string): HTMLInputElement | null {
    if (personalityId && personalityId !== "-1") {
        const existing = document.querySelector<HTMLInputElement>(`#personality-${personalityId} input[name='personality']`);
        if (existing) {
            return existing;
        }
    }

    if (personalityId === "-1") {
        const defaultCardInput = document
            .querySelector<HTMLDivElement>("#personalitiesDiv")
            ?.querySelector<HTMLInputElement>("input[name='personality']");
        if (defaultCardInput) {
            return defaultCardInput;
        }
    }

    return null;
}

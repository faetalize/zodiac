import { Message } from "../models/Message";
import { Personality } from "../models/Personality";
import { db } from "../services/Db.service";
import hljs from 'highlight.js';
import * as helpers from "../utils/helpers";
import * as personalityService from "../services/Personality.service";
import * as messageService from "../services/Message.service";
import * as parserService from "../services/Parser.service";
import * as chatsService from "../services/Chats.service";

export const messageElement = async (
    message: Message
) => {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message");
    //user message
    if (!message.personalityid) {
        messageElement.innerHTML =
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
        messageElement.classList.add("message-model");
            const rawInitial = message.parts[0].text || "";
            const initialHtml = helpers.getDecoded(rawInitial) || "";
            // If we already have generated images, don't show loading spinner even if text is empty
            const hasImages = Array.isArray(message.generatedImages) && message.generatedImages.length > 0;
            const isLoading = rawInitial.trim().length === 0 && !hasImages;
        messageElement.innerHTML =
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
            <div class="message-text${isLoading ? ' is-loading' : ''}">
                <span class="message-spinner"></span>
                <div class="message-text-content">${initialHtml}</div>
        </div>
        <div class="message-images">
            ${hasImages ? message.generatedImages!.map(img => `<img class="generated-image" src="data:${img.mimeType};base64,${img.base64}" loading="lazy" />`).join("") : ""}
        </div>
        <div class="message-grounding-rendered-content"></div>`;
        if (message.groundingContent) {
            const shadow = messageElement.querySelector<HTMLElement>(".message-grounding-rendered-content")!.attachShadow({ mode: "open" });
            shadow.innerHTML = message.groundingContent;
            shadow.querySelector<HTMLDivElement>(".carousel")!.style.scrollbarWidth = "unset";
        }
    }

    setupMessageRegeneration(messageElement);
    setupMessageClipboard(messageElement);
    setupMessageEditing(messageElement);

    return messageElement;

}

function setupMessageEditing(messageElement: HTMLElement) {
    const editButton = messageElement.querySelector<HTMLButtonElement>(".btn-edit");
    const saveButton = messageElement.querySelector<HTMLButtonElement>(".btn-save");
    const messageText = messageElement.querySelector<HTMLElement>(".message-text-content") || messageElement.querySelector<HTMLElement>(".message-text");

    if (!editButton || !saveButton || !messageText) return;
    // Handle edit button click
    editButton.addEventListener("click", async () => {
        // Store original content to allow cancellation
        messageText.dataset.originalContent = messageText.innerHTML;

        // Enable editing
        console.log(await parserService.parseHtmlToMarkdown(messageText.innerHTML));
        messageText.setAttribute("contenteditable", "true");
        messageText.innerText = await parserService.parseHtmlToMarkdown(messageText.innerHTML) || ""; // Convert HTML to Markdown for editing
        messageText.focus();

        // Show save button, hide edit button
        editButton.style.display = "none";
        saveButton.style.display = "inline-block";
    });

    // Handle save button click
    saveButton.addEventListener("click", async () => {
        const markdownContent = messageText.innerText!;
        console.log("Saving edited message:", markdownContent);
        messageText.innerHTML = await parserService.parseMarkdownToHtml(markdownContent) || ""; // Convert Markdown back to HTML
        hljs.highlightAll(); // Reapply syntax highlighting

        // Disable editing
        messageText.removeAttribute("contenteditable");

        // Show edit button, hide save button
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";

        // Get the message index to update the correct message in chat history
        const messageContainer = document.querySelector(".message-container");
        if (!messageContainer) return;
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);

        // Update the chat history in database
        await updateMessageInDatabase(markdownContent, messageIndex);
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

async function updateMessageInDatabase(markdownContent: string, messageIndex: number) {
    if (!db) return;
    try {
        // Get the current chat and update the specific message
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex] || !markdownContent) return;

        // Update the message content in the parts array
        currentChat.content[messageIndex].parts[0].text = markdownContent;

        // Save the updated chat back to the database
        await db.chats.put(currentChat);
        console.log("Message updated in database");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}
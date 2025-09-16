import * as messageService from "./Message.service"
import * as helpers from "../utils/helpers"
import { Db, db } from "./Db.service";
import { Chat, DbChat } from "../models/Chat";
import { Message } from "../models/Message";
import hljs from "highlight.js";
const messageContainer = document.querySelector<HTMLDivElement>(".message-container");
const chatHistorySection = document.querySelector<HTMLDivElement>("#chatHistorySection");
const sidebar = document.querySelector<HTMLDivElement>(".sidebar");

export function getCurrentChatId() {
    const currentChatElement = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
    if (currentChatElement) {
        return parseInt(currentChatElement.value.replace("chat", ""), 10);
    }
    return null;
}

export async function initialize() {
    const chatContainer = document.querySelector<HTMLDivElement>("#chatHistorySection");
    if (!chatContainer) {
        console.error("Chat container not found");
        return;
    }
    chatContainer.innerHTML = "";
    const chats = await getAllChats(db);
    for (let chat of chats) {
        insertChatEntry(chat);
    }
}

function insertChatEntry(chat: DbChat) {
    //radio button
    const chatRadioButton = document.createElement("input");
    chatRadioButton.setAttribute("type", "radio");
    chatRadioButton.setAttribute("name", "currentChat");
    chatRadioButton.setAttribute("value", "chat" + chat.id);
    chatRadioButton.id = "chat" + chat.id;
    chatRadioButton.classList.add("input-radio-currentchat");

    //label
    const chatLabel = document.createElement("label");
    chatLabel.setAttribute("for", "chat" + chat.id);
    chatLabel.classList.add("title-chat");
    chatLabel.classList.add("label-currentchat");


    // chat title
    const chatLabelText = document.createElement("span");
    chatLabelText.classList.add("chat-title-text");
    chatLabelText.style.overflow = "hidden";
    chatLabelText.style.textOverflow = "ellipsis";
    chatLabelText.textContent = chat.title;

    // chat icon
    const chatIcon = document.createElement("span");
    chatIcon.classList.add("material-symbols-outlined");
    chatIcon.textContent = "chat_bubble";

    // actions dropdown (ellipsis + menu)
    const actionsWrapper = document.createElement("div");
    actionsWrapper.classList.add("chat-actions-wrapper");

    const actionsButton = document.createElement("button");
    actionsButton.classList.add("btn-textual", "material-symbols-outlined", "chat-actions-button");
    actionsButton.setAttribute("aria-haspopup", "true");
    actionsButton.setAttribute("aria-expanded", "false");
    actionsButton.setAttribute("title", "Chat actions");
    actionsButton.textContent = "more_vert"; // material icon for vertical ellipsis

    const menu = document.createElement("div");
    menu.classList.add("chat-actions-menu");
    menu.setAttribute("role", "menu");

    function closeMenu() {
        if (actionsWrapper.classList.contains("open")) {
            actionsWrapper.classList.remove("open");
            actionsButton.setAttribute("aria-expanded", "false");
        }
    }

    function openMenu() {
        if (!actionsWrapper.classList.contains("open")) {
            // close other open menus
            document.querySelectorAll('.chat-actions-wrapper.open').forEach(el => {
                if (el !== actionsWrapper) el.classList.remove('open');
            });
            actionsWrapper.classList.add("open");
            actionsButton.setAttribute("aria-expanded", "true");
        }
    }

    actionsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!actionsWrapper.classList.contains("open")) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    // Menu items
    const editItem = document.createElement("button");
    editItem.classList.add("chat-actions-item");
    editItem.setAttribute("role", "menuitem");
    editItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">edit</span><span>Edit title</span>`;
    editItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        chatLabelText.setAttribute("contenteditable", "true");
        chatLabelText.focus();
        document.execCommand("selectAll", false);
        chatLabelText.addEventListener("blur", async () => {
            chatLabelText.removeAttribute("contenteditable");
            const newTitle = chatLabelText.textContent?.trim() || "";
            if (newTitle && newTitle !== chat.title) {
                await editChat(chat.id, newTitle);
            }
        }, { once: true });
        chatLabelText.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                chatLabelText.blur();
            }
        });
    });

    const deleteItem = document.createElement("button");
    deleteItem.classList.add("chat-actions-item");
    deleteItem.setAttribute("role", "menuitem");
    deleteItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">delete</span><span>Delete</span>`;
    deleteItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        deleteChat(chat.id, db);
    });
    // export single chat
    const exportItem = document.createElement("button");
    exportItem.classList.add("chat-actions-item");
    exportItem.setAttribute("role", "menuitem");
    exportItem.innerHTML = `<span class="material-symbols-outlined chat-action-icon">share</span><span>Export</span>`;
    exportItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        closeMenu();
        await exportChat(chat.id);
    });

    menu.append(editItem, exportItem, deleteItem);
    actionsWrapper.append(actionsButton, menu);

    // close on outside click
    document.addEventListener("click", (e) => {
        if (!actionsWrapper.contains(e.target as Node)) {
            closeMenu();
        }
    });

    // keyboard accessibility
    actionsButton.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeMenu();
            actionsButton.blur();
        } else if ((e.key === "Enter" || e.key === " ") && !actionsWrapper.classList.contains("open")) {
            openMenu();
        } else if (e.key === "ArrowDown") {
            openMenu();
            (menu.querySelector("button") as HTMLButtonElement)?.focus();
        }
    });
    menu.addEventListener("keydown", (e) => {
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button.chat-actions-item"));
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "Escape") {
            closeMenu();
            actionsButton.focus();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            items[(currentIndex + 1) % items.length].focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            items[(currentIndex - 1 + items.length) % items.length].focus();
        }
    });

    chatLabel.append(chatIcon);
    chatLabel.append(chatLabelText);
    chatLabel.append(actionsWrapper);

    chatRadioButton.addEventListener("change", async () => {
        await loadChat(chat.id, db);
        if (window.innerWidth < 1032 && sidebar) {
            helpers.hideElement(sidebar);
        }
    });
    if (chatHistorySection) {
        chatHistorySection.prepend(chatRadioButton, chatLabel);
    }
}

export async function addChat(title: string, content?: Message[]) {
    const chat: Chat = {
        title: title,
        timestamp: Date.now(),
        content: content || []
    };
    const id = await db.chats.put(chat);
    insertChatEntry({ ...chat, id });
    return id;
}

export async function getCurrentChat(db: Db) {
    const id = getCurrentChatId();
    if (!id) {
        return null;
    }
    return (await db.chats.get(id));
}

export async function deleteAllChats(db: Db) {
    await db.chats.clear();
    initialize();
    newChat();
}


export async function deleteChat(id: number, db: Db) {
    await db.chats.delete(id);
    if (getCurrentChatId() == id) {
        newChat();
    }
    initialize();
}

export function newChat() {
    if (!messageContainer) {
        console.error("Message container not found");
        return;
    }
    messageContainer.innerHTML = "";
    document.querySelector("#chat-title")!.textContent = "";
    const checkedInput = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
    if (checkedInput) {
        checkedInput.checked = false;
    }
}

export async function loadChat(chatID: number, db: Db) {
    try {
        if (!chatID || !messageContainer) {
            console.error("Chat ID is null or message container not found");
            throw new Error("Chat ID is null or message container not found");
        }
        messageContainer.innerHTML = ""; // Clear existing messages
        const chat = await db.chats.get(chatID);
        document.querySelector("#chat-title")!.textContent = chat?.title || "";
        for (const msg of chat?.content || []) {
            await messageService.insertMessageV2(msg);
        }
        // Always scroll to bottom when loading a chat
        messageContainer.scrollTo({
            top: messageContainer.scrollHeight,
            behavior: 'instant'
        });
        hljs.highlightAll();
        return chat;
    }
    catch (error) {
        alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
        console.error(error);
    }
}

export async function getAllChats(db: Db): Promise<DbChat[]> {
    const chats = await db.chats.orderBy('timestamp').toArray(); // Get all objects
    return chats;
}

export async function editChat(id: number, title: string) {
    const chat = await db.chats.get(id);
    if (chat) {
        chat.title = title;
        await db.chats.put(chat);
        initialize();
    }
}

export async function exportChat(id: number): Promise<void> {
    const chat = await db.chats.get(id);
    if (!chat) {
        console.error("Chat not found for export", id);
        return;
    }
    // Exclude the id so imported chats get a new one (mirrors exportAllChats behavior)
    const { id: _omit, ...rest } = chat as DbChat & { id: number };
    const blob = new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' });
    // Derive a safe filename from the chat title
    const safeTitle = (chat.title || 'chat').toLowerCase().replace(/[^a-z0-9-_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${safeTitle || 'chat'}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function exportAllChats(): Promise<void> {
    const chats = await getAllChats(db);
    //we remove the id
    const blob = new Blob([JSON.stringify(chats.map(({ id, ...rest }) => rest), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chats.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importChats(file: File): Promise<void> {
    const reader = new FileReader();
    reader.addEventListener('load', async (event) => {
        const content = event.target?.result as string;
        try {
            const chats: Chat[] = JSON.parse(content);
            for (const chat of chats) {
                //we insert the chat with a new ID
                await db.chats.add(chat);
            }
            initialize();
        } catch (error) {
            console.error("Error parsing chat file:", error);
            alert("Failed to import chats. Please ensure the file is in the correct format.");
        }
    });
    reader.readAsText(file);
}
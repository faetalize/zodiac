import * as messageService from "./Message.service"
import * as helpers from "../utils/helpers"
import { Db, db } from "./Db.service";
import { Chat, DbChat } from "../models/Chat";
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

    // delete button
    const deleteEntryButton = document.createElement("button");
    deleteEntryButton.classList.add("btn-textual", "material-symbols-outlined");
    deleteEntryButton.textContent = "delete";
    deleteEntryButton.addEventListener("click", (e) => {
        e.stopPropagation(); //so we don't activate the radio button
        deleteChat(chat.id, db);
    });

    //edit button
    const editEntryButton = document.createElement("button");
    editEntryButton.classList.add("btn-textual", "material-symbols-outlined", "edit-chat-button");
    editEntryButton.textContent = "edit";
    editEntryButton.addEventListener("click", (e) => {
        e.stopPropagation(); //so we don't activate the radio button
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

    chatLabel.append(chatIcon);
    chatLabel.append(chatLabelText);
    chatLabel.append(editEntryButton);
    chatLabel.append(deleteEntryButton);

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

export async function addChat(title: string, db: Db) {
    const chat: Chat = {
        title: title,
        timestamp: Date.now(),
        content: []
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
    const checkedInput = document.querySelector<HTMLInputElement>("input[name='currentChat']:checked");
    if (checkedInput) {
        checkedInput.checked = false;
    }
}

export async function loadChat(chatID: number, db: Db) {
    console.log("Loading chat with ID:", chatID);
    try {
        if (!chatID || !messageContainer) {
            console.error("Chat ID is null or message container not found");
            return;
        }
        const currentChat = await getCurrentChat(db);
        if (currentChat) {
            messageContainer.innerHTML = ""; // Clear existing messages
        }
        const chat = await db.chats.get(chatID);
        for (const msg of chat?.content || []) {
           await messageService.insertMessageV2(msg);
        }
        // Always scroll to bottom when loading a chat
        messageContainer.scrollTo({
            top: messageContainer.scrollHeight,
            behavior: 'instant'
        });
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
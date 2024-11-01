import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
const messageContainer = document.querySelector(".message-container");
let currentChat = null;
const chatHistorySection = document.querySelector("#chatHistorySection");
export function setupDB() {
    let db;
    try {
         db = new Dexie("chatDB");
    } catch (error) {
        console.error(error);
        alert("failed to setup dexie");
        return;
    }
    db.version(3).stores({
        chats: `
        ++id,
        title,
        timestamp,
        content`,
    });
    return db;
}

export function setCurrentChat(id) {
    currentChat = id;
}

export function getCurrentChat() {
    return currentChat;
}

export async function getAllChatIdentifiers(db) {
    try {
        let identifiers = [];
        await db.chats.orderBy('timestamp').each(
            chat => {
                identifiers.push({ id: chat.id, title: chat.title });
            }
        )
        return identifiers;
    } catch (error) {
        //to be implemented
        console.error(error);
    }
}

export async function initializeChats() {
    let chats = await getAllChatIdentifiers();
    for (let chat of chats) {
        insertChatHistory(chat,db);
    }

}

export function insertChatHistory(chat,db) {
    const chatLabel = document.createElement("label");
    chatLabel.setAttribute("for", "chat" + chat.id);
    chatLabel.classList.add("title-chat");
    chatLabel.textContent = chat.title;

    const historyEntry = document.createElement("div");
    historyEntry.classList.add("label-currentchat");

    const chatIcon = document.createElement("span");
    chatIcon.classList.add("material-symbols-outlined");
    chatIcon.innerHTML = "chat_bubble";

    const deleteEntryButton = document.createElement("button");
    deleteEntryButton.classList.add("btn-textual", "material-symbols-outlined");
    deleteEntryButton.textContent = "delete";
    deleteEntryButton.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(chat.id,db);
    })

    historyEntry.append(chatIcon);
    historyEntry.append(chatLabel);
    historyEntry.append(deleteEntryButton);

    chatHistorySection.prepend(historyEntry);

    const chatElement = document.createElement("input");
    chatElement.setAttribute("type", "radio");
    chatElement.setAttribute("name", "currentChat");
    chatElement.setAttribute("value", "chat" + chat.id);
    chatElement.id = "chat" + chat.id;
    chatElement.classList.add("input-radio-currentchat");
    chatHistorySection.prepend(chatElement);
    //
    historyEntry.addEventListener("click", async () => { await onChatSelect(chat.id, chatElement, db); });
}

export async function addChatHistory(title, firstMessage = null, db) {
    try {
        const id = await db.chats.put({
            title: title,
            timestamp: Date.now(),
            content: firstMessage ? [{ role: "user", txt: firstMessage }] : []
        });
        insertChatHistory({ title, id },db);
        return id
    } catch (error) {
        console.error(error);
    }
}

export function getChatHistory() {
    let chatHistory = [];
    [...messageContainer.children].forEach(element => {
        const messageroleapi = element.querySelector(".message-role-api").innerText;
        const messagetext = element.querySelector(".message-text").innerText;
        chatHistory.push({
            role: messageroleapi,
            parts: [{ text: messagetext }]
        })
    });
    return chatHistory;
}

export async function deleteAllChats(db) {
    try {
        await db.chats.clear();
        messageContainer.innerHTML = "";
        chatHistorySection.innerHTML = "";
        currentChat = "";
    }
    catch (error) {
        console.error("error deleting chats: ", error);
    }
}


export async function deleteChat(id,db) {
    try {
        await db.chats.delete(id);
        const input = chatHistorySection.querySelector(`#chat${id}`);
        input.nextElementSibling.remove();
        input.remove();
        if (currentChat == id) {
            messageContainer.innerHTML = "";
            currentChat = null;
        }
    } catch (error) {
        return console.error(error);
    }
}

export function newChat(){
    messageContainer.innerHTML = "";
    currentChat = null;
    //uncheck the current chat for styling purposes
    document.querySelector("input[name='currentChat']:checked").checked = false;
}

export async function onChatSelect(chatID, inputElement,db) {
    try {
        messageContainer.innerHTML = "";
        let chat = await getChatById(chatID,db);
        for await (let msg of chat.content) {
            await insertMessage(msg.role, msg.txt, msg.personality);
        }
        currentChat = chatID;
        messageContainer.scrollTo(0, messageContainer.scrollHeight);
        inputElement.click();
    } catch (error) {
        console.error(error);
    }
}

export async function getAllChats() {
    try {
        const chats = await db.chats.orderBy('timestamp').toArray(); // Get all objects
        chats.reverse() //reverse in order to have the latest chat at the top
        return chats;
    } catch (error) {
        console.error("Error getting titles:", error);
        throw error;
    }
}

export async function getChatById(id, db) {
    try {
        const chat = await db.chats.get(id);
        return chat;
    } catch (error) {
        console.error(error);
    }
}

export async function insertMessage(sender, msgText, selectedPersonalityTitle = null, netStream = null) {
    //create new message div for the user's message then append to message container's top
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    messageContainer.append(newMessage);
    let messageRole;
    //handle model's message
    if (sender != "user") {
        newMessage.classList.add("message-model");
        messageRole = selectedPersonalityTitle;
        newMessage.innerHTML = `
            <div class="message-header"><h3 class="message-role">${messageRole}</h3>
            <button class="btn-refresh btn-textual material-symbols-outlined" >refresh</button></div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <p class="message-text"></p>
            `;
        const refreshButton = newMessage.querySelector(".btn-refresh");
        refreshButton.addEventListener("click", async () => { await regenerate(newMessage)});
        const messageContent = newMessage.querySelector(".message-text");
        //no streaming necessary if not receiving answer
        if (!netStream) {
            messageContent.innerHTML = msgText;
        }
        else {
            let rawText = "";
            for await (const chunk of netStream.stream) {
                try {
                    rawText += chunk.text();
                    messageContent.innerHTML = marked.parse(rawText);
                    messageContainer.scrollTo(0, messageContainer.scrollHeight);

                } catch (error) {
                    alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
                    console.error(error);
                }
            }
            hljs.highlightAll();
            return messageContent.innerHTML;
        }
    }
    else {
        messageRole = "You:";
        newMessage.innerHTML = `
                <div class="message-header">
                    <h3 class="message-role">${messageRole}</h3>
                </div>
                <div class="message-role-api" style="display: none;">${sender}</div>
                <p class="message-text">${msgText}</p>
                `;
        messageContainer.scrollTo(0, messageContainer.scrollHeight);
    }
}
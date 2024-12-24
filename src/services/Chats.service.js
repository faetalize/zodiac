import * as messageService from "./Message.service"
const messageContainer = document.querySelector(".message-container");
const chatHistorySection = document.querySelector("#chatHistorySection");

export function getCurrentChatId() {
    const currentChatElement = document.querySelector("input[name='currentChat']:checked");
    if (currentChatElement) {
        return parseInt(currentChatElement.value.replace("chat", ""), 10);
    }
    return null;
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

export async function initialize(db) {
    const chatContainer = document.querySelector("#chatHistorySection");
    chatContainer.innerHTML = "";
    const chats = await getAllChatIdentifiers(db);
    for (let chat of chats) {
        insertChatEntry(chat, db);
    }
}

function insertChatEntry(chat, db) {
    //radio button
    const chatRadioButton = document.createElement("input");
    chatRadioButton.setAttribute("type", "radio");
    chatRadioButton.setAttribute("name", "currentChat");
    chatRadioButton.setAttribute("value", "chat" + chat.id);
    chatRadioButton.id = "chat" + chat.id;
    chatRadioButton.classList.add("input-radio-currentchat");

    //label
    const chatLabel = document.createElement("label",);
    chatLabel.setAttribute("for", "chat" + chat.id);
    chatLabel.classList.add("title-chat");
    chatLabel.classList.add("label-currentchat");
    chatLabel.textContent = chat.title;

    //
    const chatIcon = document.createElement("span");
    chatIcon.classList.add("material-symbols-outlined");
    chatIcon.textContent = "chat_bubble";

    //
    const deleteEntryButton = document.createElement("button");
    deleteEntryButton.classList.add("btn-textual", "material-symbols-outlined");
    deleteEntryButton.textContent = "delete";
    deleteEntryButton.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(chat.id, db);
    })

    chatLabel.prepend(chatIcon);
    chatLabel.append(deleteEntryButton);


    chatRadioButton.addEventListener("change", async () => {
        await loadChat(chat.id, db);
    });

    chatHistorySection.prepend(chatRadioButton, chatLabel);


}

export async function addChat(title, firstMessage = null, db) {
    const id = await db.chats.put({
        title: title,
        timestamp: Date.now(),
        content: firstMessage ? [{ role: "user", parts: [{ text: firstMessage }] }] : []
    });
    insertChatEntry({ title, id }, db);
    console.log("chat added with id: ", id);
    return id;
}

export async function getCurrentChat(db) {
    const id = getCurrentChatId();
    if (!id) {
        return null;
    }
    return (await getChatById(id, db));
}

export async function deleteAllChats(db) {
    await db.chats.clear();
    initialize(db);
}


export async function deleteChat(id, db) {
    await db.chats.delete(id);
    if (getCurrentChatId() == id) {
        newChat();
    }
    initialize(db);
}

export function newChat() {
    messageContainer.innerHTML = "";
    document.querySelector("input[name='currentChat']:checked").checked = false;
}

export async function loadChat(chatID, db) {
    try {
        if (!chatID) {
            return;
        }
        messageContainer.innerHTML = "";
        const chat = await getChatById(chatID, db);
        for (const msg of chat.content) {
            await messageService.insertMessage(msg.role, msg.parts[0].text, msg.personality, null, db);
        }
        messageContainer.scrollTo(0, messageContainer.scrollHeight);
    }
    catch (error) {
        alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
        console.error(error);
    }
}

export async function getAllChats(db) {
    const chats = await db.chats.orderBy('timestamp').toArray(); // Get all objects
    chats.reverse() //reverse in order to have the latest chat at the top
    return chats;
}

export async function getChatById(id, db) {
    const chat = await db.chats.get(id);
    return chat;
}


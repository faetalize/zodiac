import * as chatsService from "../../services/Chats.service.js";
import * as helpers from "../../utils/helpers.js";

const newChatButton = document.querySelector("#btn-new-chat");
const importChat = document.querySelector("#btn-chat-import");

if (!newChatButton || !importChat) {
    console.error("Chat section button array button is missing.");
    throw new Error("Chat section button array initialization failed.");
}

newChatButton.addEventListener("click", () => {
    //hide sidebar if in mobile view
    if (window.innerWidth <= 1032) {
        const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
        if (sidebar)
            helpers.hideElement(sidebar);
    }
    if (!chatsService.getCurrentChatId()) {
        return;
    }
    chatsService.newChat();
});

importChat.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', async () => {
        await chatsService.importChats(fileInput.files!);
    });
    fileInput.click();
    fileInput.remove();
});
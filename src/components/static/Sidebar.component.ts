import * as helpers from "../../utils/helpers";
import * as overlayService from "../../services/Overlay.service";
import * as personalityService from "../../services/Personality.service";
import * as chatsService from "../../services/Chats.service";
import { db } from "../../services/Db.service";

const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const sidebarViews = document.querySelectorAll<HTMLElement>(".sidebar-section");
const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
const clearAllPersonalitiesButton = document.querySelector("#btn-clearall-personality");
const deleteAllChatsButton = document.querySelector("#btn-reset-chat");
const newChatButton = document.querySelector("#btn-new-chat");
const importPersonalityButton = document.querySelector("#btn-import-personality");
const clearAllDataButton = document.querySelector("#btn-clear-all-data");
const bulkImportChatsButton = document.querySelector("#btn-bulk-import-chats");
const exportAllChatsButton = document.querySelector("#btn-export-all-chats");
const chatSearchInput = document.querySelector<HTMLInputElement>("#chat-search-input");

// Debounce timer for chat search
let chatSearchDebounceTimer: number;

if (!sidebar ||
    !hideSidebarButton ||
    !showSidebarButton ||
    !sidebarViews ||
    !clearAllPersonalitiesButton ||
    !deleteAllChatsButton ||
    !newChatButton ||
    !importPersonalityButton ||
    !exportAllChatsButton ||
    !bulkImportChatsButton ||
    !chatSearchInput ||
    !clearAllDataButton) {
    console.error("Sidebar component is missing some elements. Please check the HTML structure.");
    throw new Error("Sidebar component is not properly initialized.");
}
hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});
showSidebarButton.addEventListener("click", () => {
    helpers.showElement(sidebar, false);
});
clearAllPersonalitiesButton.addEventListener("click", async () => {
    const confirmation = await helpers.confirmDialogDanger("You are about to clear all your custom personalities. This action cannot be undone!");
    if (confirmation) {
        personalityService.removeAll();
    }
});
deleteAllChatsButton.addEventListener("click", async () => {
    const confirmation = await helpers.confirmDialogDanger("You are about to wipe your chats. This action cannot be undone!");
    if (confirmation) {
        await chatsService.deleteAllChats(db);
    }
});
newChatButton.addEventListener("click", () => {
    //hide sidebar if in mobile view
    if (window.innerWidth <= 1032) {
        helpers.hideElement(sidebar);
    }
    if (!chatsService.getCurrentChatId()) {
        return;
    }
    chatsService.newChat();
});

chatSearchInput.addEventListener("input", () => {
    // Clear existing timer
    clearTimeout(chatSearchDebounceTimer);
    
    // Set new timer with 300ms delay
    chatSearchDebounceTimer = window.setTimeout(() => {
        const searchTerm = chatSearchInput.value.toLowerCase();
        const chatHistorySection = document.querySelector("#chatHistorySection");
        if (!chatHistorySection) {
            return;
        }
        const chatElements = chatHistorySection.querySelectorAll<HTMLLabelElement>(".label-currentchat");
        chatElements.forEach(chatElement => {
            const chatName = chatElement.querySelector('.chat-title-text')?.textContent?.toLowerCase();
            if (chatName && chatName.includes(searchTerm)) {
                helpers.showElement(chatElement, true);
            } else {
                helpers.hideElement(chatElement);
            }
        });
    }, 300);
});

exportAllChatsButton.addEventListener("click", async () => {
    await chatsService.exportAllChats();
});

bulkImportChatsButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files![0];
        await chatsService.importChats(file);
    });
    fileInput.click();
    fileInput.remove();
});

importPersonalityButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', () => {
        const file = fileInput.files![0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const personality = JSON.parse(e.target?.result?.toString() || '{}');
            personalityService.add(personality);
        };
        reader.readAsText(file);
    });
    fileInput.click();
    fileInput.remove();
});

clearAllDataButton.addEventListener("click", async () => {
    const confirmation = await helpers.confirmDialogDanger("You are about to clear all your data. This action cannot be undone!");
    if (confirmation) {
        await db.delete();
        localStorage.clear();
        window.location.reload();
    }
});


window.addEventListener("resize", () => {
    //show sidebar if window is resized to desktop size
    if (window.innerWidth > 1032) {
        //to prevent running showElement more than necessary
        if ((sidebar as HTMLElement)?.style.opacity == '0' && sidebar) {
            helpers.showElement(sidebar, false);
        }
    }
});
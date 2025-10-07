import * as helpers from "../../utils/helpers";
import * as personalityService from "../../services/Personality.service";
import * as chatsService from "../../services/Chats.service";
import { db } from "../../services/Db.service";
import "./ChatSearch.component";

const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const sidebarViews = document.querySelectorAll<HTMLElement>(".sidebar-section");
const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
const clearAllPersonalitiesButton = document.querySelector("#btn-clearall-personality");
const deleteAllChatsButton = document.querySelector("#btn-reset-chat");

const importPersonalityButton = document.querySelector("#btn-import-personality");
const clearAllDataButton = document.querySelector("#btn-clear-all-data");
const bulkImportChatsButton = document.querySelector("#btn-bulk-import-chats");
const exportAllChatsButton = document.querySelector("#btn-export-all-chats");

if (!sidebar ||
    !hideSidebarButton ||
    !showSidebarButton ||
    !sidebarViews ||
    !clearAllPersonalitiesButton ||
    !deleteAllChatsButton ||
    !importPersonalityButton ||
    !exportAllChatsButton ||
    !bulkImportChatsButton ||
    !clearAllDataButton) {
    console.error("Sidebar component is missing some elements. Please check the HTML structure.");
    throw new Error("Sidebar component is not properly initialized.");
}
hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});
showSidebarButton.addEventListener("click", () => {
    sidebar.style.display = "flex";
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


exportAllChatsButton.addEventListener("click", async () => {
    await chatsService.exportAllChats();
});

bulkImportChatsButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', async () => {
        await chatsService.importChats(fileInput.files!);
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
            personalityService.add(personality, personality?.id);
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
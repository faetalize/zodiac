import * as helpers from "../../utils/helpers";
import * as personalityService from "../../services/Personality.service";
import * as chatsService from "../../services/Chats.service";
import { db } from "../../services/Db.service";

const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const tabs = document.querySelectorAll<HTMLElement>(".navbar-tab");
const tabHighlight = document.querySelector<HTMLElement>("#navbar-tab-highlight");
const sidebarViews = document.querySelectorAll<HTMLElement>(".sidebar-section");
const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
const clearAllPersonalitiesButton = document.querySelector("#btn-clearall-personality");
const deleteAllChatsButton = document.querySelector("#btn-reset-chat");
const newChatButton = document.querySelector("#btn-new-chat");
const importPersonalityButton = document.querySelector("#btn-import-personality");

if (!sidebar || !hideSidebarButton || !showSidebarButton || !tabHighlight || !tabs || !sidebarViews || !clearAllPersonalitiesButton || !deleteAllChatsButton || !newChatButton || !importPersonalityButton) {
    console.error("Sidebar component is missing some elements. Please check the HTML structure.");
    throw new Error("Sidebar component is not properly initialized.");
}

hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});
showSidebarButton.addEventListener("click", () => {
    helpers.showElement(sidebar, false);
});
clearAllPersonalitiesButton.addEventListener("click", () => {
    personalityService.removeAll();
});
deleteAllChatsButton.addEventListener("click", () => { chatsService.deleteAllChats(db) });
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


window.addEventListener("resize", () => {
    //show sidebar if window is resized to desktop size
    if (window.innerWidth > 1032) {
        //to prevent running showElement more than necessary
        if ((sidebar as HTMLElement)?.style.opacity == '0' && sidebar) {
            helpers.showElement(sidebar, false);
        }
    }
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




let activeTabIndex: number | undefined = undefined;
function navigateTo(tab: HTMLElement) {
    const index = [...tabs].indexOf(tab);
    if (index == activeTabIndex) {
        return;
    }
    tab.classList.add("navbar-tab-active");
    //hide active view before proceeding
    if (activeTabIndex !== undefined) {
        helpers.hideElement(sidebarViews[activeTabIndex]);
        tabs[activeTabIndex].classList.remove("navbar-tab-active");
    }
    helpers.showElement(sidebarViews[index], true);
    activeTabIndex = index;
    tabHighlight!.style.left = `calc(100% / ${tabs.length} * ${index})`;
}
//tab setup
tabHighlight!.style.width = `calc(100% / ${tabs.length})`;
for (const tab of tabs) {
    tab.addEventListener("click", () => {
        navigateTo(tab);
    });
}

navigateTo(tabs[0]);
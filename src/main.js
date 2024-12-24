
import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import * as dbService from './services/Db.service';
import * as helpers from "./utils/helpers";

//load all component code
const components = import.meta.glob('./components/*.js');
for (const path in components) {
    components[path]();
}



settingsService.loadSettings();


//get all chats from indexedDB
await chatsService.initialize(dbService.db);

//initialize personalities
await personalityService.initialize();


//event listeners
const hideOverlayButton = document.querySelector("#btn-hide-overlay");
hideOverlayButton.addEventListener("click", () => overlayService.closeOverlay());

const addPersonalityButton = document.querySelector("#btn-add-personality");
addPersonalityButton.addEventListener("click", () => overlayService.showAddPersonalityForm());



const newChatButton = document.querySelector("#btn-new-chat");
newChatButton.addEventListener("click", () => {
    if (!chatsService.getCurrentChatId()) {
        return
    }
    chatsService.newChat();
});







const clearAllButton = document.querySelector("#btn-clearall-personality");
clearAllButton.addEventListener("click", () => {
    personalityService.removeAll();
});

const deleteAllChatsButton = document.querySelector("#btn-reset-chat");
deleteAllChatsButton.addEventListener("click", () => { chatsService.deleteAllChats(dbService.db) });


const importPersonalityButton = document.querySelector("#btn-import-personality");
importPersonalityButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const personality = JSON.parse(e.target.result);
            personalityService.add(personality);
        };
        reader.readAsText(file);
    });
    fileInput.click();
    fileInput.remove();
});

window.addEventListener("resize", () => {
    //show sidebar if window is resized to desktop size
    if (window.innerWidth > 1032) {
        const sidebarElement = document.querySelector(".sidebar");
        //to prevent running showElement more than necessary, we check the opacity.
        if (sidebarElement.style.opacity == 0) {
            console.log("condition true");
            helpers.showElement(sidebarElement, false);
        }
    }
});



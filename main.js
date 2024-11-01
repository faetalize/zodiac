import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
import * as personalityService from "./services/Personality.service";
import * as helpers from "./utils/helpers.util";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import { createPersonalityCard } from "./components/Personality.component";
import * as stepper from "./components/Stepper.component";






const version = "0.8";

const messageInput = document.querySelector("#messageInput");

//buttons
const sendMessageButton = document.querySelector("#btn-send");
const clearAllButton = document.querySelector("#btn-clearall-personality");
const whatsNewButton = document.querySelector("#btn-whatsnew");
const submitNewPersonalityButton = document.querySelector("#btn-submit-personality");
const importPersonalityButton = document.querySelector("#btn-import-personality");
const addPersonalityButton = document.querySelector("#btn-add-personality");
const hideOverlayButton = document.querySelector("#btn-hide-overlay");
const submitPersonalityEditButton = document.querySelector("#btn-submit-personality-edit");
const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const deleteAllChatsButton = document.querySelector("#btn-reset-chat");
const newChatButton = document.querySelector("#btn-new-chat");

//containers
const sidebar = document.querySelector(".sidebar");
const formsOverlay = document.querySelector(".overlay");

//misc
const badge = document.querySelector("#btn-whatsnew");
overlayService.showAddPersonalityForm();

//setup tabs
helpers.tabsFirstTimeSetup();

settingsService.loadSettings();

//load personalities on launch
personalityService.initializePersonalities();


//setup version number on badge and header
badge.querySelector("#badge-version").textContent = `v${version}`;
document.getElementById('header-version').textContent += `v${version}`;

//show whats new on launch if new version
const prevVersion = localStorage.getItem("version");
if (prevVersion != version) {
    localStorage.setItem("version", version);
    badge.classList.add("badge-highlight");
    setTimeout(() => {
        badge.classList.remove("badge-highlight");
    }, 7000);
}

//indexedDB setup
let db = chatsService.setupDB();

//get all chats and load them in the template
let chats = await chatsService.getAllChatIdentifiers(db);
for (let chat of chats) {
    chatsService.insertChatHistory(chat, db);
}


//event listeners
hideOverlayButton.addEventListener("click", overlayService.closeOverlay);

addPersonalityButton.addEventListener("click", overlayService.showAddPersonalityForm);

sendMessageButton.addEventListener("click", async () => {
    try {
        await run(messageInput, personalityService.getSelectedPersonality(), chatsService.getChatHistory());
    } catch (error) {
        console.error(error);
        alert(error)
    }
});

newChatButton.addEventListener("click", () => {
    if (!chatsService.getCurrentChat()) {
        return
    }
    chatsService.newChat();
});

//enter key to send message but support shift+enter for new line
messageInput.addEventListener("keydown", (e) => {
    if (e.key == "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessageButton.click();
    }
});

whatsNewButton.addEventListener("click", showWhatsNew);

hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});

showSidebarButton.addEventListener("click", () => {
    helpers.showElement(sidebar, false);
});

clearAllButton.addEventListener("click", () => {
    personalityService.clearAllPersonalities();
});

deleteAllChatsButton.addEventListener("click", () => { chatsService.deleteAllChats(db) });

importPersonalityButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const personalityJSON = JSON.parse(e.target.result);
            personalityService.insertPersonality(createPersonalityCard(personalityJSON));
            personalityService.addPersonality(personalityJSON);
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

messageInput.addEventListener("blur", () => {
});

//hmm
messageInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.originalEvent || e).clipboardData.getData('text/plain');
    document.execCommand("insertText", false, text);
});

messageInput.addEventListener("input", () => {
    if (messageInput.innerHTML == "<br>") {
        messageInput.innerHTML = "";
    }
});


function getSanitized(string) {
    return DOMPurify.sanitize(string.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim());
}

function showWhatsNew() {
    const whatsNewDiv = document.querySelector("#whats-new");
    helpers.showElement(formsOverlay, false);
    helpers.showElement(whatsNewDiv, false);
}

async function run(msg, selectedPersonality, history) {
    if (!selectedPersonality) {
        return;
    }
    const selectedPersonalityTitle = selectedPersonality.name;
    const selectedPersonalityDescription = selectedPersonality.description;
    const selectedPersonalityPrompt = selectedPersonality.prompt;

    if (!settingsService.getSettings().apiKey) {
        alert("Please enter an API key");
        return;
    }

    let msgText = getSanitized(msg.textContent);
    if (!msgText) {
        return;
    }
    const genAI = new GoogleGenerativeAI(settingsService.getSettings().apiKey);

    //get selected model version
    const version = document.querySelector("#selectedModel").value;

    const model = genAI.getGenerativeModel({ model: version, safetySettings: settingsService.getSafetySettings() });

    //user msg handling
    await chatsService.insertMessage("user", msgText);
    msg.textContent = "";
    if (!chatsService.getCurrentChat()) {
        const result = await model.generateContent('Please generate a short title for the following request from a user, only reply with the short title, nothing else: ' + msgText);
        const title = (await result.response).text();
        chatsService.setCurrentChat(await chatsService.addChatHistory(title, msgText, db));
        document.querySelector(`#chat${chatsService.getCurrentChat()}`).click();
    }
    else {
        const currentChatHistory = await chatsService.getChatById(chatsService.getCurrentChat(), db);
        currentChatHistory.content.push({ role: "user", txt: msgText });
        await db.chats.put(currentChatHistory);
    }

    //model msg handling
    const generationConfig = {
        maxOutputTokens: settingsService.getSettings().maxTokens,
        temperature: settingsService.getSettings().temperature / 100
    };
    const safetySettings = settingsService.getSafetySettings();
    const chat = await model.startChat({
        generationConfig, safetySettings,
        history: [
            {
                role: "user",
                parts: [{ text: `Personality Name: ${selectedPersonalityTitle}, Personality Description: ${selectedPersonalityDescription}, Personality Prompt: ${selectedPersonalityPrompt}. ${settingsService.getSystemPrompt()}` }]
            },
            {
                role: "model",
                parts: [{ text: `Okay. From now on, I shall play the role of ${selectedPersonalityTitle}. Your prompt and described personality will be used for the rest of the conversation.` }]
            },
            ...history
        ]
    });
    const stream = await chat.sendMessageStream(msgText);
    const replyHTML = await chatsService.insertMessage("model", "", selectedPersonalityTitle, stream);
    const currentChatHistory = await chatsService.getChatById(chatsService.getCurrentChat(), db);
    currentChatHistory.content.push({ role: "model", personality: selectedPersonalityTitle, txt: replyHTML });
    //this replaces the existing chat history in the DB
    await db.chats.put(currentChatHistory);

    settingsService.saveSettings();
}

async function regenerate(messageElement) {
    const lastMessageElement = messageElement.previousElementSibling;
    messageInput.value = lastMessageElement.querySelector(".message-text").textContent;
    let i = 0;
    for (let message of messageContainer.children) {
        if (messageElement == message) {
            const newMessages = [...messageContainer.children].slice(0, i - 1);
            messageContainer.replaceChildren(...newMessages);
            let currentChatHistory = await getChatById(chatsService.getCurrentChat(), db);
            currentChatHistory.content = currentChatHistory.content.slice(0, i - 1);
            await db.chats.put(currentChatHistory);
            break;
        }
        i++;
    }

    run(messageInput, personalityService.getSelectedPersonality(), getChatHistory());
}

//-------------------------------
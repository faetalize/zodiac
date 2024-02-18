import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
import { HarmBlockThreshold, HarmCategory } from "https://esm.run/@google/generative-ai";

const version = "0.1.2";


const safetySettings = [

    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    }
];
const systemPrompt = "If needed, format your answer using markdown." +
    "Today's date is" + new Date().toDateString() + "." +
    "End of system prompt.";

//load api key from local storage into input field
const API_KEY = document.querySelector("#apiKeyInput");
const maxTokens = document.querySelector("#maxTokens");
API_KEY.value = localStorage.getItem("API_KEY");
maxTokens.value = localStorage.getItem("maxTokens");
if (maxTokens.value == "") maxTokens.value = 1000;


function hideElement(element) {
    element.style.transition = 'opacity 0.2s';
    element.style.opacity = '0';
    setTimeout(function () {
        element.style.display = 'none';
    }, 200);
}

function showElement(element) {
    // Wait for other transitions to complete (0.2s delay)
    setTimeout(function () {
        // Change display property
        element.style.display = 'flex';
        // Wait for next frame for display change to take effect
        requestAnimationFrame(function () {
            // Start opacity transition
            element.style.transition = 'opacity 0.2s';
            element.style.opacity = '1';
        });
    }, 200);
}


const tabs = document.querySelectorAll(".navbar-tab");
const sidebarViews = document.querySelectorAll(".sidebar-section");
const highlight = document.querySelector(".navbar-tab-highlight");
highlight.style.width = `calc(100% / ${tabs.length})`;



let currentTab = undefined;
function navigateTo(tab) {
    if (tab == tabs[currentTab]) {
        return;
    }
    // set the highlight to match the size of the tab element


    let tabIndex = [...tabs].indexOf(tab);
    if (tabIndex < 0 || tabIndex >= sidebarViews.length) {
        console.error("Invalid tab index: " + tabIndex);
        return;
    }

    if (currentTab != undefined) {
        hideElement(sidebarViews[currentTab]);
    }
    showElement(sidebarViews[tabIndex]);
    currentTab = tabIndex;

    highlight.style.left = `calc(100% / ${tabs.length} * ${tabIndex})`;

}

tabs.forEach(tab => {
    tab.addEventListener("click", () => {

        navigateTo(tab);
    })
});

sidebarViews.forEach(view => {
    hideElement(view);
});

navigateTo(tabs[0]);


const personalityCardsInnerInput = document.querySelectorAll(".card-personality input");
let personalityCards = document.getElementsByClassName("card-personality");
const formsOverlay = document.querySelector(".overlay");
const hideOverlayButton = document.querySelector("#btn-hide-overlay");
const addPersonalityForm = document.querySelector("#form-add-personality");
const addPersonalityButton = document.querySelector("#btn-add-personality");
const editDefaultPersonalityForm = document.querySelector("#form-edit-personality");
const editDefaultPersonalityButton = document.querySelector("#btn-edit-personality-default");
const submitNewPersonalityButton = document.querySelector("#btn-submit-personality");
const resetChatButton = document.querySelector("#btn-reset-chat");
const importPersonalityButton = document.querySelector("#btn-import-personality");
const messageContainer = document.querySelector(".message-container");
const sendMessageButton = document.querySelector("#btn-send");
const clearAllButton = document.querySelector("#btn-clearall-personality");
const whatsNewButton = document.querySelector("#btn-whatsnew");



function darkenBg(element) {
    let elementBackgroundImageURL = element.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '');
    element.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${elementBackgroundImageURL}')`;
}


function lightenBg(element) {

    let elementBackgroundImageURL = element.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '');
    element.style.backgroundImage = `url('${elementBackgroundImageURL}')`;
}


function sharePersonality(personality) {
    //export personality to json
    const personalityJSON = {
        name: personality.querySelector(".personality-title").innerText,
        description: personality.querySelector(".personality-description").innerText,
        prompt: personality.querySelector(".personality-prompt").innerText,
        //base64 encode image
        image: personality.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '')
    }
    const personalityJSONString = JSON.stringify(personalityJSON);
    //download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityJSONString));
    element.setAttribute('download', `${personalityJSON.name}.json`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);


}


function showAddPersonalityForm() {
    showElement(formsOverlay);
    showElement(addPersonalityForm);
}

function showEditPersonalityForm() {
    showElement(formsOverlay);
    showElement(editDefaultPersonalityForm);
}

function closeOverlay() {
    hideElement(formsOverlay);
    hideElement(addPersonalityForm);
    hideElement(editDefaultPersonalityForm);
    hideElement(document.querySelector("#whats-new"));
}


function insertPersonality(personalityJSON) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");

    const personalityCard = document.createElement("label");
    personalityCard.classList.add("card-personality");
    personalityCard.style.backgroundImage = `url('${personalityJSON.image}')`;
    personalityCard.innerHTML = `
            <input type="radio" name="personality" value="${personalityJSON.name}">
            <div>
                <h3 class="personality-title">${personalityJSON.name}</h3>
                <p class="personality-description">${personalityJSON.description}</p>
                <p class="personality-prompt">${personalityJSON.prompt}</p>
            </div>
            <button class="btn-textual btn-edit-card material-symbols-outlined" 
                id="btn-edit-personality-${personalityJSON.name}">edit</button>
            <button class="btn-textual btn-share-card material-symbols-outlined" 
                id="btn-share-personality-${personalityJSON.name}">share</button>
            <button class="btn-textual btn-delete-card material-symbols-outlined"
                id="btn-delete-personality-${personalityJSON.name}">delete</button>
            `;

    //insert personality card before the button array
    personalitiesDiv.append(personalityCard);

    darkenBg(personalityCard);

    personalityCards = document.querySelectorAll(".card-personality");
    //add input event listener
    personalityCard.querySelector("input").addEventListener("change", () => {
        // Darken all cards
        personalityCards.forEach(card => {
            const cardBackgroundImageURL = card.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '');
            card.style.outline = "0px solid rgb(150 203 236)";
            darkenBg(card);
        })

        // Lighten selected card
        personalityCard.style.outline = "3px solid rgb(150 203 236)";
        lightenBg(personalityCard);
    })

    const sharebtn = personalityCard.querySelector(".btn-share-card");
    sharebtn.addEventListener("click", () => {
        sharePersonality(personalityCard);
    });

    const deletebtn = personalityCard.querySelector(".btn-delete-card");
    deletebtn.addEventListener("click", () => {
        deleteLocalPersonality(Array.prototype.indexOf.call(personalityCard.parentNode.children, personalityCard));
        personalityCard.remove();
    });
}

function setLocalPersonality(personalityJSON) {
    const savedPersonalities = JSON.parse(localStorage.getItem("personalities"));
    let newSavedPersonalities = [];
    if (savedPersonalities) {
        newSavedPersonalities = [...savedPersonalities, personalityJSON];
    }
    else {
        newSavedPersonalities = [personalityJSON];
    }
    localStorage.setItem("personalities", JSON.stringify(newSavedPersonalities));
}

function submitNewPersonality() {
    const personalityName = document.querySelector("#form-add-personality #personalityNameInput");
    const personalityDescription = document.querySelector("#form-add-personality #personalityDescriptionInput");
    const personalityImageURL = document.querySelector("#form-add-personality #personalityImageURLInput");
    const personalityPrompt = document.querySelector("#form-add-personality #personalityPromptInput");

    if (personalityName.value == "") {
        alert("Please enter a personality name");
        return;
    }
    if (personalityPrompt.value == "") {
        alert("Please enter a personality prompt");
        return;
    }

    //to json
    const personalityJSON = {
        name: personalityName.value,
        description: personalityDescription.value,
        prompt: personalityPrompt.value,
        image: personalityImageURL.value
    }
    insertPersonality(personalityJSON);
    setLocalPersonality(personalityJSON);
    closeOverlay();
}

function getLocalPersonalities() {
    const personalitiesJSON = localStorage.getItem("personalities");
    return personalitiesJSON;
}
function deleteLocalPersonality(index) {
    let localPers = JSON.parse(getLocalPersonalities());
    localPers.splice(index, 1);
    localStorage.setItem("personalities", JSON.stringify(localPers));
}

function getSanitized(string) {
    return DOMPurify.sanitize(string.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim());
}

function showWhatsNew() {
    const whatsNewDiv = document.querySelector("#whats-new");
    showElement(formsOverlay);
    showElement(whatsNewDiv);
}

async function run() {
    const msg = document.querySelector("#messageInput");
    let msgText = getSanitized(msg.value);
    msg.value = "";
    document.getElementById('messageInput').style.height = "2.5rem"; //This will reset messageInput box to its normal size.
    if (msgText == "") {
        return;
    }
    const maxTokens = document.querySelector("#maxTokens");
    const API_KEY = document.querySelector("#apiKeyInput");
    const selectedPersonalityTitle = document.querySelector("input[name='personality']:checked + div .personality-title").innerText;
    const selectedPersonalityDescription = document.querySelector("input[name='personality']:checked + div .personality-description").innerText;
    const selectedPersonalityPrompt = document.querySelector("input[name='personality']:checked + div .personality-prompt").innerText;

    //chat history
    let chatHistory = [];
    //get chat history from message container
    const messageElements = messageContainer.querySelectorAll(".message");
    messageElements.forEach(element => {
        const messageroleapi = element.querySelector(".message-role-api").innerText;
        const messagetext = element.querySelector(".message-text").innerText;
        chatHistory.push({
            role: messageroleapi,
            parts: [{ text: messagetext }]
        })
    })
    //reverse order of chat history
    chatHistory.reverse();

    //
    const toneExamples = [];


    if (API_KEY.value == "") {
        alert("Please enter an API key");
        return;
    }

    const generationConfig = {
        maxOutputTokens: maxTokens.value,
        temperature: 0.9
    };
    const genAI = new GoogleGenerativeAI(API_KEY.value);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const chat = model.startChat({
        generationConfig, safetySettings,
        history: [
            {
                role: "user",
                parts: [{ text: `Personality Name: ${selectedPersonalityTitle}, Personality Description: ${selectedPersonalityDescription}, Personality Prompt: ${selectedPersonalityPrompt}. ${systemPrompt}` }]
            },
            {
                role: "model",
                parts: [{ text: `Okay. From now on, I shall play the role of ${selectedPersonalityTitle}. Your prompt and described personality will be used for the rest of the conversation.` }]
            },
            ...toneExamples,
            ...chatHistory
        ]
    })

    //create new message div for the user's message then append to message container's top
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    newMessage.innerHTML = `
            <h3 class="message-role">You:</h3>
            <div class="message-role-api" style="display: none;">user</div>
            <p class="message-text">${msgText}</p>
            `;
    messageContainer.insertBefore(newMessage, messageContainer.firstChild);

    const result = await chat.sendMessageStream(msgText);

    //create new message div for the model's reply then append to message container's top
    const newReply = document.createElement("div");
    newReply.classList.add("message");
    newReply.classList.add("message-model");
    newReply.innerHTML = `
            <h3 class="message-role">${selectedPersonalityTitle}:</h3>
            <div class="message-role-api" style="display: none;">model</div>
            <p class="message-text">`;

    //get the p element inside the message div
    const replyText = newReply.querySelector(".message-text");


    messageContainer.insertBefore(newReply, messageContainer.firstChild);

    let rawText = "";
    for await (const chunk of result.stream) {
        rawText += chunk.text();

        replyText.innerHTML = DOMPurify.sanitize(marked.parse(rawText));
        void replyText.offsetHeight; // Force reflow
        hljs.highlightAll();
    }

    //save api key to local storage
    localStorage.setItem("API_KEY", API_KEY.value);
    localStorage.setItem("maxTokens", maxTokens.value);

}

//reset chat button (async)
resetChatButton.addEventListener("click", () => {
    //remove all messages
    messageContainer.innerHTML = "";
});


const messageInput = document.querySelector("#messageInput");

//if more than one line, set height to scrollheight, and revert upon delete
messageInput.addEventListener("input", () => {
    if (messageInput.value.split("\n").length == 1) {
        messageInput.style.height = "2.5rem";
    }
    else {
        messageInput.style.height = "";
        messageInput.style.height = messageInput.scrollHeight + "px";
    }
})


const sidebarDismissButton = document.querySelector("#btn-hide-sidebar");
sidebarDismissButton.addEventListener("click", () => {
    hideElement(document.querySelector(".sidebar"));
})

const showSidebarButton = document.querySelector("#btn-show-sidebar");
showSidebarButton.addEventListener("click", () => {
    showElement(document.querySelector(".sidebar"));
})


//unhide sidebar if width > 768px (event hander)
window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
        showElement(document.querySelector(".sidebar"));
    }
});

//load personalities on launch
const personalitiesArray = JSON.parse(localStorage.getItem("personalities"));
if (personalitiesArray) {
    for (let personality of personalitiesArray) {
        insertPersonality(personality);
    }
}

//version number
const badge = document.querySelector("#btn-whatsnew");
badge.innerText = `v${version}`;
document.getElementById('header-version').textContent += ` v${version}`;

//show whats new on launch if new version
const prevVersion = localStorage.getItem("version");
if (prevVersion != version) {
    localStorage.setItem("version", version);
    showWhatsNew();
}

//event listeners
hideOverlayButton.addEventListener("click", closeOverlay);

addPersonalityButton.addEventListener("click", showAddPersonalityForm);

editDefaultPersonalityButton.addEventListener("click", showEditPersonalityForm);

submitNewPersonalityButton.addEventListener("click", submitNewPersonality);

sendMessageButton.addEventListener("click", run);

whatsNewButton.addEventListener("click", showWhatsNew);

clearAllButton.addEventListener("click", () => {
    localStorage.removeItem("personalities");
})

importPersonalityButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const personalityJSON = JSON.parse(e.target.result);
            insertPersonality(personalityJSON);
            setLocalPersonality(personalityJSON);
        };
        reader.readAsText(file);
    });
    fileInput.click();
    fileInput.remove();
});

//handle share button click
for (let card of personalityCards) {
    const shareButton = card.querySelector(".btn-share-card");
    shareButton.addEventListener("click", () => {
        sharePersonality(card);
    });
}

//handle delete button click
for (let card of personalityCards) {
    const deleteButton = card.querySelector(".btn-delete-card");
    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            deleteLocalPersonality(Array.prototype.indexOf.call(card.parentNode.children, card));
            card.remove();
        });
    }
}

//handle radio input check change
for (let input of personalityCardsInnerInput) {
    input.addEventListener("change", () => {
        // Darken all cards
        personalityCards.forEach(card => {
            const cardBackgroundImageURL = card.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '');
            card.style.outline = "0px solid rgb(150 203 236)";
            darkenBg(card);
        })

        // Lighten selected card
        input.parentElement.style.outline = "3px solid rgb(150 203 236)";
        lightenBg(input.parentElement);
    })
    // Set initial outline
    if (input.checked) {
        lightenBg(input.parentElement);
        input.parentElement.style.outline = "3px solid rgb(150 203 236)";
    }
}
// ...
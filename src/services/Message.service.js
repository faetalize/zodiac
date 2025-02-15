//handles sending messages to the api

import { GoogleGenerativeAI } from "@google/generative-ai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

export async function send(msg, db) {
    //some checks
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) {
        return;
    }
    const settings = settingsService.getSettings();
    if (settings.apiKey === "") {
        alert("Please enter an API key");
        return;
    }
    if (!msg) {
        return;
    }
    //model setup
    const generativeModel = new GoogleGenerativeAI(settings.apiKey).getGenerativeModel({
        model: settings.model,
        systemInstruction: settingsService.getSystemPrompt()
    });
    //user msg handling

    if (!await chatsService.getCurrentChat(db)) { //we create a new chat if there is none is currently selected
        const result = await generativeModel.generateContent('Please generate a short title for the following request from a user, only reply with the short title, nothing else: ' + msg);
        const title = result.response.text()
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }
    await insertMessage("user", msg);
    //model reply
    const generationConfig = {
        maxOutputTokens: settings.maxTokens,
        temperature: settings.temperature / 100
    };
    const chat = generativeModel.startChat({
        generationConfig, safetySettings: settings.safetySettings,
        history: [
            {
                role: "user",
                parts: [{ text: `Personality Name: ${selectedPersonality.name}, Personality Description: ${selectedPersonality.description}, Personality Prompt: ${selectedPersonality.prompt}. Your level of aggression is ${selectedPersonality.aggressiveness} out of 3. Your sensuality is ${selectedPersonality.sensuality} out of 3.` }]
            },
            {
                role: "model",
                parts: [{ text: "okie dokie. from now on, I will be acting as the personality you have chosen" }]
            },
            ...(selectedPersonality.toneExamples ? selectedPersonality.toneExamples.map((tone) => {
                return { role: "model", parts: [{ text: tone }] }
            }) : []),
            ...(await chatsService.getCurrentChat(db)).content.map((msg) => {
                return { role: msg.role, parts: msg.parts } //we remove the `personality` property as the API expects only `role` and `parts`
            })
        ]
    });
    const stream = await chat.sendMessageStream(msg);
    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db);
    //save chat history and settings
    const currentChat = await chatsService.getCurrentChat(db);
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    currentChat.content.push({ role: "model", personality: selectedPersonality.name, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

async function regenerate(responseElement, db) {
    //basically, we remove every message after the response we wish to regenerate, then send the message again.
    const message = responseElement.previousElementSibling.querySelector(".message-text").textContent;
    const elementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);

    chat.content = chat.content.slice(0, elementIndex - 1);
    await db.chats.put(chat);
    await chatsService.loadChat(chat.id, db);
    await send(message, db);
}



export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null) {
    //create new message div for the user's message then append to message container's top
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);
    //handle model's message
    if (sender != "user") {
        newMessage.classList.add("message-model");
        const messageRole = selectedPersonalityTitle;
        newMessage.innerHTML = `
            <div class="message-header"><h3 class="message-role">${messageRole}</h3>
            <button class="btn-refresh btn-textual material-symbols-outlined" >refresh</button></div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text"></div>
            `;
        const refreshButton = newMessage.querySelector(".btn-refresh");
        refreshButton.addEventListener("click", async () => {
            try {
                await regenerate(newMessage, db)
            } catch (error) {
                if (error.status === 429) {
                    alert("Error, you have reached the API's rate limit. Please try again later or use the Flash model.");
                    return;
                }
                alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
                console.error(error);
            }
        });
        const messageContent = newMessage.querySelector(".message-text");
        //no streaming necessary if not receiving answer
        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg);
        }
        else {
            let rawText = "";
            for await (const chunk of netStream.stream) {
                try {
                    
                    rawText += chunk.text();
                    messageContent.innerHTML = marked.parse(rawText, { breaks: true }); //convert md to HTML
                    helpers.messageContainerScrollToBottom();
                } catch (error) {
                    alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
                    console.error(error);
                    return;
                }
            }
            hljs.highlightAll();
            helpers.messageContainerScrollToBottom();
            return { HTML: messageContent.innerHTML, md: rawText };
        }
    }
    //handle user's message, expect encoded
    else {
        const messageRole = "You:";
        newMessage.innerHTML = `
                <div class="message-header">
                    <h3 class="message-role">${messageRole}</h3>
                </div>
                <div class="message-role-api" style="display: none;">${sender}</div>
                <div class="message-text">${helpers.getDecoded(msg)}</div>
                `;
    }
    hljs.highlightAll();
}
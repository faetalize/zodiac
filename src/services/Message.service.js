//handles sending messages to the api

import { GoogleGenAI } from "@google/genai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) {
        return;
    }
    if (settings.apiKey === "") {
        alert("Please enter an API key");
        return;
    }
    if (!msg) {
        return;
    }
    //model setup
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const config = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
        systemPrompt: settingsService.getSystemPrompt(),
        safetySettings: settings.safetySettings,
        responseMimeType: "text/plain"
    };
    
    //user msg handling
    //we create a new chat if there is none is currently selected
    if (!await chatsService.getCurrentChat(db)) { 
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
        });
        const title = response.text;
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }
    await insertMessage("user", msg);
    helpers.messageContainerScrollToBottom();
    //model reply
    
    
    // Create chat history
    const history = [
        {
            role: "user",
            parts: [{ text: `Personality Name: ${selectedPersonality.name}, Personality Description: ${selectedPersonality.description}, Personality Prompt: ${selectedPersonality.prompt}. Your level of aggression is ${selectedPersonality.aggressiveness} out of 3. Your sensuality is ${selectedPersonality.sensuality} out of 3.` }]
        },
        {
            role: "model",
            parts: [{ text: "okie dokie. from now on, I will be acting as the personality you have chosen" }]
        }
    ];
    
    // Add tone examples if available
    if (selectedPersonality.toneExamples) {
        history.push(
            ...selectedPersonality.toneExamples.map((tone) => {
                return { role: "model", parts: [{ text: tone }] }
            })
        );
    }
    
    // Add chat history
    const currentChat = await chatsService.getCurrentChat(db);
    history.push(
        ...currentChat.content.map((msg) => {
            return { role: msg.role, parts: msg.parts } //we remove the `personality` property as the API expects only `role` and `parts`
        })
    );
    
    // Create chat session
    const chat = ai.chats.create({
        model: settings.model,
        history: history,
        config: config
    });
    
    // Send message with streaming
    const stream = await chat.sendMessageStream({
        message: msg
    });
    
    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image);
    //save chat history and settings
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
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



function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector(".btn-edit");
    const saveButton = messageElement.querySelector(".btn-save");
    const messageText = messageElement.querySelector(".message-text");
    
    if (!editButton || !saveButton) return;
    
    // Handle edit button click
    editButton.addEventListener("click", () => {
        // Enable editing
        messageText.setAttribute("contenteditable", "true");
        messageText.focus();
        
        // Show save button, hide edit button
        editButton.style.display = "none";
        saveButton.style.display = "inline-block";
        
        // Store original content to allow cancellation
        messageText.dataset.originalContent = messageText.innerHTML;
        
        // Place cursor at the end
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(messageText);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    });
    
    // Handle save button click
    saveButton.addEventListener("click", async () => {
        // Disable editing
        messageText.removeAttribute("contenteditable");
        
        // Show edit button, hide save button
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";
        
        // Get the message index to update the correct message in chat history
        const messageContainer = document.querySelector(".message-container");
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
        
        // Update the chat history in database
        await updateMessageInDatabase(messageElement, messageIndex, db);
    });
    
    // Handle keydown events in the editable message
    messageText.addEventListener("keydown", (e) => {
        // Save on Enter key (without shift for newlines)
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveButton.click();
        }
        
        // Cancel on Escape key
        if (e.key === "Escape") {
            messageText.innerHTML = messageText.dataset.originalContent;
            messageText.removeAttribute("contenteditable");
            editButton.style.display = "inline-block";
            saveButton.style.display = "none";
        }
    });
}

async function updateMessageInDatabase(messageElement, messageIndex, db) {
    if (!db) return;
    
    try {
        // Get the updated message text
        const messageText = messageElement.querySelector(".message-text").innerHTML;
        const rawText = messageText.replace(/<[^>]*>/g, "").trim(); // Strip HTML for storing in parts
        
        // Get the current chat and update the specific message
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex]) return;
        
        // Update the message content in the parts array
        currentChat.content[messageIndex].parts[0].text = rawText;
        
        // Save the updated chat back to the database
        await db.chats.put(currentChat);
        console.log("Message updated in database");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}

export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null) {
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
            <div class="message-header">
                <img class="pfp" src="${pfpSrc}" loading="lazy"></img>
                <h3 class="message-role">${messageRole}</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
                </div>
            </div>
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
            try {
                // In the new API, we receive an iterable stream
                for await (const chunk of netStream) {
                    // The chunks will have text property that contains content
                    if (chunk && chunk.text) {
                        rawText += chunk.text;
                        messageContent.innerHTML = marked.parse(rawText, { breaks: true }); //convert md to HTML
                        helpers.messageContainerScrollToBottom();
                    }
                }
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                return { HTML: messageContent.innerHTML, md: rawText };
            } catch (error) {
                alert("Error processing response: " + error);
                console.error("Stream error:", error);
                return { HTML: messageContent.innerHTML, md: rawText };
            }
        }
    }
    //handle user's message, expect encoded
    else {
        const messageRole = "You:";
        newMessage.innerHTML = `
                <div class="message-header">
                    <h3 class="message-role">${messageRole}</h3>
                    <div class="message-actions">
                        <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                        <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    </div>
                </div>
                <div class="message-role-api" style="display: none;">${sender}</div>
                <div class="message-text">${helpers.getDecoded(msg)}</div>
                `;
    }
    hljs.highlightAll();
    
    // Setup edit functionality for the message
    setupMessageEditing(newMessage, db);
}
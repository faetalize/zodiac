import * as chatService from "../../services/Chats.service"
import { Message } from "../../models/Message";

const generateRandomChatsButton = document.querySelector<HTMLButtonElement>("#btn-debug-chats");
const generateRandomPersonalitiesButton = document.querySelector<HTMLButtonElement>("#btn-debug-personalities");

if (!generateRandomChatsButton || !generateRandomPersonalitiesButton) {
    console.error("Debug buttons not found");
    throw new Error("DebugButtons component is not properly initialized.");
}


const titles = ["Chat about AI", "Discussing the future", "Random Thoughts", "Tech Talk", "Daily Musings", "Philosophy Chat", "Science Discussion", "Book Club", "Movie Reviews", "Travel Plans"];

const userMessages = [
    "Hey there, how's it going?",
    "What do you think about this weather?",
    "I had the weirdest dream last night",
    "Can you help me with something?",
    "Tell me a joke",
    "What's your favorite color?",
    "I'm thinking about getting a pet",
    "Do you like pizza?",
    "What should I watch tonight?",
    "I'm feeling a bit tired today",
    "Have you ever been to Mars?",
    "What's the meaning of life?",
    "I lost my keys again",
    "Coffee or tea?",
    "It's been a long day"
];

const modelMessages = [
    "That sounds interesting!",
    "I completely agree with you",
    "Hmm, let me think about that",
    "That's a great question",
    "I'm not sure about that one",
    "Absolutely! Here's what I think",
    "That reminds me of something",
    "I've heard that before",
    "That's fascinating",
    "You raise a good point",
    "I see what you mean",
    "That's quite unusual",
    "Let me help you with that",
    "That's an interesting perspective",
    "I'd love to hear more about that"
];

generateRandomChatsButton.addEventListener("click", async () => {
    titles.forEach((title) => {
        const randomConversation: Message[] = [];

        for (let i = 0; i < 10; i++) {
            // User message
            const userText = userMessages[Math.floor(Math.random() * userMessages.length)];
            randomConversation.push({
                role: "user",
                parts: [{ text: userText }],
            });

            // Model response
            const modelText = modelMessages[Math.floor(Math.random() * modelMessages.length)];
            randomConversation.push({
                role: "model",
                parts: [{ text: modelText }],
                personalityid: -1
            });
        }
        chatService.addChat(title, randomConversation);
    });
});

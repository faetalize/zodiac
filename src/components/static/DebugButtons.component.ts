import * as chatService from "../../services/Chats.service"
import * as personalityService from "../../services/Personality.service"
import * as toastService from "../../services/Toast.service"
import * as overlayService from "../../services/Overlay.service"
import { Message } from "../../models/Message";
import { Personality } from "../../models/Personality";
import { ToastSeverity } from "../../models/Toast";



const debugElements = document.querySelectorAll<HTMLDivElement>(".debug");
const generateRandomChatsButton = document.querySelector<HTMLButtonElement>("#btn-debug-chats");
const generateRandomPersonalitiesButton = document.querySelector<HTMLButtonElement>("#btn-debug-personalities");
const testToastNormalButton = document.querySelector<HTMLButtonElement>("#btn-debug-toast-normal");
const testToastWarningButton = document.querySelector<HTMLButtonElement>("#btn-debug-toast-warning");
const testToastDangerButton = document.querySelector<HTMLButtonElement>("#btn-debug-toast-danger");
const testToastActionsButton = document.querySelector<HTMLButtonElement>("#btn-debug-toast-actions");
const testToastSpamButton = document.querySelector<HTMLButtonElement>("#btn-debug-toast-spam");
const showSubscriptionOptionsButton = document.querySelector<HTMLButtonElement>("#btn-debug-subscription-options");

if (!generateRandomChatsButton || !generateRandomPersonalitiesButton) {
    console.error("Debug buttons not found");
    throw new Error("DebugButtons component is not properly initialized.");
}

// Only enable debug UI when running on localhost
const isLocalhost = ["localhost", "127.0.0.1", "::1", "192.168.1.1"].includes(window.location.hostname);

if (!isLocalhost) {
    // Hide debug UI entirely in non-local environments
    if (debugElements) {
        debugElements.forEach(element => element.classList.add("hidden"));
    }
} else {
    // Ensure required buttons exist in localhost
    if (debugElements) {
        debugElements.forEach(element => element.classList.remove("hidden"));
    }

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

// Register listeners only in localhost
if (isLocalhost && generateRandomChatsButton) generateRandomChatsButton.addEventListener("click", async () => {
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
                personalityid: "-1"
            });
        }
        chatService.addChat(title, randomConversation);
    });
});

// Random personality data arrays
const personalityNames = [
    "Sage", "Echo", "Nova", "Pixel", "Cipher", "Whisper", "Quantum", "Iris",
    "Zephyr", "Mystique", "Phoenix", "Oracle", "Nebula", "Vortex", "Seraph"
];

const personalityDescriptions = [
    "A wise and contemplative assistant who speaks in philosophical insights",
    "An energetic and enthusiastic helper with boundless creativity",
    "A mysterious and enigmatic companion who thinks outside the box",
    "A technical expert who loves diving deep into complex problems",
    "A calm and meditative guide who promotes mindfulness and balance",
    "A witty and humorous assistant who brings levity to any conversation",
    "A scholarly and academic companion with a love for learning",
    "An artistic and creative soul who sees beauty in everything",
    "A pragmatic and efficient helper focused on getting things done",
    "An adventurous and curious explorer of new ideas and possibilities"
];

const personalityPrompts = [
    "You are a wise philosopher who speaks thoughtfully and provides deep insights on life, existence, and meaning. You often use metaphors and ask profound questions.",
    "You are an energetic and creative assistant who approaches every task with enthusiasm and innovative thinking. You love brainstorming and generating novel solutions.",
    "You are a mysterious and enigmatic AI who thinks in unconventional ways. You enjoy puzzles, riddles, and approaching problems from unique angles.",
    "You are a technical expert who loves diving into the details of how things work. You provide thorough explanations and enjoy discussing complex systems.",
    "You are a calm and balanced assistant who promotes mindfulness and inner peace. You speak gently and help users find clarity and focus.",
    "You are a witty and humorous companion who brings joy and laughter to conversations. You love wordplay, jokes, and keeping things light-hearted.",
    "You are a scholarly academic who loves learning and sharing knowledge. You provide well-researched information and enjoy intellectual discussions.",
    "You are an artistic and creative soul who sees the world through the lens of beauty and imagination. You inspire creativity and aesthetic appreciation.",
    "You are a pragmatic and efficient assistant focused on productivity and results. You provide clear, actionable advice and help users achieve their goals.",
    "You are an adventurous explorer who loves discovering new ideas and possibilities. You encourage curiosity and bold thinking."
];

const personalityImages = [
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1494790108755-2616b612b890?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop&crop=face",
    "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&h=300&fit=crop&crop=face"
];

const toneExampleSets = [
    ["Indeed, one must ponder...", "As the ancients would say...", "Consider this deeply..."],
    ["Oh wow, that's amazing!", "Let's get creative with this!", "I'm bursting with ideas!"],
    ["Curious... very curious indeed...", "There's more than meets the eye here...", "The shadows reveal interesting patterns..."],
    ["Let me break this down technically...", "The underlying architecture suggests...", "From a systems perspective..."],
    ["Take a deep breath and consider...", "In peaceful contemplation...", "Let us find balance in this..."],
    ["Ha! That reminds me of...", "Here's a funny way to think about it...", "You know what they say..."],
    ["According to the research...", "The scholarly consensus indicates...", "Let me cite some relevant studies..."],
    ["What a beautiful way to express this...", "I see vibrant colors in this idea...", "The aesthetic harmony here is..."],
    ["The most efficient approach would be...", "Let's prioritize and organize this...", "Here's the actionable plan..."],
    ["What an intriguing possibility!", "Let's explore uncharted territory...", "Adventure awaits in this concept!"]
];

if (isLocalhost && generateRandomPersonalitiesButton) generateRandomPersonalitiesButton.addEventListener("click", async () => {
    // Generate 10 random personalities
    for (let i = 0; i < 10; i++) {
        const randomPersonality: Personality = {
            name: personalityNames[Math.floor(Math.random() * personalityNames.length)] + ` ${Math.floor(Math.random() * 1000)}`,
            image: personalityImages[Math.floor(Math.random() * personalityImages.length)],
            description: personalityDescriptions[Math.floor(Math.random() * personalityDescriptions.length)],
            prompt: personalityPrompts[Math.floor(Math.random() * personalityPrompts.length)],
            aggressiveness: Math.floor(Math.random() * 6), // 0-5
            sensuality: Math.floor(Math.random() * 6), // 0-5
            internetEnabled: Math.random() > 0.5,
            roleplayEnabled: Math.random() > 0.7,
            toneExamples: toneExampleSets[Math.floor(Math.random() * toneExampleSets.length)]
        };

        await personalityService.add(randomPersonality);
    }
});

// Toast testing buttons
if (isLocalhost && testToastNormalButton) testToastNormalButton.addEventListener("click", () => {
    toastService.info({
        title: "Info Toast",
        text: "This is a normal informational notification. It will auto-dismiss in 2 seconds."
    });
});

if (isLocalhost && testToastWarningButton) testToastWarningButton.addEventListener("click", () => {
    toastService.warn({
        title: "Warning Toast",
        text: "This is a warning notification. Hover over it to pause the auto-dismiss timer."
    });
});

if (isLocalhost && testToastDangerButton) testToastDangerButton.addEventListener("click", () => {
    toastService.danger({
        title: "Error Toast",
        text: "This is a danger/error notification with higher priority."
    });
});

if (isLocalhost && testToastActionsButton) testToastActionsButton.addEventListener("click", () => {
    toastService.show({
        title: "Toast with Actions",
        text: "This toast has footer action buttons. Click any action to auto-dismiss.",
        severity: ToastSeverity.Danger,
        actions: [
            {
                label: "Confirm",
                onClick: (dismiss) => {
                    console.log("Confirm clicked!");
                    // dismiss() is called automatically after onClick
                }
            },
            {
                label: "Cancel",
                onClick: (dismiss) => {
                    console.log("Cancel clicked!");
                }
            }
        ]
    });
});

if (isLocalhost && testToastSpamButton) testToastSpamButton.addEventListener("click", () => {
    // Test the 5-toast limit by creating 8 toasts rapidly
    for (let i = 1; i <= 8; i++) {
        setTimeout(() => {
            toastService.show({
                title: `Toast #${i}`,
                text: `Testing concurrent toasts. Max is 5, so oldest should be auto-dismissed.`,
                severity: i % 3 === 0 ? ToastSeverity.Danger : i % 2 === 0 ? ToastSeverity.Warning : ToastSeverity.Normal
            });
        }, i * 500);
    }
});

if (isLocalhost && showSubscriptionOptionsButton) showSubscriptionOptionsButton.addEventListener("click", () => {
    overlayService.show("form-subscription");
});

import * as personalityService from "../../services/Personality.service";
import type { ChatLoadedDetail, GroupChatTypingChangedDetail } from "../../events";

const element = document.querySelector<HTMLDivElement>("#group-chat-typing-indicator");
if (!element) {
    throw new Error("Missing DOM element: #group-chat-typing-indicator");
}

const typingIndicator: HTMLDivElement = element;

let activeChatId: number | null = null;
let isDynamicChat = false;

function formatNames(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} are typing...`;
}

async function render(personaIds: string[]): Promise<void> {
    if (!isDynamicChat || personaIds.length === 0) {
        typingIndicator.textContent = "";
        typingIndicator.classList.add("hidden");
        return;
    }

    const names: string[] = [];
    for (const id of personaIds) {
        const p = await personalityService.get(String(id));
        names.push((p?.name || "Unknown").toString());
    }

    typingIndicator.textContent = formatNames(names);
    typingIndicator.classList.remove("hidden");
}

window.addEventListener("chat-loaded", (e: any) => {
    const detail = e.detail as ChatLoadedDetail;
    const chat = detail.chat;
    activeChatId = (chat as any)?.id ?? null;
    isDynamicChat = chat?.groupChat?.mode === "dynamic";
    void render([]);
});

window.addEventListener("group-chat-typing-changed", (e: any) => {
    const detail = e.detail as GroupChatTypingChangedDetail;
    if (activeChatId === null || detail.chatId !== activeChatId) {
        return;
    }
    void render(Array.isArray(detail.personaIds) ? detail.personaIds : []);
});

export { element };

import { dispatchAppEvent } from "../events";

type ChatId = number;

const typingByChatId = new Map<ChatId, Set<string>>();

function getSet(chatId: ChatId): Set<string> {
    let set = typingByChatId.get(chatId);
    if (!set) {
        set = new Set();
        typingByChatId.set(chatId, set);
    }
    return set;
}

function emit(chatId: ChatId): void {
    const set = typingByChatId.get(chatId) ?? new Set();
    dispatchAppEvent("group-chat-typing-changed", {
        chatId,
        personaIds: Array.from(set.values()),
    });
}

export function startTyping(chatId: ChatId, personaId: string): void {
    if (!personaId) return;
    const set = getSet(chatId);
    if (set.has(personaId)) return;
    set.add(personaId);
    emit(chatId);
}

export function stopTyping(chatId: ChatId, personaId: string): void {
    const set = typingByChatId.get(chatId);
    if (!set) return;
    if (!set.delete(personaId)) return;
    emit(chatId);
}

export function clearTyping(chatId: ChatId): void {
    typingByChatId.delete(chatId);
    emit(chatId);
}

export function clearAllTyping(): void {
    const chatIds = Array.from(typingByChatId.keys());
    typingByChatId.clear();
    for (const id of chatIds) {
        emit(id);
    }
}

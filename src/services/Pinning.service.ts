import { SETTINGS_STORAGE_KEYS } from "../constants/SettingsStorageKeys";
import * as syncService from "./Sync.service";

function readPinnedIds(storageKey: string): string[] {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        const unique = new Set<string>();
        for (const value of parsed) {
            if (typeof value !== "string") continue;
            const trimmed = value.trim();
            if (!trimmed) continue;
            unique.add(trimmed);
        }

        return Array.from(unique);
    } catch {
        return [];
    }
}

function writePinnedIds(storageKey: string, ids: string[]): void {
    const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    localStorage.setItem(storageKey, JSON.stringify(unique));
}

function queueSyncSettingsPush(): void {
    if (!syncService.isSyncActive()) return;
    syncService.pushCurrentSettings().catch((error) => {
        console.warn("Failed to sync pinning settings", error);
    });
}

export function getPinnedChatIds(): string[] {
    return readPinnedIds(SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS);
}

export function getPinnedPersonaIds(): string[] {
    return readPinnedIds(SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS);
}

export function isChatPinned(chatId: string): boolean {
    return getPinnedChatIds().includes(chatId);
}

export function isPersonaPinned(personaId: string): boolean {
    return getPinnedPersonaIds().includes(personaId);
}

export async function toggleChatPinned(chatId: string): Promise<boolean> {
    const pinned = new Set(getPinnedChatIds());
    let isPinned: boolean;

    if (pinned.has(chatId)) {
        pinned.delete(chatId);
        isPinned = false;
    } else {
        pinned.add(chatId);
        isPinned = true;
    }

    writePinnedIds(SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS, Array.from(pinned));
    queueSyncSettingsPush();
    return isPinned;
}

export async function togglePersonaPinned(personaId: string): Promise<boolean> {
    const pinned = new Set(getPinnedPersonaIds());
    let isPinned: boolean;

    if (pinned.has(personaId)) {
        pinned.delete(personaId);
        isPinned = false;
    } else {
        pinned.add(personaId);
        isPinned = true;
    }

    writePinnedIds(SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS, Array.from(pinned));
    queueSyncSettingsPush();
    return isPinned;
}

export async function removeChatPin(chatId: string): Promise<void> {
    const pinned = getPinnedChatIds();
    if (!pinned.includes(chatId)) return;
    writePinnedIds(SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS, pinned.filter((id) => id !== chatId));
    queueSyncSettingsPush();
}

export async function removePersonaPin(personaId: string): Promise<void> {
    const pinned = getPinnedPersonaIds();
    if (!pinned.includes(personaId)) return;
    writePinnedIds(SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS, pinned.filter((id) => id !== personaId));
    queueSyncSettingsPush();
}

export async function clearChatPins(): Promise<void> {
    localStorage.removeItem(SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS);
    queueSyncSettingsPush();
}

export async function clearPersonaPins(): Promise<void> {
    localStorage.removeItem(SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS);
    queueSyncSettingsPush();
}

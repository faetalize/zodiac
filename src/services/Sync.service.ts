/**
 * Cloud Sync service — orchestrates encrypted data synchronization
 * between local IndexedDB and Supabase for Pro/Max users.
 *
 * Architecture:
 * - Write-through: every local mutation pushes an encrypted delta to Supabase
 * - Pull-on-login: on session start, pull remote data and merge into IndexedDB
 * - Offline queue: failed pushes are queued and retried on reconnect
 * - E2EE: all data is encrypted client-side with AES-256-GCM before upload
 *
 * This service never reads or writes plaintext data to Supabase.
 * The encryption key lives in memory only (Crypto.service.ts).
 */

import { supabase, getCurrentUser, getSubscriptionTier, getUserSubscription } from './Supabase.service';
import * as crypto from './Crypto.service';
import * as blobStore from './BlobStore.service';
import { db } from './Db.service';
import { dispatchAppEvent } from '../events';
import type { SyncStatus } from '../events';
import type { DbChat } from '../types/Chat';
import type { Message, GeneratedImage } from '../types/Message';
import type { DbPersonality } from '../types/Personality';
import { isBlobReference, type BlobReference } from '../types/BlobReference';
import { fileToBase64 } from '../utils/helpers';
import { resolveAttachmentFile, resolveGeneratedImageSrc, resolveThoughtSignature } from '../utils/blobResolver';
import { SETTINGS_STORAGE_KEYS, SYNCABLE_SETTINGS_KEYS } from '../constants/SettingsStorageKeys';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SyncPreferences {
    syncEnabled: boolean;
    encryptionSalt: Uint8Array | null;
    keyVerification: Uint8Array | null;
    keyVerificationIv: Uint8Array | null;
}

export interface EnableSyncOptions {
    strategy?: 'push-local' | 'pull-remote';
}

export interface SyncQuota {
    usedBytes: number;
    quotaBytes: number;
}

export interface RemoteMessageWindow {
    messages: Message[];
    startIndex: number;
    endExclusive: number;
    totalCount: number;
    hasMoreOlder: boolean;
}

export interface LegacyMediaMigrationProgress {
    phase: 'starting' | 'scanning' | 'migrating' | 'finalizing' | 'done';
    totalRows: number;
    scannedRows: number;
    migratedRows: number;
    failedRows: number;
    message: string;
}

export interface LegacyMediaMigrationResult {
    totalRows: number;
    scannedRows: number;
    migratedRows: number;
    failedRows: number;
}

interface QueuedOperation {
    id: string;
    table: 'chats' | 'personas' | 'settings';
    operation: 'upsert' | 'delete';
    entityId?: string;
    timestamp: number;
    retryCount?: number;
}

// ── State ──────────────────────────────────────────────────────────────────

let syncStatus: SyncStatus = 'idle';
let offlineQueue: QueuedOperation[] = [];
let syncPrefsCache: SyncPreferences | null = null;
let suppressSyncHooksDepth = 0;
const hydratedChats = new Set<string>();
const remoteMessageCountByChatId = new Map<string, number>();

const SYNC_PROMPT_SEEN_KEY = 'zodiac-sync-prompt-seen';
const OFFLINE_QUEUE_KEY = 'zodiac-sync-offline-queue';
const LEGACY_MEDIA_MIGRATION_BATCH_SIZE = 500;
const LEGACY_MEDIA_MIGRATION_COMPLETION_VALUE = 'true';
const LEGACY_MEDIA_MIGRATION_MIN_HEX_CANDIDATE_LENGTH = 8_000;
const MESSAGE_UPSERT_MAX_ROWS = 1000;
const MESSAGE_UPSERT_MAX_BYTES = 6_500_000;
const MESSAGE_DELETE_MARK_BATCH_SIZE = 500;
const CHAT_DELETE_MARK_BATCH_SIZE = 500;
const MESSAGE_DECRYPT_CONCURRENCY = 4;
const MAX_OFFLINE_RETRIES = 5;
/** Client-side page size for reading messages from Supabase. Independent of
 *  the server-side PostgREST max-rows setting (typically 1000 on hosted
 *  Supabase). Cursor-based paging handles lower server caps safely. */
const READ_PAGE_SIZE = 500;

function areSyncHooksSuppressed(): boolean {
    return suppressSyncHooksDepth > 0;
}

async function withSyncHooksSuppressed<T>(task: () => Promise<T>): Promise<T> {
    suppressSyncHooksDepth++;
    try {
        return await task();
    } finally {
        suppressSyncHooksDepth = Math.max(0, suppressSyncHooksDepth - 1);
    }
}

// ── Status management ──────────────────────────────────────────────────────

function setSyncStatus(status: SyncStatus, error?: string) {
    syncStatus = status;
    dispatchAppEvent('sync-state-changed', { status, error });
}

export function getSyncStatus(): SyncStatus {
    return syncStatus;
}

// ── Sync prompt tracking ───────────────────────────────────────────────────

export function hasSeenSyncPrompt(): boolean {
    return localStorage.getItem(SYNC_PROMPT_SEEN_KEY) === 'true';
}

export function markSyncPromptSeen(): void {
    localStorage.setItem(SYNC_PROMPT_SEEN_KEY, 'true');
}

function isLegacyMediaMigrationMarkedComplete(): boolean {
    return localStorage.getItem(SETTINGS_STORAGE_KEYS.CLOUD_MEDIA_MIGRATION_V1_DONE) === LEGACY_MEDIA_MIGRATION_COMPLETION_VALUE;
}

function markLegacyMediaMigrationCompleteLocally(): void {
    localStorage.setItem(SETTINGS_STORAGE_KEYS.CLOUD_MEDIA_MIGRATION_V1_DONE, LEGACY_MEDIA_MIGRATION_COMPLETION_VALUE);
}

export async function hasCompletedLegacyMediaMigration(): Promise<boolean> {
    if (isLegacyMediaMigrationMarkedComplete()) {
        return true;
    }

    // If this flag came from another device via synced settings, apply it once
    // before deciding whether to show the migration modal.
    await applySyncedSettingsToLocalStorage();
    return isLegacyMediaMigrationMarkedComplete();
}

// ── Offline queue persistence ──────────────────────────────────────────────

function loadOfflineQueue(): void {
    try {
        const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
        offlineQueue = stored ? JSON.parse(stored) : [];
    } catch {
        offlineQueue = [];
    }
}

function saveOfflineQueue(): void {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
}

function enqueue(op: Omit<QueuedOperation, 'id' | 'timestamp'>): void {
    offlineQueue.push({
        ...op,
        id: globalThis.crypto.randomUUID(),
        timestamp: Date.now(),
    });
    saveOfflineQueue();
}

// ── Preferences ────────────────────────────────────────────────────────────

/**
 * Fetch the user's sync preferences from Supabase.
 * Returns null if no row exists (user never set up sync).
 */
export async function fetchSyncPreferences(): Promise<SyncPreferences | null> {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_sync_preferences')
        .select('sync_enabled, encryption_salt, key_verification, key_verification_iv')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error || !data) {
        syncPrefsCache = null;
        return null;
    }

    const prefs: SyncPreferences = {
        syncEnabled: data.sync_enabled,
        encryptionSalt: data.encryption_salt ? crypto.fromHex(data.encryption_salt) : null,
        keyVerification: data.key_verification ? crypto.fromHex(data.key_verification) : null,
        keyVerificationIv: data.key_verification_iv ? crypto.fromHex(data.key_verification_iv) : null,
    };
    syncPrefsCache = prefs;
    return prefs;
}

/**
 * Get cached preferences (avoids network call if already fetched).
 */
export function getCachedSyncPreferences(): SyncPreferences | null {
    return syncPrefsCache;
}

/**
 * Check if sync is currently active (enabled + key unlocked).
 */
export function isSyncActive(): boolean {
    return syncPrefsCache?.syncEnabled === true && crypto.isUnlocked();
}

export function isOnlineSyncEnabled(): boolean {
    return syncPrefsCache?.syncEnabled === true;
}

// ── Quota ──────────────────────────────────────────────────────────────────

/**
 * Fetch the user's storage quota from Supabase.
 *
 * Server-side triggers on both the sync tables and storage.objects
 * (`encrypted-blobs` bucket) keep `storage_used_bytes` up-to-date
 * automatically, so we just read the pre-computed value here.
 */
export async function fetchSyncQuota(): Promise<SyncQuota | null> {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_sync_quotas')
        .select('storage_used_bytes, storage_quota_bytes')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error || !data) return null;

    const quota: SyncQuota = {
        usedBytes: data.storage_used_bytes,
        quotaBytes: data.storage_quota_bytes,
    };
    dispatchAppEvent('sync-quota-updated', quota);
    return quota;
}

// ── First-time setup ───────────────────────────────────────────────────────

/**
 * Set up cloud sync for the first time.
 * Called after the user creates their encryption password.
 *
 * 1. Derives a key from the password
 * 2. Creates verification blob
 * 3. Upserts sync preferences to Supabase
 * 4. Caches the key in memory
 * 5. Triggers initial upload
 */
export async function setupSync(password: string): Promise<boolean> {
    const user = await getCurrentUser();
    if (!user) return false;

    try {
        setSyncStatus('syncing');

        // 1. Generate salt and derive key
        const salt = crypto.generateSalt();
        const key = await crypto.deriveKey(password, salt);

        // 2. Create verification blob
        const verification = await crypto.createVerification(key);

        // 3. Upsert preferences to Supabase
        const { error } = await supabase
            .from('user_sync_preferences')
            .upsert({
                user_id: user.id,
                sync_enabled: true,
                encryption_salt: crypto.toHex(salt),
                key_verification: crypto.toHex(verification.ciphertext),
                key_verification_iv: crypto.toHex(verification.iv),
            });

        if (error) {
            console.error('Sync setup: failed to save preferences', error);
            setSyncStatus('error', error.message);
            return false;
        }

        // 4. Cache key
        crypto.cacheKey(key);

        // 5. Update local cache
        syncPrefsCache = {
            syncEnabled: true,
            encryptionSalt: salt,
            keyVerification: verification.ciphertext,
            keyVerificationIv: verification.iv,
        };

        // 6. Initial upload
        await pushAll();

        // 7. Online-only mode: remove all local synced data after successful migration.
        await clearAllLocalSyncedData();

        dispatchAppEvent('sync-setup-complete', { enabled: true });
        setSyncStatus('synced');
        return true;
    } catch (err) {
        console.error('Sync setup failed:', err);
        setSyncStatus('error', String(err));
        return false;
    }
}

// ── Unlock (returning user) ────────────────────────────────────────────────

/**
 * Unlock sync with the user's encryption password.
 * Called on every new session when sync is enabled.
 *
 * @returns true if the password was correct and sync is now active.
 */
export async function unlock(password: string, options?: { skipFlush?: boolean }): Promise<boolean> {
    const prefs = syncPrefsCache ?? await fetchSyncPreferences();
    if (!prefs?.syncEnabled || !prefs.encryptionSalt || !prefs.keyVerification || !prefs.keyVerificationIv) {
        return false;
    }

    const key = await crypto.deriveKey(password, prefs.encryptionSalt);
    const valid = await crypto.verifyKey(key, prefs.keyVerification, prefs.keyVerificationIv);

    if (!valid) return false;

    crypto.cacheKey(key);
    setSyncStatus('synced');

    // Flush queued offline operations in the background so unlock UX stays fast.
    // Skip for final-download flow — writes will fail against write RLS anyway.
    if (!options?.skipFlush) {
        void flushOfflineQueue().catch((error) => {
            console.error('Background offline queue flush failed after unlock:', error);
        });
    }

    return true;
}

// ── Enable / Disable ───────────────────────────────────────────────────────

/**
 * Disable cloud sync. Data remains on server (encrypted) but syncing stops.
 */
export async function disableSync(options?: { keepLocalCopy?: boolean }): Promise<boolean> {
    const user = await getCurrentUser();
    if (!user) return false;

    if (options?.keepLocalCopy) {
        const backupOk = await restoreRemoteDataToLocalUnencrypted();
        if (!backupOk) return false;
    } else {
        await clearAllLocalSyncedData();
    }

    const { error } = await supabase
        .from('user_sync_preferences')
        .update({ sync_enabled: false })
        .eq('user_id', user.id);

    if (error) {
        console.error('Failed to disable sync:', error);
        return false;
    }

    if (syncPrefsCache) syncPrefsCache.syncEnabled = false;
    crypto.clearCachedKey();
    blobStore.clearCache();
    setSyncStatus('idle');
    dispatchAppEvent('sync-setup-complete', { enabled: false });
    return true;
}

/**
 * Re-enable sync (user already has encryption material on server).
 * Requires the user to enter their encryption password again.
 */
export async function enableSync(password: string, options?: EnableSyncOptions): Promise<boolean> {
    const prefs = await fetchSyncPreferences();
    if (!prefs?.encryptionSalt || !prefs.keyVerification || !prefs.keyVerificationIv) {
        // No encryption material — needs full setup instead
        return false;
    }

    const key = await crypto.deriveKey(password, prefs.encryptionSalt);
    const valid = await crypto.verifyKey(key, prefs.keyVerification, prefs.keyVerificationIv);
    if (!valid) return false;

    const user = await getCurrentUser();
    if (!user) return false;

    const { error } = await supabase
        .from('user_sync_preferences')
        .update({ sync_enabled: true })
        .eq('user_id', user.id);

    if (error) {
        console.error('Failed to enable sync:', error);
        return false;
    }

    crypto.cacheKey(key);
    if (syncPrefsCache) syncPrefsCache.syncEnabled = true;

    const strategy = options?.strategy ?? 'push-local';
    if (strategy === 'pull-remote') {
        await pullAll();
    } else {
        // Sync current local data
        await pushAll();
    }

    setSyncStatus('synced');
    dispatchAppEvent('sync-setup-complete', { enabled: true });
    return true;
}

/**
 * Wipe all synced data on the server and reset encryption.
 * Used when the user forgets their encryption password.
 */
export async function wipeRemoteData(options?: { keepLocalCopy?: boolean }): Promise<boolean> {
    try {
        if (options?.keepLocalCopy) {
            const backupOk = await restoreRemoteDataToLocalUnencrypted();
            if (!backupOk) return false;
        } else {
            await clearAllLocalSyncedData();
        }

        const { data, error } = await supabase.functions.invoke('purge-my-sync-data', {
            method: 'POST',
        });
        if (error || data?.success !== true) {
            console.error('Failed to wipe synced data:', error ?? data);
            return false;
        }

        if (options?.keepLocalCopy) {
            dispatchAppEvent('sync-data-pulled', {});
        }

        crypto.clearCachedKey();
        blobStore.clearCache();
        syncPrefsCache = null;
        setSyncStatus('idle');
        dispatchAppEvent('sync-setup-complete', { enabled: false });
        return true;
    } catch (err) {
        console.error('Wipe failed:', err);
        return false;
    }
}

export async function clearAllLocalSyncedData(): Promise<void> {
    await withSyncHooksSuppressed(async () => {
        await db.chats.clear();
        await db.personalities.clear();
    });
    hydratedChats.clear();
    remoteMessageCountByChatId.clear();
}

function dataUriToBase64(dataUri: string): string {
    const commaIndex = dataUri.indexOf(',');
    return commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri;
}

async function materializeMessageBlobBackedMedia(message: Message): Promise<Message> {
    if (Array.isArray(message.generatedImages)) {
        for (const image of message.generatedImages) {
            if (image._blobRef) {
                const resolvedSrc = await resolveGeneratedImageSrc(image);
                if (!resolvedSrc) {
                    throw new Error(`Failed to materialize generated image blob ${image._blobRef.blobId}`);
                }
                image.base64 = dataUriToBase64(resolvedSrc);
                delete (image as any)._blobRef;
            }

            if (image._thoughtSignatureRef) {
                const resolvedThoughtSignature = await resolveThoughtSignature(image);
                if (!resolvedThoughtSignature) {
                    throw new Error(`Failed to materialize image thought signature blob ${image._thoughtSignatureRef.blobId}`);
                }
                delete (image as any)._thoughtSignatureRef;
            }
        }
    }

    if (Array.isArray(message.parts)) {
        for (const part of message.parts) {
            if (part._thoughtSignatureRef) {
                const resolvedThoughtSignature = await resolveThoughtSignature(part);
                if (!resolvedThoughtSignature) {
                    throw new Error(`Failed to materialize part thought signature blob ${part._thoughtSignatureRef.blobId}`);
                }
                delete (part as any)._thoughtSignatureRef;
            }

            const sourceAttachments = Array.from(part.attachments || []);
            if (sourceAttachments.length === 0) {
                continue;
            }

            const resolvedAttachments: File[] = [];
            for (const attachment of sourceAttachments) {
                const originalBlobRef = (attachment as any)._blobRef as BlobReference | undefined;
                const resolvedAttachment = await resolveAttachmentFile(attachment);
                if (originalBlobRef && resolvedAttachment.size === 0) {
                    throw new Error(`Failed to materialize attachment blob ${originalBlobRef.blobId}`);
                }
                delete (resolvedAttachment as any)._blobRef;
                resolvedAttachments.push(resolvedAttachment);
            }
            part.attachments = resolvedAttachments;
        }
    }

    return message;
}

async function materializeAllLocalBlobBackedMedia(): Promise<void> {
    const chats = await db.chats.toArray();

    await withSyncHooksSuppressed(async () => {
        for (const chat of chats) {
            if (!Array.isArray(chat.content) || chat.content.length === 0) {
                continue;
            }

            const materializedContent: Message[] = [];
            for (const message of chat.content) {
                materializedContent.push(await materializeMessageBlobBackedMedia(message));
            }

            await db.chats.put({
                ...chat,
                content: materializedContent,
            });
        }
    });
}

export async function restoreRemoteDataToLocalUnencrypted(): Promise<boolean> {
    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return false;

    try {
        await withSyncHooksSuppressed(async () => {
            await pullChats(user.id, key, { hydrateMessages: true, materializeMedia: true });
            await pullPersonas(user.id, key);
            await pullSettings(user.id, key);
        });
        return true;
    } catch (error) {
        console.error('restoreRemoteDataToLocalUnencrypted failed:', error);
        return false;
    }
}

async function fetchAllSyncedChatsPaged(userId: string): Promise<Array<{
    id: string;
    encrypted_data: string;
    iv: string;
    updated_at: string | null;
    deleted: boolean;
}> | null> {
    const rows: Array<{
        id: string;
        encrypted_data: string;
        iv: string;
        updated_at: string | null;
        deleted: boolean;
    }> = [];

    let cursorId: string | null = null;

    while (true) {
        let query = supabase
            .from('user_synced_chats')
            .select('id, encrypted_data, iv, updated_at, deleted')
            .eq('user_id', userId)
            .order('id', { ascending: true })
            .limit(READ_PAGE_SIZE);

        if (cursorId !== null) {
            query = query.gt('id', cursorId);
        }

        const { data, error } = await query;

        if (error) {
            console.error(`fetchAllSyncedChatsPaged failed (cursor=${cursorId ?? '∅'}):`, error);
            return null;
        }

        if (!data || data.length === 0) {
            break;
        }

        rows.push(...data);

        const lastId = data[data.length - 1]?.id;
        if (typeof lastId !== 'string' || (cursorId !== null && lastId <= cursorId)) {
            console.error(
                `fetchAllSyncedChatsPaged: cursor cannot advance (cursor=${cursorId ?? '∅'} lastId=${String(lastId)}).`,
            );
            return rows;
        }
        cursorId = lastId;
    }

    return rows;
}

async function fetchAllSyncedPersonasPaged(userId: string): Promise<Array<{
    id: string;
    encrypted_data: string;
    iv: string;
    updated_at: string | null;
    deleted: boolean;
}> | null> {
    const rows: Array<{
        id: string;
        encrypted_data: string;
        iv: string;
        updated_at: string | null;
        deleted: boolean;
    }> = [];

    let cursorId: string | null = null;

    while (true) {
        let query = supabase
            .from('user_synced_personas')
            .select('id, encrypted_data, iv, updated_at, deleted')
            .eq('user_id', userId)
            .order('id', { ascending: true })
            .limit(READ_PAGE_SIZE);

        if (cursorId !== null) {
            query = query.gt('id', cursorId);
        }

        const { data, error } = await query;

        if (error) {
            console.error(`fetchAllSyncedPersonasPaged failed (cursor=${cursorId ?? '∅'}):`, error);
            return null;
        }

        if (!data || data.length === 0) {
            break;
        }

        rows.push(...data);

        const lastId = data[data.length - 1]?.id;
        if (typeof lastId !== 'string' || (cursorId !== null && lastId <= cursorId)) {
            console.error(
                `fetchAllSyncedPersonasPaged: cursor cannot advance (cursor=${cursorId ?? '∅'} lastId=${String(lastId)}).`,
            );
            return rows;
        }
        cursorId = lastId;
    }

    return rows;
}

export async function fetchSyncedChatsMetadata(): Promise<DbChat[]> {
    if (!isSyncActive()) return [];

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return [];

    const data = await fetchAllSyncedChatsPaged(user.id);
    if (!data) {
        console.error('fetchSyncedChatsMetadata failed to read synced chats');
        return [];
    }

    const activeRows = data.filter((row) => !row.deleted);

    // Decrypt all rows concurrently for faster sidebar population
    const results = await Promise.allSettled(
        activeRows.map(async (row) => {
            const plaintext = await crypto.decrypt(
                key,
                crypto.fromHex(row.encrypted_data),
                crypto.fromHex(row.iv),
            );
            const parsed = JSON.parse(plaintext);
            const { chat, messageCount } = parseChatMetadata(row.id, parsed);
            remoteMessageCountByChatId.set(row.id, messageCount);
            return chat;
        }),
    );

    const chats: DbChat[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            chats.push(result.value);
        } else {
            console.error('fetchSyncedChatsMetadata: failed to decrypt a chat', result.reason);
        }
    }

    return chats;
}

export async function fetchSyncedChatMetadata(chatId: string): Promise<DbChat | null> {
    if (!isSyncActive()) return null;

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return null;

    const { data, error } = await supabase
        .from('user_synced_chats')
        .select('id, encrypted_data, iv, deleted')
        .eq('user_id', user.id)
        .eq('id', chatId)
        .eq('deleted', false)
        .maybeSingle();

    if (error || !data) return null;

    try {
        const plaintext = await crypto.decrypt(
            key,
            crypto.fromHex(data.encrypted_data),
            crypto.fromHex(data.iv),
        );
        const parsed = JSON.parse(plaintext);
        const { chat, messageCount } = parseChatMetadata(data.id, parsed);
        remoteMessageCountByChatId.set(data.id, messageCount);
        return chat;
    } catch (decryptError) {
        console.error(`fetchSyncedChatMetadata: failed to decrypt chat ${chatId}`, decryptError);
        return null;
    }
}

export async function upsertSyncedChat(chat: DbChat, previous?: DbChat): Promise<boolean> {
    if (!isSyncActive()) return false;
    return pushChatIncremental(previous, chat);
}

export async function fetchSyncedPersonas(): Promise<DbPersonality[]> {
    if (!isSyncActive()) return [];

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return [];

    const data = await fetchAllSyncedPersonasPaged(user.id);

    if (!data) {
        console.error('fetchSyncedPersonas failed to read synced personas');
        return [];
    }

    const activeRows = data.filter((row) => !row.deleted);

    const personas: DbPersonality[] = [];
    for (const row of activeRows) {
        try {
            const plaintext = await crypto.decrypt(
                key,
                crypto.fromHex(row.encrypted_data),
                crypto.fromHex(row.iv),
            );
            personas.push(JSON.parse(plaintext) as DbPersonality);
        } catch (decryptError) {
            console.error(`fetchSyncedPersonas: failed to decrypt persona ${row.id}`, decryptError);
        }
    }

    return personas;
}

export async function fetchSyncedSettingsObject(): Promise<Record<string, string> | null> {
    if (!isSyncActive()) return null;

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return null;

    const { data, error } = await supabase
        .from('user_synced_settings')
        .select('encrypted_data, iv')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error || !data) return null;

    try {
        const plaintext = await crypto.decrypt(
            key,
            crypto.fromHex(data.encrypted_data),
            crypto.fromHex(data.iv),
        );
        return JSON.parse(plaintext) as Record<string, string>;
    } catch (decryptError) {
        console.error('fetchSyncedSettingsObject: failed to decrypt settings', decryptError);
        return null;
    }
}

export async function applySyncedSettingsToLocalStorage(): Promise<boolean> {
    const settings = await fetchSyncedSettingsObject();
    if (!settings) return false;

    for (const [key, value] of Object.entries(settings)) {
        localStorage.setItem(key, value);
    }
    return true;
}

// ── Push operations (local → remote) ───────────────────────────────────────

/**
 * Chat metadata payload for cloud sync v2.
 * Message bodies are stored separately in user_synced_messages.
 */
function serializeChatMetadata(chat: DbChat, messageCountOverride?: number): string {
    const resolvedMessageCount = typeof messageCountOverride === 'number'
        ? Math.max(0, messageCountOverride)
        : (chat.content?.length ?? 0);

    const metadata = {
        syncVersion: 2,
        id: chat.id,
        title: chat.title,
        timestamp: chat.timestamp,
        lastModified: chat.lastModified ?? null,
        groupChat: chat.groupChat,
        messageCount: resolvedMessageCount,
    };

    return JSON.stringify(metadata);
}

/**
 * Serialized attachment — either inline base64 or a BlobReference.
 */
interface SerializedAttachment {
    name: string;
    type: string;
    lastModified: number;
    size: number;
    base64: string | BlobReference;
}

function estimateBase64ByteLength(base64: string): number {
    if (!base64) return 0;
    const len = base64.length;
    let padding = 0;
    if (base64.endsWith('==')) {
        padding = 2;
    } else if (base64.endsWith('=')) {
        padding = 1;
    }
    return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function utf8Encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

/**
 * Serialize a message for cloud sync.
 *
 * Large payload fields (>BLOB_SIZE_THRESHOLD) are extracted, encrypted, and
 * uploaded to blob storage. This includes image/attachment base64 and very
 * large thoughtSignature strings. The serialized JSON contains BlobReferences
 * instead of inline payloads for those items.
 *
 * If blob upload fails for any item, it falls back to inline base64 so the
 * message still syncs (just larger).
 *
 * @returns The serialized JSON string AND an array of uploaded blob IDs
 *          (for cleanup on downstream failure).
 */
async function serializeMessage(message: Message): Promise<{ json: string; uploadedBlobIds: string[] }> {
    const uploadedBlobIds: string[] = [];

    // ── Serialize generatedImages ──────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let serializedGeneratedImages: any[] | undefined;
    if (message.generatedImages && message.generatedImages.length > 0) {
        const preservedImageRefs = new Map<number, BlobReference>();
        const preservedThoughtSignatureRefs = new Map<number, BlobReference>();
        const imageUploadItems: Array<{ index: number; data: Uint8Array; mimeType: string }> = [];
        const thoughtSignatureUploadItems: Array<{ index: number; data: Uint8Array }> = [];

        for (let i = 0; i < message.generatedImages.length; i++) {
            const img = message.generatedImages[i];

            // Preserve existing image blob reference if available.
            if (img._blobRef) {
                preservedImageRefs.set(i, img._blobRef);
            } else if (img.base64 && img.base64.length > 0) {
                const estimatedBytes = estimateBase64ByteLength(img.base64);
                if (estimatedBytes > blobStore.BLOB_SIZE_THRESHOLD) {
                    const rawBytes = blobStore.base64ToUint8Array(img.base64);
                    if (rawBytes.byteLength > blobStore.BLOB_SIZE_THRESHOLD) {
                        imageUploadItems.push({ index: i, data: rawBytes, mimeType: img.mimeType });
                    }
                }
            }

            // Preserve existing thoughtSignature blob reference if available.
            if (img._thoughtSignatureRef) {
                preservedThoughtSignatureRefs.set(i, img._thoughtSignatureRef);
            } else if (typeof img.thoughtSignature === 'string' && img.thoughtSignature.length > 0) {
                const sigBytes = utf8Encode(img.thoughtSignature);
                if (sigBytes.byteLength > blobStore.BLOB_SIZE_THRESHOLD) {
                    thoughtSignatureUploadItems.push({ index: i, data: sigBytes });
                }
            }
        }

        const imageBlobRefs = new Map<number, BlobReference>();
        if (imageUploadItems.length > 0) {
            try {
                const refs = await blobStore.uploadEncryptedBlobsBatch(
                    imageUploadItems.map(item => ({ data: item.data, mimeType: item.mimeType })),
                );
                for (let j = 0; j < imageUploadItems.length; j++) {
                    imageBlobRefs.set(imageUploadItems[j].index, refs[j]);
                    uploadedBlobIds.push(refs[j].blobId);
                }
            } catch (err) {
                console.warn('serializeMessage: blob upload failed for generatedImages, falling back to inline:', err);
            }
        }

        const thoughtSignatureBlobRefs = new Map<number, BlobReference>();
        if (thoughtSignatureUploadItems.length > 0) {
            try {
                const refs = await blobStore.uploadEncryptedBlobsBatch(
                    thoughtSignatureUploadItems.map(item => ({ data: item.data, mimeType: 'text/plain;charset=utf-8' })),
                );
                for (let j = 0; j < thoughtSignatureUploadItems.length; j++) {
                    thoughtSignatureBlobRefs.set(thoughtSignatureUploadItems[j].index, refs[j]);
                    uploadedBlobIds.push(refs[j].blobId);
                }
            } catch (err) {
                console.warn('serializeMessage: blob upload failed for generatedImage thought signatures, falling back to inline:', err);
            }
        }

        // Build the serialized array, preserving existing refs and adding new refs.
        serializedGeneratedImages = message.generatedImages.map((img, i) => {
            const imageRef = imageBlobRefs.get(i) ?? preservedImageRefs.get(i);
            const thoughtSignatureRef = thoughtSignatureBlobRefs.get(i) ?? preservedThoughtSignatureRefs.get(i);
            const { _blobRef, _thoughtSignatureRef, ...rest } = img;
            const serialized: any = { ...rest };
            if (imageRef) {
                serialized.base64 = imageRef as unknown as string | BlobReference;
            }
            if (thoughtSignatureRef) {
                serialized.thoughtSignature = thoughtSignatureRef as unknown as string | BlobReference;
            }
            return serialized;
        });
    }

    // ── Serialize parts (with attachments) ─────────────────────────────
    const parts = await Promise.all((message.parts || []).map(async (part: any) => {
        const attachments = Array.from<File>(part.attachments || []);
        const preservedAttachmentRefs = new Map<number, BlobReference>();
        const preservedPartThoughtSignatureRef = (part as any)._thoughtSignatureRef as BlobReference | undefined;
        let partThoughtSignatureRef: BlobReference | undefined;

        const attachmentUploadItems: Array<{ index: number; data: Uint8Array; mimeType: string }> = [];

        for (let i = 0; i < attachments.length; i++) {
            const file = attachments[i];

            // Preserve existing blob reference on placeholder files.
            const existingRef = (file as any)._blobRef as BlobReference | undefined;
            if (existingRef && file.size === 0) {
                preservedAttachmentRefs.set(i, existingRef);
                continue;
            }

            if (file.size <= blobStore.BLOB_SIZE_THRESHOLD) {
                continue;
            }

            const arrayBuf = await file.arrayBuffer();
            const rawBytes = new Uint8Array(arrayBuf);
            if (rawBytes.byteLength > blobStore.BLOB_SIZE_THRESHOLD) {
                attachmentUploadItems.push({ index: i, data: rawBytes, mimeType: file.type });
            }
        }

        const attachmentBlobRefs = new Map<number, BlobReference>();
        if (attachmentUploadItems.length > 0) {
            try {
                const refs = await blobStore.uploadEncryptedBlobsBatch(
                    attachmentUploadItems.map(item => ({ data: item.data, mimeType: item.mimeType })),
                );
                for (let j = 0; j < attachmentUploadItems.length; j++) {
                    attachmentBlobRefs.set(attachmentUploadItems[j].index, refs[j]);
                    uploadedBlobIds.push(refs[j].blobId);
                }
            } catch (err) {
                console.warn('serializeMessage: blob upload failed for attachments, falling back to inline:', err);
            }
        }

        if (preservedPartThoughtSignatureRef) {
            partThoughtSignatureRef = preservedPartThoughtSignatureRef;
        } else if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.length > 0) {
            const sigBytes = utf8Encode(part.thoughtSignature);
            if (sigBytes.byteLength > blobStore.BLOB_SIZE_THRESHOLD) {
                try {
                    partThoughtSignatureRef = await blobStore.uploadEncryptedBlob(sigBytes, 'text/plain;charset=utf-8');
                    uploadedBlobIds.push(partThoughtSignatureRef.blobId);
                } catch (err) {
                    console.warn('serializeMessage: blob upload failed for part thoughtSignature, falling back to inline:', err);
                }
            }
        }

        const serializedAttachments: SerializedAttachment[] = await Promise.all(
            attachments.map(async (file: File, i: number) => {
                const ref = attachmentBlobRefs.get(i) ?? preservedAttachmentRefs.get(i);
                if (ref) {
                    return {
                        name: file.name,
                        type: file.type,
                        lastModified: file.lastModified,
                        size: file.size,
                        base64: ref as unknown as string | BlobReference,
                    };
                }

                return {
                    name: file.name,
                    type: file.type,
                    lastModified: file.lastModified,
                    size: file.size,
                    base64: await fileToBase64(file),
                };
            }),
        );

        const { _thoughtSignatureRef, ...restPart } = part;
        const serializedPart: any = {
            ...restPart,
            attachments: serializedAttachments,
        };

        if (partThoughtSignatureRef) {
            serializedPart.thoughtSignature = partThoughtSignatureRef as unknown as string | BlobReference;
        }

        return serializedPart;
    }));

    // ── Build final JSON ───────────────────────────────────────────────
    const serializable: any = { ...message, parts };
    // Strip runtime-only _blobRef from the serialized payload
    if (serializedGeneratedImages) {
        serializable.generatedImages = serializedGeneratedImages;
    }
    // Strip runtime-only refs from any generatedImages that may have been left inline
    if (serializable.generatedImages) {
        serializable.generatedImages = serializable.generatedImages.map((img: any) => {
            const { _blobRef, _thoughtSignatureRef, ...rest } = img;
            return rest;
        });
    }

    return { json: JSON.stringify(serializable), uploadedBlobIds };
}

function base64ToFile(base64: string, name: string, type: string, lastModified: number): File {
    const byteString = atob(base64);
    const byteNumbers = new Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
        byteNumbers[i] = byteString.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: type || 'application/octet-stream' });
    return new File([blob], name || 'attachment', { type: type || 'application/octet-stream', lastModified: lastModified || Date.now() });
}

/**
 * Deserialize a message from cloud sync JSON.
 *
 * Handles both old format (inline base64) and new format (BlobReference).
 * For blob references:
 *   - generatedImages: sets base64='' and _blobRef=ref (lazy resolution by renderer)
 *   - thought signatures: sets *_thoughtSignatureRef for lazy resolution during history build
 *   - attachments: creates a placeholder empty File with _blobRef metadata (lazy resolution)
 */
function deserializeMessage(message: any): Message {
    // ── Handle generatedImages (inline or blob ref) ────────────────────
    let generatedImages: GeneratedImage[] | undefined;
    if (Array.isArray(message.generatedImages) && message.generatedImages.length > 0) {
        generatedImages = message.generatedImages.map((img: any) => {
            const imageRef = isBlobReference(img.base64) ? img.base64 : undefined;
            const thoughtSignatureRef = isBlobReference(img.thoughtSignature) ? img.thoughtSignature : undefined;

            return {
                mimeType: img.mimeType,
                base64: imageRef ? '' : (typeof img.base64 === 'string' ? img.base64 : ''),
                thoughtSignature: thoughtSignatureRef
                    ? undefined
                    : (typeof img.thoughtSignature === 'string' ? img.thoughtSignature : undefined),
                thought: img.thought,
                _blobRef: imageRef,
                _thoughtSignatureRef: thoughtSignatureRef,
            } satisfies GeneratedImage;
        });
    }

    // ── Handle parts with attachments (inline or blob ref) ─────────────
    const parts = (message.parts || []).map((part: any) => {
        const serializedAttachments = Array.isArray(part.attachments) ? part.attachments : [];
        const files = serializedAttachments.map((att: any) => {
            if (isBlobReference(att.base64)) {
                // New format: blob reference attachment — create a small placeholder File.
                // The _blobRef metadata is stored on the File object for lazy resolution.
                const placeholder = new File([], att.name || 'attachment', {
                    type: att.type || 'application/octet-stream',
                    lastModified: att.lastModified || Date.now(),
                });
                // Attach the blob reference as an expando property for downstream resolution
                (placeholder as any)._blobRef = att.base64 as BlobReference;
                return placeholder;
            }
            // Old format: inline base64
            try {
                return base64ToFile(att.base64 || '', att.name || 'attachment', att.type || 'application/octet-stream', att.lastModified || Date.now());
            } catch {
                return null;
            }
        }).filter(Boolean);

        const thoughtSignatureRef = isBlobReference(part.thoughtSignature) ? part.thoughtSignature : undefined;

        return {
            ...part,
            thoughtSignature: thoughtSignatureRef
                ? undefined
                : (typeof part.thoughtSignature === 'string' ? part.thoughtSignature : undefined),
            _thoughtSignatureRef: thoughtSignatureRef,
            attachments: files,
        };
    });

    const result: any = { ...message, parts };
    if (generatedImages) {
        result.generatedImages = generatedImages;
    }
    return result as Message;
}

function parseChatMetadata(chatId: string, raw: any): { chat: DbChat; messageCount: number } {
    const messageCount = typeof raw?.messageCount === 'number'
        ? Math.max(0, raw.messageCount)
        : Array.isArray(raw?.content) ? raw.content.length : 0;

    return {
        chat: {
            id: chatId,
            title: typeof raw?.title === 'string' ? raw.title : '',
            timestamp: typeof raw?.timestamp === 'number' ? raw.timestamp : Date.now(),
            content: [],
            lastModified: raw?.lastModified ? new Date(raw.lastModified) : undefined,
            groupChat: raw?.groupChat,
        },
        messageCount,
    };
}

/**
 * Encrypt and push chat metadata to Supabase.
 */
export async function pushChat(chat: DbChat, messageCountOverride?: number): Promise<boolean> {
    if (!isSyncActive()) return false;
    const key = crypto.getCachedKey()!;
    const user = await getCurrentUser();
    if (!user) return false;

    try {
        const plaintext = serializeChatMetadata(chat, messageCountOverride);
        const { ciphertext, iv } = await crypto.encrypt(key, plaintext);

        const { error } = await supabase
            .from('user_synced_chats')
            .upsert({
                user_id: user.id,
                id: chat.id,
                encrypted_data: crypto.toHex(ciphertext),
                iv: crypto.toHex(iv),
                deleted: false,
            });

        if (error) {
            console.error('pushChat failed (chat id=%s):', chat.id, JSON.stringify(error));
            enqueue({ table: 'chats', operation: 'upsert', entityId: chat.id });
            return false;
        }

        return true;
    } catch (err) {
        console.error('pushChat error (chat id=%s):', chat.id, err);
        enqueue({ table: 'chats', operation: 'upsert', entityId: chat.id });
        return false;
    }
}

async function pushChatMessagesRange(chat: DbChat, startInclusive: number, endExclusive: number): Promise<number> {
    if (!isSyncActive()) return endExclusive - startInclusive;

    const key = crypto.getCachedKey();
    const user = await getCurrentUser();
    if (!key || !user) return endExclusive - startInclusive;

    let failures = 0;
    const clampedStart = Math.max(0, startInclusive);
    const clampedEnd = Math.min(endExclusive, chat.content.length);

    const flushRows = async (rows: Array<{
        user_id: string;
        chat_id: string;
        message_index: number;
        encrypted_data: string;
        iv: string;
        deleted: boolean;
    }>): Promise<boolean> => {
        if (rows.length === 0) return true;

        const rangeStart = rows[0].message_index;
        const rangeEnd = rows[rows.length - 1].message_index;
        const { error } = await supabase
            .from('user_synced_messages')
            .upsert(rows);

        if (error) {
            console.error(
                'pushChatMessagesRange failed (chat=%s range=%s-%s):',
                chat.id,
                rangeStart,
                rangeEnd,
                JSON.stringify(error),
            );
            failures += rows.length;
            enqueue({ table: 'chats', operation: 'upsert', entityId: chat.id });
            return false;
        }

        return true;
    };

    let rows: Array<{
        user_id: string;
        chat_id: string;
        message_index: number;
        encrypted_data: string;
        iv: string;
        deleted: boolean;
    }> = [];
    let currentBatchBytes = 2; // Account for JSON array brackets: []

    for (let messageIndex = clampedStart; messageIndex < clampedEnd; messageIndex++) {
        let uploadedBlobIdsForMessage: string[] = [];
        try {
            const message = chat.content[messageIndex];
            const { json: plaintext, uploadedBlobIds } = await serializeMessage(message);
            uploadedBlobIdsForMessage = uploadedBlobIds;
            const { ciphertext, iv } = await crypto.encrypt(key, plaintext);

            const row = {
                user_id: user.id,
                chat_id: chat.id,
                message_index: messageIndex,
                encrypted_data: crypto.toHex(ciphertext),
                iv: crypto.toHex(iv),
                deleted: false,
            };

            const rowBytes = new Blob([JSON.stringify(row)]).size;
            const separatorBytes = rows.length > 0 ? 1 : 0; // comma between array items

            const wouldExceedBytes = currentBatchBytes + separatorBytes + rowBytes > MESSAGE_UPSERT_MAX_BYTES;
            const wouldExceedRows = rows.length >= MESSAGE_UPSERT_MAX_ROWS;

            if ((wouldExceedBytes || wouldExceedRows) && rows.length > 0) {
                await flushRows(rows);
                rows = [];
                currentBatchBytes = 2;
            }

            rows.push(row);
            currentBatchBytes += (rows.length > 1 ? 1 : 0) + rowBytes;
        } catch (err) {
            console.error(
                'pushChatMessagesRange error (chat=%s idx=%s):',
                chat.id,
                messageIndex,
                err,
            );
            // Clean up only blobs uploaded while serializing this message.
            if (uploadedBlobIdsForMessage.length > 0) {
                blobStore.deleteBlobsBatch(uploadedBlobIdsForMessage).catch(() => {});
            }
            failures += 1;
            enqueue({ table: 'chats', operation: 'upsert', entityId: chat.id });
        }
    }

    if (rows.length > 0) {
        await flushRows(rows);
    }

    return failures;
}

function messageSignature(message: Message): string {
    return JSON.stringify({
        role: message.role,
        personalityid: message.personalityid,
        groundingContent: message.groundingContent,
        thinking: message.thinking,
        hidden: message.hidden,
        interrupted: message.interrupted,
        roundIndex: message.roundIndex,
        // Use content-addressable metadata for images instead of full base64.
        // This avoids re-syncing a message just because the storage format
        // changed (inline vs blob ref) while the image content is the same.
        generatedImages: (message.generatedImages || []).map((img) => ({
            mimeType: img.mimeType,
            thoughtSignatureSize: typeof img.thoughtSignature === 'string'
                ? img.thoughtSignature.length
                : img._thoughtSignatureRef?.size ?? 0,
            thought: img.thought,
            // Use base64 length as a stable size proxy — cheaper than hashing.
            // For blob-ref images (base64=''), use the _blobRef.size if available.
            size: img.base64.length > 0
                ? img.base64.length
                : img._blobRef?.size ?? 0,
        })),
        parts: (message.parts || []).map((part) => ({
            text: part.text,
            thoughtSignatureSize: typeof part.thoughtSignature === 'string'
                ? part.thoughtSignature.length
                : part._thoughtSignatureRef?.size ?? 0,
            attachments: Array.from(part.attachments || []).map((file) => ({
                name: file.name,
                size: file.size > 0
                    ? file.size
                    : ((file as any)?._blobRef?.size ?? 0),
                type: file.type,
                lastModified: file.lastModified,
            })),
        })),
    });
}

function firstDifferentMessageIndex(previous: Message[], current: Message[]): number {
    const shared = Math.min(previous.length, current.length);
    for (let i = 0; i < shared; i++) {
        if (messageSignature(previous[i]) !== messageSignature(current[i])) {
            return i;
        }
    }
    return shared;
}

async function markDeletedMessages(chatId: string, fromIndexInclusive: number, toIndexExclusive?: number): Promise<void> {
    if (!isSyncActive()) return;
    const user = await getCurrentUser();
    if (!user) return;

    const startIndex = Math.max(0, fromIndexInclusive);
    const boundedEnd = typeof toIndexExclusive === 'number'
        ? Math.max(startIndex, toIndexExclusive)
        : null;

    const markRange = async (rangeStart: number, rangeEndExclusive?: number): Promise<boolean> => {
        let query = supabase
            .from('user_synced_messages')
            .update({ deleted: true })
            .eq('user_id', user.id)
            .eq('chat_id', chatId)
            .gte('message_index', rangeStart);

        if (typeof rangeEndExclusive === 'number') {
            query = query.lt('message_index', rangeEndExclusive);
        }

        const { error } = await query;
        if (error) {
            console.error(
                'markDeletedMessages failed (chat=%s, from=%s, to=%s):',
                chatId,
                rangeStart,
                rangeEndExclusive ?? '∞',
                error,
            );
            return false;
        }

        return true;
    };

    if (boundedEnd === null) {
        await markRange(startIndex);
        return;
    }

    for (let chunkStart = startIndex; chunkStart < boundedEnd; chunkStart += MESSAGE_DELETE_MARK_BATCH_SIZE) {
        const chunkEnd = Math.min(boundedEnd, chunkStart + MESSAGE_DELETE_MARK_BATCH_SIZE);
        const ok = await markRange(chunkStart, chunkEnd);
        if (!ok) {
            break;
        }
    }
}

async function pushChatIncremental(previous: DbChat | undefined, current: DbChat): Promise<boolean> {
    const previousMessages = previous?.content || [];
    const currentMessages = current.content || [];
    const cachedRemoteCount = remoteMessageCountByChatId.get(current.id) ?? 0;
    const previousCount = previousMessages.length;
    const baselineCount = Math.max(cachedRemoteCount, previousCount);
    const hasPotentiallyPartialSnapshot = previousCount < baselineCount && currentMessages.length <= previousCount;

    const metadataMessageCount = hasPotentiallyPartialSnapshot
        ? baselineCount
        : currentMessages.length;

    const metadataOk = await pushChat(current, metadataMessageCount);
    if (!metadataOk) return false;

    if (hasPotentiallyPartialSnapshot) {
        console.warn(
            'pushChatIncremental: detected partial snapshot for chat=%s (baseline=%s previous=%s current=%s). Skipping message body upsert to avoid data loss.',
            current.id,
            baselineCount,
            previousCount,
            currentMessages.length,
        );
        remoteMessageCountByChatId.set(current.id, metadataMessageCount);
        return true;
    }

    const diffStart = firstDifferentMessageIndex(previousMessages, currentMessages);

    const failures = await pushChatMessagesRange(current, diffStart, currentMessages.length);
    if (currentMessages.length < previousMessages.length) {
        await markDeletedMessages(current.id, currentMessages.length, previousMessages.length);

        // Clean up blobs from deleted messages (fire-and-forget).
        // The previous messages are in memory so we can extract blob refs directly.
        const deletedMessages = previousMessages.slice(currentMessages.length);
        const blobIds = extractBlobIdsFromMessages(deletedMessages);
        if (blobIds.length > 0) {
            blobStore.deleteBlobsBatch(blobIds).catch((err) => {
                console.warn(`pushChatIncremental: blob cleanup failed for ${blobIds.length} blobs:`, err);
            });
        }
    }

    hydratedChats.add(current.id);
    remoteMessageCountByChatId.set(current.id, currentMessages.length);
    return failures === 0;
}

/**
 * Extract blob IDs from in-memory Message objects.
 * Used when the messages are already decrypted/hydrated locally
 * (e.g., during pushChatIncremental when messages are removed).
 */
function extractBlobIdsFromMessages(messages: Message[]): string[] {
    const blobIds = new Set<string>();
    for (const msg of messages) {
        if (msg.generatedImages) {
            for (const img of msg.generatedImages) {
                if (img._blobRef) {
                    blobIds.add(img._blobRef.blobId);
                }
                if (img._thoughtSignatureRef) {
                    blobIds.add(img._thoughtSignatureRef.blobId);
                }
            }
        }
        for (const part of msg.parts || []) {
            if (part._thoughtSignatureRef) {
                blobIds.add(part._thoughtSignatureRef.blobId);
            }
            const attachments = Array.from(part.attachments || []);
            for (const file of attachments) {
                const ref = (file as any)?._blobRef;
                if (ref && typeof ref.blobId === 'string') {
                    blobIds.add(ref.blobId);
                }
            }
        }
    }
    return Array.from(blobIds);
}

/**
 * Extract blob IDs from a set of encrypted message rows.
 * Decrypts each message, parses the JSON, and collects any BlobReference blobIds
 * found in generatedImages, part thought signatures, or parts[].attachments.
 *
 * Best-effort: decryption failures are silently skipped.
 */
async function extractBlobIdsFromEncryptedMessages(
    rows: Array<{ encrypted_data: string; iv: string }>,
): Promise<string[]> {
    const key = crypto.getCachedKey();
    if (!key) return [];

    const blobIds = new Set<string>();
    for (const row of rows) {
        try {
            const plaintext = await crypto.decrypt(
                key,
                crypto.fromHex(row.encrypted_data),
                crypto.fromHex(row.iv),
            );
            const parsed = JSON.parse(plaintext);

            // Check generatedImages
            if (Array.isArray(parsed.generatedImages)) {
                for (const img of parsed.generatedImages) {
                    if (isBlobReference(img.base64)) {
                        blobIds.add(img.base64.blobId);
                    }
                    if (isBlobReference(img.thoughtSignature)) {
                        blobIds.add(img.thoughtSignature.blobId);
                    }
                }
            }

            // Check parts[].attachments
            if (Array.isArray(parsed.parts)) {
                for (const part of parsed.parts) {
                    if (isBlobReference(part.thoughtSignature)) {
                        blobIds.add(part.thoughtSignature.blobId);
                    }
                    if (Array.isArray(part.attachments)) {
                        for (const att of part.attachments) {
                            if (isBlobReference(att.base64)) {
                                blobIds.add(att.base64.blobId);
                            }
                        }
                    }
                }
            }
        } catch {
            // Decryption or parse failure — skip this message
        }
    }

    return Array.from(blobIds);
}

/**
 * Mark a chat as deleted on Supabase (soft delete).
 * Also cleans up any associated encrypted blobs in storage.
 */
export async function deleteSyncedChat(chatId: string): Promise<boolean> {
    if (!isSyncActive()) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    try {
        // ── Collect blob IDs from messages before soft-deleting ─────────
        // We need to read the encrypted messages BEFORE marking them deleted
        // so we can extract any blob references for cleanup.
        const blobIdsToDelete: string[] = [];
        try {
            let cursor = 0;
            const BLOB_SCAN_PAGE = 500;
            while (true) {
                const { data, error } = await supabase
                    .from('user_synced_messages')
                    .select('encrypted_data, iv')
                    .eq('user_id', user.id)
                    .eq('chat_id', chatId)
                    .eq('deleted', false)
                    .gte('message_index', cursor)
                    .order('message_index', { ascending: true })
                    .limit(BLOB_SCAN_PAGE);

                if (error || !data || data.length === 0) break;

                const ids = await extractBlobIdsFromEncryptedMessages(data);
                blobIdsToDelete.push(...ids);

                if (data.length < BLOB_SCAN_PAGE) break;
                cursor += data.length;
            }
        } catch (err) {
            console.warn('deleteSyncedChat: blob ID extraction failed (will skip blob cleanup):', err);
        }

        // ── Soft-delete the chat ───────────────────────────────────────
        const { error: chatError } = await supabase
            .from('user_synced_chats')
            .update({ deleted: true })
            .eq('user_id', user.id)
            .eq('id', chatId);

        if (chatError) {
            console.error('deleteSyncedChat failed to mark chat deleted:', chatError);
            enqueue({ table: 'chats', operation: 'delete', entityId: chatId });
            return false;
        }

        // ── Soft-delete all messages ───────────────────────────────────
        const { data: latestMessage, error: latestError } = await supabase
            .from('user_synced_messages')
            .select('message_index')
            .eq('user_id', user.id)
            .eq('chat_id', chatId)
            .eq('deleted', false)
            .order('message_index', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (latestError) {
            console.error('deleteSyncedChat failed to read latest message index:', latestError);
            enqueue({ table: 'chats', operation: 'delete', entityId: chatId });
        } else if (latestMessage && typeof latestMessage.message_index === 'number') {
            const maxIndex = latestMessage.message_index;
            for (let start = 0; start <= maxIndex; start += CHAT_DELETE_MARK_BATCH_SIZE) {
                const endExclusive = start + CHAT_DELETE_MARK_BATCH_SIZE;
                const { error: messagesError } = await supabase
                    .from('user_synced_messages')
                    .update({ deleted: true })
                    .eq('user_id', user.id)
                    .eq('chat_id', chatId)
                    .eq('deleted', false)
                    .gte('message_index', start)
                    .lt('message_index', endExclusive);

                if (messagesError) {
                    console.error(
                        'deleteSyncedChat failed while marking message chunk deleted (chat=%s, start=%s, end=%s):',
                        chatId,
                        start,
                        endExclusive,
                        messagesError,
                    );
                    enqueue({ table: 'chats', operation: 'delete', entityId: chatId });
                    break;
                }
            }
        }

        // ── Clean up blobs (fire-and-forget) ───────────────────────────
        if (blobIdsToDelete.length > 0) {
            blobStore.deleteBlobsBatch(blobIdsToDelete).catch((err) => {
                console.warn(`deleteSyncedChat: blob cleanup failed for ${blobIdsToDelete.length} blobs:`, err);
            });
        }

        hydratedChats.delete(chatId);
        remoteMessageCountByChatId.delete(chatId);
        return true;
    } catch (err) {
        console.error('deleteSyncedChat error:', err);
        enqueue({ table: 'chats', operation: 'delete', entityId: chatId });
        return false;
    }
}

/**
 * Encrypt and push a single persona to Supabase.
 */
export async function pushPersona(persona: DbPersonality): Promise<boolean> {
    if (!isSyncActive()) return false;
    const key = crypto.getCachedKey()!;
    const user = await getCurrentUser();
    if (!user) return false;

    try {
        const plaintext = JSON.stringify(persona);
        const { ciphertext, iv } = await crypto.encrypt(key, plaintext);

        const { error } = await supabase
            .from('user_synced_personas')
            .upsert({
                user_id: user.id,
                id: persona.id,
                encrypted_data: crypto.toHex(ciphertext),
                iv: crypto.toHex(iv),
                deleted: false,
            });

        if (error) {
            console.error('pushPersona failed:', error);
            enqueue({ table: 'personas', operation: 'upsert', entityId: persona.id });
            return false;
        }

        return true;
    } catch (err) {
        console.error('pushPersona error:', err);
        enqueue({ table: 'personas', operation: 'upsert', entityId: persona.id });
        return false;
    }
}

/**
 * Mark a persona as deleted on Supabase (soft delete).
 */
export async function deleteSyncedPersona(personaId: string): Promise<boolean> {
    if (!isSyncActive()) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    try {
        const { error } = await supabase
            .from('user_synced_personas')
            .update({ deleted: true })
            .eq('user_id', user.id)
            .eq('id', personaId);

        if (error) {
            console.error('deleteSyncedPersona failed:', error);
            enqueue({ table: 'personas', operation: 'delete', entityId: personaId });
            return false;
        }
        return true;
    } catch (err) {
        console.error('deleteSyncedPersona error:', err);
        enqueue({ table: 'personas', operation: 'delete', entityId: personaId });
        return false;
    }
}

/**
 * Encrypt and push user settings to Supabase.
 */
export async function pushSettings(settings: Record<string, string>): Promise<boolean> {
    if (!isSyncActive()) return false;
    const key = crypto.getCachedKey()!;
    const user = await getCurrentUser();
    if (!user) return false;

    try {
        const plaintext = JSON.stringify(settings);
        const { ciphertext, iv } = await crypto.encrypt(key, plaintext);

        const { error } = await supabase
            .from('user_synced_settings')
            .upsert({
                user_id: user.id,
                encrypted_data: crypto.toHex(ciphertext),
                iv: crypto.toHex(iv),
            });

        if (error) {
            console.error('pushSettings failed:', error);
            enqueue({ table: 'settings', operation: 'upsert' });
            return false;
        }

        return true;
    } catch (err) {
        console.error('pushSettings error:', err);
        enqueue({ table: 'settings', operation: 'upsert' });
        return false;
    }
}

/**
 * Push ALL local data to Supabase (used on first sync setup or manual "Sync Now").
 */
export async function pushAll(): Promise<void> {
    if (!isSyncActive()) return;
    setSyncStatus('syncing');

    let chatFailures = 0;
    let personaFailures = 0;

    try {
        // Push all chats
        const chats = await db.chats.toArray();
        for (const chat of chats) {
            const metadataOk = await pushChat(chat);
            const failures = await pushChatMessagesRange(chat, 0, chat.content.length);
            const ok = metadataOk && failures === 0;
            if (!ok) chatFailures++;
            hydratedChats.add(chat.id);
        }

        // Push all personas
        const personas = await db.personalities.toArray();
        for (const persona of personas) {
            const ok = await pushPersona(persona);
            if (!ok) personaFailures++;
        }

        // Push settings
        await pushCurrentSettings();

        // Update quota once after all uploads rather than per-item
        await fetchSyncQuota();

        if (chatFailures > 0 || personaFailures > 0) {
            const detail = [chatFailures && `${chatFailures} chat(s)`, personaFailures && `${personaFailures} persona(s)`].filter(Boolean).join(', ');
            setSyncStatus('error', `Failed to sync: ${detail}. Check console for details.`);
            console.error(`pushAll: ${detail} failed to sync. Enable DevTools → Console to see the Supabase error.`);
        } else {
            setSyncStatus('synced');
        }
    } catch (err) {
        console.error('pushAll failed:', err);
        setSyncStatus('error', String(err));
    }
}

/**
 * Gather current settings from localStorage and push them.
 */
export async function pushCurrentSettings(): Promise<boolean> {
    const settings: Record<string, string> = {};
    for (const key of SYNCABLE_SETTINGS_KEYS) {
        const val = localStorage.getItem(key);
        if (val !== null) settings[key] = val;
    }

    return pushSettings(settings);
}

function hasInlineMediaAboveThreshold(message: any): boolean {
    if (Array.isArray(message?.generatedImages)) {
        for (const img of message.generatedImages) {
            if (typeof img?.base64 === 'string' && estimateBase64ByteLength(img.base64) > blobStore.BLOB_SIZE_THRESHOLD) {
                return true;
            }
            if (typeof img?.thoughtSignature === 'string' && utf8Encode(img.thoughtSignature).byteLength > blobStore.BLOB_SIZE_THRESHOLD) {
                return true;
            }
        }
    }

    if (Array.isArray(message?.parts)) {
        for (const part of message.parts) {
            if (typeof part?.thoughtSignature === 'string' && utf8Encode(part.thoughtSignature).byteLength > blobStore.BLOB_SIZE_THRESHOLD) {
                return true;
            }

            if (typeof part?.inlineData?.data === 'string' && estimateBase64ByteLength(part.inlineData.data) > blobStore.BLOB_SIZE_THRESHOLD) {
                return true;
            }

            if (!Array.isArray(part?.attachments)) continue;
            for (const att of part.attachments) {
                if (typeof att?.base64 === 'string' && estimateBase64ByteLength(att.base64) > blobStore.BLOB_SIZE_THRESHOLD) {
                    return true;
                }
            }
        }
    }

    return false;
}

function emitLegacyMediaMigrationProgress(
    cb: ((progress: LegacyMediaMigrationProgress) => void) | undefined,
    progress: LegacyMediaMigrationProgress,
): void {
    cb?.(progress);
}

export async function shouldRunLegacyMediaMigration(): Promise<boolean> {
    if (!isSyncActive()) return false;
    return !(await hasCompletedLegacyMediaMigration());
}

export async function migrateLegacySyncedMediaToBlobs(
    onProgress?: (progress: LegacyMediaMigrationProgress) => void,
): Promise<LegacyMediaMigrationResult> {
    if (!isSyncActive()) {
        throw new Error('Cloud sync is not active. Unlock sync before running migration.');
    }

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) {
        throw new Error('Not authenticated or key not cached.');
    }

    const totalCountQuery = await supabase
        .from('user_synced_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('deleted', false);

    if (totalCountQuery.error) {
        throw new Error(`Failed to count synced messages: ${totalCountQuery.error.message}`);
    }

    const totalRows = totalCountQuery.count ?? 0;
    let scannedRows = 0;
    let migratedRows = 0;
    let failedRows = 0;

    emitLegacyMediaMigrationProgress(onProgress, {
        phase: 'starting',
        totalRows,
        scannedRows,
        migratedRows,
        failedRows,
        message: 'Preparing migration…',
    });

    if (totalRows === 0) {
        markLegacyMediaMigrationCompleteLocally();
        await pushCurrentSettings();
        emitLegacyMediaMigrationProgress(onProgress, {
            phase: 'done',
            totalRows,
            scannedRows,
            migratedRows,
            failedRows,
            message: 'No synced messages found. Migration complete.',
        });
        return { totalRows, scannedRows, migratedRows, failedRows };
    }

    for (let offset = 0; offset < totalRows; offset += LEGACY_MEDIA_MIGRATION_BATCH_SIZE) {
        const { data, error } = await supabase
            .from('user_synced_messages')
            .select('chat_id, message_index, encrypted_data, iv')
            .eq('user_id', user.id)
            .eq('deleted', false)
            .order('chat_id', { ascending: true })
            .order('message_index', { ascending: true })
            .range(offset, offset + LEGACY_MEDIA_MIGRATION_BATCH_SIZE - 1);

        if (error) {
            throw new Error(`Failed to fetch synced messages for migration: ${error.message}`);
        }

        if (!data || data.length === 0) {
            break;
        }

        for (const row of data) {
            scannedRows += 1;
            emitLegacyMediaMigrationProgress(onProgress, {
                phase: 'scanning',
                totalRows,
                scannedRows,
                migratedRows,
                failedRows,
                message: `Scanning message ${scannedRows} / ${totalRows}…`,
            });

            if ((row.encrypted_data?.length ?? 0) < LEGACY_MEDIA_MIGRATION_MIN_HEX_CANDIDATE_LENGTH) {
                continue;
            }

            try {
                const plaintext = await crypto.decrypt(
                    key,
                    crypto.fromHex(row.encrypted_data),
                    crypto.fromHex(row.iv),
                );

                const parsed = JSON.parse(plaintext);
                if (!hasInlineMediaAboveThreshold(parsed)) {
                    continue;
                }

                emitLegacyMediaMigrationProgress(onProgress, {
                    phase: 'migrating',
                    totalRows,
                    scannedRows,
                    migratedRows,
                    failedRows,
                    message: `Migrating media (${migratedRows + 1} so far)…`,
                });

                const deserialized = deserializeMessage(parsed);
                const { json, uploadedBlobIds } = await serializeMessage(deserialized);
                let stillHasInlineMedia = false;
                try {
                    stillHasInlineMedia = hasInlineMediaAboveThreshold(JSON.parse(json));
                } catch {
                    // If the serialized JSON is invalid for any reason, treat this row
                    // as unresolved so the migration fails loudly and can be retried.
                    stillHasInlineMedia = true;
                }

                // If serialization didn't materially change the payload, skip update.
                if (json === plaintext) {
                    if (uploadedBlobIds.length > 0) {
                        await blobStore.deleteBlobsBatch(uploadedBlobIds);
                    }

                    if (stillHasInlineMedia) {
                        failedRows += 1;
                        console.error(
                            'Legacy media migration: row still contains oversized inline media after conversion attempt',
                            row.chat_id,
                            row.message_index,
                        );
                    }
                    continue;
                }

                const { ciphertext, iv } = await crypto.encrypt(key, json);
                const { error: updateError } = await supabase
                    .from('user_synced_messages')
                    .update({
                        encrypted_data: crypto.toHex(ciphertext),
                        iv: crypto.toHex(iv),
                    })
                    .eq('user_id', user.id)
                    .eq('chat_id', row.chat_id)
                    .eq('message_index', row.message_index);

                if (updateError) {
                    if (uploadedBlobIds.length > 0) {
                        await blobStore.deleteBlobsBatch(uploadedBlobIds);
                    }
                    failedRows += 1;
                    console.error(
                        'Legacy media migration: failed to update message row',
                        row.chat_id,
                        row.message_index,
                        updateError,
                    );
                    continue;
                }

                if (stillHasInlineMedia) {
                    failedRows += 1;
                    console.error(
                        'Legacy media migration: row updated but oversized inline media still remains',
                        row.chat_id,
                        row.message_index,
                    );
                    continue;
                }

                migratedRows += 1;
            } catch (rowError) {
                failedRows += 1;
                console.error(
                    'Legacy media migration: failed processing message row',
                    row.chat_id,
                    row.message_index,
                    rowError,
                );
            }
        }
    }

    emitLegacyMediaMigrationProgress(onProgress, {
        phase: 'finalizing',
        totalRows,
        scannedRows,
        migratedRows,
        failedRows,
        message: 'Finalizing migration…',
    });

    if (failedRows > 0) {
        throw new Error(`Migration completed with ${failedRows} failed row(s). Please retry.`);
    }

    markLegacyMediaMigrationCompleteLocally();
    await pushCurrentSettings();
    await fetchSyncQuota();

    emitLegacyMediaMigrationProgress(onProgress, {
        phase: 'done',
        totalRows,
        scannedRows,
        migratedRows,
        failedRows,
        message: 'Migration complete.',
    });

    return {
        totalRows,
        scannedRows,
        migratedRows,
        failedRows,
    };
}

// ── Pull operations (remote → local) ───────────────────────────────────────

/**
 * Pull all remote data and merge into local IndexedDB.
 * Remote-wins on conflict (by updated_at comparison).
 */
export async function pullAll(): Promise<void> {
    if (!isSyncActive()) return;
    setSyncStatus('syncing');

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) {
        setSyncStatus('error', 'Not authenticated or key not cached');
        return;
    }

    try {
        hydratedChats.clear();
        remoteMessageCountByChatId.clear();
        await withSyncHooksSuppressed(async () => {
            await pullChats(user.id, key);
            await pullPersonas(user.id, key);
            await pullSettings(user.id, key);
        });

        setSyncStatus('synced');
        dispatchAppEvent('sync-data-pulled', {});
    } catch (err) {
        console.error('pullAll failed:', err);
        setSyncStatus('error', String(err));
    }
}

async function pullChats(userId: string, key: CryptoKey, options?: { hydrateMessages?: boolean; materializeMedia?: boolean }): Promise<void> {
    const data = await fetchAllSyncedChatsPaged(userId);

    if (!data) {
        console.error('pullChats failed to read synced chats');
        return;
    }

    for (const row of data) {
        if (row.deleted) {
            // Remove locally if it exists
            try {
                await db.chats.delete(row.id);
                hydratedChats.delete(row.id);
                remoteMessageCountByChatId.delete(row.id);
            } catch { /* may not exist */ }
            continue;
        }

        try {
            const plaintext = await crypto.decrypt(
                key,
                crypto.fromHex(row.encrypted_data),
                crypto.fromHex(row.iv),
            );
            const parsed = JSON.parse(plaintext);
            const { chat, messageCount } = parseChatMetadata(row.id, parsed);
            const existing = await db.chats.get(row.id);
            remoteMessageCountByChatId.set(row.id, messageCount);

            let content: Message[] = existing?.content ?? [];
            if (options?.hydrateMessages) {
                const totalCount = await getRemoteMessageCount(row.id, userId);
                const remoteMessages = await fetchRemoteMessageRange({
                    userId,
                    key,
                    chatId: row.id,
                    startIndex: 0,
                    endExclusive: totalCount,
                });

                if (remoteMessages !== null) {
                    if (remoteMessages.length > 0) {
                        content = options?.materializeMedia
                            ? await Promise.all(remoteMessages.map((message) => materializeMessageBlobBackedMedia(message)))
                            : remoteMessages;
                    } else if (Array.isArray(parsed?.content)) {
                        content = parsed.content as Message[];
                    } else {
                        content = [];
                    }
                    remoteMessageCountByChatId.set(row.id, content.length);
                    hydratedChats.add(row.id);
                }
            }

            // Preserve current local message cache; messages hydrate on demand.
            await db.chats.put({
                ...chat,
                content,
            });

            // If this row is still old full-chat format, compact it to metadata-only.
            if (Array.isArray(parsed?.content)) {
                await pushChat({ ...chat, content: parsed.content });
            }
        } catch (err) {
            console.error(`pullChats: failed to decrypt chat ${row.id}`, err);
        }
    }
}

async function getRemoteMessageCount(chatId: string, userId: string, options?: { signal?: AbortSignal }): Promise<number> {
    const cached = remoteMessageCountByChatId.get(chatId);

    let query = supabase
        .from('user_synced_messages')
        .select('message_index')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .eq('deleted', false)
        .order('message_index', { ascending: false })
        .limit(1);

    if (options?.signal) {
        query = query.abortSignal(options.signal);
    }

    const { data, error } = await query;

    if (error) {
        if (error.message?.includes('AbortError') || (error as any)?.code === 'ABORT_ERR') {
            throw new DOMException('The operation was aborted.', 'AbortError');
        }
        console.error('getRemoteMessageCount failed:', error);
        return typeof cached === 'number' ? cached : 0;
    }

    const queriedCount = data && data.length > 0 ? Number(data[0].message_index) + 1 : 0;
    const count = typeof cached === 'number' ? Math.max(cached, queriedCount) : queriedCount;
    remoteMessageCountByChatId.set(chatId, count);
    return count;
}

async function fetchRemoteMessageRange(args: {
    userId: string;
    key: CryptoKey;
    chatId: string;
    startIndex: number;
    endExclusive: number;
    signal?: AbortSignal;
}): Promise<Message[] | null> {
    const { userId, key, chatId, startIndex, endExclusive, signal } = args;
    if (endExclusive <= startIndex) return [];

    const allMessages: Message[] = [];
    let cursor = startIndex;

    while (cursor < endExclusive) {
        if (signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
        }

        let query = supabase
            .from('user_synced_messages')
            .select('message_index, encrypted_data, iv')
            .eq('user_id', userId)
            .eq('chat_id', chatId)
            .eq('deleted', false)
            .gte('message_index', cursor)
            .lt('message_index', endExclusive)
            .order('message_index', { ascending: true })
            .limit(READ_PAGE_SIZE);

        if (signal) {
            query = query.abortSignal(signal);
        }

        const { data, error } = await query;

        if (error) {
            if (error.message?.includes('AbortError') || (error as any)?.code === 'ABORT_ERR') {
                throw new DOMException('The operation was aborted.', 'AbortError');
            }
            console.error(`fetchRemoteMessageRange failed (chat=${chatId} cursor=${cursor}):`, error);
            return null;
        }

        if (!data || data.length === 0) {
            break;
        }

        // Advance cursor past the highest message_index we received.
        // This is robust against server caps lower than READ_PAGE_SIZE
        // and against sparse/non-contiguous indices.
        const lastIndex = Number(data[data.length - 1].message_index);
        if (!Number.isFinite(lastIndex) || lastIndex < cursor) {
            console.error(
                `fetchRemoteMessageRange: cursor cannot advance (chat=${chatId} cursor=${cursor} lastIndex=${lastIndex}). Aborting to prevent infinite loop.`,
            );
            return null;
        }
        cursor = lastIndex + 1;

        // Decrypt rows in parallel (bounded concurrency)
        const pageMessages: Array<Message | null> = new Array(data.length).fill(null);
        let nextRowIndex = 0;

        const workerCount = Math.max(1, Math.min(MESSAGE_DECRYPT_CONCURRENCY, data.length));
        const workers = Array.from({ length: workerCount }, async () => {
            while (true) {
                if (signal?.aborted) {
                    throw new DOMException('The operation was aborted.', 'AbortError');
                }

                const rowIndex = nextRowIndex;
                nextRowIndex += 1;
                if (rowIndex >= data.length) return;

                const row = data[rowIndex];
                try {
                    const plaintext = await crypto.decrypt(
                        key,
                        crypto.fromHex(row.encrypted_data),
                        crypto.fromHex(row.iv),
                    );
                    pageMessages[rowIndex] = deserializeMessage(JSON.parse(plaintext));
                } catch (err) {
                    console.error(`fetchRemoteMessageRange: failed to decrypt chat=${chatId} idx=${row.message_index}`, err);
                }
            }
        });

        await Promise.all(workers);
        allMessages.push(...pageMessages.filter((m): m is Message => m !== null));
    }

    return allMessages;
}

export async function hydrateLatestChatMessagesWindow(
    chatId: string,
    limit: number,
    options?: { signal?: AbortSignal },
): Promise<RemoteMessageWindow | null> {
    if (!isSyncActive()) return null;

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return null;

    const totalCount = await getRemoteMessageCount(chatId, user.id, { signal: options?.signal });
    const safeLimit = Math.max(1, limit);
    const startIndex = Math.max(0, totalCount - safeLimit);
    const endExclusive = totalCount;

    const messages = await fetchRemoteMessageRange({
        userId: user.id,
        key,
        chatId,
        startIndex,
        endExclusive,
        signal: options?.signal,
    });

    if (messages === null) return null;

    return {
        messages,
        startIndex,
        endExclusive,
        totalCount,
        hasMoreOlder: startIndex > 0,
    };
}

export async function hydrateOlderChatMessagesWindow(
    chatId: string,
    beforeIndex: number,
    limit: number,
    options?: { signal?: AbortSignal },
): Promise<RemoteMessageWindow | null> {
    if (!isSyncActive()) return null;

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return null;

    const totalCount = await getRemoteMessageCount(chatId, user.id, { signal: options?.signal });
    const endExclusive = Math.max(0, Math.min(beforeIndex, totalCount));
    const safeLimit = Math.max(1, limit);
    const startIndex = Math.max(0, endExclusive - safeLimit);

    const messages = await fetchRemoteMessageRange({
        userId: user.id,
        key,
        chatId,
        startIndex,
        endExclusive,
        signal: options?.signal,
    });

    if (messages === null) return null;

    return {
        messages,
        startIndex,
        endExclusive,
        totalCount,
        hasMoreOlder: startIndex > 0,
    };
}

export async function hydrateChatMessages(chatId: string): Promise<boolean> {
    if (!isSyncActive()) return false;
    if (hydratedChats.has(chatId)) return true;

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return false;

    const totalCount = await getRemoteMessageCount(chatId, user.id);
    const messages = await fetchRemoteMessageRange({
        userId: user.id,
        key,
        chatId,
        startIndex: 0,
        endExclusive: totalCount,
    });

    if (messages === null) {
        console.error('hydrateChatMessages failed');
        return false;
    }

    const chat = await db.chats.get(chatId);
    if (!chat) return false;

    await withSyncHooksSuppressed(async () => {
        await db.chats.put({
            ...chat,
            content: messages,
        });
    });

    hydratedChats.add(chatId);
    remoteMessageCountByChatId.set(chatId, messages.length);
    return true;
}

export async function fetchAllSyncedChatMessages(chatId: string, options?: { signal?: AbortSignal }): Promise<Message[] | null> {
    if (!isSyncActive()) return null;

    const user = await getCurrentUser();
    const key = crypto.getCachedKey();
    if (!user || !key) return null;

    const totalCount = await getRemoteMessageCount(chatId, user.id, { signal: options?.signal });
    return fetchRemoteMessageRange({
        userId: user.id,
        key,
        chatId,
        startIndex: 0,
        endExclusive: totalCount,
        signal: options?.signal,
    });
}

async function pullPersonas(userId: string, key: CryptoKey): Promise<void> {
    const data = await fetchAllSyncedPersonasPaged(userId);

    if (!data) {
        console.error('pullPersonas failed to read synced personas');
        return;
    }

    for (const row of data) {
        if (row.deleted) {
            try { await db.personalities.delete(row.id); } catch { /* may not exist */ }
            continue;
        }

        try {
            const plaintext = await crypto.decrypt(
                key,
                crypto.fromHex(row.encrypted_data),
                crypto.fromHex(row.iv),
            );
            const persona: DbPersonality = JSON.parse(plaintext);
            const now = Date.now();
            if (typeof (persona as any).dateAdded !== 'number') {
                (persona as any).dateAdded = now;
            }
            if (typeof (persona as any).lastModified !== 'number') {
                (persona as any).lastModified = (persona as any).dateAdded;
            }
            await db.personalities.put(persona);
        } catch (err) {
            console.error(`pullPersonas: failed to decrypt persona ${row.id}`, err);
        }
    }
}

async function pullSettings(userId: string, key: CryptoKey): Promise<void> {
    const { data, error } = await supabase
        .from('user_synced_settings')
        .select('encrypted_data, iv, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) return;

    try {
        const plaintext = await crypto.decrypt(
            key,
            crypto.fromHex(data.encrypted_data),
            crypto.fromHex(data.iv),
        );
        const settings: Record<string, string> = JSON.parse(plaintext);

        // Merge into localStorage (remote wins)
        for (const [k, v] of Object.entries(settings)) {
            localStorage.setItem(k, v);
        }
    } catch (err) {
        console.error('pullSettings: failed to decrypt settings', err);
    }
}

// ── Offline queue flush ────────────────────────────────────────────────────

async function flushOfflineQueue(): Promise<void> {
    if (offlineQueue.length === 0) return;
    if (!isSyncActive()) return;

    const pending = [...offlineQueue];
    offlineQueue = [];
    saveOfflineQueue();

    for (const op of pending) {
        try {
            if (op.table === 'chats' && op.operation === 'upsert' && op.entityId) {
                const chat = await db.chats.get(op.entityId);
                if (chat) await pushChatIncremental(undefined, chat);
            } else if (op.table === 'chats' && op.operation === 'delete' && op.entityId) {
                await deleteSyncedChat(op.entityId);
            } else if (op.table === 'personas' && op.operation === 'upsert' && op.entityId) {
                const persona = await db.personalities.get(op.entityId);
                if (persona) await pushPersona(persona);
            } else if (op.table === 'personas' && op.operation === 'delete' && op.entityId) {
                await deleteSyncedPersona(op.entityId);
            } else if (op.table === 'settings' && op.operation === 'upsert') {
                await pushCurrentSettings();
            }
        } catch (err) {
            console.error('flushOfflineQueue: failed to process operation', op, err);
            const retries = (op.retryCount ?? 0) + 1;
            if (retries < MAX_OFFLINE_RETRIES) {
                offlineQueue.push({ ...op, retryCount: retries });
            } else {
                console.warn('flushOfflineQueue: dropping operation after max retries', op);
            }
        }
    }

    saveOfflineQueue();
}

// ── Initialization ─────────────────────────────────────────────────────────

/**
 * Initialize sync service. Called from main.ts.
 *
 * - Loads offline queue from localStorage
 * - Listens for online/offline events
 * - Attaches Dexie table hooks for automatic sync on writes
 */
export function initialize(): void {
    loadOfflineQueue();

    // Online/offline listeners
    window.addEventListener('online', async () => {
        if (isSyncActive()) {
            await flushOfflineQueue();
        }
    });

    window.addEventListener('offline', () => {
        if (syncPrefsCache?.syncEnabled) {
            setSyncStatus('offline');
        }
    });

    // Attach Dexie hooks for automatic sync-on-write.
    // These fire after every local DB mutation, regardless of which service triggered it.
    attachDexieHooks();
}

/**
 * Attach Dexie CRUD hooks so that every local write is automatically
 * pushed to Supabase without modifying every call site.
 */
function attachDexieHooks(): void {
    // ── Chats ──────────────────────────────────────────────────────────
    db.chats.hook('creating', function (_primKey, obj) {
        // 'this' context has onsuccess callback
        (this as any).onsuccess = (key: any) => {
            if (!isSyncActive() || areSyncHooksSuppressed()) return;
            const chatWithId = { ...obj, id: key } as DbChat;
            // Fire and forget — don't block the local write
            pushChatIncremental(undefined, chatWithId).catch(err => console.warn('Sync hook (chat create):', err));
        };
    });

    db.chats.hook('updating', function (_mods, primKey, obj) {
        (this as any).onsuccess = async () => {
            if (!isSyncActive() || areSyncHooksSuppressed()) return;
            const previous = obj as DbChat;
            const current = await db.chats.get(String(primKey));
            if (!current) return;
            await pushChatIncremental(previous, current).catch(err => console.warn('Sync hook (chat update):', err));
        };
    });

    db.chats.hook('deleting', function (primKey) {
        (this as any).onsuccess = () => {
            if (!isSyncActive() || areSyncHooksSuppressed()) return;
            deleteSyncedChat(primKey).catch(err => console.warn('Sync hook (chat delete):', err));
        };
    });

    // ── Personas ───────────────────────────────────────────────────────
    db.personalities.hook('creating', function (_primKey, obj) {
        (this as any).onsuccess = () => {
            if (!isSyncActive() || areSyncHooksSuppressed()) return;
            pushPersona(obj as DbPersonality).catch(err => console.warn('Sync hook (persona create):', err));
        };
    });

    db.personalities.hook('updating', function (_mods, _primKey, obj) {
        (this as any).onsuccess = () => {
            if (!isSyncActive() || areSyncHooksSuppressed()) return;
            const updated = { ...obj, ..._mods } as DbPersonality;
            pushPersona(updated).catch(err => console.warn('Sync hook (persona update):', err));
        };
    });

    db.personalities.hook('deleting', function (primKey) {
        (this as any).onsuccess = () => {
            if (!isSyncActive() || areSyncHooksSuppressed()) return;
            deleteSyncedPersona(String(primKey)).catch(err => console.warn('Sync hook (persona delete):', err));
        };
    });
}

/**
 * Called after auth state change when user is logged in.
 * Checks sync preferences and emits unlock-required event if needed.
 */
export async function checkSyncOnLogin(): Promise<void> {
    const user = await getCurrentUser();
    if (!user) return;

    // Check subscription tier
    const sub = await getUserSubscription();
    const tier = getSubscriptionTier(sub);
    if (tier !== 'pro' && tier !== 'pro_plus' && tier !== 'max') {
        // Downgraded users get one final recovery flow:
        // unlock once, restore an unencrypted local copy, then disable/revoke sync.
        const prefs = await fetchSyncPreferences();
        if (prefs?.syncEnabled) {
            dispatchAppEvent('sync-unlock-required', { isFirstSetup: false, mode: 'final-download' });
        }
        return;
    }

    const prefs = await fetchSyncPreferences();

    if (!prefs) {
        // No preferences row — user has never set up sync.
        // If they haven't seen the prompt yet, show it.
        if (!hasSeenSyncPrompt()) {
            dispatchAppEvent('sync-unlock-required', { isFirstSetup: true, mode: 'setup' });
        }
        return;
    }

    if (!prefs.syncEnabled) {
        // Sync is disabled.
        // Show a one-time invite prompt if the local prompt flag is missing
        // (e.g. fresh browser/device or localStorage was cleared).
        if (!hasSeenSyncPrompt()) {
            const hasEncryptionMaterial = !!prefs.encryptionSalt && !!prefs.keyVerification && !!prefs.keyVerificationIv;
            if (hasEncryptionMaterial) {
                dispatchAppEvent('sync-unlock-required', { isFirstSetup: false, mode: 'enable' });
            } else {
                dispatchAppEvent('sync-unlock-required', { isFirstSetup: true, mode: 'setup' });
            }
        }
        return;
    }

    // Sync is enabled — they need to enter their encryption password
    if (!crypto.isUnlocked()) {
        dispatchAppEvent('sync-unlock-required', { isFirstSetup: false, mode: 'unlock' });
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

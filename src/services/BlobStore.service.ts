/**
 * Encrypted Blob Store service — manages E2E-encrypted media blobs
 * in Supabase Storage for cloud sync.
 *
 * Large media (images, attachments) are extracted from messages, encrypted
 * client-side with AES-256-GCM (same key as Sync.service), and uploaded to
 * the `encrypted-blobs` storage bucket. Messages then store a BlobReference
 * instead of the raw base64 data.
 *
 * This service is used exclusively by Sync.service.ts during serialization
 * and deserialization. Local-only users are never affected.
 */

import { supabase, getCurrentUser } from './Supabase.service';
import * as crypto from './Crypto.service';
import type { BlobReference } from '../types/BlobReference';
import { fetchSyncQuota } from './Sync.service';

// ── Constants ──────────────────────────────────────────────────────────────

const BUCKET_NAME = 'encrypted-blobs';

/** Blobs larger than this (raw bytes) are stored externally. Smaller ones stay inline. */
export const BLOB_SIZE_THRESHOLD = 50_000; // 50 KB

/** Max concurrent blob uploads per message. */
const UPLOAD_CONCURRENCY = 3;

/** Max upload retry attempts. */
const UPLOAD_MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms). */
const RETRY_BASE_DELAY = 500;

// ── LRU Cache ──────────────────────────────────────────────────────────────

const blobCache = new Map<string, { data: Uint8Array; mimeType: string; accessedAt: number }>();
const CACHE_MAX_ENTRIES = 30;
const CACHE_MAX_BYTES = 50_000_000; // 50 MB

function cacheGet(blobId: string): { data: Uint8Array; mimeType: string } | null {
    const entry = blobCache.get(blobId);
    if (!entry) return null;
    entry.accessedAt = Date.now();
    return { data: entry.data, mimeType: entry.mimeType };
}

function cachePut(blobId: string, data: Uint8Array, mimeType: string): void {
    // Skip caching entries larger than total cache capacity.
    if (data.byteLength > CACHE_MAX_BYTES) {
        return;
    }

    // Evict until both entry count and byte limits can accommodate this blob.
    while (blobCache.size >= CACHE_MAX_ENTRIES || getCacheBytes() + data.byteLength > CACHE_MAX_BYTES) {
        const evicted = evictOldest();
        if (!evicted) {
            return;
        }
    }
    blobCache.set(blobId, { data, mimeType, accessedAt: Date.now() });
}

function getCacheBytes(): number {
    let total = 0;
    for (const entry of blobCache.values()) {
        total += entry.data.byteLength;
    }
    return total;
}

function evictOldest(): boolean {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of blobCache) {
        if (entry.accessedAt < oldestTime) {
            oldestTime = entry.accessedAt;
            oldestKey = key;
        }
    }
    if (!oldestKey) return false;
    blobCache.delete(oldestKey);
    return true;
}

/** Clear the entire blob cache (called on logout). */
export function clearCache(): void {
    blobCache.clear();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function storagePath(userId: string, blobId: string): string {
    return `${userId}/${blobId}`;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Encrypt raw binary data with AES-256-GCM using the sync encryption key.
 * Returns the ciphertext and IV as Uint8Arrays.
 */
async function encryptBlob(
    key: CryptoKey,
    data: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
        await globalThis.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as BufferSource },
            key,
            data as BufferSource,
        ),
    );
    return { ciphertext, iv };
}

/**
 * Decrypt a ciphertext blob with AES-256-GCM using the sync encryption key.
 */
async function decryptBlob(
    key: CryptoKey,
    ciphertext: Uint8Array,
    iv: Uint8Array,
): Promise<Uint8Array> {
    const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        ciphertext as BufferSource,
    );
    return new Uint8Array(decrypted);
}

// ── Upload ─────────────────────────────────────────────────────────────────

/**
 * Encrypt and upload a single blob to Supabase Storage.
 *
 * @param data     Raw (unencrypted) binary data.
 * @param mimeType Original MIME type (e.g. `image/png`).
 * @returns        A BlobReference to embed in the serialized message.
 * @throws         On persistent upload failure after retries.
 */
export async function uploadEncryptedBlob(
    data: Uint8Array,
    mimeType: string,
): Promise<BlobReference> {
    const key = crypto.getCachedKey();
    const user = await getCurrentUser();
    if (!key || !user) throw new Error('BlobStore: not authenticated or key not unlocked');

    const blobId = globalThis.crypto.randomUUID();
    const { ciphertext, iv } = await encryptBlob(key, data);
    const path = storagePath(user.id, blobId);
    const blob = new Blob([ciphertext], { type: 'application/octet-stream' });

    let lastError: unknown;
    for (let attempt = 0; attempt < UPLOAD_MAX_RETRIES; attempt++) {
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(path, blob, {
                contentType: 'application/octet-stream',
                upsert: false,
            });

        if (!error) {
            // Cache the decrypted data so immediate reads don't re-download
            cachePut(blobId, data, mimeType);

            return {
                __blob: true,
                blobId,
                mimeType,
                size: data.byteLength,
                iv: crypto.toHex(iv),
            };
        }

        lastError = error;
        console.warn(`BlobStore: upload attempt ${attempt + 1} failed for ${blobId}:`, error);
        if (attempt < UPLOAD_MAX_RETRIES - 1) {
            await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt));
        }
    }

    throw new Error(`BlobStore: upload failed after ${UPLOAD_MAX_RETRIES} attempts: ${lastError}`);
}

/**
 * Upload multiple blobs in parallel with bounded concurrency.
 *
 * @param items Array of { data, mimeType } to upload.
 * @returns     Array of BlobReferences in the same order as input.
 */
export async function uploadEncryptedBlobsBatch(
    items: Array<{ data: Uint8Array; mimeType: string }>,
): Promise<BlobReference[]> {
    const results: BlobReference[] = new Array(items.length);
    let nextIndex = 0;

    const worker = async () => {
        while (true) {
            const idx = nextIndex++;
            if (idx >= items.length) return;
            results[idx] = await uploadEncryptedBlob(items[idx].data, items[idx].mimeType);
        }
    };

    const workerCount = Math.min(UPLOAD_CONCURRENCY, items.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

// ── Download ───────────────────────────────────────────────────────────────

/**
 * Download and decrypt a blob from Supabase Storage.
 *
 * @param ref The BlobReference from the serialized message.
 * @returns   The decrypted data and original MIME type.
 */
export async function downloadDecryptedBlob(
    ref: BlobReference,
): Promise<{ data: Uint8Array; mimeType: string }> {
    // Check cache first
    const cached = cacheGet(ref.blobId);
    if (cached) return cached;

    const key = crypto.getCachedKey();
    const user = await getCurrentUser();
    if (!key || !user) throw new Error('BlobStore: not authenticated or key not unlocked');

    const path = storagePath(user.id, ref.blobId);
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(path);

    if (error || !data) {
        throw new Error(`BlobStore: download failed for ${ref.blobId}: ${error?.message ?? 'no data'}`);
    }

    const ciphertext = new Uint8Array(await data.arrayBuffer());
    const iv = crypto.fromHex(ref.iv);
    const decrypted = await decryptBlob(key, ciphertext, iv);

    // Cache for subsequent reads
    cachePut(ref.blobId, decrypted, ref.mimeType);

    return { data: decrypted, mimeType: ref.mimeType };
}

// ── Delete ─────────────────────────────────────────────────────────────────

/**
 * Delete a single blob from Supabase Storage.
 */
export async function deleteBlob(blobId: string): Promise<void> {
    const user = await getCurrentUser();
    if (!user) return;

    const path = storagePath(user.id, blobId);
    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([path]);

    if (error) {
        console.warn(`BlobStore: failed to delete blob ${blobId}:`, error);
    }

    blobCache.delete(blobId);
}

/**
 * Delete multiple blobs from Supabase Storage.
 */
export async function deleteBlobsBatch(blobIds: string[]): Promise<void> {
    if (blobIds.length === 0) return;

    const user = await getCurrentUser();
    if (!user) return;

    const paths = blobIds.map(id => storagePath(user.id, id));
    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(paths);

    if (error) {
        console.warn('BlobStore: batch delete failed:', error);
    }

    for (const id of blobIds) {
        blobCache.delete(id);
    }
}

// ── Quota pre-flight ───────────────────────────────────────────────────────

/**
 * Check whether the user has enough quota headroom for additional bytes.
 * This is a client-side soft check — the server enforces the real limit
 * via `recalculate_user_storage` after writes.
 *
 * @param additionalBytes The number of additional bytes to check for.
 * @returns `true` if there is enough headroom.
 */
export async function checkQuotaHeadroom(additionalBytes: number): Promise<boolean> {
    const quota = await fetchSyncQuota();
    if (!quota) return false;
    return (quota.usedBytes + additionalBytes) <= quota.quotaBytes;
}

// ── Utility: base64 ↔ Uint8Array ───────────────────────────────────────────

/**
 * Convert a raw base64 string (no `data:` prefix) to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Convert a Uint8Array to a raw base64 string (no `data:` prefix).
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

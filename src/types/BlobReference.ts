/**
 * A reference to an encrypted blob stored in Supabase Storage.
 *
 * When syncing messages with large media (images, attachments), the binary
 * data is extracted from the message, encrypted client-side, and uploaded to
 * the `encrypted-blobs` storage bucket. The message payload then contains
 * a BlobReference instead of the raw base64 data.
 *
 * The `__blob: true` discriminator allows the deserializer to distinguish
 * between inline base64 strings (old format) and blob references (new format).
 */
export interface BlobReference {
    /** Discriminator — always `true`. Distinguishes from inline base64 strings. */
    __blob: true;
    /** UUID identifying the blob in storage. Path: `encrypted-blobs/{userId}/{blobId}` */
    blobId: string;
    /** Original MIME type of the unencrypted data (e.g. `image/png`). */
    mimeType: string;
    /** Original unencrypted size in bytes. */
    size: number;
    /** Hex-encoded IV used to encrypt this specific blob. */
    iv: string;
}

/**
 * Type guard: returns true if the value is a BlobReference object.
 */
export function isBlobReference(value: unknown): value is BlobReference {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as BlobReference).__blob === true &&
        typeof (value as BlobReference).blobId === 'string'
    );
}

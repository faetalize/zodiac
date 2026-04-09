/**
 * Client-side encryption service for cloud sync.
 *
 * Uses Web Crypto API exclusively (zero dependencies):
 * - PBKDF2 (SHA-256, 600k iterations) for key derivation
 * - AES-256-GCM for authenticated encryption
 *
 * The encryption key is derived from a user-chosen password and a random salt.
 * The key is cached in memory only — never persisted to disk.
 * On logout or tab close, the key is cleared.
 */

// ── Constants ──────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = "SHA-256";
const AES_KEY_LENGTH = 256; // bits
const IV_BYTE_LENGTH = 12; // 96 bits, recommended for GCM
const SALT_BYTE_LENGTH = 32; // 256 bits

/** Known plaintext used to verify the correct password was entered. */
const VERIFICATION_TOKEN = "zodiac-sync-key-verification-v1";

// ── In-memory key cache ────────────────────────────────────────────────────
let cachedKey: CryptoKey | null = null;

// ── Salt generation ────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random salt for PBKDF2.
 */
export function generateSalt(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
}

// ── Key derivation ─────────────────────────────────────────────────────────

/**
 * Derive an AES-256-GCM key from a password and salt using PBKDF2.
 *
 * @param password  The user's encryption password (plaintext).
 * @param salt      A 32-byte random salt (stored on Supabase, not secret).
 * @returns         A non-extractable CryptoKey for AES-GCM encrypt/decrypt.
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: salt as BufferSource,
			iterations: PBKDF2_ITERATIONS,
			hash: PBKDF2_HASH
		},
		keyMaterial,
		{ name: "AES-GCM", length: AES_KEY_LENGTH },
		false, // non-extractable
		["encrypt", "decrypt"]
	);
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────────────

export interface EncryptedPayload {
	/** AES-GCM ciphertext (includes 16-byte auth tag). */
	ciphertext: Uint8Array;
	/** 12-byte initialization vector. Must be unique per encryption. */
	iv: Uint8Array;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * @param key       Derived CryptoKey.
 * @param plaintext UTF-8 string to encrypt.
 * @returns         Ciphertext + IV pair.
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
	const encoded = new TextEncoder().encode(plaintext);

	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, encoded)
	);

	return { ciphertext, iv };
}

/**
 * Decrypt an AES-256-GCM ciphertext back to a plaintext string.
 *
 * @throws DOMException if the key is wrong or data is tampered.
 */
export async function decrypt(key: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array): Promise<string> {
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: iv as BufferSource },
		key,
		ciphertext as BufferSource
	);

	return new TextDecoder().decode(decrypted);
}

// ── Key verification (password correctness check) ──────────────────────────

export interface VerificationBlob {
	ciphertext: Uint8Array;
	iv: Uint8Array;
}

/**
 * Create a verification blob by encrypting a known token.
 * Store the result on Supabase alongside the salt.
 */
export async function createVerification(key: CryptoKey): Promise<VerificationBlob> {
	const { ciphertext, iv } = await encrypt(key, VERIFICATION_TOKEN);
	return { ciphertext, iv };
}

/**
 * Verify that a derived key is correct by attempting to decrypt the
 * stored verification blob and checking the plaintext matches.
 *
 * @returns `true` if the password is correct.
 */
export async function verifyKey(key: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array): Promise<boolean> {
	try {
		const plaintext = await decrypt(key, ciphertext, iv);
		return plaintext === VERIFICATION_TOKEN;
	} catch {
		// Decryption failure → wrong key (GCM auth tag mismatch).
		return false;
	}
}

// ── In-memory key cache ────────────────────────────────────────────────────

/**
 * Cache the derived key in memory for the current session.
 * The key is never written to localStorage / IndexedDB / cookies.
 */
export function cacheKey(key: CryptoKey): void {
	cachedKey = key;
}

/**
 * Retrieve the cached key, or null if not yet unlocked this session.
 */
export function getCachedKey(): CryptoKey | null {
	return cachedKey;
}

/**
 * Clear the cached key (called on logout or manual lock).
 */
export function clearCachedKey(): void {
	cachedKey = null;
}

/**
 * Returns true if a key is currently cached (i.e., the user has unlocked sync this session).
 */
export function isUnlocked(): boolean {
	return cachedKey !== null;
}

// ── Encoding helpers (Uint8Array ↔ hex for Supabase bytea columns) ─────────
// Supabase represents `bytea` as hex-encoded strings prefixed with `\\x`.

/**
 * Convert a Uint8Array to a PostgreSQL bytea hex string (`\\x...`).
 */
export function toHex(bytes: Uint8Array): string {
	return `\\x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Convert a hex string (with or without `\\x` prefix) back to Uint8Array.
 */
export function fromHex(hex: string): Uint8Array {
	// Strip Supabase's \\x prefix if present
	const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < clean.length; i += 2) {
		bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
	}
	return bytes;
}

/**
 * Blob resolution utilities for lazily loading images stored in encrypted
 * blob storage. Used by the message renderer and image history to resolve
 * BlobReference objects into usable base64/data URIs.
 */

import type { GeneratedImage } from "../types/Message";
import type { BlobReference } from "../types/BlobReference";
import { downloadDecryptedBlob, uint8ArrayToBase64, uint8ArrayToBlob } from "../services/BlobStore.service";

// Track in-flight resolutions to avoid duplicate fetches for the same blob
const inflightResolutions = new Map<string, Promise<string>>();
const inflightTextResolutions = new Map<string, Promise<string | undefined>>();

/**
 * Resolve a GeneratedImage's base64 data, fetching from blob storage if needed.
 *
 * - If the image already has base64 data (inline format), returns immediately.
 * - If the image has a _blobRef (blob format), downloads, decrypts, and populates
 *   the base64 field, then returns the data URI.
 * - Deduplicates concurrent fetches for the same blobId.
 *
 * @returns The resolved data URI (`data:{mimeType};base64,{data}`), or empty string on failure.
 */
export async function resolveGeneratedImageSrc(img: GeneratedImage): Promise<string> {
	// Already resolved (inline format or previously resolved blob)
	if (img.base64 && img.base64.length > 0) {
		return `data:${img.mimeType};base64,${img.base64}`;
	}

	const ref = img._blobRef;
	if (!ref) {
		return ""; // No data and no ref — nothing to resolve
	}

	// Deduplicate in-flight requests
	const existing = inflightResolutions.get(ref.blobId);
	if (existing) return existing;

	const resolution = (async (): Promise<string> => {
		try {
			const { data } = await downloadDecryptedBlob(ref);
			const base64 = uint8ArrayToBase64(data);
			// Populate the in-memory GeneratedImage so subsequent renders don't re-fetch
			img.base64 = base64;
			return `data:${img.mimeType};base64,${base64}`;
		} catch (err) {
			console.error(`blobResolver: failed to resolve blob ${ref.blobId}:`, err);
			return "";
		} finally {
			inflightResolutions.delete(ref.blobId);
		}
	})();

	inflightResolutions.set(ref.blobId, resolution);
	return resolution;
}

/**
 * Resolve a File attachment that may have a _blobRef expando property.
 * Returns a new File with the actual binary content, or the original File
 * if it's already a real file (no blob ref).
 */
export async function resolveAttachmentFile(file: File): Promise<File> {
	const ref = (file as any)._blobRef as BlobReference | undefined;
	if (!ref) return file; // Already a real file

	// Check if the file already has content (size > 0 means it was resolved before)
	if (file.size > 0) return file;

	try {
		const { data, mimeType } = await downloadDecryptedBlob(ref);
		const blob = uint8ArrayToBlob(data, mimeType || file.type);
		const resolved = new File([blob], file.name, {
			type: mimeType || file.type,
			lastModified: file.lastModified
		});
		// Preserve original blob reference so sync can avoid re-uploading
		// unchanged attachments that were lazily resolved for preview.
		(resolved as any)._blobRef = ref;
		return resolved;
	} catch (err) {
		console.error(`blobResolver: failed to resolve attachment blob ${ref.blobId}:`, err);
		return file; // Return the placeholder
	}
}

/**
 * Check whether a GeneratedImage needs lazy blob resolution.
 */
export function needsBlobResolution(img: GeneratedImage): boolean {
	return (!img.base64 || img.base64.length === 0) && !!img._blobRef;
}

/**
 * Resolve a thoughtSignature that may be stored in blob storage.
 *
 * Mutates `target.thoughtSignature` in memory so follow-up calls avoid re-fetching.
 */
export async function resolveThoughtSignature(target: {
	thoughtSignature?: string;
	_thoughtSignatureRef?: BlobReference;
}): Promise<string | undefined> {
	if (target.thoughtSignature && target.thoughtSignature.length > 0) {
		return target.thoughtSignature;
	}

	const ref = target._thoughtSignatureRef;
	if (!ref) {
		return target.thoughtSignature;
	}

	const existing = inflightTextResolutions.get(ref.blobId);
	if (existing) {
		return existing;
	}

	const resolution = (async (): Promise<string | undefined> => {
		try {
			const { data } = await downloadDecryptedBlob(ref);
			const text = new TextDecoder().decode(data);
			target.thoughtSignature = text;
			return text;
		} catch (err) {
			console.error(`blobResolver: failed to resolve thoughtSignature blob ${ref.blobId}:`, err);
			return undefined;
		} finally {
			inflightTextResolutions.delete(ref.blobId);
		}
	})();

	inflightTextResolutions.set(ref.blobId, resolution);
	return resolution;
}

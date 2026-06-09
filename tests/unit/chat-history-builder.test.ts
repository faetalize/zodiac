import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/helpers", () => ({
	fileToBase64: vi.fn()
}));

vi.mock("@google/genai", async (importOriginal) => ({
	...(await importOriginal<typeof import("@google/genai")>()),
	createPartFromBase64: vi.fn(async (data: string, mimeType: string) => ({ inlineData: { data, mimeType } }))
}));

vi.mock("../../src/utils/blobResolver", () => ({
	resolveAttachmentFile: vi.fn(),
	resolveGeneratedImageSrc: vi.fn(),
	resolveThoughtSignature: vi.fn(async (target: { thoughtSignature?: string }) => target.thoughtSignature)
}));

import { processAttachmentsToParts, processGeneratedImagesToParts } from "../../src/utils/chatHistoryBuilder";
import { fileToBase64 } from "../../src/utils/helpers";
import { resolveAttachmentFile, resolveThoughtSignature } from "../../src/utils/blobResolver";

describe("processGeneratedImagesToParts", () => {
	it("preserves stored generated-image thought signatures for Gemini history", async () => {
		const parts = await processGeneratedImagesToParts({
			images: [
				{
					mimeType: "image/png",
					base64: "generated-image-base64",
					thoughtSignature: "provider-image-signature"
				}
			],
			shouldProcess: true,
			enforceThoughtSignatures: true,
			skipThoughtSignatureValidator: "skip_thought_signature_validator",
			suppressThoughtSignature: true
		});

		expect(parts).toEqual([
			{
				inlineData: { data: "generated-image-base64", mimeType: "image/png" },
				thoughtSignature: "provider-image-signature"
			}
		]);
		expect(resolveThoughtSignature).toHaveBeenCalledWith(
			expect.objectContaining({ thoughtSignature: "provider-image-signature" })
		);
	});

	it("falls back to the skip validator only when no stored image signature exists", async () => {
		const parts = await processGeneratedImagesToParts({
			images: [{ mimeType: "image/png", base64: "generated-image-base64" }],
			shouldProcess: true,
			enforceThoughtSignatures: true,
			skipThoughtSignatureValidator: "skip_thought_signature_validator"
		});

		expect(parts).toEqual([
			{
				inlineData: { data: "generated-image-base64", mimeType: "image/png" },
				thoughtSignature: "skip_thought_signature_validator"
			}
		]);
	});

	it("does not include thought images in rebuilt Gemini history", async () => {
		const parts = await processGeneratedImagesToParts({
			images: [
				{ mimeType: "image/png", base64: "thought-image-base64", thought: true },
				{ mimeType: "image/png", base64: "visible-image-base64" }
			],
			shouldProcess: true,
			enforceThoughtSignatures: false,
			skipThoughtSignatureValidator: "skip_thought_signature_validator"
		});

		expect(parts).toEqual([
			{
				inlineData: { data: "visible-image-base64", mimeType: "image/png" },
				thoughtSignature: undefined
			}
		]);
	});
});

describe("processAttachmentsToParts", () => {
	it("resolves blob-backed attachments before creating Gemini inline data", async () => {
		const placeholder = new File([], "image.png", { type: "image/png" });
		const resolved = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
		(placeholder as any)._blobRef = { blobId: "blob-1", path: "sync/blob-1", size: 3, mimeType: "image/png" };
		vi.mocked(resolveAttachmentFile).mockResolvedValueOnce(resolved);
		vi.mocked(fileToBase64).mockResolvedValueOnce("resolved-image-base64");

		const parts = await processAttachmentsToParts({ attachments: [placeholder], shouldProcess: true });

		expect(resolveAttachmentFile).toHaveBeenCalledWith(placeholder);
		expect(fileToBase64).toHaveBeenCalledWith(resolved);
		expect(parts).toEqual([{ inlineData: { data: "resolved-image-base64", mimeType: "image/png" } }]);
	});

	it("skips attachments that resolve to empty base64", async () => {
		const unresolved = new File([], "image.png", { type: "image/png" });
		vi.mocked(resolveAttachmentFile).mockResolvedValueOnce(unresolved);
		vi.mocked(fileToBase64).mockResolvedValueOnce("");

		const parts = await processAttachmentsToParts({ attachments: [unresolved], shouldProcess: true });

		expect(parts).toEqual([]);
	});
});

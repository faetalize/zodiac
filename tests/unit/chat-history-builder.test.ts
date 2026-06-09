import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/helpers", () => ({
	fileToBase64: vi.fn()
}));

vi.mock("../../src/utils/blobResolver", () => ({
	resolveAttachmentFile: vi.fn(),
	resolveGeneratedImageSrc: vi.fn(),
	resolveThoughtSignature: vi.fn(async (target: { thoughtSignature?: string }) => target.thoughtSignature)
}));

import { processGeneratedImagesToParts } from "../../src/utils/chatHistoryBuilder";
import { resolveThoughtSignature } from "../../src/utils/blobResolver";

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

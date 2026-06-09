import { describe, expect, it } from "vitest";

import { processGeminiLocalSdkResponse } from "../../src/services/GeminiResponseProcessor.service";

describe("Gemini response processing", () => {
	it("preserves thought parts separately from visible answer text", async () => {
		const result = await processGeminiLocalSdkResponse({
			response: {
				candidates: [
					{
						content: {
							parts: [
								{ text: "hidden reasoning", thought: true },
								{ text: "visible answer", thoughtSignature: "answer-signature" }
							]
						},
						finishReason: "STOP"
					}
				]
			} as any,
			process: {
				includeThoughts: true,
				useSkipThoughtSignature: false,
				skipThoughtSignatureValidator: "skip_thought_signature_validator",
				abortMode: "return",
				throwOnBlocked: false
			}
		});

		expect(result.thinking).toBe("hidden reasoning");
		expect(result.text).toBe("visible answer");
		expect(result.textSignature).toBe("answer-signature");
		expect(result.responseParts).toEqual([
			{ text: "hidden reasoning", thought: true },
			{ text: "visible answer", thoughtSignature: "answer-signature" }
		]);
	});

	it("keeps thought parts for history when reasoning display is disabled", async () => {
		const result = await processGeminiLocalSdkResponse({
			response: {
				candidates: [
					{
						content: {
							parts: [
								{ text: "hidden reasoning", thought: true },
								{ text: "visible answer", thoughtSignature: "answer-signature" }
							]
						}
					}
				]
			} as any,
			process: {
				includeThoughts: false,
				useSkipThoughtSignature: false,
				skipThoughtSignatureValidator: "skip_thought_signature_validator",
				abortMode: "return",
				throwOnBlocked: false
			}
		});

		expect(result.thinking).toBe("");
		expect(result.responseParts[0]).toEqual({ text: "hidden reasoning", thought: true });
	});

	it("keeps thought inline images out of visible generated images", async () => {
		const result = await processGeminiLocalSdkResponse({
			response: {
				candidates: [
					{
						content: {
							parts: [
								{
									inlineData: { data: "thought-image-base64", mimeType: "image/jpeg" },
									thought: true
								},
								{
									inlineData: { data: "visible-image-base64", mimeType: "image/jpeg" },
									thoughtSignature: "visible-image-signature"
								}
							]
						}
					}
				]
			} as any,
			process: {
				includeThoughts: true,
				useSkipThoughtSignature: false,
				skipThoughtSignatureValidator: "skip_thought_signature_validator",
				abortMode: "return",
				throwOnBlocked: false
			}
		});

		expect(result.responseParts).toEqual([
			{
				inlineData: { data: "thought-image-base64", mimeType: "image/jpeg" },
				thought: true
			}
		]);
		expect(result.images).toEqual([
			{
				mimeType: "image/jpeg",
				base64: "visible-image-base64",
				thoughtSignature: "visible-image-signature",
				thought: undefined
			}
		]);
	});
});

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/helpers", () => ({
	fileToBase64: vi.fn()
}));

import { processPremiumEndpointSse } from "../../src/services/PremiumEndpointResponseProcessor.service";

function sseResponse(blocks: string[]): Response {
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			controller.enqueue(encoder.encode(blocks.join("")));
			controller.close();
		}
	});

	return new Response(stream);
}

describe("premium endpoint response processing", () => {
	it("does not save OpenRouter fallback encrypted reasoning as a Gemini text signature", async () => {
		const response = sseResponse([
			`event: fallback\ndata: ${JSON.stringify({ mode: "restart", reason: "direct_openrouter" })}\n\n`,
			`data: ${JSON.stringify({
				choices: [
					{
						delta: {
							content: "visible answer",
							reasoning_details: [
								{
									type: "reasoning.encrypted",
									data: "fallback-signature",
									format: "google-gemini-v1",
									index: 0
								}
							]
						}
					}
				]
			})}\n\n`,
			"event: done\ndata: {}\n\n"
		]);

		const result = await processPremiumEndpointSse({
			res: response,
			process: {
				includeThoughts: false,
				useSkipThoughtSignature: false,
				skipThoughtSignatureValidator: "skip_thought_signature_validator",
				abortMode: "return",
				throwOnBlocked: () => false,
				onBlocked: () => {
					throw new Error("blocked");
				}
			}
		});

		expect(result.wasFallbackMode).toBe(true);
		expect(result.text).toBe("visible answer");
		expect(result.textSignature).toBeUndefined();
	});
});

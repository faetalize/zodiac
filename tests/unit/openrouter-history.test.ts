import type { Content } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/helpers", () => ({
	fileToBase64: vi.fn()
}));

import {
	convertGeminiHistoryToOpenRouterMessages,
	requestOpenRouterCompletion
} from "../../src/services/OpenRouter.service";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("OpenRouter history conversion", () => {
	it("sends assistant generated-image history as user messages without reasoning details", async () => {
		const history = [
			{
				role: "user",
				parts: [
					{ text: "Can you still see this?" },
					{
						inlineData: { data: "user-image-base64", mimeType: "image/png" },
						thoughtSignature: "user-signature"
					}
				]
			},
			{
				role: "model",
				parts: [
					{ text: "Here is the generated image." },
					{
						inlineData: { data: "assistant-image-base64", mimeType: "image/png" },
						thoughtSignature: "assistant-signature"
					}
				]
			}
		] as unknown as Content[];

		const messages = await convertGeminiHistoryToOpenRouterMessages(history);

		expect(messages[0]).not.toHaveProperty("reasoning_details");
		expect(messages[1]).toEqual({
			role: "user",
			content: [
				{ type: "text", text: "Here is the generated image." },
				{
					type: "image_url",
					image_url: { url: "data:image/png;base64,assistant-image-base64" }
				}
			]
		});
		expect(messages[1]).not.toHaveProperty("reasoning_details");
	});

	it("sends OpenRouter assistant image history as user messages without reasoning metadata", async () => {
		const history = [
			{
				role: "model",
				parts: [
					{ text: "Generated from OpenRouter." },
					{
						inlineData: { data: "assistant-image-base64", mimeType: "image/png" },
						thoughtSignature: "assistant-signature",
						thoughtSignatureReasoningDetail: {
							type: "reasoning.encrypted",
							id: "reasoning-encrypted-previous",
							format: "provider-returned-format-v1",
							index: 7,
							provider_extra: "kept"
						}
					}
				]
			}
		] as unknown as Content[];

		const messages = await convertGeminiHistoryToOpenRouterMessages(history);

		expect(messages[0]).toEqual({
			role: "user",
			content: [
				{ type: "text", text: "Generated from OpenRouter." },
				{
					type: "image_url",
					image_url: { url: "data:image/png;base64,assistant-image-base64" }
				}
			]
		});
		expect(messages[0]).not.toHaveProperty("reasoning_details");
	});

	it("omits native Gemini thought parts and encrypted signatures from OpenRouter requests", async () => {
		const history = [
			{
				role: "model",
				parts: [
					{ text: "hidden reasoning", thought: true },
					{ text: "visible answer", thoughtSignature: "answer-signature" },
					{
						inlineData: { data: "image-base64", mimeType: "image/png" },
						thoughtSignature: "answer-signature"
					}
				]
			}
		] as unknown as Content[];

		const messages = await convertGeminiHistoryToOpenRouterMessages(history);

		expect(messages[0]).toEqual({
			role: "user",
			content: [
				{ type: "text", text: "visible answer" },
				{ type: "image_url", image_url: { url: "data:image/png;base64,image-base64" } }
			]
		});
		expect(messages[0]).not.toHaveProperty("reasoning_details");
	});

	it("drops history messages that contain only prior reasoning", async () => {
		const history = [
			{
				role: "model",
				parts: [{ text: "hidden reasoning only", thought: true }]
			}
		] as unknown as Content[];

		const messages = await convertGeminiHistoryToOpenRouterMessages(history);

		expect(messages).toEqual([]);
	});

	it("omits OpenRouter encrypted reasoning from saved model response signatures", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						choices: [
							{
								finish_reason: "stop",
								message: {
									role: "assistant",
									content: "visible answer",
									reasoning: "hidden reasoning",
									reasoning_details: [
										{
											type: "reasoning.text",
											text: "hidden reasoning",
											format: "google-gemini-v1",
											index: 0,
											provider_extra: "text-kept"
										},
										{
											type: "reasoning.encrypted",
											data: "answer-signature",
											format: "google-gemini-v1",
											index: 1,
											provider_extra: "encrypted-kept"
										}
									]
								}
							}
						]
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } }
				)
			)
		);

		const result = await requestOpenRouterCompletion({
			apiKey: "test-key",
			request: { stream: false, messages: [{ role: "user", content: "hi" }] }
		});

		expect(result.text).toBe("visible answer");
		expect(result.thinking).toBe("hidden reasoning");
		expect(result.textSignature).toBeUndefined();
		expect(result.responseParts).toEqual([
			{
				text: "hidden reasoning",
				thought: true,
				reasoningDetail: {
					type: "reasoning.text",
					format: "google-gemini-v1",
					index: 0,
					provider_extra: "text-kept"
				}
			},
			{
				text: "visible answer"
			}
		]);

		const nextMessages = await convertGeminiHistoryToOpenRouterMessages([
			{ role: "model", parts: result.responseParts }
		] as unknown as Content[]);
		expect(nextMessages[0]).toEqual({
			role: "assistant",
			content: "visible answer"
		});
		expect(nextMessages[0]).not.toHaveProperty("reasoning_details");
	});
});

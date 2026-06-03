import type { Content } from "@google/genai";

import type {
	ContentPart,
	FileContentPart,
	ImageContentPart,
	Message as OpenRouterMessage,
	Plugin,
	ReasoningDetail as OpenRouterReasoningDetail,
	Request as OpenRouterRequest,
	Response as OpenRouterResponse,
	StreamingChoice
} from "../types/OpenRouterTypes";
import { getChatModelDefinition, modelSupportsTemperature, type ChatModelDefinition } from "../types/Models";
import type { GeneratedImage, Message, ReasoningDetailMetadata } from "../types/Message";
import * as helpers from "../utils/helpers";

export interface OpenRouterCompletionResult {
	text: string;
	thinking: string;
	textSignature?: string;
	responseParts: Message["parts"];
	finishReason?: unknown;
	images?: {
		mimeType: string;
		base64: string;
		thoughtSignature?: string;
		thoughtSignatureReasoningDetail?: GeneratedImage["thoughtSignatureReasoningDetail"];
	}[];
}

export interface OpenRouterCompletionArgs {
	apiKey: string;
	request: OpenRouterRequest;
	signal?: AbortSignal;
	onText?: (args: { text: string; delta: string }) => void | Promise<void>;
	onThinking?: (args: { thinking: string; delta: string }) => void | Promise<void>;
	onImage?: (image: {
		mimeType: string;
		base64: string;
		thoughtSignature?: string;
		thoughtSignatureReasoningDetail?: GeneratedImage["thoughtSignatureReasoningDetail"];
	}) => void | Promise<void>;
}

function getHeaders(apiKey: string): Record<string, string> {
	return {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
		"HTTP-Referer": window.location.origin,
		"X-OpenRouter-Title": "Zodiac"
	};
}

function createDataUri(base64: string, mimeType: string): string {
	return `data:${mimeType};base64,${base64}`;
}

function normalizeFileName(fileName: string, mimeType: string): string {
	if (fileName.trim()) {
		return fileName;
	}

	if (mimeType === "application/pdf") {
		return "attachment.pdf";
	}

	if (mimeType.startsWith("image/")) {
		return `image.${mimeType.slice(6) || "png"}`;
	}

	return "attachment.bin";
}

function isTextLikeMimeType(mimeType: string): boolean {
	return (
		mimeType.startsWith("text/") ||
		[
			"application/json",
			"application/xml",
			"application/javascript",
			"application/x-javascript",
			"application/typescript",
			"application/x-typescript",
			"text/csv"
		].includes(mimeType)
	);
}

function decodeBase64ToText(base64: string): string {
	try {
		return decodeURIComponent(escape(atob(base64)));
	} catch {
		return atob(base64);
	}
}

function makeImagePart(url: string): ImageContentPart {
	return {
		type: "image_url",
		image_url: { url }
	};
}

function makeFilePart(args: { fileName: string; mimeType: string; base64: string }): FileContentPart {
	return {
		type: "file",
		file: {
			filename: normalizeFileName(args.fileName, args.mimeType),
			file_data: createDataUri(args.base64, args.mimeType)
		}
	};
}

function appendTextPart(parts: ContentPart[], text: string): void {
	if (!text.trim()) return;
	parts.push({ type: "text", text });
}

async function convertFileToOpenRouterParts(file: File): Promise<ContentPart[]> {
	const mimeType = file.type || "application/octet-stream";
	const base64 = await helpers.fileToBase64(file);

	if (mimeType.startsWith("image/")) {
		return [makeImagePart(createDataUri(base64, mimeType))];
	}

	if (isTextLikeMimeType(mimeType)) {
		const text = await file.text();
		return [
			{
				type: "text",
				text: `[Attached file: ${normalizeFileName(file.name, mimeType)}]\n${text}`
			}
		];
	}

	return [makeFilePart({ fileName: file.name, mimeType, base64 })];
}

function convertInlineDataToOpenRouterParts(args: {
	base64: string;
	mimeType: string;
	fileName?: string;
}): ContentPart[] {
	const mimeType = args.mimeType || "application/octet-stream";

	if (mimeType.startsWith("image/")) {
		return [makeImagePart(createDataUri(args.base64, mimeType))];
	}

	if (isTextLikeMimeType(mimeType)) {
		return [
			{
				type: "text",
				text: decodeBase64ToText(args.base64)
			}
		];
	}

	return [
		makeFilePart({
			fileName: args.fileName || "attachment",
			mimeType,
			base64: args.base64
		})
	];
}

function normalizeMessageRole(role: string | undefined): "user" | "assistant" | "system" | "developer" {
	if (role === "model") return "assistant";
	if (role === "assistant" || role === "system" || role === "developer") return role;
	return "user";
}

function collapseContentParts(parts: ContentPart[]): string | ContentPart[] {
	if (parts.length === 1 && parts[0]?.type === "text") {
		return parts[0].text;
	}

	return parts;
}

function getOpenRouterHistoryRole(args: {
	role: ReturnType<typeof normalizeMessageRole>;
	contentParts: ContentPart[];
}): ReturnType<typeof normalizeMessageRole> {
	if (args.role === "assistant" && args.contentParts.some((part) => part.type === "image_url")) {
		return "user";
	}

	return args.role;
}

function extractReasoningFromDetails(details: unknown): string {
	if (!Array.isArray(details)) return "";

	return details
		.map((detail) => {
			const value = detail as { type?: string; text?: string; summary?: string };
			if (value.type === "reasoning.encrypted") return "";
			return value.text || value.summary || "";
		})
		.filter(Boolean)
		.join("");
}

function stripReasoningPayload(detail: OpenRouterReasoningDetail): ReasoningDetailMetadata {
	const { data, text, summary, ...metadata } = detail;
	return metadata;
}

export function extractEncryptedReasoningDetailFromDetails(details: unknown): OpenRouterReasoningDetail | undefined {
	if (!Array.isArray(details)) return undefined;

	const encryptedDetail = details.find((detail) => (detail as { type?: string }).type === "reasoning.encrypted");
	const data = (encryptedDetail as { data?: unknown } | undefined)?.data;
	if (encryptedDetail && typeof data === "string" && data.length > 0) {
		return { ...(encryptedDetail as OpenRouterReasoningDetail), type: "reasoning.encrypted", data };
	}

	return undefined;
}

export function extractThoughtSignatureFromDetails(details: unknown): string | undefined {
	return extractEncryptedReasoningDetailFromDetails(details)?.data;
}

function getThoughtSignatureReasoningMetadata(
	detail: OpenRouterReasoningDetail | undefined
): GeneratedImage["thoughtSignatureReasoningDetail"] {
	if (!detail || detail.type !== "reasoning.encrypted") return undefined;
	const metadata = stripReasoningPayload(detail);

	return {
		...metadata,
		type: "reasoning.encrypted",
		id: metadata.id,
		format: metadata.format,
		index: metadata.index
	};
}

function getReasoningTextFromDetail(detail: OpenRouterReasoningDetail): string {
	const value = detail as { text?: unknown; summary?: unknown };
	if (typeof value.text === "string") return value.text;
	if (typeof value.summary === "string") return value.summary;
	return "";
}

function buildResponsePartsFromOpenRouter(args: {
	text: string;
	reasoningDetails: OpenRouterReasoningDetail[];
	fallbackThinking?: string;
}): { responseParts: Message["parts"]; textSignature?: string } {
	const responseParts: Message["parts"] = [];
	let encryptedDetail: OpenRouterReasoningDetail | undefined;
	let hasReasoningTextPart = false;

	for (const detail of args.reasoningDetails) {
		if (detail.type === "reasoning.encrypted" && typeof detail.data === "string" && detail.data.length > 0) {
			encryptedDetail = detail;
			continue;
		}

		const reasoningText = getReasoningTextFromDetail(detail);
		if (!reasoningText) continue;
		hasReasoningTextPart = true;
		responseParts.push({ text: reasoningText, thought: true, reasoningDetail: stripReasoningPayload(detail) });
	}

	if (!hasReasoningTextPart && args.reasoningDetails.length > 0 && args.fallbackThinking) {
		responseParts.push({ text: args.fallbackThinking, thought: true });
	}

	const textSignature = encryptedDetail?.data;
	if (args.text.trim().length > 0 || textSignature) {
		responseParts.push({
			text: args.text,
			thoughtSignature: textSignature,
			reasoningDetail: encryptedDetail ? stripReasoningPayload(encryptedDetail) : undefined
		});
	}

	return { responseParts, textSignature };
}

function normalizeReasoningDetails(details: unknown): OpenRouterReasoningDetail[] {
	if (!Array.isArray(details)) return [];
	return details.filter((detail): detail is OpenRouterReasoningDetail => !!detail && typeof detail === "object");
}

function mergeReasoningDetails(
	existing: OpenRouterReasoningDetail[],
	incoming: OpenRouterReasoningDetail[]
): OpenRouterReasoningDetail[] {
	const merged = [...existing];

	for (const detail of incoming) {
		const index = typeof detail.index === "number" ? detail.index : undefined;
		const existingIndex =
			index === undefined ? -1 : merged.findIndex((item) => item.index === index && item.type === detail.type);

		if (existingIndex < 0) {
			merged.push({ ...detail });
			continue;
		}

		const current = merged[existingIndex] as OpenRouterReasoningDetail;
		merged[existingIndex] = {
			...current,
			...detail,
			text:
				typeof current.text === "string" || typeof detail.text === "string"
					? `${current.text || ""}${detail.text || ""}`
					: undefined,
			summary:
				typeof current.summary === "string" || typeof detail.summary === "string"
					? `${current.summary || ""}${detail.summary || ""}`
					: undefined,
			data:
				typeof current.data === "string" || typeof detail.data === "string"
					? `${current.data || ""}${detail.data || ""}`
					: undefined
		};
	}

	return merged;
}

export function extractImageDataFromOpenRouterImageUrl(
	img: any,
	thoughtSignature?: string,
	thoughtSignatureReasoningDetail?: GeneratedImage["thoughtSignatureReasoningDetail"]
) {
	const url = img?.image_url?.url;
	if (typeof url === "string" && url.startsWith("data:")) {
		const match = url.match(/^data:([^;]+);base64,(.+)$/);
		if (match) {
			return {
				mimeType: match[1],
				base64: match[2],
				thoughtSignature,
				thoughtSignatureReasoningDetail
			};
		}
	}
	return undefined;
}

function extractContentText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => {
				const value = part as { type?: string; text?: string };
				return value.type === "text" ? value.text || "" : "";
			})
			.join("");
	}

	return "";
}

export async function convertGeminiHistoryToOpenRouterMessages(history: Content[]): Promise<OpenRouterMessage[]> {
	const messages: OpenRouterMessage[] = [];

	for (const item of history || []) {
		const role = normalizeMessageRole(item?.role);
		const contentParts: ContentPart[] = [];

		for (const part of item?.parts || []) {
			if ((part as { thought?: unknown })?.thought === true) {
				continue;
			}

			if (part?.text) {
				appendTextPart(contentParts, String(part.text));
				continue;
			}

			if (part?.inlineData?.data) {
				contentParts.push(
					...convertInlineDataToOpenRouterParts({
						base64: String(part.inlineData.data),
						mimeType: String(part.inlineData.mimeType || "application/octet-stream")
					})
				);
			}
		}

		if (contentParts.length === 0) continue;
		const requestRole = getOpenRouterHistoryRole({ role, contentParts });
		const message: OpenRouterMessage = {
			role: requestRole,
			content: contentParts.length > 0 ? collapseContentParts(contentParts) : ""
		};
		messages.push(message);
	}

	return messages;
}

export async function buildOpenRouterUserMessage(args: {
	text: string;
	attachments?: FileList | File[];
}): Promise<OpenRouterMessage> {
	const contentParts: ContentPart[] = [];
	appendTextPart(contentParts, args.text);

	for (const file of Array.from(args.attachments || [])) {
		contentParts.push(...(await convertFileToOpenRouterParts(file)));
	}

	if (contentParts.length === 0) {
		contentParts.push({ type: "text", text: args.text });
	}

	return {
		role: "user",
		content: collapseContentParts(contentParts)
	};
}

export async function buildOpenRouterRequestMessages(args: {
	history: Content[];
	systemInstructionText?: string;
	userText: string;
	attachments?: FileList | File[];
}): Promise<OpenRouterMessage[]> {
	const messages: OpenRouterMessage[] = [];

	if (args.systemInstructionText?.trim()) {
		messages.push({ role: "system", content: args.systemInstructionText.trim() });
	}

	messages.push(...(await convertGeminiHistoryToOpenRouterMessages(args.history)));
	messages.push(await buildOpenRouterUserMessage({ text: args.userText, attachments: args.attachments }));
	return messages;
}

export function buildOpenRouterReasoning(args: {
	model: string;
	enableThinking: boolean;
	thinkingBudget: number;
}): OpenRouterRequest["reasoning"] | undefined {
	const definition = getChatModelDefinition(args.model);
	if (!definition?.supportsThinking) {
		return undefined;
	}

	if (!args.enableThinking && !definition.requiresThinking) {
		return {
			effort: "none",
			exclude: true
		};
	}

	if (args.thinkingBudget > 0) {
		return {
			max_tokens: args.thinkingBudget,
			exclude: false
		};
	}

	return {
		enabled: true,
		exclude: false
	};
}

export function buildOpenRouterPlugins(args: { isInternetSearchEnabled: boolean }): Plugin[] | undefined {
	if (!args.isInternetSearchEnabled) {
		return undefined;
	}

	return [{ id: "web" }];
}

export function buildOpenRouterRequest(args: {
	model: string;
	messages: OpenRouterMessage[];
	stream: boolean;
	maxTokens: number;
	temperature: number;
	enableThinking: boolean;
	thinkingBudget: number;
	isInternetSearchEnabled: boolean;
	responseFormat?: OpenRouterRequest["response_format"];
}): OpenRouterRequest {
	const definition = getChatModelDefinition(args.model);

	return {
		model: args.model,
		messages: args.messages,
		stream: args.stream,
		max_tokens: args.maxTokens,
		temperature: modelSupportsTemperature(args.model) ? args.temperature : undefined,
		reasoning: buildOpenRouterReasoning({
			model: args.model,
			enableThinking: args.enableThinking,
			thinkingBudget: args.thinkingBudget
		}),
		plugins: buildOpenRouterPlugins({ isInternetSearchEnabled: args.isInternetSearchEnabled }),
		response_format: args.responseFormat,
		provider: definition?.provider === "openrouter" ? { require_parameters: false } : undefined,
		modalities: definition?.supportsImageOutput ? ["text", "image"] : undefined
	};
}

export async function requestOpenRouterCompletion(args: OpenRouterCompletionArgs): Promise<OpenRouterCompletionResult> {
	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: getHeaders(args.apiKey),
		body: JSON.stringify(args.request),
		signal: args.signal
	});

	if (!response.ok) {
		let message = `OpenRouter error: ${response.status}`;
		try {
			const json = (await response.json()) as { error?: { message?: string } };
			message = json.error?.message || message;
		} catch {
			// noop
		}
		throw new Error(message);
	}

	if (args.request.stream) {
		return await processOpenRouterStream({
			response,
			signal: args.signal,
			onText: args.onText,
			onThinking: args.onThinking,
			onImage: args.onImage
		});
	}

	return await processOpenRouterJson({
		response,
		onText: args.onText,
		onThinking: args.onThinking,
		onImage: args.onImage
	});
}

async function processOpenRouterJson(args: {
	response: Response;
	onText?: OpenRouterCompletionArgs["onText"];
	onThinking?: OpenRouterCompletionArgs["onThinking"];
	onImage?: OpenRouterCompletionArgs["onImage"];
}): Promise<OpenRouterCompletionResult> {
	const payload = (await args.response.json()) as OpenRouterResponse;
	const choice = payload.choices?.[0] as
		| {
				finish_reason?: unknown;
				error?: { message?: string };
				message?: {
					content?: unknown;
					reasoning?: string | null;
					reasoning_details?: unknown;
					images?: unknown[];
				};
		  }
		| undefined;

	if (choice?.error?.message) {
		throw new Error(choice.error.message);
	}

	const text = extractContentText(choice?.message?.content);
	const reasoningDetails = normalizeReasoningDetails(choice?.message?.reasoning_details);
	const thinking = choice?.message?.reasoning || extractReasoningFromDetails(reasoningDetails);
	const encryptedReasoningDetail = extractEncryptedReasoningDetailFromDetails(reasoningDetails);
	const thoughtSignature = encryptedReasoningDetail?.data;
	const thoughtSignatureReasoningDetail = getThoughtSignatureReasoningMetadata(encryptedReasoningDetail);
	const { responseParts, textSignature } = buildResponsePartsFromOpenRouter({
		text,
		reasoningDetails,
		fallbackThinking: thinking
	});

	const images: OpenRouterCompletionResult["images"] = [];
	for (const img of choice?.message?.images || []) {
		const extracted = extractImageDataFromOpenRouterImageUrl(
			img,
			thoughtSignature,
			thoughtSignatureReasoningDetail
		);
		if (extracted) {
			images.push(extracted);
		}
	}

	if (text && args.onText) {
		await args.onText({ text, delta: text });
	}

	if (thinking && args.onThinking) {
		await args.onThinking({ thinking, delta: thinking });
	}

	for (const image of images) {
		if (args.onImage) {
			await args.onImage(image);
		}
	}

	return {
		text,
		thinking,
		textSignature,
		responseParts,
		finishReason: choice?.finish_reason,
		images
	};
}

async function processOpenRouterStream(args: {
	response: Response;
	signal?: AbortSignal;
	onText?: OpenRouterCompletionArgs["onText"];
	onThinking?: OpenRouterCompletionArgs["onThinking"];
	onImage?: OpenRouterCompletionArgs["onImage"];
}): Promise<OpenRouterCompletionResult> {
	if (!args.response.body) {
		return { text: "", thinking: "", responseParts: [] };
	}

	const reader = args.response.body.getReader();
	const decoder = new TextDecoder();

	let buffer = "";
	let text = "";
	let thinking = "";
	let finishReason: unknown;
	let thoughtSignature: string | undefined;
	let thoughtSignatureReasoningDetail: GeneratedImage["thoughtSignatureReasoningDetail"];
	let reasoningDetails: OpenRouterReasoningDetail[] = [];
	const images: OpenRouterCompletionResult["images"] = [];

	while (true) {
		if (args.signal?.aborted) {
			await reader.cancel().catch(() => undefined);
			const err = new Error("Aborted");
			(err as Error & { name: string }).name = "AbortError";
			throw err;
		}

		const { value, done } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });

		let separatorIndex = buffer.indexOf("\n\n");
		while (separatorIndex !== -1) {
			const eventBlock = buffer.slice(0, separatorIndex);
			buffer = buffer.slice(separatorIndex + 2);
			separatorIndex = buffer.indexOf("\n\n");

			if (!eventBlock || eventBlock.startsWith(":")) continue;

			const data = eventBlock
				.split("\n")
				.filter((line) => line.startsWith("data: "))
				.map((line) => line.slice(6))
				.join("");

			if (!data || data === "[DONE]") {
				continue;
			}

			const payload = JSON.parse(data) as OpenRouterResponse;
			const choice = payload.choices?.[0] as StreamingChoice | undefined;

			if (!choice) {
				continue;
			}

			if (choice.error?.message) {
				throw new Error(choice.error.message);
			}

			finishReason = choice.finish_reason ?? finishReason;

			const textDelta = choice.delta?.content || "";
			if (textDelta) {
				text += textDelta;
				await args.onText?.({ text, delta: textDelta });
			}

			const thinkingDelta = choice.delta?.reasoning || "";
			if (thinkingDelta) {
				thinking += thinkingDelta;
				await args.onThinking?.({ thinking, delta: thinkingDelta });
			}

			const deltaReasoningDetails = normalizeReasoningDetails(choice.delta?.reasoning_details);
			if (deltaReasoningDetails.length > 0) {
				reasoningDetails = mergeReasoningDetails(reasoningDetails, deltaReasoningDetails);
			}

			const encryptedReasoningDetail = extractEncryptedReasoningDetailFromDetails(deltaReasoningDetails);
			if (encryptedReasoningDetail) {
				thoughtSignature = encryptedReasoningDetail.data;
				thoughtSignatureReasoningDetail = getThoughtSignatureReasoningMetadata(encryptedReasoningDetail);
			}

			const deltaImages = choice.delta?.images || [];
			for (const img of deltaImages) {
				const imageObj = extractImageDataFromOpenRouterImageUrl(
					img,
					thoughtSignature,
					thoughtSignatureReasoningDetail
				);
				if (imageObj) {
					images.push(imageObj);
					if (args.onImage) {
						await args.onImage(imageObj);
					}
				}
			}
		}
	}

	const responsePartResult = buildResponsePartsFromOpenRouter({
		text,
		reasoningDetails,
		fallbackThinking: thinking
	});

	return { text, thinking, finishReason, images, ...responsePartResult };
}

export function getOpenRouterModelDefinition(model: string): ChatModelDefinition | undefined {
	return getChatModelDefinition(model);
}

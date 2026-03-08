import type { Content } from "@google/genai";

import type {
    ContentPart,
    FileContentPart,
    ImageContentPart,
    Message as OpenRouterMessage,
    Plugin,
    Request as OpenRouterRequest,
    Response as OpenRouterResponse,
    StreamingChoice,
} from "../types/OpenRouterTypes";
import { getChatModelDefinition, modelSupportsTemperature, type ChatModelDefinition } from "../types/Models";
import * as helpers from "../utils/helpers";

export interface OpenRouterCompletionResult {
    text: string;
    thinking: string;
    finishReason?: unknown;
}

export interface OpenRouterCompletionArgs {
    apiKey: string;
    request: OpenRouterRequest;
    signal?: AbortSignal;
    onText?: (args: { text: string; delta: string }) => void | Promise<void>;
    onThinking?: (args: { thinking: string; delta: string }) => void | Promise<void>;
}

function getHeaders(apiKey: string): Record<string, string> {
    return {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-OpenRouter-Title": "Zodiac",
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
    return mimeType.startsWith("text/") || [
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-javascript",
        "application/typescript",
        "application/x-typescript",
        "text/csv",
    ].includes(mimeType);
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
        image_url: { url },
    };
}

function makeFilePart(args: { fileName: string; mimeType: string; base64: string }): FileContentPart {
    return {
        type: "file",
        file: {
            filename: normalizeFileName(args.fileName, args.mimeType),
            file_data: createDataUri(args.base64, args.mimeType),
        },
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
        return [{
            type: "text",
            text: `[Attached file: ${normalizeFileName(file.name, mimeType)}]\n${text}`,
        }];
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
        return [{
            type: "text",
            text: decodeBase64ToText(args.base64),
        }];
    }

    return [makeFilePart({
        fileName: args.fileName || "attachment",
        mimeType,
        base64: args.base64,
    })];
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

function extractReasoningFromDetails(details: unknown): string {
    if (!Array.isArray(details)) return "";

    return details
        .map((detail) => {
            const value = detail as { text?: string; summary?: string };
            return value.text || value.summary || "";
        })
        .filter(Boolean)
        .join("");
}

function extractContentText(content: unknown): string {
    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                const value = part as { type?: string; text?: string };
                return value.type === "text" ? (value.text || "") : "";
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
            if (part?.text) {
                appendTextPart(contentParts, String(part.text));
                continue;
            }

            if (part?.inlineData?.data) {
                contentParts.push(...convertInlineDataToOpenRouterParts({
                    base64: String(part.inlineData.data),
                    mimeType: String(part.inlineData.mimeType || "application/octet-stream"),
                }));
            }
        }

        if (contentParts.length === 0) continue;
        messages.push({ role, content: collapseContentParts(contentParts) });
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
        contentParts.push(...await convertFileToOpenRouterParts(file));
    }

    if (contentParts.length === 0) {
        contentParts.push({ type: "text", text: args.text });
    }

    return {
        role: "user",
        content: collapseContentParts(contentParts),
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

    messages.push(...await convertGeminiHistoryToOpenRouterMessages(args.history));
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
            exclude: true,
        };
    }

    if (args.thinkingBudget > 0) {
        return {
            max_tokens: args.thinkingBudget,
            exclude: false,
        };
    }

    return {
        enabled: true,
        exclude: false,
    };
}

export function buildOpenRouterPlugins(args: {
    isInternetSearchEnabled: boolean;
}): Plugin[] | undefined {
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
            thinkingBudget: args.thinkingBudget,
        }),
        plugins: buildOpenRouterPlugins({ isInternetSearchEnabled: args.isInternetSearchEnabled }),
        response_format: args.responseFormat,
        provider: definition?.provider === "openrouter"
            ? { require_parameters: false }
            : undefined,
    };
}

export async function requestOpenRouterCompletion(args: OpenRouterCompletionArgs): Promise<OpenRouterCompletionResult> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: getHeaders(args.apiKey),
        body: JSON.stringify(args.request),
        signal: args.signal,
    });

    if (!response.ok) {
        let message = `OpenRouter error: ${response.status}`;
        try {
            const json = await response.json() as { error?: { message?: string } };
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
        });
    }

    return await processOpenRouterJson({ response, onText: args.onText, onThinking: args.onThinking });
}

async function processOpenRouterJson(args: {
    response: Response;
    onText?: OpenRouterCompletionArgs["onText"];
    onThinking?: OpenRouterCompletionArgs["onThinking"];
}): Promise<OpenRouterCompletionResult> {
    const payload = await args.response.json() as OpenRouterResponse;
    const choice = payload.choices?.[0] as {
        finish_reason?: unknown;
        error?: { message?: string };
        message?: {
            content?: unknown;
            reasoning?: string | null;
            reasoning_details?: unknown;
        };
    } | undefined;

    if (choice?.error?.message) {
        throw new Error(choice.error.message);
    }

    const text = extractContentText(choice?.message?.content);
    const thinking = choice?.message?.reasoning || extractReasoningFromDetails(choice?.message?.reasoning_details);

    if (text && args.onText) {
        await args.onText({ text, delta: text });
    }

    if (thinking && args.onThinking) {
        await args.onThinking({ thinking, delta: thinking });
    }

    return {
        text,
        thinking,
        finishReason: choice?.finish_reason,
    };
}

async function processOpenRouterStream(args: {
    response: Response;
    signal?: AbortSignal;
    onText?: OpenRouterCompletionArgs["onText"];
    onThinking?: OpenRouterCompletionArgs["onThinking"];
}): Promise<OpenRouterCompletionResult> {
    if (!args.response.body) {
        return { text: "", thinking: "" };
    }

    const reader = args.response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let text = "";
    let thinking = "";
    let finishReason: unknown;

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
        }
    }

    return { text, thinking, finishReason };
}

export function getOpenRouterModelDefinition(model: string): ChatModelDefinition | undefined {
    return getChatModelDefinition(model);
}

/**
 * Chat history builder utilities.
 * Shared functions for constructing Gemini API chat history from local chat data.
 * 
 * These utilities handle the common patterns of:
 * - Finding last image/attachment indices
 * - Processing attachments into API parts
 * - Processing generated images into API parts
 * - Rendering grounding content to shadow DOM
 */

import type { Message, GeneratedImage } from "../types/Message";
import type { Chat, DbChat } from "../types/Chat";
import * as helpers from "./helpers";

// ================================================================================
// INDEX FINDING
// ================================================================================

/**
 * Finds the index of the last visible message containing generated images.
 * Returns -1 if no such message exists.
 */
export function findLastGeneratedImageIndex(content: Message[]): number {
    for (let i = content.length - 1; i >= 0; i--) {
        const message = content[i];
        if (message.hidden) continue;
        if (message.generatedImages && message.generatedImages.length > 0) {
            return i;
        }
    }
    return -1;
}

/**
 * Finds the index of the last visible message containing attachments.
 * Returns -1 if no such message exists.
 */
export function findLastAttachmentIndex(content: Message[]): number {
    for (let i = content.length - 1; i >= 0; i--) {
        const message = content[i];
        if (message.hidden) continue;
        if (message.parts.some(part => part.attachments && part.attachments.length > 0)) {
            return i;
        }
    }
    return -1;
}

/**
 * Result of finding relevant message indices for history construction.
 */
export interface MessageIndices {
    lastImageIndex: number;
    lastAttachmentIndex: number;
}

/**
 * Finds both last image and last attachment indices in one pass.
 */
export function findMediaIndices(content: Message[]): MessageIndices {
    return {
        lastImageIndex: findLastGeneratedImageIndex(content),
        lastAttachmentIndex: findLastAttachmentIndex(content),
    };
}

// ================================================================================
// PART PROCESSING
// ================================================================================

/**
 * Configuration for processing attachments.
 */
export interface AttachmentProcessingConfig {
    attachments: FileList | File[];
    shouldProcess: boolean;
}

/**
 * Processes file attachments into Gemini API parts.
 * Returns an array of parts ready to be added to a message.
 */
export async function processAttachmentsToParts(config: AttachmentProcessingConfig): Promise<any[]> {
    const { attachments, shouldProcess } = config;
    
    if (!shouldProcess || !attachments || attachments.length === 0) {
        return [];
    }

    const parts: any[] = [];
    const { createPartFromBase64 } = await import("@google/genai");
    
    for (const attachment of Array.from(attachments)) {
        const base64 = await helpers.fileToBase64(attachment);
        const mimeType = attachment.type || "application/octet-stream";
        parts.push(await createPartFromBase64(base64, mimeType));
    }
    
    return parts;
}

/**
 * Configuration for processing generated images.
 */
export interface GeneratedImageProcessingConfig {
    images: GeneratedImage[] | undefined;
    shouldProcess: boolean;
    enforceThoughtSignatures: boolean;
    skipThoughtSignatureValidator: string;
}

/**
 * Processes generated images into Gemini API inline data parts.
 * Returns an array of parts ready to be added to a message.
 */
export function processGeneratedImagesToParts(config: GeneratedImageProcessingConfig): any[] {
    const { images, shouldProcess, enforceThoughtSignatures, skipThoughtSignatureValidator } = config;
    
    if (!shouldProcess || !images || images.length === 0) {
        return [];
    }

    return images.map(img => {
        const part: any = {
            inlineData: { data: img.base64, mimeType: img.mimeType }
        };
        part.thoughtSignature = img.thoughtSignature ?? 
            (enforceThoughtSignatures ? skipThoughtSignatureValidator : undefined);
        if (img.thought) {
            part.thought = img.thought;
        }
        return part;
    });
}

// ================================================================================
// GROUNDING RENDERING
// ================================================================================

/**
 * Renders grounding content to an element's shadow DOM.
 * This is used to display Google Search grounding results.
 */
export function renderGroundingToShadowDom(element: Element, content: string): void {
    if (!content) return;
    
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    shadow.innerHTML = content;
    
    // Fix carousel scrollbar styling if present
    const carousel = shadow.querySelector<HTMLDivElement>(".carousel");
    if (carousel) {
        carousel.style.scrollbarWidth = "unset";
    }
}

// ================================================================================
// THINKING UI
// ================================================================================

/**
 * Creates the thinking UI elements (toggle button + content container).
 * Returns an object with references to the created elements.
 */
export interface ThinkingUiElements {
    wrapper: HTMLDivElement;
    toggle: HTMLButtonElement;
    content: HTMLDivElement;
}

export function createThinkingUiElements(): ThinkingUiElements {
    const wrapper = document.createElement("div");
    wrapper.className = "message-thinking";

    const toggle = document.createElement("button");
    toggle.className = "thinking-toggle btn-textual";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Show reasoning";

    const content = document.createElement("div");
    content.className = "thinking-content";
    content.setAttribute("hidden", "");

    wrapper.append(toggle, content);

    // Setup toggle behavior
    toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        if (expanded) {
            toggle.setAttribute("aria-expanded", "false");
            toggle.textContent = "Show reasoning";
            content.setAttribute("hidden", "");
        } else {
            toggle.setAttribute("aria-expanded", "true");
            toggle.textContent = "Hide reasoning";
            content.removeAttribute("hidden");
        }
    });

    return { wrapper, toggle, content };
}

/**
 * Ensures thinking UI exists on a message element, creating it if needed.
 * Returns the thinking content element, or null if the message structure is invalid.
 */
export function ensureThinkingUi(messageElement: HTMLElement): HTMLDivElement | null {
    // Check if already exists
    const existing = messageElement.querySelector<HTMLDivElement>(".thinking-content");
    if (existing) {
        return existing;
    }

    // Find insertion point
    const messageTextWrapper = messageElement.querySelector<HTMLDivElement>(".message-text");
    if (!messageTextWrapper) {
        return null;
    }

    // Create and insert
    const { wrapper, content } = createThinkingUiElements();
    messageTextWrapper.insertAdjacentElement("beforebegin", wrapper);

    return content;
}

// ================================================================================
// ERROR MESSAGES
// ================================================================================

/**
 * Error message types for different failure scenarios.
 */
export type ErrorMessageType = "generation" | "image_generation" | "image_editing";

const ERROR_MESSAGES: Record<ErrorMessageType, string> = {
    generation: "Error: Unable to get a response from the AI. Please try again by regenerating the response.",
    image_generation: "I'm sorry, I couldn't generate the image you requested. Try regenerating the response, or picking a different image model in the settings.",
    image_editing: "I'm sorry, I couldn't edit the image. Please try again or check that the image is valid.",
};

/**
 * Creates an error message for the given error type.
 */
export function createErrorMessage(type: ErrorMessageType, personalityId: string): Message {
    return {
        role: "model",
        parts: [{ text: ERROR_MESSAGES[type] }],
        personalityid: personalityId,
    };
}

// ================================================================================
// SAFETY SETTINGS
// ================================================================================

import { HarmBlockThreshold, HarmCategory } from "@google/genai";

/**
 * Default safety settings with all filters disabled.
 * Used for chat title generation where we need unrestricted responses.
 */
export const UNRESTRICTED_SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
] as const;

// ================================================================================
// TEXT EXTRACTION
// ================================================================================

import type { TextAndThinking } from "../types/Message";

/**
 * Extracts text and thinking content from a Gemini API response payload.
 * Handles both standard responses and decensored fallback responses.
 */
export function extractTextAndThinkingFromResponse(payload: any): TextAndThinking {
    // Handle decensored fallback format
    if (payload && typeof payload === "object" && payload.decensored) {
        return {
            text: (payload.text ?? "").toString(),
            thinking: (payload.reasoning ?? "").toString()
        };
    }

    // Handle standard Gemini response format
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
        let thinking = "";
        let text = "";
        for (const part of parts) {
            if (part?.thought && part?.text) {
                thinking += part.text;
            } else if (part?.text) {
                text += part.text;
            }
        }
        return {
            text: text || (payload?.text ?? "").toString(),
            thinking
        };
    }

    // Fallback for simple text response
    return {
        text: (payload?.text ?? "").toString(),
        thinking: ""
    };
}

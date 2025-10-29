import * as overlayService from "../services/Overlay.service";
import DOMPurify from 'dompurify';
import { marked } from "marked";
import { getSettings } from '../services/Settings.service';


// Description: This file contains helper functions that are used throughout the application.

export function hideElement(element: HTMLElement, nowait?: boolean) {
    if (!element) {
        return;
    }
    element.style.transition = 'opacity 0.2s';
    element.style.opacity = '0';
    setTimeout(function () {
        hideWithClass(element);
    }, nowait ? 0 : 200);
}

export function showElement(element: HTMLElement, wait: boolean) {
    if (!element) {
        return;
    }
    let timeToWait = 0
    if (wait) {
        timeToWait = 200;
    }
    setTimeout(function () {
        showWithClass(element);
        element.style.transition = 'opacity 0.2s';
        element.style.opacity = '0';  //required as certain elements arent opacity 0 despite being hidden
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                element.style.opacity = '1';
            });
        });
    }, timeToWait);
}

export function darkenCard(element: HTMLElement) {
    const backgroundImageMatch = element.style.backgroundImage.match(/url\((.*?)\)/);
    if (!backgroundImageMatch) {
        return;
    }
    let elementBackgroundImageURL = backgroundImageMatch[1].replace(/('|")/g, '');
    element.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${elementBackgroundImageURL}')`;
}


export function lightenCard(element: HTMLElement) {
    const backgroundImageMatch = element.style.backgroundImage.match(/url\((.*?)\)/);
    if (!backgroundImageMatch) {
        return;
    }
    let elementBackgroundImageURL = backgroundImageMatch[1].replace(/('|")/g, '');
    element.style.backgroundImage = `url('${elementBackgroundImageURL}')`;
}

export function getVersion() {
    return "1.1.0";
}

export function getSanitized(string: string) {
    return DOMPurify.sanitize(string.trim());
}


/**
 * Converts HTML entities back to their original characters.
 * 
 * This function takes an HTML string and replaces common HTML entities
 * with their corresponding characters. It handles entities for less-than,
 * greater-than, ampersand, quotes, apostrophes, and non-breaking spaces.
 * 
 * @param innerHTML - The HTML string containing entities to be unescaped
 * @returns The string with HTML entities converted back to original characters
 * 
 * @example
 * ```typescript
 * const htmlString = "&lt;div&gt;Hello &amp; welcome&lt;/div&gt;";
 * const unescaped = getUnescaped(htmlString);
 * console.log(unescaped); // "<div>Hello & welcome</div>"
 * ```
 */
function getUnescaped(innerHTML: string) {
    return innerHTML
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");
}


/**
 * Converts contenteditable HTML content to Markdown-formatted plain text with proper line breaks.
 * 
 * This function normalizes HTML content from contenteditable elements, particularly handling
 * mobile keyboard behavior where lines are wrapped in `<div>` or `<p>` tags instead of using `<br>`.
 * 
 * The normalization process:
 * 1. Converts `<br>` tags to newlines
 * 2. Treats closing `</div>`/`</p>` tags as line breaks
 * 3. Removes opening `<div>`/`<p>` tags
 * 4. Collapses empty block placeholders like `<div><br></div>`
 * 5. Strips all remaining HTML tags to produce plain text
 * 6. Converts single newlines within paragraphs to Markdown hard breaks (two spaces + newline)
 * 7. Limits consecutive newlines to maximum of 2 to preserve intentional spacing
 * 
 * @param innerHTML - The HTML content from a contenteditable element
 * @returns Markdown-formatted plain text with proper line breaks, or empty string if input is falsy
 * 
 * @example
 * ```typescript
 * const html = '<div>Line 1</div><div>Line 2<br>Line 3</div>';
 * const result = getMdNewLined(html);
 * // Returns: "Line 1\n\nLine 2  \nLine 3"
 * ```
 */
function getMdNewLined(innerHTML: string) {
    // Normalize contenteditable HTML into plain text with newlines.
    // Mobile (Android) keyboards inside a contenteditable often wrap each line
    // in <div> or <p> instead of inserting <br>. Previously we only converted
    // <br> to newlines, so those block tags were kept, later escaped, and
    // appeared as literal "<div>" in the sent message. Here we:
    // 1. Convert <br> to \n
    // 2. Treat closing </div>/<p> as line breaks
    // 3. Remove opening <div>/<p> tags
    // 4. Collapse empty block placeholders like <div><br></div>
    // 5. Strip any remaining tags (we only want plain text from the input field)
    // 6. Collapse excessive blank lines and trim trailing whitespace
    if (!innerHTML) return "";

    let normalized = innerHTML;

    // Replace &nbsp; early (will also be handled later, but helps with cleanup)
    normalized = normalized.replace(/&nbsp;/gi, ' ');

    // Collapse empty block placeholders e.g. <div><br></div> -> double newline
    normalized = normalized.replace(/<(div|p)>\s*<br\s*\/?>(\s*)<\/\1>/gi, '\n\n');

    // Convert <br> to newline
    normalized = normalized.replace(/<br\s*\/?>(?=\s*<)/gi, '\n'); // br before another tag
    normalized = normalized.replace(/<br\s*\/?>(?!\n)/gi, '\n');   // remaining br

    // Treat opening block tags as newline boundaries
    normalized = normalized.replace(/<(div|p)[^>]*>/gi, '\n');

    // Remove closing block tags
    normalized = normalized.replace(/<\/(div|p)>/gi, '');

    // Strip any remaining HTML tags (keeps user content purely textual)
    normalized = normalized.replace(/<[^>]+>/g, '');

    // Normalize CRLF -> LF
    normalized = normalized.replace(/\r\n?/g, '\n');

    // Collapse 3+ consecutive newlines to max 2 (preserve intentional blank line spacing)
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // Within each paragraph (split by double newline), convert single newlines to Markdown hard breaks (two spaces before \n)
    // This ensures a single Enter (common on mobile) renders as a visible line break instead of a space.
    normalized = normalized
        .split(/\n\n/) // paragraph boundaries
        .map(paragraph => paragraph.replace(/\n/g, '  \n'))
        .join('\n\n');

    // Final trim (do after transformations so we don't remove intentional internal newlines)
    normalized = normalized.trim();

    return normalized;
}

export function getEncoded(innerHTML: string) {
    return getUnescaped(getMdNewLined(innerHTML)).trim();
}

function getEscaped(unescapedString: string): string {
    return unescapedString
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export async function getDecoded(encoded: string) {
    // Re-escape only OUTSIDE of code spans/blocks to avoid double-escaping inside backticks
    // 1) Temporarily replace fenced blocks and inline code with placeholders
    const blocks: string[] = [];
    const inlines: string[] = [];

    // Use private-use unicode range to minimize collision with user content
    const blockToken = (i: number) => `\uE000MD_BLOCK_${i}\uE000`;
    const inlineToken = (i: number) => `\uE000MD_INLINE_${i}\uE000`;

    let protectedMd = encoded;

    // Protect fenced code blocks ```lang\n...\n```
    protectedMd = protectedMd.replace(/```[\s\S]*?```/g, (m) => {
        blocks.push(m);
        return blockToken(blocks.length - 1);
    });

    // Protect inline code `...`
    protectedMd = protectedMd.replace(/`[^`]*`/g, (m) => {
        inlines.push(m);
        return inlineToken(inlines.length - 1);
    });

    // 2) Escape the remaining (non-code) segments to neutralize HTML
    protectedMd = getEscaped(protectedMd);

    // 3) Restore the protected code segments
    protectedMd = protectedMd
        .replace(/\uE000MD_BLOCK_(\d+)\uE000/g, (_, i) => blocks[Number(i)])
        .replace(/\uE000MD_INLINE_(\d+)\uE000/g, (_, i) => inlines[Number(i)]);

    // 4) Parse to HTML with marked
    const result = await marked.parse(protectedMd, { breaks: true, gfm: true, async: true });
    return result;
}

export function messageContainerScrollToBottom(force?: boolean) {
    if (!getSettings().autoscroll && !force) {
        return;
    }
    const container = document.querySelector("#scrollable-chat-container");
    container?.scrollBy({
        top: container.scrollHeight,
        behavior: 'smooth',
    });
}

export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            //we need to strip the data prefix
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = (error) => {
            reject(error);
        };
    });
}

// Safely convert an ArrayBuffer to a base64 string (without data: prefix)
export async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
    const blob = new Blob([buffer]);
    const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

/**
 * Calculates fuzzy search score between a search term and a target string
 * Returns a score from 0 to 1, where 1 is a perfect match
 * @param searchTerm The term being searched for
 * @param target The string to search within
 * @returns Score between 0 and 1, or null if no match
 */
export function fuzzySearch(searchTerm: string, target: string): number | null {
    if (!searchTerm || !target) {
        return null;
    }

    const search = searchTerm.toLowerCase();
    const text = target.toLowerCase();

    // Exact match gets highest score
    if (text === search) {
        return 1;
    }

    // Contains search term gets high score
    if (text.includes(search)) {
        return 0.8 + (0.2 * (search.length / text.length));
    }

    // Fuzzy matching - check if all characters in search term appear in order
    let searchIndex = 0;
    let matchedChars = 0;
    let consecutiveMatches = 0;
    let maxConsecutiveMatches = 0;

    for (let i = 0; i < text.length && searchIndex < search.length; i++) {
        if (text[i] === search[searchIndex]) {
            matchedChars++;
            searchIndex++;
            consecutiveMatches++;
            maxConsecutiveMatches = Math.max(maxConsecutiveMatches, consecutiveMatches);
        } else {
            consecutiveMatches = 0;
        }
    }

    // All characters must be found in order
    if (searchIndex < search.length) {
        return null;
    }

    // Calculate score based on:
    // - Percentage of characters matched
    // - Longest consecutive match sequence
    // - Relative length of search term to target
    const charMatchRatio = matchedChars / search.length;
    const consecutiveBonus = maxConsecutiveMatches / search.length;
    const lengthPenalty = search.length / text.length;

    return (charMatchRatio * 0.4) + (consecutiveBonus * 0.4) + (lengthPenalty * 0.2);
}

export async function confirmDialogDanger(message: string): Promise<boolean> {
    const dialog = document.querySelector<HTMLDivElement>("#dialog");
    const dialogMessage = document.querySelector<HTMLDivElement>("#dialog-message");
    const btnDialogOk = document.querySelector<HTMLButtonElement>("#btn-dialog-ok");
    const btnDialogCancel = document.querySelector<HTMLButtonElement>("#btn-dialog-cancel");
    if (!dialog || !dialogMessage || !btnDialogOk || !btnDialogCancel) {
        console.error("Dialog elements not found in the document");
        throw new Error("Dialog elements not found in the document");
    }
    showElement(dialog, false);
    return new Promise((resolve) => {
        dialogMessage.textContent = message;

        btnDialogOk.onclick = () => {
            hideElement(dialog);
            resolve(true);
        };

        btnDialogCancel.onclick = () => {
            hideElement(dialog);
            resolve(false);
        };
    });
}

// Class-based visibility helpers
function hideWithClass(element: HTMLElement | null) {
    if (!element) return;
    element.classList.add('hidden');
}

function showWithClass(element: HTMLElement | null) {
    if (!element) return;
    element.classList.remove('hidden');
}


export function getClientScrollbarWidth(): number {
    // Create a temporary div container and append it into the body
    const container = document.createElement("div");
    // Append the element into the body
    document.body.appendChild(container);
    // Force scrollbar on the element
    container.style.overflow = 'scroll';
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    const scrollbarWidth = container.offsetWidth - container.clientWidth;
    document.body.removeChild(container);
    return scrollbarWidth;
}
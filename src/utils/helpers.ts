import * as overlayService from "../services/Overlay.service";
import DOMPurify from 'dompurify';
import { marked } from "marked";
import { getSettings } from '../services/Settings.service';


// Description: This file contains helper functions that are used throughout the application.

export function hideElement(element: HTMLElement) {
    if (!element) {
        return;
    }
    element.style.transition = 'opacity 0.2s';
    element.style.opacity = '0';
    setTimeout(function () {
        hideWithClass(element);
    }, 200);
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
    return "1.0.0";
}

export function getSanitized(string: string) {
    return DOMPurify.sanitize(string.trim());
}

function getUnescaped(innerHTML: string) {
    return innerHTML.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function getMdNewLined(innerHTML: string) {
    //replace <br> with \n
    //also collapse multiple newlines into one
    return innerHTML.replace(/<br>/g, "\n").replace(/\n{2,}/g, "\n");
}

export function getEncoded(innerHTML: string) {
    return getUnescaped(getMdNewLined(innerHTML)).trim();
}

export function getDecoded(encoded: string) {
    //reescape, convert to md
    return marked.parse(encoded.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), { breaks: true });
}

// Basic HTML escape for displaying raw reasoning/thinking safely inside <code> blocks
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function messageContainerScrollToBottom() {
    if (!getSettings().autoscroll) {
        return;
    }
    const container = document.querySelector(".message-container");
    container?.scrollBy({
        top: container.scrollHeight,
        behavior: 'instant',
    });
}

export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            resolve(reader.result as string);
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

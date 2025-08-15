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
        element.style.display = 'none';
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
        element.style.display = 'flex';
        element.style.opacity = '0';  //required as certain elements arent opacity 0 despite being hidden
        element.style.transition = 'opacity 0.2s';
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

export function getVersion(){
    return "0.9.9";
}

export function getSanitized(string: string) {
    return DOMPurify.sanitize(string.trim());
}

function getUnescaped(innerHTML: string){
    return innerHTML.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function getMdNewLined(innerHTML: string){
    //replace <br> with \n
    //also collapse multiple newlines into one
    return innerHTML.replace(/<br>/g, "\n").replace(/\n{2,}/g, "\n");
}

export function getEncoded(innerHTML: string){
    return getUnescaped(getMdNewLined(innerHTML)).trim();
}

export function getDecoded(encoded: string){
    //reescape, convert to md
    return marked.parse(encoded.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), {breaks: true});
}

export function messageContainerScrollToBottom(){
    if(!getSettings().autoscroll){
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
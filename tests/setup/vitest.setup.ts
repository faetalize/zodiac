import "fake-indexeddb/auto";

import { afterEach, beforeEach } from "vitest";

declare global {
    interface Window {
        matchMedia(query: string): MediaQueryList;
    }
}

function createMatchMedia(): typeof window.matchMedia {
    return (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    });
}

function createStorageMock(): Storage {
    const values = new Map<string, string>();

    return {
        get length() {
            return values.size;
        },
        clear() {
            values.clear();
        },
        getItem(key: string) {
            return values.has(key) ? values.get(key)! : null;
        },
        key(index: number) {
            return Array.from(values.keys())[index] ?? null;
        },
        removeItem(key: string) {
            values.delete(key);
        },
        setItem(key: string, value: string) {
            values.set(key, String(value));
        },
    };
}

if (!window.localStorage || typeof window.localStorage.clear !== "function") {
    Object.defineProperty(window, "localStorage", {
        value: createStorageMock(),
        configurable: true,
    });
}

if (!window.sessionStorage || typeof window.sessionStorage.clear !== "function") {
    Object.defineProperty(window, "sessionStorage", {
        value: createStorageMock(),
        configurable: true,
    });
}

if (!window.matchMedia) {
    window.matchMedia = createMatchMedia();
}

if (!window.scrollBy) {
    window.scrollBy = () => {};
}

if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(Date.now()), 0);
    };
}

if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (handle: number) => {
        window.clearTimeout(handle);
    };
}

if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => "blob:test-object-url";
}

if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = () => {};
}

beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    window.localStorage.clear();
    window.sessionStorage.clear();
});

afterEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    window.localStorage.clear();
    window.sessionStorage.clear();
});

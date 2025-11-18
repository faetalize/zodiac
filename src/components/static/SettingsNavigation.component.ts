import * as helpers from "../../utils/helpers";

interface SettingsPageConfig {
    id: string;
    key: SettingsPageKey;
}

type SettingsPageKey = "home" | "api" | "chat" | "image" | "personalisation" | "data";

const SETTINGS_SECTION_SELECTOR = "#settings-section";
const SETTINGS_HOME_ID = "settings-home";
const SETTINGS_PAGE_SELECTOR = "[data-settings-page]";
const SETTINGS_ITEM_SELECTOR = "[data-settings-target]";
const SETTINGS_BACK_BUTTON_SELECTOR = "[data-settings-back]";

let currentPage: SettingsPageKey = "home";

function getSettingsSection(): HTMLElement | null {
    return document.querySelector<HTMLElement>(SETTINGS_SECTION_SELECTOR);
}

function getHomeView(): HTMLElement | null {
    return document.getElementById(SETTINGS_HOME_ID);
}

function getPages(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(SETTINGS_PAGE_SELECTOR));
}

function showPage(target: SettingsPageKey, container: HTMLElement): void {
    const homeView = getHomeView();
    const pages = getPages(container);

    if (!homeView) {
        console.error("SettingsNavigation: Home view not found.");
        return;
    }

    console.log("SettingsNavigation: showPage called", { target, pagesCount: pages.length });

    // Hide all pages instantly (no fade-out delay) to avoid everything being hidden mid-transition
    helpers.hideElement(homeView, true);
    pages.forEach((page) => helpers.hideElement(page, true));

    if (target === "home") {
        // Show home immediately
        helpers.showElement(homeView, false);
    } else {
        const page = pages.find((p) => p.dataset.settingsPage === target);
        if (!page) {
            console.error(`SettingsNavigation: Target page '${target}' not found.`, {
                availablePages: pages.map((p) => p.dataset.settingsPage),
            });
            helpers.showElement(homeView, false);
            currentPage = "home";
            return;
        }

        console.log("SettingsNavigation: showing page", {
            target,
            pageDataset: page.dataset.settingsPage,
            classList: Array.from(page.classList),
        });
        // Show the requested page immediately
        helpers.showElement(page, false);
    }

    currentPage = target;
}

function navigateTo(target: SettingsPageKey, container: HTMLElement): void {
    if (target === currentPage) return;
    showPage(target, container);
}

export function initialize(): void {
    const settingsSection = getSettingsSection();
    if (!settingsSection) {
        console.error("SettingsNavigation: settings section not found in DOM.");
        throw new Error("SettingsNavigation component initialization failed.");
    }

    const homeViewElement = getHomeView();
    const pages = getPages(settingsSection);

    if (!homeViewElement) {
        console.error("SettingsNavigation: settings home view not found.");
        throw new Error("SettingsNavigation component initialization failed.");
    }

    if (pages.length === 0) {
        console.error("SettingsNavigation: no settings pages found.");
        throw new Error("SettingsNavigation component initialization failed.");
    }

    // Initialize state: show home and ensure pages start hidden
    helpers.showElement(homeViewElement, true);
    pages.forEach((page) => {
        helpers.hideElement(page);
    });

    // Attach click handlers for navigation items
    const items = settingsSection.querySelectorAll<HTMLElement>(SETTINGS_ITEM_SELECTOR);
    items.forEach((item) => {
        const targetKey = item.dataset.settingsTarget as SettingsPageKey | undefined;
        if (!targetKey) {
            return;
        }
        item.addEventListener("click", () => navigateTo(targetKey, settingsSection));
    });

    // Attach back button handlers
    const backButtons = settingsSection.querySelectorAll<HTMLButtonElement>(SETTINGS_BACK_BUTTON_SELECTOR);
    backButtons.forEach((button) => {
        button.addEventListener("click", () => navigateTo("home", settingsSection));
    });
}

// Auto-initialize when this module is loaded so it works with the static component loader in main.ts
try {
    initialize();
} catch (err) {
    // If the settings section is not present yet or another error occurs,
    // log it for debugging but don't break the rest of the app.
    console.error("SettingsNavigation initialization error:", err);
}

import { getChatSortMode, setChatSortMode } from "../../services/Chats.service";
import { ChatSortMode } from "../../models/Chat";

const sortButton = document.querySelector<HTMLButtonElement>("#btn-chat-sort");
const sortLabel = document.querySelector<HTMLSpanElement>("#chat-sort-label");

let menu: HTMLDivElement | null = null;
let isOpen = false;

const MODE_LABELS: Record<ChatSortMode, string> = {
    created_at: "Created",
    last_interaction: "Last active",
    alphabetical: "A–Z",
};

function updateSortLabel(mode: ChatSortMode) {
    if (sortLabel) {
        sortLabel.textContent = MODE_LABELS[mode];
    }
}

function closeMenu() {
    if (!menu || !sortButton) return;
    menu.classList.remove("open");
    sortButton.setAttribute("aria-expanded", "false");
    sortButton.classList.remove("chat-sort-toggle-open");
    isOpen = false;
}

function handleOutsideClick(event: MouseEvent) {
    if (!menu || !sortButton) return;
    const target = event.target as Node | null;
    if (!sortButton.contains(target) && !menu.contains(target)) {
        closeMenu();
    }
}

function buildMenu() {
    if (menu) return;

    menu = document.createElement("div");
    menu.classList.add("dropdown-menu", "chat-sort-menu");
    menu.setAttribute("role", "menu");

    const options: Array<{ mode: ChatSortMode; label: string }> = [
        { mode: "created_at", label: "Created date" },
        { mode: "last_interaction", label: "Last interaction" },
        { mode: "alphabetical", label: "Alphabetical (A–Z)" },
    ];

    const currentMode = getChatSortMode();

    options.forEach(({ mode, label }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.classList.add("chat-actions-item", "chat-sort-item");
        btn.setAttribute("role", "menuitemradio");
        btn.setAttribute("aria-checked", mode === currentMode ? "true" : "false");
        btn.textContent = label;

        if (mode === currentMode) {
            btn.classList.add("active");
        }

        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (mode !== getChatSortMode()) {
                setChatSortMode(mode);
                updateSortLabel(mode);
            }
            closeMenu();
        });

        menu!.appendChild(btn);
    });

    // Overlay-style menu anchored to sort button area
    if (sortButton && sortButton.parentElement) {
        if (!sortButton.parentElement.style.position) {
            sortButton.parentElement.style.position = "relative";
        }
        sortButton.parentElement.appendChild(menu);
    }

    document.addEventListener("click", handleOutsideClick);
}

function openMenu() {
    if (!sortButton) return;
    if (!menu) {
        buildMenu();
    }
    if (!menu) return;

    menu.classList.add("open");
    sortButton.setAttribute("aria-expanded", "true");
    sortButton.classList.add("chat-sort-toggle-open");
    isOpen = true;
}

// Initialize current label from stored mode
updateSortLabel(getChatSortMode());

if (sortButton) {
    sortButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });
}

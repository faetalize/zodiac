import * as helpers from "../../utils/helpers";

const chatSearchInput = document.querySelector<HTMLInputElement>("#chat-search-input");

// Debounce timer for chat search
let chatSearchDebounceTimer: number;

if (!chatSearchInput) {
    console.error("ChatSearch component is missing the search input element. Please check the HTML structure.");
    throw new Error("ChatSearch component is not properly initialized.");
}

chatSearchInput.addEventListener("input", () => {
    // Clear existing timer
    clearTimeout(chatSearchDebounceTimer);

    // Set new timer with 300ms delay
    chatSearchDebounceTimer = window.setTimeout(() => {
        performSearch();
    }, 300);
});

/**
 * Perform the actual search operation
 */
function performSearch(): void {
    if (!chatSearchInput) {
        return;
    }

    const searchTerm = chatSearchInput.value.toLowerCase();
    const chatHistorySection = document.querySelector("#chatHistorySection");

    if (!chatHistorySection) {
        return;
    }

    const chatElements = chatHistorySection.querySelectorAll<HTMLLabelElement>(".label-currentchat");

    chatElements.forEach(chatElement => {
        const chatName = chatElement.querySelector('.chat-title-text')?.textContent?.toLowerCase();
        if (chatName && chatName.includes(searchTerm)) {
            helpers.showElement(chatElement, true);
        } else {
            helpers.hideElement(chatElement);
        }
    });
}

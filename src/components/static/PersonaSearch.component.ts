import * as helpers from "../../utils/helpers";

const personaSearchInput = document.querySelector<HTMLInputElement>("#persona-search-input");

let personaSearchDebounceTimer: number;

if (!personaSearchInput) {
	console.error("PersonaSearch component is missing the search input element. Please check the HTML structure.");
	throw new Error("PersonaSearch component is not properly initialized.");
}

personaSearchInput.addEventListener("input", () => {
	clearTimeout(personaSearchDebounceTimer);

	personaSearchDebounceTimer = window.setTimeout(() => {
		performSearch();
	}, 300);
});

window.addEventListener("persona-list-updated", () => {
	performSearch();
});

function performSearch(): void {
	const personalitiesDiv = document.querySelector<HTMLElement>("#personalitiesDiv");

	if (!personaSearchInput || !personalitiesDiv) {
		return;
	}

	const searchTerm = personaSearchInput.value.trim();
	const personalityCards = personalitiesDiv.querySelectorAll<HTMLElement>(".card-personality");

	if (searchTerm === "") {
		personalityCards.forEach((card) => {
			helpers.showElement(card, true);
		});
		return;
	}

	const cardsWithScores: Array<{ element: HTMLElement; score: number }> = [];

	personalityCards.forEach((card) => {
		if (card.id === "btn-add-personality") {
			return;
		}

		const personalityName = card.querySelector(".personality-title")?.textContent;
		if (!personalityName) {
			return;
		}

		const score = helpers.fuzzySearch(searchTerm, personalityName);
		if (score !== null && score > 0.1) {
			cardsWithScores.push({ element: card, score });
		}
	});

	cardsWithScores.sort((a, b) => b.score - a.score);
	const matchingCards = new Set(cardsWithScores.map((item) => item.element));

	personalityCards.forEach((card) => {
		if (card.id === "btn-add-personality" || matchingCards.has(card)) {
			helpers.showElement(card, true);
		} else {
			helpers.hideElement(card);
		}
	});
}

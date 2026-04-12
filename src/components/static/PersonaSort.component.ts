import { getPersonaSortMode, setPersonaSortMode } from "../../services/Personality.service";
import type { PersonaSortMode } from "../../types/Personality";

const sortButton = document.querySelector<HTMLButtonElement>("#btn-persona-sort");
const sortLabel = document.querySelector<HTMLSpanElement>("#persona-sort-label");

let menu: HTMLDivElement | null = null;
let isOpen = false;

const MODE_LABELS: Record<PersonaSortMode, string> = {
	date_added: "Added",
	last_modified: "Modified",
	alphabetical: "A-Z"
};

function updateSortLabel(mode: PersonaSortMode) {
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

	const options: Array<{ mode: PersonaSortMode; label: string }> = [
		{ mode: "date_added", label: "Date added" },
		{ mode: "last_modified", label: "Last modified" },
		{ mode: "alphabetical", label: "Alphabetical (A-Z)" }
	];

	const currentMode = getPersonaSortMode();

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
			void (async () => {
				event.stopPropagation();
				if (mode !== getPersonaSortMode()) {
					await setPersonaSortMode(mode);
					updateSortLabel(mode);
				}
				closeMenu();
			})();
		});

		menu!.appendChild(btn);
	});

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

updateSortLabel(getPersonaSortMode());

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

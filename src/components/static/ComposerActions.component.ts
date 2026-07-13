import { openDropdownPortal, type DropdownPortal } from "../../utils/dropdownPortal";

const messageBoxButtons = document.querySelector<HTMLDivElement>("#message-box-buttons");
const messageBoxActions = document.querySelector<HTMLDivElement>("#message-box-actions");
const messageBoxRight = document.querySelector<HTMLDivElement>(".message-box-right");
const imageCreditsLabel = document.querySelector<HTMLDivElement>("#image-credits-label");
const overflow = document.querySelector<HTMLDivElement>("#composer-actions-overflow");
const overflowButton = document.querySelector<HTMLButtonElement>("#btn-composer-actions-overflow");
const overflowMenu = document.querySelector<HTMLDivElement>("#composer-actions-menu");
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-composer-action]"));

if (
	!messageBoxButtons ||
	!messageBoxActions ||
	!messageBoxRight ||
	!imageCreditsLabel ||
	!overflow ||
	!overflowButton ||
	!overflowMenu ||
	actionButtons.length === 0
) {
	console.error("Composer actions component initialization failed");
	throw new Error("Missing composer action elements");
}

const ensuredMessageBoxButtons = messageBoxButtons;
const ensuredMessageBoxActions = messageBoxActions;
const ensuredMessageBoxRight = messageBoxRight;
const ensuredImageCreditsLabel = imageCreditsLabel;
const ensuredOverflow = overflow;
const ensuredOverflowButton = overflowButton;
const ensuredOverflowMenu = overflowMenu;
const managedActionClasses = new Set(["chat-actions-item", "composer-action-menu-item"]);

let menuPortal: DropdownPortal | null = null;
let layoutFrame: number | null = null;

function resetMenuState(): void {
	menuPortal = null;
	ensuredOverflow.classList.remove("open");
	ensuredOverflowButton.setAttribute("aria-expanded", "false");
}

function closeMenu(): void {
	if (menuPortal) {
		menuPortal.close();
	} else {
		resetMenuState();
	}
}

function menuItems(): HTMLButtonElement[] {
	return actionButtons.filter((button) => button.parentElement === ensuredOverflowMenu && !button.disabled);
}

function openMenu(): void {
	if (menuPortal || ensuredOverflow.classList.contains("hidden")) return;

	ensuredOverflow.classList.add("open");
	ensuredOverflowButton.setAttribute("aria-expanded", "true");
	menuPortal = openDropdownPortal(ensuredOverflowMenu, ensuredOverflowButton, {
		align: "left",
		offsetY: 4,
		onClose: resetMenuState
	});
}

function restoreActions(): void {
	for (const action of actionButtons) {
		ensuredMessageBoxActions.insertBefore(action, ensuredOverflow);
		action.classList.remove(...managedActionClasses);
		action.removeAttribute("role");
	}
}

function moveActionToMenu(action: HTMLButtonElement): void {
	action.classList.add(...managedActionClasses);
	action.setAttribute("role", "menuitem");
	ensuredOverflowMenu.prepend(action);
}

function actionGroupOverflows(): boolean {
	return ensuredMessageBoxActions.scrollWidth > ensuredMessageBoxActions.clientWidth + 1;
}

function isActionAvailable(action: HTMLButtonElement): boolean {
	return getComputedStyle(action).display !== "none";
}

function syncOverflowButtonState(): void {
	const overflowedActions = actionButtons.filter((action) => action.parentElement === ensuredOverflowMenu);
	const activeActions = overflowedActions.filter((action) => action.classList.contains("btn-toggled"));
	const activeLabels = activeActions.map((action) => action.dataset.composerAction).filter(Boolean);
	const label =
		activeLabels.length > 0 ? `More message actions. Active: ${activeLabels.join(", ")}` : "More message actions";

	ensuredOverflowButton.classList.toggle("btn-toggled", activeActions.length > 0);
	ensuredOverflowButton.setAttribute("aria-label", label);
	ensuredOverflowButton.title = label;
}

function updateLayout(): void {
	closeMenu();
	restoreActions();
	ensuredOverflow.classList.add("hidden");
	ensuredImageCreditsLabel.classList.remove("image-credits-label-compact");

	if (ensuredMessageBoxButtons.clientWidth === 0 || !actionGroupOverflows()) {
		syncOverflowButtonState();
		return;
	}

	if (!ensuredImageCreditsLabel.classList.contains("hidden")) {
		ensuredImageCreditsLabel.classList.add("image-credits-label-compact");
		if (!actionGroupOverflows()) {
			syncOverflowButtonState();
			return;
		}
	}

	ensuredOverflow.classList.remove("hidden");
	const availableActions = actionButtons.filter(isActionAvailable);

	for (let index = availableActions.length - 1; index >= 0 && actionGroupOverflows(); index -= 1) {
		moveActionToMenu(availableActions[index]);
	}

	if (ensuredOverflowMenu.childElementCount === 0) {
		ensuredOverflow.classList.add("hidden");
	}

	syncOverflowButtonState();
}

function scheduleLayout(): void {
	if (layoutFrame !== null) return;
	layoutFrame = requestAnimationFrame(() => {
		layoutFrame = null;
		updateLayout();
	});
}

function unmanagedClassNames(value: string | null): string {
	return (value ?? "")
		.split(/\s+/)
		.filter((className) => className && !managedActionClasses.has(className))
		.sort()
		.join(" ");
}

const resizeObserver = new ResizeObserver(scheduleLayout);
resizeObserver.observe(ensuredMessageBoxButtons);
resizeObserver.observe(ensuredMessageBoxActions);
resizeObserver.observe(ensuredMessageBoxRight);

const actionStateObserver = new MutationObserver((mutations) => {
	const hasRelevantChange = mutations.some((mutation) => {
		if (mutation.attributeName === "style") return true;
		if (mutation.attributeName !== "class") return false;
		return (
			unmanagedClassNames(mutation.oldValue) !== unmanagedClassNames((mutation.target as HTMLElement).className)
		);
	});

	if (hasRelevantChange) scheduleLayout();
});

for (const action of actionButtons) {
	actionStateObserver.observe(action, {
		attributes: true,
		attributeFilter: ["class", "style"],
		attributeOldValue: true
	});
}

ensuredOverflowButton.addEventListener("click", (event) => {
	event.stopPropagation();
	if (menuPortal) {
		closeMenu();
	} else {
		openMenu();
	}
});

ensuredOverflowMenu.addEventListener("click", (event) => {
	if (!(event.target as Element).closest<HTMLButtonElement>("[data-composer-action]")) return;
	closeMenu();
	scheduleLayout();
});

ensuredOverflowMenu.addEventListener("keydown", (event) => {
	const items = menuItems();
	if (items.length === 0) return;

	const focusedIndex = items.indexOf(document.activeElement as HTMLButtonElement);
	if (event.key === "Escape") {
		event.preventDefault();
		closeMenu();
		ensuredOverflowButton.focus();
		return;
	}

	if (event.key === "ArrowDown" || event.key === "ArrowUp") {
		event.preventDefault();
		const direction = event.key === "ArrowDown" ? 1 : -1;
		const nextIndex =
			focusedIndex < 0
				? direction > 0
					? 0
					: items.length - 1
				: (focusedIndex + direction + items.length) % items.length;
		items[nextIndex].focus();
	}
});

document.addEventListener("click", (event) => {
	const target = event.target as Node;
	if (ensuredOverflow.contains(target) || ensuredOverflowMenu.contains(target)) return;
	closeMenu();
});

scheduleLayout();

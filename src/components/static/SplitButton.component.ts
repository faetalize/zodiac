/**
 * Split Button Component
 *
 * A button with a main action (left) and a dropdown menu (right).
 *
 * HTML Structure:
 * ```html
 * <div class="split-button">
 *   <button class="split-button__main">Main Action</button>
 *   <button class="split-button__toggle" aria-haspopup="true" aria-expanded="false">
 *     <span class="material-symbols-outlined">expand_more</span>
 *   </button>
 *   <div class="split-button__menu" role="menu">
 *     <button class="split-button__menu-item" role="menuitem">Option 1</button>
 *     <button class="split-button__menu-item" role="menuitem">Option 2</button>
 *     <button class="split-button__menu-item" role="menuitem">Option 3</button>
 *   </div>
 * </div>
 * ```
 *
 * Features:
 * - Click toggle button to open/close dropdown
 * - Click outside to close dropdown
 * - Keyboard navigation (Arrow Up/Down, Enter, Escape)
 * - Multiple instances supported
 * - Add your own event handlers to main button and menu items
 */

import { openDropdownPortal, type DropdownPortal } from "../../utils/dropdownPortal";

const splitButtons = document.querySelectorAll<HTMLElement>(".split-button");
let closeOpenSplitButtonMenu: (() => void) | null = null;

splitButtons.forEach((splitButton) => {
	const toggleButton = splitButton.querySelector<HTMLButtonElement>(".split-button__toggle");
	const menu = splitButton.querySelector<HTMLElement>(".split-button__menu");
	const menuItems = splitButton.querySelectorAll<HTMLButtonElement>(".split-button__menu-item");

	if (!toggleButton || !menu) {
		console.error("Split button missing required elements (.split-button__toggle or .split-button__menu)");
		throw new Error("Split button component is not properly initialized.");
	}
	const toggleElement = toggleButton;
	const menuElement = menu;

	let currentFocusIndex = -1;
	let menuPortal: DropdownPortal | null = null;

	function resetMenuState() {
		splitButton.classList.remove("open");
		toggleElement.setAttribute("aria-expanded", "false");
		currentFocusIndex = -1;
		menuPortal = null;
		if (closeOpenSplitButtonMenu === closeMenu) closeOpenSplitButtonMenu = null;
	}

	function closeMenu() {
		if (splitButton.classList.contains("open") || menuPortal) {
			menuPortal?.close();
			if (!menuPortal) resetMenuState();
		}
	}

	function openMenu() {
		if (!splitButton.classList.contains("open")) {
			closeOpenSplitButtonMenu?.();
			splitButton.classList.add("open");
			toggleElement.setAttribute("aria-expanded", "true");
			menuPortal = openDropdownPortal(menuElement, splitButton, {
				align: "left",
				matchAnchorWidth: true,
				offsetY: 4,
				onClose: resetMenuState
			});
			closeOpenSplitButtonMenu = closeMenu;
			currentFocusIndex = -1;
		}
	}

	// Toggle menu on toggle button click
	toggleElement.addEventListener("click", (e) => {
		e.stopPropagation();
		if (!splitButton.classList.contains("open")) {
			openMenu();
		} else {
			closeMenu();
		}
	});

	// Close menu when clicking menu items
	menuItems.forEach((item) => {
		item.addEventListener("click", (e) => {
			e.stopPropagation();
			closeMenu();
		});
	});

	// Keyboard navigation
	menu.addEventListener("keydown", (e) => {
		if (!splitButton.classList.contains("open")) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				currentFocusIndex = (currentFocusIndex + 1) % menuItems.length;
				menuItems[currentFocusIndex].focus();
				break;

			case "ArrowUp":
				e.preventDefault();
				currentFocusIndex = currentFocusIndex <= 0 ? menuItems.length - 1 : currentFocusIndex - 1;
				menuItems[currentFocusIndex].focus();
				break;

			case "Enter":
				e.preventDefault();
				if (currentFocusIndex >= 0 && currentFocusIndex < menuItems.length) {
					menuItems[currentFocusIndex].click();
				}
				break;

			case "Escape":
				e.preventDefault();
				closeMenu();
				toggleElement.focus();
				break;
		}
	});

	// Also support keyboard navigation on menu items directly
	menuItems.forEach((item, index) => {
		item.addEventListener("keydown", () => {
			currentFocusIndex = index;
			// Let the menu handler above deal with it
		});
	});

	document.addEventListener("click", (e) => {
		const target = e.target as Node;
		if (!splitButton.contains(target) && !menuElement.contains(target)) closeMenu();
	});
});

type DropdownPortalOptions = {
	align?: "left" | "right";
	matchAnchorWidth?: boolean;
	offsetY?: number;
	onClose?: () => void;
};

export type DropdownPortal = {
	close: () => void;
	position: () => void;
};

let closeActivePortal: (() => void) | null = null;

export function openDropdownPortal(
	menu: HTMLElement,
	anchor: HTMLElement,
	options: DropdownPortalOptions = {}
): DropdownPortal {
	const originalParent = menu.parentNode;
	const originalNextSibling = menu.nextSibling;
	const viewportMargin = 8;
	const align = options.align ?? "right";
	const offsetY = options.offsetY ?? 0;
	let isClosed = false;

	function position() {
		const anchorRect = anchor.getBoundingClientRect();
		const menuRect = menu.getBoundingClientRect();
		const menuWidth = options.matchAnchorWidth ? anchorRect.width : menuRect.width || 128;
		const menuHeight = menuRect.height || 120;
		const canOpenAbove = anchorRect.top > menuHeight + viewportMargin + offsetY;
		const openAbove =
			window.innerHeight - anchorRect.bottom < menuHeight + viewportMargin + offsetY && canOpenAbove;
		const rawLeft = align === "left" ? anchorRect.left : anchorRect.right - menuWidth;
		const left = Math.min(Math.max(rawLeft, viewportMargin), window.innerWidth - menuWidth - viewportMargin);
		const rawTop = openAbove ? anchorRect.top - menuHeight - offsetY : anchorRect.bottom + offsetY;
		const top = Math.min(Math.max(rawTop, viewportMargin), window.innerHeight - menuHeight - viewportMargin);

		menu.style.setProperty("--dropdown-menu-left", `${left}px`);
		menu.style.setProperty("--dropdown-menu-top", `${top}px`);
		if (options.matchAnchorWidth) menu.style.setProperty("--dropdown-menu-width", `${menuWidth}px`);
		menu.classList.toggle("dropdown-menu--above", openAbove);
	}

	function close() {
		if (isClosed) return;
		isClosed = true;
		if (closeActivePortal === close) closeActivePortal = null;
		window.removeEventListener("resize", position);
		window.removeEventListener("scroll", close, true);
		menu.classList.remove("dropdown-menu--portal", "dropdown-menu--above");
		menu.style.removeProperty("--dropdown-menu-left");
		menu.style.removeProperty("--dropdown-menu-top");
		menu.style.removeProperty("--dropdown-menu-width");
		if (originalParent) {
			if (originalNextSibling?.parentNode === originalParent) {
				originalParent.insertBefore(menu, originalNextSibling);
			} else {
				originalParent.appendChild(menu);
			}
		}
		options.onClose?.();
	}

	closeActivePortal?.();
	menu.classList.add("dropdown-menu--portal");
	document.body.append(menu);
	position();
	window.addEventListener("resize", position);
	window.addEventListener("scroll", close, true);
	closeActivePortal = close;

	return { close, position };
}

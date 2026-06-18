const surfacePlaneElement = document.querySelector<HTMLElement>("#surface-plane");

if (!surfacePlaneElement) throw new Error("Missing DOM element: #surface-plane");

const surfacePlane = surfacePlaneElement;

const closeTimers = new WeakMap<HTMLElement, number>();
const focusRestoreTargets = new WeakMap<HTMLElement, HTMLElement>();
let activeSurface: HTMLElement | null = null;

const FOCUSABLE_SELECTOR = [
	"[data-surface-initial-focus]",
	"button:not([disabled])",
	"[href]",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])"
].join(",");

function getSurface(elementId: string): HTMLElement | null {
	const element = document.querySelector<HTMLElement>(`#${elementId}`);
	if (!element) {
		console.error(`Surface with id ${elementId} not found`);
		return null;
	}
	return element;
}

function prepareSurface(element: HTMLElement): void {
	element.classList.add("surface-plane__item");
	if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
}

function finishClose(element: HTMLElement): void {
	element.classList.add("hidden");
	element.classList.remove("surface-open", "surface-closing");
	element.dispatchEvent(new CustomEvent("surface-closed"));
	restoreFocus(element);
	if (activeSurface === element) activeSurface = null;
}

function getInitialFocusTarget(element: HTMLElement): HTMLElement {
	const focusTarget = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).find((candidate) => {
		if (candidate.hasAttribute("disabled")) return false;
		if (candidate.closest(".hidden")) return false;
		return true;
	});

	return focusTarget ?? element;
}

function moveFocusIntoSurface(element: HTMLElement): void {
	getInitialFocusTarget(element).focus({ preventScroll: true });
}

function restoreFocus(element: HTMLElement): void {
	const target = focusRestoreTargets.get(element);
	focusRestoreTargets.delete(element);
	if (!target || !document.contains(target)) return;
	target.focus({ preventScroll: true });
}

function hideSurface(element: HTMLElement, immediate = false): void {
	const existingTimer = closeTimers.get(element);
	if (existingTimer) window.clearTimeout(existingTimer);

	element.classList.remove("surface-open");
	element.classList.add("surface-closing");

	if (immediate) {
		finishClose(element);
		return;
	}

	const timer = window.setTimeout(() => {
		closeTimers.delete(element);
		if (!element.classList.contains("surface-open")) finishClose(element);
	}, 220);
	closeTimers.set(element, timer);
}

export function show(elementId: string): void {
	const element = getSurface(elementId);
	if (!element) return;
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	if (activeSurface && activeSurface !== element) hideSurface(activeSurface, true);

	const existingTimer = closeTimers.get(element);
	if (existingTimer) {
		window.clearTimeout(existingTimer);
		closeTimers.delete(element);
	}

	prepareSurface(element);
	surfacePlane.append(element);
	activeSurface = element;
	if (previousFocus && previousFocus !== element && !element.contains(previousFocus)) {
		focusRestoreTargets.set(element, previousFocus);
	}
	element.classList.remove("hidden", "surface-closing", "surface-open");

	requestAnimationFrame(() => {
		element.classList.add("surface-open");
		moveFocusIntoSurface(element);
	});
}

export function close(elementId?: string): void {
	const element = elementId ? getSurface(elementId) : activeSurface;
	if (!element) return;
	hideSurface(element);
}

export function closeAll(): void {
	surfacePlane.querySelectorAll<HTMLElement>(".surface-plane__item:not(.hidden)").forEach((element) => {
		hideSurface(element);
	});
}

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && activeSurface) close();
});

surfacePlane.addEventListener("click", (event) => {
	if (!activeSurface || event.button !== 0 || activeSurface.dataset.dismissOnOutside !== "true") return;
	if (event.target instanceof Node && !activeSurface.contains(event.target)) close();
});

const surfacePlaneElement = document.querySelector<HTMLElement>("#surface-plane");

if (!surfacePlaneElement) throw new Error("Missing DOM element: #surface-plane");

const surfacePlane = surfacePlaneElement;

const closeTimers = new WeakMap<HTMLElement, number>();
const focusRestoreTargets = new WeakMap<HTMLElement, HTMLElement>();
let activeSurface: HTMLElement | null = null;
let outsideDismissPointerStart: { surface: HTMLElement; startedOutside: boolean } | null = null;
const surfaceActiveClass = "surface-plane--active";
const surfaceBlurredClass = "surface-plane--blurred";

const FOCUSABLE_SELECTOR = [
	"[data-surface-initial-focus]",
	"button:not([disabled])",
	"[href]",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])"
].join(",");

function isAvailableFocusTarget(candidate: HTMLElement): boolean {
	if (candidate.hasAttribute("disabled")) return false;
	if (candidate.closest(".hidden")) return false;
	return true;
}

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

function refreshSurfacePlaneState(): void {
	const openSurfaces = Array.from(surfacePlane.querySelectorAll<HTMLElement>(".surface-plane__item")).filter(
		(element) => !element.classList.contains("hidden") && !element.classList.contains("surface-closing")
	);
	const hasOpenAdaptiveSheet = openSurfaces.some((element) => element.classList.contains("adaptive-sheet"));

	surfacePlane.classList.toggle(surfaceActiveClass, openSurfaces.length > 0);
	surfacePlane.classList.toggle(surfaceBlurredClass, hasOpenAdaptiveSheet);
}

function finishClose(element: HTMLElement): void {
	element.classList.add("hidden");
	element.classList.remove("surface-open", "surface-closing");
	element.dispatchEvent(new CustomEvent("surface-closed"));
	restoreFocus(element);
	if (activeSurface === element) activeSurface = null;
	refreshSurfacePlaneState();
}

function getInitialFocusTarget(element: HTMLElement): HTMLElement {
	const explicitTarget = element.querySelector<HTMLElement>("[data-surface-initial-focus]");
	if (explicitTarget && isAvailableFocusTarget(explicitTarget)) return explicitTarget;

	const focusTarget = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).find(
		isAvailableFocusTarget
	);

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
	refreshSurfacePlaneState();

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
	refreshSurfacePlaneState();

	requestAnimationFrame(() => {
		element.classList.add("surface-open");
		refreshSurfacePlaneState();
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

surfacePlane.addEventListener("pointerdown", (event) => {
	if (!activeSurface || event.button !== 0 || activeSurface.dataset.dismissOnOutside !== "true") {
		outsideDismissPointerStart = null;
		return;
	}

	outsideDismissPointerStart = {
		surface: activeSurface,
		startedOutside: event.target instanceof Node && !activeSurface.contains(event.target)
	};
});

surfacePlane.addEventListener("click", (event) => {
	if (!activeSurface || event.button !== 0 || activeSurface.dataset.dismissOnOutside !== "true") return;

	const endedOutside = event.target instanceof Node && !activeSurface.contains(event.target);
	if (!endedOutside) {
		outsideDismissPointerStart = null;
		return;
	}

	const startedOutside =
		outsideDismissPointerStart?.surface === activeSurface ? outsideDismissPointerStart.startedOutside : true;
	outsideDismissPointerStart = null;
	if (startedOutside) close();
});

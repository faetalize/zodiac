const surfacePlaneElement = document.querySelector<HTMLElement>("#surface-plane");

if (!surfacePlaneElement) throw new Error("Missing DOM element: #surface-plane");

const surfacePlane = surfacePlaneElement;

const closeTimers = new WeakMap<HTMLElement, number>();
let activeSurface: HTMLElement | null = null;

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
}

function finishClose(element: HTMLElement): void {
	element.classList.add("hidden");
	element.classList.remove("surface-open", "surface-closing");
	element.dispatchEvent(new CustomEvent("surface-closed"));
	if (activeSurface === element) activeSurface = null;
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

	if (activeSurface && activeSurface !== element) hideSurface(activeSurface, true);

	const existingTimer = closeTimers.get(element);
	if (existingTimer) {
		window.clearTimeout(existingTimer);
		closeTimers.delete(element);
	}

	prepareSurface(element);
	surfacePlane.append(element);
	activeSurface = element;
	element.classList.remove("hidden", "surface-closing", "surface-open");

	requestAnimationFrame(() => {
		element.classList.add("surface-open");
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

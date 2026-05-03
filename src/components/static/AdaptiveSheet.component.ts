import * as surfaceService from "../../services/Surface.service";

const adaptiveSheetMediaQuery = window.matchMedia("(max-width: 640px)");
const surfacePlane = document.querySelector<HTMLElement>("#surface-plane");

if (!surfacePlane) throw new Error("Missing DOM element: #surface-plane");

type AdaptiveSheetDragState = {
	sheet: HTMLElement;
	handle: HTMLElement;
	pointerId?: number;
	startY: number;
	currentY: number;
};

let dragState: AdaptiveSheetDragState | null = null;

function resetSheetPosition(sheet: HTMLElement): void {
	sheet.style.transition = "";
	sheet.style.transform = "";
}

function beginDrag(sheet: HTMLElement, handle: HTMLElement, clientY: number, pointerId?: number): void {
	if (!adaptiveSheetMediaQuery.matches || dragState) return;

	dragState = {
		sheet,
		handle,
		pointerId,
		startY: clientY,
		currentY: clientY
	};

	sheet.style.transition = "none";
}

function handleDragMove(event: MouseEvent | PointerEvent): void {
	if (!dragState) return;
	if (event instanceof PointerEvent && dragState.pointerId !== event.pointerId) return;

	dragState.currentY = event.clientY;
	const dragOffset = Math.max(0, event.clientY - dragState.startY);
	dragState.sheet.style.transform = `translateY(${dragOffset}px)`;
}

function finishDrag(event: MouseEvent | PointerEvent): void {
	if (!dragState) return;
	if (event instanceof PointerEvent && dragState.pointerId !== event.pointerId) return;

	const { sheet, handle, startY, currentY, pointerId } = dragState;
	dragState = null;
	if (pointerId !== undefined && handle.hasPointerCapture(pointerId)) {
		handle.releasePointerCapture(pointerId);
	}

	if (currentY - startY > 96) {
		resetSheetPosition(sheet);
		surfaceService.close(sheet.id);
		return;
	}

	resetSheetPosition(sheet);
}

function prepareSheet(sheet: HTMLElement): void {
	let handle = sheet.querySelector<HTMLButtonElement>(":scope > .adaptive-sheet__handle");
	if (!handle) {
		handle = document.createElement("button");
		handle.type = "button";
		handle.className = "adaptive-sheet__handle";
		handle.setAttribute("aria-label", "Drag down to close");
		sheet.prepend(handle);
	}

	if (handle.dataset.adaptiveSheetHandleReady === "true") return;
	handle.dataset.adaptiveSheetHandleReady = "true";

	const isInHandleZone = (clientY: number) => clientY <= sheet.getBoundingClientRect().top + 48;

	handle.addEventListener("pointerdown", (event) => {
		if (!adaptiveSheetMediaQuery.matches || event.button !== 0) return;
		beginDrag(sheet, handle, event.clientY, event.pointerId);
		handle.setPointerCapture(event.pointerId);
	});
	handle.addEventListener("mousedown", (event) => {
		if (event.button !== 0) return;
		beginDrag(sheet, handle, event.clientY);
	});

	handle.addEventListener("pointermove", handleDragMove);
	handle.addEventListener("pointerup", finishDrag);
	handle.addEventListener("pointercancel", finishDrag);
	sheet.addEventListener("pointerdown", (event) => {
		if (!adaptiveSheetMediaQuery.matches || event.button !== 0 || !isInHandleZone(event.clientY)) return;
		beginDrag(sheet, handle, event.clientY, event.pointerId);
	});
	sheet.addEventListener("mousedown", (event) => {
		if (event.button !== 0 || !isInHandleZone(event.clientY)) return;
		beginDrag(sheet, handle, event.clientY);
	});
}

function prepareSheets(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>(".adaptive-sheet").forEach(prepareSheet);
}

prepareSheets(surfacePlane);

const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		for (const node of mutation.addedNodes) {
			if (!(node instanceof HTMLElement)) continue;
			if (node.classList.contains("adaptive-sheet")) prepareSheet(node);
			prepareSheets(node);
		}
	}
});

observer.observe(surfacePlane, { childList: true, subtree: true });

document.addEventListener("pointermove", handleDragMove);
document.addEventListener("pointerup", finishDrag);
document.addEventListener("pointercancel", finishDrag);
document.addEventListener("mousemove", handleDragMove);
document.addEventListener("mouseup", finishDrag);

export { prepareSheets };

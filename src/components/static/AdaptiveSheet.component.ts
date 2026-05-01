import * as overlayService from "../../services/Overlay.service";

const adaptiveSheetMediaQuery = window.matchMedia("(max-width: 640px)");
const overlayContent = document.querySelector<HTMLElement>(".overlay-content");

if (!overlayContent) throw new Error("Missing DOM element: .overlay-content");

type AdaptiveSheetDragState = {
	sheet: HTMLElement;
	handle: HTMLElement;
	pointerId: number;
	startY: number;
	currentY: number;
};

let dragState: AdaptiveSheetDragState | null = null;

function resetSheetPosition(sheet: HTMLElement): void {
	sheet.style.transition = "";
	sheet.style.transform = "";
}

function handlePointerMove(event: PointerEvent): void {
	if (!dragState || event.pointerId !== dragState.pointerId) return;

	dragState.currentY = event.clientY;
	const dragOffset = Math.max(0, event.clientY - dragState.startY);
	dragState.sheet.style.transform = `translateY(${dragOffset}px)`;
}

function finishDrag(event: PointerEvent): void {
	if (!dragState || event.pointerId !== dragState.pointerId) return;

	const { sheet, handle, startY, currentY, pointerId } = dragState;
	dragState = null;
	handle.releasePointerCapture(pointerId);

	if (currentY - startY > 96) {
		resetSheetPosition(sheet);
		overlayService.closeOverlay();
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

	handle.addEventListener("pointerdown", (event) => {
		if (!adaptiveSheetMediaQuery.matches || event.button !== 0) return;

		dragState = {
			sheet,
			handle,
			pointerId: event.pointerId,
			startY: event.clientY,
			currentY: event.clientY
		};

		sheet.style.transition = "none";
		handle.setPointerCapture(event.pointerId);
	});

	handle.addEventListener("pointermove", handlePointerMove);
	handle.addEventListener("pointerup", finishDrag);
	handle.addEventListener("pointercancel", finishDrag);
}

function prepareSheets(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>(".adaptive-sheet").forEach(prepareSheet);
}

prepareSheets();

const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		for (const node of mutation.addedNodes) {
			if (!(node instanceof HTMLElement)) continue;
			if (node.classList.contains("adaptive-sheet")) prepareSheet(node);
			prepareSheets(node);
		}
	}
});

observer.observe(overlayContent, { childList: true, subtree: true });

export { prepareSheets };

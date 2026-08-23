import * as overlayService from "../../services/Overlay.service";
import * as toastService from "../../services/Toast.service";
import { DEBUG_ANNOUNCEMENT_STORAGE_KEY, type Announcement, type AnnouncementAction } from "../../types/Announcement";

const openButton = document.querySelector<HTMLButtonElement>("#btn-debug-announcement");
const form = document.querySelector<HTMLFormElement>("#form-debug-announcement");
const titleInput = document.querySelector<HTMLInputElement>("#debug-announcement-title");
const bodyInput = document.querySelector<HTMLTextAreaElement>("#debug-announcement-body");
const heroUrlInput = document.querySelector<HTMLInputElement>("#debug-announcement-hero-url");
const heroAltInput = document.querySelector<HTMLInputElement>("#debug-announcement-hero-alt");
const actionInput = document.querySelector<HTMLSelectElement>("#debug-announcement-action");
const actionLabelInput = document.querySelector<HTMLInputElement>("#debug-announcement-action-label");
const cancelButton = document.querySelector<HTMLButtonElement>("#btn-debug-announcement-cancel");

if (
	!openButton ||
	!form ||
	!titleInput ||
	!bodyInput ||
	!heroUrlInput ||
	!heroAltInput ||
	!actionInput ||
	!actionLabelInput ||
	!cancelButton
) {
	throw new Error("Missing debug announcement DOM elements");
}

const actionSelect = actionInput;
const actionLabel = actionLabelInput;
const isLocalhost = ["localhost", "127.0.0.1", "::1", "192.168.1.1"].includes(window.location.hostname);

function updateActionLabelState(): void {
	const hasAction = actionSelect.value === "dismiss" || actionSelect.value === "next";
	actionLabel.disabled = !hasAction;
	actionLabel.required = hasAction;
}

if (isLocalhost) {
	openButton.addEventListener("click", () => {
		overlayService.show("form-debug-announcement");
		updateActionLabelState();
		window.setTimeout(() => titleInput.focus(), 0);
	});

	actionSelect.addEventListener("change", updateActionLabelState);
	cancelButton.addEventListener("click", () => overlayService.closeOverlay());

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const action = (actionSelect.value || null) as AnnouncementAction | null;
		const createdAt = Date.now();
		const announcement: Announcement = {
			id: `debug-announcement-${createdAt}`,
			key: `debug-announcement-${createdAt}`,
			title: titleInput.value.trim(),
			body: bodyInput.value.trim(),
			heroImageUrl: heroUrlInput.value.trim() || null,
			heroImageAlt: heroAltInput.value.trim(),
			actionLabel: action ? actionLabel.value.trim() : null,
			action
		};

		localStorage.setItem(DEBUG_ANNOUNCEMENT_STORAGE_KEY, JSON.stringify(announcement));
		overlayService.closeOverlay();
		toastService.info({
			title: "Announcement preview saved",
			text: "Refresh the app to display it."
		});
	});
}

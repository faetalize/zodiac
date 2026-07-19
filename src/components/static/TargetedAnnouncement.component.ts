import type { Announcement } from "../../types/Announcement";
import { onAppEvent } from "../../events";
import { getEligibleAnnouncements, recordAnnouncementReceipt } from "../../services/Announcement.service";
import * as overlayService from "../../services/Overlay.service";
import { getCurrentUser } from "../../services/Supabase.service";

const overlayElement = document.querySelector<HTMLElement>("#overlay");
const onboardingOverlayElement = document.querySelector<HTMLElement>("#onboarding-overlay");
const modalElement = document.querySelector<HTMLElement>("#targeted-announcement");
const closeButtonElement = document.querySelector<HTMLButtonElement>("#targeted-announcement-close");
const heroElement = document.querySelector<HTMLElement>("#targeted-announcement-hero");
const heroImageElement = document.querySelector<HTMLImageElement>("#targeted-announcement-image");
const titleElement = document.querySelector<HTMLElement>("#targeted-announcement-title");
const bodyElement = document.querySelector<HTMLElement>("#targeted-announcement-body");
const actionButtonElement = document.querySelector<HTMLButtonElement>("#targeted-announcement-action");

if (
	!overlayElement ||
	!onboardingOverlayElement ||
	!modalElement ||
	!closeButtonElement ||
	!heroElement ||
	!heroImageElement ||
	!titleElement ||
	!bodyElement ||
	!actionButtonElement
) {
	throw new Error("Missing targeted announcement DOM elements");
}

const overlay = overlayElement;
const onboardingOverlay = onboardingOverlayElement;
const modal = modalElement;
const closeButton = closeButtonElement;
const hero = heroElement;
const heroImage = heroImageElement;
const title = titleElement;
const body = bodyElement;
const actionButton = actionButtonElement;

let activeUserId: string | null = null;
let loadingUserId: string | null = null;
let loadedUserId: string | null = null;
let currentAnnouncement: Announcement | null = null;
let announcements: Announcement[] = [];
let presentationPaused = false;

function canPresent(): boolean {
	return overlay.classList.contains("hidden") && onboardingOverlay.classList.contains("hidden");
}

function showNextAnnouncement(): void {
	const modalAlreadyOpen = !modal.classList.contains("hidden");
	if (
		presentationPaused ||
		currentAnnouncement ||
		!announcements.length ||
		!activeUserId ||
		(!modalAlreadyOpen && !canPresent())
	) {
		return;
	}

	const announcement = announcements[0];
	currentAnnouncement = announcement;
	title.textContent = announcement.title;
	body.textContent = announcement.body;

	hero.classList.add("hidden");
	heroImage.removeAttribute("src");
	heroImage.alt = announcement.heroImageAlt;
	if (announcement.heroImageUrl) {
		heroImage.onload = () => hero.classList.remove("hidden");
		heroImage.onerror = () => hero.classList.add("hidden");
		heroImage.src = announcement.heroImageUrl;
	}

	if (announcement.action && announcement.actionLabel) {
		actionButton.textContent = announcement.actionLabel;
		actionButton.classList.remove("hidden");
	} else {
		actionButton.classList.add("hidden");
	}

	if (!modalAlreadyOpen) {
		overlayService.show("targeted-announcement");
		requestAnimationFrame(() => closeButton.focus());
	}
	void recordAnnouncementReceipt(activeUserId, announcement.id, "seen");
}

function removeCurrentAnnouncement(): Announcement | null {
	const announcement = currentAnnouncement;
	if (!announcement) return null;

	announcements = announcements.filter((candidate) => candidate.id !== announcement.id);
	currentAnnouncement = null;
	return announcement;
}

function dismissCurrentAnnouncement(actioned: boolean): void {
	const announcement = removeCurrentAnnouncement();
	if (!announcement || !activeUserId) return;

	presentationPaused = true;
	void recordAnnouncementReceipt(activeUserId, announcement.id, actioned ? "actioned" : "dismissed");
	overlayService.closeOverlay();
}

async function loadAnnouncements(userId: string): Promise<void> {
	if (loadingUserId === userId || loadedUserId === userId) return;

	activeUserId = userId;
	loadingUserId = userId;
	presentationPaused = false;
	const eligibleAnnouncements = await getEligibleAnnouncements();
	if (activeUserId !== userId) return;

	announcements = eligibleAnnouncements;
	loadedUserId = userId;
	loadingUserId = null;
	showNextAnnouncement();
}

closeButton.addEventListener("click", () => dismissCurrentAnnouncement(false));

actionButton.addEventListener("click", () => {
	const announcement = currentAnnouncement;
	if (!announcement || !activeUserId) return;

	const action = announcement.action;
	const dismissedAnnouncement = removeCurrentAnnouncement();
	if (!dismissedAnnouncement) return;

	void recordAnnouncementReceipt(activeUserId, dismissedAnnouncement.id, "actioned");
	if (action === "next" && announcements.length) {
		showNextAnnouncement();
		return;
	}

	presentationPaused = true;
	overlayService.closeOverlay();
});

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && !modal.classList.contains("hidden")) {
		event.preventDefault();
		dismissCurrentAnnouncement(false);
	}
});

const overlayObserver = new MutationObserver(() => showNextAnnouncement());
overlayObserver.observe(overlay, { attributes: true, attributeFilter: ["class"] });
overlayObserver.observe(onboardingOverlay, { attributes: true, attributeFilter: ["class"] });

onAppEvent("auth-state-changed", (event) => {
	if (event.detail.loggedIn && event.detail.session) {
		void loadAnnouncements(event.detail.session.user.id);
		return;
	}

	activeUserId = null;
	loadingUserId = null;
	loadedUserId = null;
	currentAnnouncement = null;
	announcements = [];
	presentationPaused = true;
});

async function loadAnnouncementsForCurrentUser(): Promise<void> {
	const user = await getCurrentUser();
	if (user) void loadAnnouncements(user.id);
}

if (document.readyState === "complete") {
	void loadAnnouncementsForCurrentUser();
} else {
	window.addEventListener("load", () => void loadAnnouncementsForCurrentUser(), { once: true });
}

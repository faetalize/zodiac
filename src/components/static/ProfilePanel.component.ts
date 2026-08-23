import type { SubscriptionTier } from "../../types/Supabase";
import type { User } from "../../types/User";
import * as supabaseService from "../../services/Supabase.service";
import * as toastService from "../../services/Toast.service";
import { dispatchAppEvent, onAppEvent } from "../../events";

const pfpChangeButton = document.querySelector("#btn-change-pfp");
const preferredNameInput = document.querySelector("#profile-preferred-name");
const systemPromptAddition = document.querySelector("#profile-system-prompt");
const saveButton = document.querySelector<HTMLButtonElement>("#btn-profile-save");
const saveSpinner = document.querySelector<HTMLElement>("#profile-save-spinner");
const saveLabel = document.querySelector<HTMLElement>("#profile-save-label");
const subscriptionBadge = document.querySelector<HTMLElement>("#subscription-badge");
const manageSubscriptionBtn = document.querySelector<HTMLButtonElement>("#btn-manage-subscription");
const subscriptionCard = document.querySelector<HTMLElement>("#subscription-status-row");
const subscriptionHeader = document.querySelector<HTMLElement>("#subscription-status-row .collapsible-card-header");
const infoCard = document.querySelector<HTMLElement>("#profile-info-card");
const infoHeader = document.querySelector<HTMLElement>("#profile-info-card .collapsible-card-header");
const remainingImageGenerations = document.querySelector<HTMLSpanElement>("#subscription-remaining-generations");
const remainingMegaCredits = document.querySelector<HTMLSpanElement>("#subscription-remaining-mega-credits");
const accountCard = document.querySelector<HTMLElement>("#account-info-card");
const accountHeader = document.querySelector<HTMLElement>("#account-info-card .collapsible-card-header");
const accountEmailEl = document.querySelector<HTMLSpanElement>("#account-email");
const resetPasswordButton = document.querySelector<HTMLButtonElement>("#btn-reset-password");
const changeEmailButton = document.querySelector<HTMLButtonElement>("#btn-change-email");
let image: File | undefined;
let isSavingProfile = false;
let subscriptionTier: SubscriptionTier = "free";

if (
	!pfpChangeButton ||
	!preferredNameInput ||
	!systemPromptAddition ||
	!saveButton ||
	!saveSpinner ||
	!saveLabel ||
	!subscriptionBadge ||
	!manageSubscriptionBtn ||
	!subscriptionCard ||
	!subscriptionHeader ||
	!infoCard ||
	!infoHeader ||
	!remainingImageGenerations ||
	!remainingMegaCredits ||
	!accountCard ||
	!accountHeader ||
	!accountEmailEl ||
	!resetPasswordButton ||
	!changeEmailButton
) {
	console.error("One or more profile panel elements are missing.");
	throw new Error("Profile panel initialization failed.");
}

const ensuredRemainingImageGenerations = remainingImageGenerations;
const ensuredRemainingMegaCredits = remainingMegaCredits;

function setProfileSavePending(isPending: boolean) {
	isSavingProfile = isPending;
	saveButton!.disabled = isPending;
	saveButton!.setAttribute("aria-busy", String(isPending));
	saveSpinner!.classList.toggle("hidden", !isPending);
	saveLabel!.textContent = isPending ? "Saving..." : "Save";
}

async function updateProfile(user: User): Promise<void> {
	const result = await supabaseService.updateUser(user);
	if (result.error) {
		throw new Error(result.error.message);
	}
}

async function refreshSubscriptionAllowances(): Promise<void> {
	const subscription = await supabaseService.getUserSubscription();
	subscriptionTier = supabaseService.getSubscriptionTier(subscription);
	const imageGenerationRecord = await supabaseService.getImageGenerationRecord();

	ensuredRemainingImageGenerations.textContent =
		subscriptionTier === "max" ? "Unlimited" : (imageGenerationRecord?.remaining_image_generations ?? 0).toString();

	if (subscriptionTier === "pro" || subscriptionTier === "pro_plus") {
		const megaCreditsRecord = await supabaseService.getMegaCreditsRecord();
		ensuredRemainingMegaCredits.textContent = (megaCreditsRecord?.remaining_mega_credits ?? 0).toString();
	} else if (subscriptionTier === "max") {
		ensuredRemainingMegaCredits.textContent = "Unlimited";
	} else {
		ensuredRemainingMegaCredits.textContent = "—";
	}
}

onAppEvent("profile-updated", (event) => {
	const { user: profile } = event.detail;
	if (profile) {
		(preferredNameInput as HTMLInputElement).value = profile.preferredName || "";
		(systemPromptAddition as HTMLTextAreaElement).value = profile.systemPromptAddition || "";
	}
});

onAppEvent("image-generation-record-refreshed", (event) => {
	const { imageGenerationRecord } = event.detail;
	if (imageGenerationRecord) {
		ensuredRemainingImageGenerations.textContent =
			subscriptionTier === "max"
				? "Unlimited"
				: (imageGenerationRecord.remaining_image_generations ?? 0).toString();
	}
});

onAppEvent("subscription-updated", (event) => {
	subscriptionTier = event.detail.tier;
	refreshSubscriptionAllowances().catch((error) =>
		console.error("Failed to refresh subscription allowances:", error)
	);
});

onAppEvent("generation-state-changed", (event) => {
	if (!event.detail.anyGenerating) {
		refreshSubscriptionAllowances().catch((error) =>
			console.error("Failed to refresh subscription allowances:", error)
		);
	}
});

// Smooth expand/collapse helper
function toggleCard(cardEl: HTMLElement, contentSelector: string) {
	const content = document.querySelector<HTMLElement>(contentSelector);
	if (!content) {
		cardEl.classList.toggle("collapsed");
		return;
	}

	const isCollapsed = cardEl.classList.contains("collapsed");
	if (isCollapsed) {
		// Expand
		content.style.height = "0px";
		cardEl.classList.remove("collapsed");
		requestAnimationFrame(() => {
			content.style.height = content.scrollHeight + "px";
		});
		const onEnd = () => {
			content.style.height = "auto";
			content.removeEventListener("transitionend", onEnd);
		};
		content.addEventListener("transitionend", onEnd);
	} else {
		// Collapse
		const currentHeight = content.scrollHeight;
		content.style.height = currentHeight + "px";
		void content.offsetHeight; // force reflow
		content.style.height = "0px";
		const onEnd = () => {
			cardEl.classList.add("collapsed");
			content.removeEventListener("transitionend", onEnd);
		};
		content.addEventListener("transitionend", onEnd);
	}
}

const subHeaderEl = subscriptionHeader as HTMLElement;
subHeaderEl.addEventListener("click", () => toggleCard(subscriptionCard as HTMLElement, "#subscription-card-content"));

const infoHeaderEl = infoHeader as HTMLElement;
infoHeaderEl.addEventListener("click", () => toggleCard(infoCard as HTMLElement, "#profile-info-content"));

const accountHeaderEl = accountHeader as HTMLElement;
accountHeaderEl.addEventListener("click", () => toggleCard(accountCard as HTMLElement, "#account-info-content"));

// Initialize collapsed states' inline heights to 0 to avoid flash
const subContent = document.querySelector<HTMLElement>("#subscription-card-content");
if ((subscriptionCard as HTMLElement).classList.contains("collapsed") && subContent) {
	subContent.style.height = "0px";
}
const infoContent = document.querySelector<HTMLElement>("#profile-info-content");
if ((infoCard as HTMLElement).classList.contains("collapsed") && infoContent) {
	infoContent.style.height = "0px";
}
const accountContent = document.querySelector<HTMLElement>("#account-info-content");
if ((accountCard as HTMLElement).classList.contains("collapsed") && accountContent) {
	accountContent.style.height = "0px";
}

function setAccountEmail(email: string | null) {
	const fallback = "—";
	accountEmailEl!.textContent = email?.trim() || fallback;
}

async function hydrateAccountEmail() {
	try {
		const email = await supabaseService.getCurrentUserEmail();
		setAccountEmail(email);
	} catch (error) {
		console.error("Failed to load account email:", error);
		setAccountEmail(null);
	}
}

window.addEventListener("auth-state-changed", (event: Event) => {
	const detail = (event as CustomEvent).detail ?? {};
	if (detail.loggedIn) {
		const email = detail.session?.user?.email ?? null;
		if (email) {
			setAccountEmail(email);
		} else {
			void hydrateAccountEmail();
		}
	} else {
		setAccountEmail(null);
	}
});

window.addEventListener("account-email-changed", (event: Event) => {
	const detail = (event as CustomEvent).detail ?? {};
	const email = typeof detail.email === "string" ? detail.email : null;
	if (email && email.trim()) {
		setAccountEmail(email.trim());
	} else {
		void hydrateAccountEmail();
	}
});

resetPasswordButton.addEventListener(
	"click",
	() =>
		void (async () => {
			const email = accountEmailEl!.textContent?.trim();
			if (!email || email === "—") {
				toastService.warn({
					title: "Reset Password",
					text: "No email is set for this account."
				});
				return;
			}
			try {
				await supabaseService.sendPasswordResetEmail(email);
				toastService.info({
					title: "Reset Email Sent",
					text: "Follow the email link to finish updating your password in the app."
				});
			} catch (error) {
				toastService.danger({
					title: "Reset Failed",
					text: error instanceof Error ? error.message : "Unable to send reset email."
				});
			}
		})()
);

changeEmailButton.addEventListener("click", () => {
	const currentEmail = accountEmailEl!.textContent?.trim() || "";
	const normalized = currentEmail === "—" ? "" : currentEmail;
	dispatchAppEvent("open-email-update", { currentEmail: normalized });
});

void hydrateAccountEmail();
refreshSubscriptionAllowances().catch((error) => console.error("Failed to hydrate subscription allowances:", error));

pfpChangeButton.addEventListener(
	"click",
	() =>
		void (async () => {
			const tempInput: HTMLInputElement = document.createElement("input");
			tempInput.type = "file";
			tempInput.accept = "image/*";
			tempInput.multiple = false;

			tempInput.addEventListener(
				"change",
				() =>
					void (async () => {
						const newPfp = tempInput.files?.[0];
						if (newPfp) {
							document.querySelector("#profile-pfp")?.setAttribute("src", URL.createObjectURL(newPfp));
							image = newPfp;
						}
					})()
			);

			tempInput.click();
		})()
);

saveButton.addEventListener(
	"click",
	() =>
		void (async () => {
			if (isSavingProfile) {
				return;
			}

			setProfileSavePending(true);

			try {
				const preferredName = (preferredNameInput as HTMLInputElement).value;
				const systemPrompt = (systemPromptAddition as HTMLTextAreaElement).value;
				const user: User = {
					preferredName,
					systemPromptAddition: systemPrompt
				};

				if (image) {
					// Resize image on client side to 200 x 200 max.
					const img = document.createElement("img");
					img.src = URL.createObjectURL(image);
					await img.decode();
					const canvas = document.createElement("canvas");
					const ctx = canvas.getContext("2d");
					if (!ctx) {
						throw new Error("Unable to prepare profile image.");
					}
					const maxSize = 200;
					let width = img.width;
					let height = img.height;
					if (width > height) {
						if (width > maxSize) {
							height = Math.round((height *= maxSize / width));
							width = maxSize;
						}
					} else {
						if (height > maxSize) {
							width = Math.round((width *= maxSize / height));
							height = maxSize;
						}
					}
					canvas.width = width;
					canvas.height = height;
					ctx.drawImage(img, 0, 0, width, height);
					const resizedBlob = await new Promise<Blob | null>((resolve) =>
						canvas.toBlob(resolve, "image/jpeg", 0.8)
					);
					if (!resizedBlob) {
						throw new Error("Unable to prepare profile image.");
					}
					const resizedFile = new File([resizedBlob], "profile_picture.jpeg", { type: "image/jpeg" });
					let imageURL = await supabaseService.uploadPfpToSupabase(resizedFile);
					imageURL = "https://hglcltvwunzynnzduauy.supabase.co/storage/v1/object/public/" + imageURL;
					user.avatar = imageURL;
				}

				await updateProfile(user);
				image = undefined;
				toastService.info({
					title: "Profile Saved",
					text: "Your profile changes are up to date."
				});
			} catch (error) {
				console.error("Error saving profile:", error);
				toastService.danger({
					title: "Save Failed",
					text: error instanceof Error ? error.message : "Unable to save your profile."
				});
			} finally {
				setProfileSavePending(false);
			}
		})()
);

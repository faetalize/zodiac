import { isImageEditingActive } from "./ImageEditButton.component";
import { isImageModeActive } from "./ImageButton.component";
import { getLoraState } from "../../services/Lora.service";
import {
	getCurrentUser,
	getMegaCreditsRecord,
	getSubscriptionTier,
	getUserSubscription
} from "../../services/Supabase.service";
import { getChatModelDefinition } from "../../types/Models";
import * as overlayService from "../../services/Overlay.service";
import { dispatchAppEvent } from "../../events";
import {
	hasGeminiApiKey,
	hasOpenRouterApiKey,
	shouldPreferPremiumEndpoint,
	shouldPreferPremiumImageEndpoint
} from "./ApiKeyInput.component";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "../../constants/ImageModels";
import { getSelectedEditingModel } from "./ImageEditModelSelector.component";
import { resolveImageModelRoute } from "../../utils/imageModelRouting";
import { loraArchitectureFromCivitaiBaseModel } from "../../constants/Loras";

const imageCreditsLabel = document.querySelector<HTMLDivElement>("#image-credits-label");
const imageCreditsPopover = document.querySelector<HTMLDivElement>("#image-credits-popover");
const imageCreditsCount = document.querySelector<HTMLSpanElement>("#image-credits-label .image-credits-count");
const imageCreditsType = document.querySelector<HTMLSpanElement>("#image-credits-label .image-credits-type");
const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel");
const modelSelector = document.querySelector<HTMLSelectElement>("#selectedModel");

if (!imageCreditsLabel || !imageCreditsPopover || !imageCreditsCount || !imageCreditsType) {
	console.error("Image credits label component initialization failed");
	throw new Error("Missing image credits label elements");
}

const ensuredImageCreditsCount = imageCreditsCount;
const ensuredImageCreditsType = imageCreditsType;

let imageCredits: number | null | undefined = undefined;
let megaCredits: number | null | undefined = undefined;
let subscriptionTier: "free" | "pro" | "pro_plus" | "max" | "canceled" = "free";
let isPopoverVisible = false;

type AllowanceMode = "image" | "mega" | null;

// Click handler for the label
imageCreditsLabel.addEventListener("click", (e) => {
	e.stopPropagation();
	togglePopover();
});

// Close popover when clicking outside
document.addEventListener("click", (e) => {
	if (isPopoverVisible && !imageCreditsPopover.contains(e.target as Node)) {
		hidePopover();
	}
});

// Close popover on Escape key
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && isPopoverVisible) {
		hidePopover();
	}
});

// Listen for auth state changes
window.addEventListener(
	"auth-state-changed",
	(event: any) =>
		void (async () => {
			const imageGenRecord = event.detail?.imageGenerationRecord;
			if (imageGenRecord) {
				imageCredits = imageGenRecord.remaining_image_generations;
			} else {
				imageCredits = undefined;
			}
			await refreshSupplementalAllowanceState();
		})()
);

// Listen for explicit image generation record refreshes
window.addEventListener(
	"image-generation-record-refreshed",
	(event: any) =>
		void (async () => {
			const imageGenRecord = event.detail?.imageGenerationRecord;
			if (!imageGenRecord) {
				imageCredits = undefined;
			} else {
				imageCredits = imageGenRecord.remaining_image_generations;
			}
			renderLabel();
		})()
);

// Listen for image mode toggles
window.addEventListener("image-generation-toggled", () => {
	updateImageCreditsLabelVisibility();
	renderLabel();
});

window.addEventListener("image-editing-toggled", () => {
	updateImageCreditsLabelVisibility();
	renderLabel();
});

// Listen for LoRA state changes
window.addEventListener("lora-state-changed", () => {
	renderLabel();
});

window.addEventListener("chat-model-changed", () => {
	updateImageCreditsLabelVisibility();
	renderLabel();
});

window.addEventListener("edit-model-changed", () => {
	renderLabel();
});

window.addEventListener("premium-endpoint-preference-changed", () => {
	updateImageCreditsLabelVisibility();
	renderLabel();
});

window.addEventListener("image-premium-endpoint-preference-changed", () => {
	updateImageCreditsLabelVisibility();
	renderLabel();
});

window.addEventListener("subscription-updated", () => void refreshSupplementalAllowanceState());

window.addEventListener(
	"generation-state-changed",
	(event: any) =>
		void (async () => {
			if (event.detail?.anyGenerating === false) {
				await refreshSupplementalAllowanceState();
			}
		})()
);

// Listen for image model changes
if (imageModelSelector) {
	imageModelSelector.addEventListener("change", () => {
		renderLabel();
	});
}

function getSelectedChatModel(): string | null {
	return modelSelector?.value || null;
}

function selectedChatModelConsumesImageCredits(): boolean {
	if (subscriptionTier === "free" || !shouldPreferPremiumEndpoint()) {
		return false;
	}

	return getChatModelDefinition(getSelectedChatModel())?.consumesImageCredits === true;
}

function getActiveImageModel() {
	if (isImageEditingActive()) {
		return IMAGE_MODELS.find((model) => model.id === getSelectedEditingModel() && model.editing);
	}

	if (isImageModeActive()) {
		return IMAGE_MODELS.find(
			(model) => model.id === (imageModelSelector?.value || DEFAULT_IMAGE_MODEL) && model.generation
		);
	}

	return undefined;
}

function getActiveImageRoute() {
	const model = getActiveImageModel();
	if (!model) return null;
	return resolveImageModelRoute(model, shouldPreferPremiumImageEndpoint(), {
		edgeCredits: Number(imageCredits ?? 0) > 0,
		geminiKey: hasGeminiApiKey(),
		openRouterKey: hasOpenRouterApiKey()
	});
}

function getCompatibleActiveLoraCount(): number {
	const architecture = getActiveImageModel()?.loraArchitecture;
	if (!architecture) return 0;
	return getLoraState().filter(
		(state) => state.enabled && loraArchitectureFromCivitaiBaseModel(state.lora.baseModel) === architecture
	).length;
}

function getAllowanceMode(): AllowanceMode {
	if (isImageEditingActive() || isImageModeActive()) {
		return getActiveImageRoute()?.route === "edge" ? "image" : null;
	}

	// Chat-model allowances are only consumed through the premium endpoint. BYOK requests do not
	// consume them, so the label stays hidden when that route is selected.
	if (!shouldPreferPremiumEndpoint()) {
		return null;
	}

	const selectedModel = getSelectedChatModel();
	const modelDefinition = getChatModelDefinition(selectedModel);

	if (selectedChatModelConsumesImageCredits()) {
		return "image";
	}

	if (modelDefinition?.mega && (subscriptionTier === "pro" || subscriptionTier === "pro_plus")) {
		return "mega";
	}

	return null;
}

async function refreshSupplementalAllowanceState(): Promise<void> {
	const currentUser = await getCurrentUser();
	if (!currentUser) {
		megaCredits = undefined;
		subscriptionTier = "free";
		updateImageCreditsLabelVisibility();
		renderLabel();
		return;
	}

	const subscription = await getUserSubscription();
	subscriptionTier = getSubscriptionTier(subscription);

	if (subscriptionTier === "pro" || subscriptionTier === "pro_plus") {
		const megaCreditsRecord = await getMegaCreditsRecord();
		megaCredits = megaCreditsRecord?.remaining_mega_credits ?? 0;
	} else {
		megaCredits = undefined;
	}

	updateImageCreditsLabelVisibility();
	renderLabel();
}

function calculateCreditsNeeded(): number {
	const isEditing = isImageEditingActive();
	const isGenerating = isImageModeActive();

	if (selectedChatModelConsumesImageCredits() && !isEditing && !isGenerating) {
		return 1;
	}

	if (!isEditing && !isGenerating) {
		return 0;
	}
	if (getAllowanceMode() !== "image") {
		return 0;
	}

	if (isEditing) {
		// Image editing always costs 1 credit (no LoRAs)
		return 1;
	}

	// Image generation
	const activeLorasCount = getCompatibleActiveLoraCount();

	if (activeLorasCount === 0) {
		return 1; // Base cost
	}

	// Base cost + LoRA cost (ceiling of activeLoRAs / 2)
	return 1 + Math.ceil(activeLorasCount / 2);
}

function hasInsufficientCredits(): boolean {
	const creditsNeeded = calculateCreditsNeeded();
	const totalCredits = imageCredits ?? 0;
	return creditsNeeded > 0 && totalCredits < creditsNeeded;
}

function hasInsufficientMegaCredits(): boolean {
	return getAllowanceMode() === "mega" && Number(megaCredits ?? 0) < 1;
}

function checkAndDispatchInsufficientCreditsState(): void {
	const allowanceMode = getAllowanceMode();
	const isInsufficient = hasInsufficientCredits();
	const isEditing = isImageEditingActive();
	const isGenerating = isImageModeActive();

	const shouldBlock = isInsufficient && (isEditing || isGenerating);

	dispatchAppEvent("insufficient-image-credits", { insufficient: shouldBlock });

	if (allowanceMode === "mega") {
		dispatchAppEvent("composer-allowance-blocked", {
			blocked: hasInsufficientMegaCredits(),
			title: "Insufficient Mega Credits",
			text: "This model costs 1 Mega Credit per request. Choose another model or upgrade to Max for unlimited Mega access."
		});
		return;
	}

	dispatchAppEvent("composer-allowance-blocked", {
		blocked: shouldBlock,
		title: "Insufficient Image Credits",
		text: "You don't have enough credits for this image request. Please buy more credits or disable image mode."
	});
}

function renderLabel(): void {
	if (!imageCreditsLabel) return;

	const allowanceMode = getAllowanceMode();

	if (allowanceMode === "mega") {
		if (hasInsufficientMegaCredits()) {
			ensuredImageCreditsCount.textContent = "No";
			ensuredImageCreditsType.textContent = "Mega Credits";
		} else if (megaCredits === null || megaCredits === undefined) {
			ensuredImageCreditsCount.textContent = "—";
			ensuredImageCreditsType.textContent = "Mega Credits";
		} else {
			ensuredImageCreditsCount.textContent = String(megaCredits);
			ensuredImageCreditsType.textContent = "Mega Credits";
		}

		checkAndDispatchInsufficientCreditsState();
		if (isPopoverVisible) renderPopoverContent();
		return;
	}

	ensuredImageCreditsCount.textContent =
		imageCredits === null || imageCredits === undefined ? "—" : String(imageCredits);
	ensuredImageCreditsType.textContent = "Image Credits";

	// Check and dispatch insufficient credits state
	checkAndDispatchInsufficientCreditsState();

	// Update popover content if it's visible
	if (isPopoverVisible) {
		renderPopoverContent();
	}
}

function renderPopoverContent(): void {
	if (!imageCreditsPopover) return;

	const allowanceMode = getAllowanceMode();
	if (allowanceMode === "mega") {
		const totalCredits = Number(megaCredits ?? 0);
		imageCreditsPopover.innerHTML = `
            <div class="image-credits-popover-header">
                <h4>Mega Credits</h4>
                <button class="image-credits-popover-close btn-textual material-symbols-outlined" aria-label="Close">close</button>
            </div>
            <div class="image-credits-popover-body">
                <div class="credit-breakdown-item">
                    <span class="material-symbols-outlined credit-icon">auto_awesome</span>
                    <span class="credit-description">Mega model request</span>
                    <span class="credit-amount">1 credit</span>
                </div>
                <div class="credit-breakdown-total">
                    <span class="credit-total-label">Your balance</span>
                    <span class="credit-total-amount">${totalCredits}</span>
                </div>
                <div class="credit-breakdown-remaining">
                    <span class="credit-remaining-label">Remaining after request</span>
                    <span class="credit-remaining-amount">${Math.max(totalCredits - 1, 0)}</span>
                </div>
            </div>
        `;
		bindPopoverButtons();
		return;
	}

	const isEditing = isImageEditingActive();
	const isGenerating = isImageModeActive();
	const activeLorasCount = getCompatibleActiveLoraCount();
	const creditsNeeded = calculateCreditsNeeded();
	const totalCredits = imageCredits ?? 0;

	let contentHTML = `
        <div class="image-credits-popover-header">
            <h4>Request Breakdown</h4>
            <button class="image-credits-popover-close btn-textual material-symbols-outlined" aria-label="Close">close</button>
        </div>
        <div class="image-credits-popover-body">
    `;

	if (hasInsufficientCredits()) {
		// Show insufficient credits warning
		contentHTML += `
            <div class="credit-breakdown-note credit-breakdown-warning">
                <span class="material-symbols-outlined">error</span>
                <span>You don't have enough credits for this request.</span>
            </div>
            <div class="credit-breakdown-simple-item">
                <span class="credit-simple-label">Required credits</span>
                <span class="credit-simple-value">${creditsNeeded}</span>
            </div>
            <div class="credit-breakdown-simple-item">
                <span class="credit-simple-label">Your current credits</span>
                <span class="credit-simple-value">${totalCredits}</span>
            </div>

            <div class="credit-breakdown-action">
                <button id="insufficient-credits-buy-button" class="btn">Buy Credits</button>
            </div>
        `;
	} else {
		// Show credit breakdown for users with credits
		if (isEditing) {
			contentHTML += `
                <div class="credit-breakdown-item">
                    <span class="material-symbols-outlined credit-icon">imagesearch_roller</span>
                    <span class="credit-description">Image editing</span>
                    <span class="credit-amount">1 credit</span>
                </div>
                <div class="credit-breakdown-note">
                    <span class="material-symbols-outlined">info</span>
                    <span>LoRAs are not supported for image editing</span>
                </div>
            `;
		} else if (isGenerating) {
			contentHTML += `
                <div class="credit-breakdown-item">
                    <span class="material-symbols-outlined credit-icon">brush</span>
                    <span class="credit-description">Base image generation</span>
                    <span class="credit-amount">1 credit</span>
                </div>
            `;

			if (activeLorasCount > 0) {
				const loraCost = Math.ceil(activeLorasCount / 2);
				contentHTML += `
                    <div class="credit-breakdown-item">
                        <span class="material-symbols-outlined credit-icon">style</span>
                        <span class="credit-description">LoRAs (${activeLorasCount} active)</span>
                        <span class="credit-amount">+${loraCost} credit${loraCost > 1 ? "s" : ""}</span>
                    </div>
                    <div class="credit-breakdown-note">
                        <span class="material-symbols-outlined">info</span>
                        <span>Every 2 active LoRAs consume 1 additional credit</span>
                    </div>
                `;
			}
		}

		contentHTML += `
                <div class="credit-breakdown-total">
                    <span class="credit-total-label">Total cost</span>
                    <span class="credit-total-amount">${creditsNeeded} credit${creditsNeeded !== 1 ? "s" : ""}</span>
                </div>
                <div class="credit-breakdown-remaining">
                    <span class="credit-remaining-label">Remaining credits after request</span>
                    <span class="credit-remaining-amount">${totalCredits === 0 ? "—" : totalCredits - creditsNeeded}</span>
                </div>
        `;
	}

	contentHTML += `
        </div>
    `;

	imageCreditsPopover.innerHTML = contentHTML;
	bindPopoverButtons();
}

function bindPopoverButtons(): void {
	if (!imageCreditsPopover) return;

	// Add close button handler
	const closeButton = imageCreditsPopover.querySelector(".image-credits-popover-close");
	closeButton?.addEventListener("click", (e) => {
		e.stopPropagation();
		hidePopover();
	});

	// Add buy credits button handler for insufficient credits (if present)
	const buyCreditsButton = imageCreditsPopover.querySelector<HTMLButtonElement>("#insufficient-credits-buy-button");
	buyCreditsButton?.addEventListener(
		"click",
		(e) =>
			void (async () => {
				e.stopPropagation();
				hidePopover();

				const user = await getCurrentUser();
				if (!user) {
					// User is not logged in, show login overlay
					overlayService.show("login-register-tabs");
				} else {
					// User is logged in, show buy credits overlay
					overlayService.show("form-top-up-imagecredits");
				}
			})()
	);
}

function togglePopover(): void {
	if (isPopoverVisible) {
		hidePopover();
	} else {
		showPopover();
	}
}

function showPopover(): void {
	if (!imageCreditsLabel || !imageCreditsPopover) return;

	renderPopoverContent();
	positionPopover();

	imageCreditsPopover.classList.remove("hidden");
	// Trigger reflow for animation
	void imageCreditsPopover.offsetWidth;
	imageCreditsPopover.classList.add("visible");

	isPopoverVisible = true;
}

function hidePopover(): void {
	if (!imageCreditsPopover) return;

	imageCreditsPopover.classList.remove("visible");
	// Wait for animation to complete
	setTimeout(() => {
		imageCreditsPopover.classList.add("hidden");
	}, 200);

	isPopoverVisible = false;
}

function positionPopover(): void {
	if (!imageCreditsLabel || !imageCreditsPopover) return;

	const labelRect = imageCreditsLabel.getBoundingClientRect();
	const popoverRect = imageCreditsPopover.getBoundingClientRect();
	const viewportHeight = window.innerHeight;
	const viewportWidth = window.innerWidth;

	// Calculate space above and below
	const spaceAbove = labelRect.top;
	const spaceBelow = viewportHeight - labelRect.bottom;

	// Determine if popover should appear above or below
	const showAbove = spaceAbove > spaceBelow && spaceAbove > popoverRect.height + 10;

	// Position horizontally (align right edge with label's right edge)
	const right = viewportWidth - labelRect.right;
	imageCreditsPopover.style.right = `${right}px`;

	// Position vertically
	if (showAbove) {
		imageCreditsPopover.style.bottom = `${viewportHeight - labelRect.top + 8}px`;
		imageCreditsPopover.style.top = "auto";
		imageCreditsPopover.setAttribute("data-position", "above");
	} else {
		imageCreditsPopover.style.top = `${labelRect.bottom + 8}px`;
		imageCreditsPopover.style.bottom = "auto";
		imageCreditsPopover.setAttribute("data-position", "below");
	}
}

// Initialize and render
void refreshSupplementalAllowanceState();

// Export visibility state getter
export function isImageCreditsLabelVisible(): boolean {
	return !imageCreditsLabel?.classList.contains("hidden");
}

// Export function to update visibility (called from ChatInput)
export function updateImageCreditsLabelVisibility(): void {
	if (!imageCreditsLabel) return;

	const shouldShow = getAllowanceMode() !== null;

	if (shouldShow) {
		imageCreditsLabel.classList.remove("hidden");
	} else {
		imageCreditsLabel.classList.add("hidden");
		// Hide popover if label is hidden
		if (isPopoverVisible) {
			hidePopover();
		}
	}
}

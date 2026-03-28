import { isImageEditingActive } from "./ImageEditButton.component";
import { isImageModeActive } from "./ImageButton.component";
import { getLoraState } from "../../services/Lora.service";
import { getCurrentUser, getMegaCreditsRecord, getNanoBananaDailyUsageRecord, getSubscriptionTier, getUserSubscription, isImageGenerationAvailable } from "../../services/Supabase.service";
import type { ImageGenerationPermitted } from "../../types/ImageGenerationTypes";
import { ChatModel, getChatModelDefinition, ImageModel } from "../../types/Models";
import * as overlayService from "../../services/Overlay.service";
import * as helpers from "../../utils/helpers";
import { dispatchAppEvent } from "../../events";

const imageCreditsLabel = document.querySelector<HTMLDivElement>("#image-credits-label");
const imageCreditsPopover = document.querySelector<HTMLDivElement>("#image-credits-popover");
const imageModelSelector = document.querySelector<HTMLSelectElement>("#selectedImageModel");
const modelSelector = document.querySelector<HTMLSelectElement>("#selectedModel");

const PRO_NANO_BANANA_DAILY_LIMIT = 20;
const NANO_BANANA_MODELS = new Set<string>([
    ChatModel.NANO_BANANA,
    ChatModel.NANO_BANANA_PRO,
    ChatModel.NANO_BANANA_2,
]);

if (!imageCreditsLabel || !imageCreditsPopover) {
    console.error("Image credits label component initialization failed");
    throw new Error("Missing DOM elements: #image-credits-label or #image-credits-popover");
}

let imageCredits: number | null | undefined = undefined;
let megaCredits: number | null | undefined = undefined;
let nanoBananaUsageCount = 0;
let nanoBananaUsageDate: string | null = null;
let subscriptionTier: "free" | "pro" | "pro_plus" | "max" | "canceled" = "free";
let imageGenStatus: ImageGenerationPermitted | null = null;
let isPopoverVisible = false;

type AllowanceMode = "image" | "mega" | "nano" | null;

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
window.addEventListener('auth-state-changed', async (event: any) => {
    const imageGenRecord = event.detail?.imageGenerationRecord;
    if (imageGenRecord) {
        imageCredits = imageGenRecord.remaining_image_generations;
    } else {
        imageCredits = undefined;
    }
    imageGenStatus = await isImageGenerationAvailable();
    await refreshSupplementalAllowanceState();
});

// Listen for explicit image generation record refreshes
window.addEventListener('image-generation-record-refreshed', async (event: any) => {
    const imageGenRecord = event.detail?.imageGenerationRecord;
    if (!imageGenRecord) {
        imageCredits = undefined;
    } else {
        imageCredits = imageGenRecord.remaining_image_generations;
    }
    imageGenStatus = await isImageGenerationAvailable();
    renderLabel();
});

// Listen for image mode toggles
window.addEventListener('image-generation-toggled', () => {
    updateImageCreditsLabelVisibility();
    renderLabel();
});

window.addEventListener('image-editing-toggled', () => {
    updateImageCreditsLabelVisibility();
    renderLabel();
});

// Listen for LoRA state changes
window.addEventListener('lora-state-changed', () => {
    renderLabel();
});

window.addEventListener('chat-model-changed', () => {
    updateImageCreditsLabelVisibility();
    renderLabel();
});

window.addEventListener('subscription-updated', async () => {
    imageGenStatus = await isImageGenerationAvailable();
    await refreshSupplementalAllowanceState();
});

window.addEventListener('generation-state-changed', async (event: any) => {
    if (event.detail?.anyGenerating === false) {
        imageGenStatus = await isImageGenerationAvailable();
        await refreshSupplementalAllowanceState();
    }
});

// Listen for image model changes
if (imageModelSelector) {
    imageModelSelector.addEventListener('change', () => {
        renderLabel();
    });
}

function getSelectedChatModel(): string | null {
    return modelSelector?.value || null;
}

function getAllowanceMode(): AllowanceMode {
    if (isImageEditingActive() || isImageModeActive()) {
        return "image";
    }

    const selectedModel = getSelectedChatModel();
    const modelDefinition = getChatModelDefinition(selectedModel);

    if (modelDefinition?.mega && (subscriptionTier === "pro" || subscriptionTier === "pro_plus")) {
        return "mega";
    }

    if (subscriptionTier === "pro" && selectedModel && NANO_BANANA_MODELS.has(selectedModel)) {
        return "nano";
    }

    return null;
}

function getTodayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getEffectiveNanoBananaUsageCount(): number {
    return nanoBananaUsageDate === getTodayIsoDate() ? nanoBananaUsageCount : 0;
}

function getRemainingNanoBananaUses(): number {
    return Math.max(PRO_NANO_BANANA_DAILY_LIMIT - getEffectiveNanoBananaUsageCount(), 0);
}

async function refreshSupplementalAllowanceState(): Promise<void> {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        megaCredits = undefined;
        nanoBananaUsageCount = 0;
        nanoBananaUsageDate = null;
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

    if (subscriptionTier === "pro") {
        const nanoUsageRecord = await getNanoBananaDailyUsageRecord();
        nanoBananaUsageCount = Number(nanoUsageRecord?.usage_count ?? 0);
        nanoBananaUsageDate = nanoUsageRecord?.usage_date ?? getTodayIsoDate();
    } else {
        nanoBananaUsageCount = 0;
        nanoBananaUsageDate = null;
    }

    updateImageCreditsLabelVisibility();
    renderLabel();
}

function getSelectedImageModel(): string | null {
    return imageModelSelector?.value || null;
}

function isImagenModel(): boolean {
    const selectedModel = getSelectedImageModel();
    return selectedModel === ImageModel.ULTRA;
}

function calculateCreditsNeeded(): number {
    const isEditing = isImageEditingActive();
    const isGenerating = isImageModeActive();

    if (!isEditing && !isGenerating) {
        return 0;
    }

    if (isEditing) {
        // Image editing always costs 1 credit (no LoRAs)
        return 1;
    }

    // Image generation
    const loraState = getLoraState();
    const activeLorasCount = loraState.filter(state => state.enabled).length;
    
    // Imagen 4 doesn't support LoRAs, so don't count them
    if (isImagenModel()) {
        return 1; // Base cost only
    }
    
    if (activeLorasCount === 0) {
        return 1; // Base cost
    }

    // Base cost + LoRA cost (ceiling of activeLoRAs / 2)
    return 1 + Math.ceil(activeLorasCount / 2);
}

function shouldShowApiKeyPath(): boolean {
    // Only show "May Incur Charges" path when:
    // 1. User is in google_only mode
    // 2. Image generation is active (not editing)
    // 3. Imagen 4 (ULTRA) model is selected
    const isGoogleOnly = imageGenStatus?.type === 'google_only';
    const isEditing = isImageEditingActive();
    const isGenerating = isImageModeActive();
    const isImagenModel = getSelectedImageModel() === ImageModel.ULTRA;
    
    return isGoogleOnly && !isEditing && isGenerating && isImagenModel;
}

function hasInsufficientCredits(): boolean {
    const creditsNeeded = calculateCreditsNeeded();
    const totalCredits = imageCredits ?? 0;
    return creditsNeeded > 0 && totalCredits < creditsNeeded;
}

function hasInsufficientMegaCredits(): boolean {
    return getAllowanceMode() === "mega" && Number(megaCredits ?? 0) < 1;
}

function hasInsufficientNanoAllowance(): boolean {
    return getAllowanceMode() === "nano" && getRemainingNanoBananaUses() < 1;
}

function checkAndDispatchInsufficientCreditsState(): void {
    const allowanceMode = getAllowanceMode();
    const isInsufficient = hasInsufficientCredits();
    const isEditing = isImageEditingActive();
    const isGenerating = isImageModeActive();
    const showingApiKeyPath = shouldShowApiKeyPath();
    
    // Only block if insufficient credits AND not in the "may incur charges" path
    // (users with API keys in google_only mode should be able to send)
    const shouldBlock = isInsufficient && (isEditing || isGenerating) && !showingApiKeyPath;
    
    dispatchAppEvent('insufficient-image-credits', { insufficient: shouldBlock });

    if (allowanceMode === "mega") {
        dispatchAppEvent('composer-allowance-blocked', {
            blocked: hasInsufficientMegaCredits(),
            title: 'Insufficient Mega Credits',
            text: 'This model costs 1 Mega Credit per request. Choose another model or upgrade to Max for unlimited Mega access.',
        });
        return;
    }

    if (allowanceMode === "nano") {
        dispatchAppEvent('composer-allowance-blocked', {
            blocked: hasInsufficientNanoAllowance(),
            title: 'Nano Banana Daily Limit Reached',
            text: `Pro includes ${PRO_NANO_BANANA_DAILY_LIMIT} Nano Banana requests per day. Try again tomorrow or switch models.`,
        });
        return;
    }

    dispatchAppEvent('composer-allowance-blocked', {
        blocked: shouldBlock,
        title: 'Insufficient Image Credits',
        text: "You don't have enough credits for this image request. Please buy more credits or disable image mode.",
    });
}

function renderLabel(): void {
    if (!imageCreditsLabel) return;

    const allowanceMode = getAllowanceMode();

    if (allowanceMode === "mega") {
        if (hasInsufficientMegaCredits()) {
            imageCreditsLabel.textContent = 'No Mega Credits';
        } else if (megaCredits === null || megaCredits === undefined) {
            imageCreditsLabel.textContent = '— Mega Credits';
        } else {
            imageCreditsLabel.textContent = `${megaCredits} Mega Credits`;
        }

        checkAndDispatchInsufficientCreditsState();
        if (isPopoverVisible) renderPopoverContent();
        return;
    }

    if (allowanceMode === "nano") {
        const remainingNanoUses = getRemainingNanoBananaUses();
        imageCreditsLabel.textContent = remainingNanoUses > 0 ? `${remainingNanoUses} Nano Left` : 'Nano Limit Reached';

        checkAndDispatchInsufficientCreditsState();
        if (isPopoverVisible) renderPopoverContent();
        return;
    }

    if (shouldShowApiKeyPath()) {
        imageCreditsLabel.textContent = 'May Incur Charges';
    } else {
        const totalCredits = (imageCredits === null || imageCredits === undefined) ? '—' : String(imageCredits);
        imageCreditsLabel.textContent = `${totalCredits} Image Credits`;
    }

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

    if (allowanceMode === "nano") {
        const usageCount = getEffectiveNanoBananaUsageCount();
        const remaining = getRemainingNanoBananaUses();
        imageCreditsPopover.innerHTML = `
            <div class="image-credits-popover-header">
                <h4>Nano Banana Daily Allowance</h4>
                <button class="image-credits-popover-close btn-textual material-symbols-outlined" aria-label="Close">close</button>
            </div>
            <div class="image-credits-popover-body">
                <div class="credit-breakdown-item">
                    <span class="material-symbols-outlined credit-icon">image</span>
                    <span class="credit-description">Nano Banana request</span>
                    <span class="credit-amount">1 daily use</span>
                </div>
                <div class="credit-breakdown-simple-item">
                    <span class="credit-simple-label">Daily limit</span>
                    <span class="credit-simple-value">${PRO_NANO_BANANA_DAILY_LIMIT}</span>
                </div>
                <div class="credit-breakdown-simple-item">
                    <span class="credit-simple-label">Used today</span>
                    <span class="credit-simple-value">${usageCount}</span>
                </div>
                <div class="credit-breakdown-remaining">
                    <span class="credit-remaining-label">Remaining after request</span>
                    <span class="credit-remaining-amount">${Math.max(remaining - 1, 0)}</span>
                </div>
            </div>
        `;
        bindPopoverButtons();
        return;
    }

    const showApiKeyPath = shouldShowApiKeyPath();
    const isEditing = isImageEditingActive();
    const isGenerating = isImageModeActive();
    const loraState = getLoraState();
    const activeLorasCount = loraState.filter(state => state.enabled).length;
    const creditsNeeded = calculateCreditsNeeded();
    const totalCredits = imageCredits ?? 0;

    let contentHTML = `
        <div class="image-credits-popover-header">
            <h4>${showApiKeyPath ? 'API Key Usage' : 'Request Breakdown'}</h4>
            <button class="image-credits-popover-close btn-textual material-symbols-outlined" aria-label="Close">close</button>
        </div>
        <div class="image-credits-popover-body">
    `;

    if (showApiKeyPath) {
        // Show informative message for google_only users
        contentHTML += `
            <div class="credit-breakdown-note credit-breakdown-warning">
                <span class="material-symbols-outlined">warning</span>
                <span>This image generation request will go through your own API key and may cause a charge on your Google Cloud account if you have billing enabled. <b>We recommend buying credits instead.</b></span>
            </div>
        `;
        
        if (isGenerating && activeLorasCount > 0) {
            contentHTML += `
                <div class="credit-breakdown-note">
                    <span class="material-symbols-outlined">info</span>
                    <span>You have ${activeLorasCount} active LoRA${activeLorasCount > 1 ? 's' : ''}, but LoRAs require premium image credits and cannot be used with your API key.</span>
                </div>
            `;
        }

        contentHTML += `
            <div class="credit-breakdown-action">
                <button id="google-only-buy-button" class="btn">Buy Credits</button>
                <button id="google-only-setup-api-button" class="btn-neutral">Setup API Key</button>
            </div>
        `;
    } else if (hasInsufficientCredits()) {
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
                // Check if Imagen 4 is selected (doesn't support LoRAs)
                if (isImagenModel()) {
                    contentHTML += `
                        <div class="credit-breakdown-note">
                            <span class="material-symbols-outlined">warning</span>
                            <span>Imagen 4 does not support LoRAs. Your ${activeLorasCount} active LoRA${activeLorasCount > 1 ? 's' : ''} will be ignored for this request.</span>
                        </div>
                    `;
                } else {
                    const loraCost = Math.ceil(activeLorasCount / 2);
                    contentHTML += `
                        <div class="credit-breakdown-item">
                            <span class="material-symbols-outlined credit-icon">style</span>
                            <span class="credit-description">LoRAs (${activeLorasCount} active)</span>
                            <span class="credit-amount">+${loraCost} credit${loraCost > 1 ? 's' : ''}</span>
                        </div>
                        <div class="credit-breakdown-note">
                            <span class="material-symbols-outlined">info</span>
                            <span>Every 2 active LoRAs consume 1 additional credit</span>
                        </div>
                    `;
                }
            }
        }

        contentHTML += `
                <div class="credit-breakdown-total">
                    <span class="credit-total-label">Total cost</span>
                    <span class="credit-total-amount">${creditsNeeded} credit${creditsNeeded !== 1 ? 's' : ''}</span>
                </div>
                <div class="credit-breakdown-remaining">
                    <span class="credit-remaining-label">Remaining credits after request</span>
                    <span class="credit-remaining-amount">${totalCredits === 0 ? '—' : totalCredits - creditsNeeded}</span>
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
    const closeButton = imageCreditsPopover.querySelector('.image-credits-popover-close');
    closeButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        hidePopover();
    });

    // Add buy credits button handler for insufficient credits (if present)
    const buyCreditsButton = imageCreditsPopover.querySelector<HTMLButtonElement>('#insufficient-credits-buy-button');
    buyCreditsButton?.addEventListener('click', async (e) => {
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
    });

    // Add buy credits button handler for google_only mode (if present)
    const googleOnlyBuyButton = imageCreditsPopover.querySelector<HTMLButtonElement>('#google-only-buy-button');
    googleOnlyBuyButton?.addEventListener('click', async (e) => {
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
    });

    // Add setup API key button handler for google_only mode (if present)
    const googleOnlySetupApiButton = imageCreditsPopover.querySelector<HTMLButtonElement>('#google-only-setup-api-button');
    googleOnlySetupApiButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        hidePopover();
        
        // Show sidebar on mobile if needed
        const sidebar = document.querySelector<HTMLDivElement>(".sidebar");
        if (sidebar && window.innerWidth <= 1032) {
            sidebar.style.display = "flex";
            helpers.showElement(sidebar, false);
        }
        
        // Navigate to settings and then to API key section
        const settingsTab = document.querySelector<HTMLDivElement>('.navbar-tab:nth-child(3)');
        settingsTab?.click();
        // After settings opens, click the API key settings item
        setTimeout(() => {
            const apiKeySettingsButton = document.querySelector<HTMLButtonElement>('[data-settings-target="api"]');
            apiKeySettingsButton?.click();
        }, 100);
    });
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
    
    imageCreditsPopover.classList.remove('hidden');
    // Trigger reflow for animation
    void imageCreditsPopover.offsetWidth;
    imageCreditsPopover.classList.add('visible');
    
    isPopoverVisible = true;
}

function hidePopover(): void {
    if (!imageCreditsPopover) return;

    imageCreditsPopover.classList.remove('visible');
    // Wait for animation to complete
    setTimeout(() => {
        imageCreditsPopover.classList.add('hidden');
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
        imageCreditsPopover.style.top = 'auto';
        imageCreditsPopover.setAttribute('data-position', 'above');
    } else {
        imageCreditsPopover.style.top = `${labelRect.bottom + 8}px`;
        imageCreditsPopover.style.bottom = 'auto';
        imageCreditsPopover.setAttribute('data-position', 'below');
    }
}

// Initialize and render
(async () => {
    imageGenStatus = await isImageGenerationAvailable();
    await refreshSupplementalAllowanceState();
})();

// Export visibility state getter
export function isImageCreditsLabelVisible(): boolean {
    return !imageCreditsLabel?.classList.contains('hidden');
}

// Export function to update visibility (called from ChatInput)
export function updateImageCreditsLabelVisibility(): void {
    if (!imageCreditsLabel) return;

    const shouldShow = getAllowanceMode() !== null;

    if (shouldShow) {
        imageCreditsLabel.classList.remove('hidden');
    } else {
        imageCreditsLabel.classList.add('hidden');
        // Hide popover if label is hidden
        if (isPopoverVisible) {
            hidePopover();
        }
    }
}

import {
	getSubscriptionTier,
	isImageGenerationAvailable,
	type SubscriptionTier
} from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { validateGeminiApiKey, validateOpenRouterApiKey } from "../../services/ApiKeyValidation.service";
import * as syncService from "../../services/Sync.service";

const geminiApiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const openRouterApiKeyInput = document.querySelector<HTMLInputElement>("#openRouterApiKeyInput");
const geminiError = document.querySelector<HTMLElement>("#gemini-api-key-error");
const openRouterError = document.querySelector<HTMLElement>("#openrouter-api-key-error");
const preferPremiumToggle = document.querySelector<HTMLDivElement>("#prefer-premium-endpoint-toggle");
const preferPremiumCheckbox = document.querySelector<HTMLInputElement>("#preferPremiumEndpoint");
const preferPremiumImageToggle = document.querySelector<HTMLDivElement>("#prefer-premium-image-endpoint-toggle");
const preferPremiumImageCheckbox = document.querySelector<HTMLInputElement>("#preferPremiumImageEndpoint");

if (
	!geminiApiKeyInput ||
	!openRouterApiKeyInput ||
	!geminiError ||
	!openRouterError ||
	!preferPremiumToggle ||
	!preferPremiumCheckbox ||
	!preferPremiumImageToggle ||
	!preferPremiumImageCheckbox
) {
	console.error("One or more API key input elements are missing.");
	throw new Error("API key input initialization failed.");
}

const ensuredGeminiApiKeyInput = geminiApiKeyInput;
const ensuredOpenRouterApiKeyInput = openRouterApiKeyInput;
const ensuredGeminiError = geminiError;
const ensuredOpenRouterError = openRouterError;
const ensuredPreferPremiumToggle = preferPremiumToggle;
const ensuredPreferPremiumCheckbox = preferPremiumCheckbox;
const ensuredPreferPremiumImageToggle = preferPremiumImageToggle;
const ensuredPreferPremiumImageCheckbox = preferPremiumImageCheckbox;
let isPaidAccount = false;
let hasObservedSyncedSettingsPull = false;

function applyPremiumPreferenceFromStorage(): void {
	const savedPreference = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT);
	if (savedPreference !== null) {
		ensuredPreferPremiumCheckbox.checked = savedPreference === "true";
	} else {
		ensuredPreferPremiumCheckbox.checked = true;
	}
}

function rehydratePremiumPreferenceFromStorage(): void {
	applyPremiumPreferenceFromStorage();
	dispatchAppEvent("premium-endpoint-preference-changed", { preferred: ensuredPreferPremiumCheckbox.checked });
}

function applyImagePremiumPreferenceFromStorage(): void {
	const savedPreference = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_IMAGE_ENDPOINT);
	ensuredPreferPremiumImageCheckbox.checked = savedPreference === null ? true : savedPreference === "true";
}

function rehydrateImagePremiumPreferenceFromStorage(): void {
	applyImagePremiumPreferenceFromStorage();
	dispatchAppEvent("image-premium-endpoint-preference-changed", {
		preferred: ensuredPreferPremiumImageCheckbox.checked
	});
}

/**
 * The "use image credits" toggle is only meaningful for accounts that have image
 * credits. Every image model supports the EDGE (credit) route, so credit-holders are
 * the only users with a genuine credits-vs-BYOK choice; without credits there is a
 * single usable path and the toggle would be noise. Gated on credit access only
 * (isImageGenerationAvailable -> type "all"), independent of subscription tier.
 */
async function updateImagePremiumToggleVisibility(): Promise<void> {
	const { type } = await isImageGenerationAvailable();
	ensuredPreferPremiumImageToggle.classList.toggle("hidden", type !== "all");
}

function persistDefaultPremiumPreferenceAfterSyncedSettingsPull(): void {
	if (!isPaidAccount || !hasObservedSyncedSettingsPull) return;
	if (localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT) !== null) return;

	ensuredPreferPremiumCheckbox.checked = true;
	localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT, "true");
	dispatchAppEvent("premium-endpoint-preference-changed", { preferred: true });
	queuePremiumEndpointSettingsSync();
}

function clearValidationState(input: HTMLInputElement, errorElement: HTMLElement): void {
	input.classList.remove("api-key-valid", "api-key-invalid");
	errorElement.classList.add("hidden");
}

function setValidationState(args: { input: HTMLInputElement; errorElement: HTMLElement; isValid: boolean }): void {
	args.input.classList.toggle("api-key-valid", args.isValid);
	args.input.classList.toggle("api-key-invalid", !args.isValid);
	args.errorElement.classList.toggle("hidden", args.isValid);
}

function attachValidation(args: {
	input: HTMLInputElement;
	errorElement: HTMLElement;
	validator: (apiKey: string) => Promise<boolean>;
}): void {
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	args.input.addEventListener("input", () => {
		const value = args.input.value.trim();
		if (debounceTimer) clearTimeout(debounceTimer);

		if (!value) {
			clearValidationState(args.input, args.errorElement);
			return;
		}

		debounceTimer = setTimeout(
			() =>
				void (async () => {
					const isValid = await args.validator(value);
					setValidationState({ input: args.input, errorElement: args.errorElement, isValid });
				})(),
			750
		);
	});
}

applyPremiumPreferenceFromStorage();
applyImagePremiumPreferenceFromStorage();
void updateImagePremiumToggleVisibility();

ensuredPreferPremiumCheckbox.addEventListener("change", () => {
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT,
		ensuredPreferPremiumCheckbox.checked.toString()
	);
	dispatchAppEvent("premium-endpoint-preference-changed", { preferred: ensuredPreferPremiumCheckbox.checked });
	queuePremiumEndpointSettingsSync();
});

ensuredPreferPremiumImageCheckbox.addEventListener("change", () => {
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_IMAGE_ENDPOINT,
		ensuredPreferPremiumImageCheckbox.checked.toString()
	);
	dispatchAppEvent("image-premium-endpoint-preference-changed", {
		preferred: ensuredPreferPremiumImageCheckbox.checked
	});
	queuePremiumEndpointSettingsSync();
});

onAppEvent("auth-state-changed", () => void updateImagePremiumToggleVisibility());
onAppEvent("subscription-updated", () => void updateImagePremiumToggleVisibility());
onAppEvent("image-generation-record-refreshed", () => void updateImagePremiumToggleVisibility());

onAppEvent("auth-state-changed", (event) => {
	const { subscription: sub } = event.detail;
	const savedPreference = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT);
	if (!sub) {
		isPaidAccount = false;
		ensuredPreferPremiumToggle.classList.add("hidden");
		ensuredPreferPremiumCheckbox.checked = false;
		return;
	}

	const tier: SubscriptionTier = getSubscriptionTier(sub);
	if (tier === "pro" || tier === "pro_plus" || tier === "max") {
		isPaidAccount = true;
		ensuredPreferPremiumToggle.classList.remove("hidden");
		if (savedPreference === null) {
			ensuredPreferPremiumCheckbox.checked = true;
		}
	} else {
		isPaidAccount = false;
		ensuredPreferPremiumToggle.classList.add("hidden");
		ensuredPreferPremiumCheckbox.checked = false;
	}
});

onAppEvent("sync-data-pulled", () => {
	hasObservedSyncedSettingsPull = true;
	rehydratePremiumPreferenceFromStorage();
	rehydrateImagePremiumPreferenceFromStorage();
	persistDefaultPremiumPreferenceAfterSyncedSettingsPull();
	void updateImagePremiumToggleVisibility();
});

onAppEvent("settings-loaded-from-storage", () => {
	rehydratePremiumPreferenceFromStorage();
	rehydrateImagePremiumPreferenceFromStorage();
	void updateImagePremiumToggleVisibility();
});

attachValidation({
	input: ensuredGeminiApiKeyInput,
	errorElement: ensuredGeminiError,
	validator: validateGeminiApiKey
});

attachValidation({
	input: ensuredOpenRouterApiKeyInput,
	errorElement: ensuredOpenRouterError,
	validator: validateOpenRouterApiKey
});

export function shouldPreferPremiumEndpoint(): boolean {
	const saved = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT);
	return saved === null ? true : saved === "true";
}

export function hasGeminiApiKey(): boolean {
	return (
		ensuredGeminiApiKeyInput.value.trim().length > 0 ||
		(localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "").trim().length > 0
	);
}

export function hasOpenRouterApiKey(): boolean {
	return (
		ensuredOpenRouterApiKeyInput.value.trim().length > 0 ||
		(localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "").trim().length > 0
	);
}

export function shouldPreferPremiumImageEndpoint(): boolean {
	// A hidden toggle means the account has no image credits, so the edge route is
	// unusable — treat the preference as off so image routing falls to BYOK.
	if (ensuredPreferPremiumImageToggle.classList.contains("hidden")) {
		return false;
	}
	const saved = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_IMAGE_ENDPOINT);
	return saved === null ? true : saved === "true";
}

function queuePremiumEndpointSettingsSync(): void {
	syncService.queueSettingsPush({ label: "premium endpoint settings" });
}

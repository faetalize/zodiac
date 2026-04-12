import { getSubscriptionTier, type SubscriptionTier } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { validateGeminiApiKey, validateOpenRouterApiKey } from "../../services/ApiKeyValidation.service";

const geminiApiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const openRouterApiKeyInput = document.querySelector<HTMLInputElement>("#openRouterApiKeyInput");
const geminiError = document.querySelector<HTMLElement>("#gemini-api-key-error");
const openRouterError = document.querySelector<HTMLElement>("#openrouter-api-key-error");
const preferPremiumToggle = document.querySelector<HTMLDivElement>("#prefer-premium-endpoint-toggle");
const preferPremiumCheckbox = document.querySelector<HTMLInputElement>("#preferPremiumEndpoint");

if (
	!geminiApiKeyInput ||
	!openRouterApiKeyInput ||
	!geminiError ||
	!openRouterError ||
	!preferPremiumToggle ||
	!preferPremiumCheckbox
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

function applyPremiumPreferenceFromStorage(): void {
	const savedPreference = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT);
	if (savedPreference !== null) {
		ensuredPreferPremiumCheckbox.checked = savedPreference === "true";
	} else {
		ensuredPreferPremiumCheckbox.checked = true;
	}
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

		debounceTimer = setTimeout(() => {
			void (async () => {
				const isValid = await args.validator(value);
				setValidationState({ input: args.input, errorElement: args.errorElement, isValid });
			})();
		}, 750);
	});
}

applyPremiumPreferenceFromStorage();

ensuredPreferPremiumCheckbox.addEventListener("change", () => {
	localStorage.setItem(
		SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT,
		ensuredPreferPremiumCheckbox.checked.toString()
	);
	dispatchAppEvent("premium-endpoint-preference-changed", { preferred: ensuredPreferPremiumCheckbox.checked });
});

onAppEvent("auth-state-changed", (event) => {
	const { subscription: sub } = event.detail;
	const savedPreference = localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT);
	if (!sub) {
		ensuredPreferPremiumToggle.classList.add("hidden");
		ensuredPreferPremiumCheckbox.checked = false;
		return;
	}

	const tier: SubscriptionTier = getSubscriptionTier(sub);
	if (tier === "pro" || tier === "pro_plus" || tier === "max") {
		ensuredPreferPremiumToggle.classList.remove("hidden");
		if (savedPreference === null) {
			ensuredPreferPremiumCheckbox.checked = true;
			localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT, "true");
		}
	} else {
		ensuredPreferPremiumToggle.classList.add("hidden");
		ensuredPreferPremiumCheckbox.checked = false;
	}
});

onAppEvent("sync-data-pulled", () => {
	applyPremiumPreferenceFromStorage();
	dispatchAppEvent("premium-endpoint-preference-changed", { preferred: ensuredPreferPremiumCheckbox.checked });
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

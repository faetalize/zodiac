/**
 * Onboarding component - handles user interaction and flow logic
 */

import { OnboardingPath, OnboardingStep } from "../../types/Onboarding";
import { SubscriptionPriceIDs } from "../../types/Price";
import type { ColorTheme, ThemeMode } from "../../types/Theme";
import * as onboardingService from "../../services/Onboarding.service";
import * as supabaseService from "../../services/Supabase.service";
import * as syncService from "../../services/Sync.service";
import * as settingsService from "../../services/Settings.service";
import * as toastService from "../../services/Toast.service";
import { themeService } from "../../services/Theme.service";
import {
	GEMINI_CHAT_MODELS,
	formatChatModelLabel,
	OPENROUTER_CHAT_MODELS,
	getAccessibleChatModels,
	getDefaultChatModel,
	getValidChatModel,
	modelRequiresThinking,
	modelSupportsThinking,
	type ChatModelAccess
} from "../../types/Models";
import { SETTINGS_STORAGE_KEYS } from "../../constants/SettingsStorageKeys";
import { validateGeminiApiKey, validateOpenRouterApiKey } from "../../services/ApiKeyValidation.service";

// Path selection buttons
const easyPathButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-easy");
const powerPathButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-power");
const skipOnboardingButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-skip");

// Theme selection elements
const themeModeButtons = {
	light: document.querySelector<HTMLButtonElement>("#onboarding-mode-light"),
	auto: document.querySelector<HTMLButtonElement>("#onboarding-mode-auto"),
	dark: document.querySelector<HTMLButtonElement>("#onboarding-mode-dark")
};
const themeColorButtons = {
	blue: document.querySelector<HTMLButtonElement>("#onboarding-theme-blue"),
	red: document.querySelector<HTMLButtonElement>("#onboarding-theme-red"),
	green: document.querySelector<HTMLButtonElement>("#onboarding-theme-green"),
	purple: document.querySelector<HTMLButtonElement>("#onboarding-theme-purple"),
	monochrome: document.querySelector<HTMLButtonElement>("#onboarding-theme-monochrome")
};
const themeContinueButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-theme-continue");

// Account selector elements (for logged-in Pro/Max users)
const accountSelectorPfp = document.querySelector<HTMLImageElement>("#onboarding-account-pfp");
const accountSelectorEmail = document.querySelector<HTMLDivElement>("#onboarding-account-email");
const accountSelectorTierBadge = document.querySelector<HTMLSpanElement>("#onboarding-account-tier-badge");
const continueWithAccountButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-continue-with-account");
const useDifferentAccountButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-use-different-account");

// Account confirmation elements (for logged-in users)
const confirmTitle = document.querySelector<HTMLHeadingElement>("#onboarding-confirm-title");
const confirmSubtitle = document.querySelector<HTMLParagraphElement>("#onboarding-confirm-subtitle");
const confirmAccountPfp = document.querySelector<HTMLImageElement>("#onboarding-confirm-account-pfp");
const confirmAccountEmail = document.querySelector<HTMLDivElement>("#onboarding-confirm-account-email");
const confirmAccountTierBadge = document.querySelector<HTMLSpanElement>("#onboarding-confirm-account-tier-badge");
const confirmContinueButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-confirm-continue");
const confirmDifferentAccountButton = document.querySelector<HTMLButtonElement>(
	"#onboarding-btn-confirm-different-account"
);

// API vs Subscription choice buttons
const chooseApiKeyButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-choose-api");
const chooseSubscriptionButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-choose-subscription");

// API key setup elements
const apiKeyInput = document.querySelector<HTMLInputElement>("#onboarding-api-key");
const validateApiKeyButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-validate-api");
const apiKeyStatus = document.querySelector<HTMLDivElement>("#onboarding-api-key-status");
const openRouterApiKeyInput = document.querySelector<HTMLInputElement>("#onboarding-openrouter-api-key");
const validateOpenRouterApiKeyButton = document.querySelector<HTMLButtonElement>(
	"#onboarding-btn-validate-openrouter-api"
);
const openRouterApiKeyStatus = document.querySelector<HTMLDivElement>("#onboarding-openrouter-api-key-status");
const apiKeyNextButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-api-next");

// Registration elements
const registerEmailInput = document.querySelector<HTMLInputElement>("#onboarding-register-email");
const registerPasswordInput = document.querySelector<HTMLInputElement>("#onboarding-register-password");
const registerPasswordConfirmInput = document.querySelector<HTMLInputElement>("#onboarding-register-password-confirm");
const registerTermsCheckbox = document.querySelector<HTMLInputElement>("#onboarding-register-terms");
const registerSubmitButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-register");
const registerSkipButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-skip-register");
const registerError = document.querySelector<HTMLDivElement>("#onboarding-register-error");
const registerTabsContainer = document.querySelector<HTMLDivElement>("#onboarding-auth-tabs");
const registerToggleRegisterButton = document.querySelector<HTMLDivElement>("#onboarding-toggle-register");
const registerToggleLoginButton = document.querySelector<HTMLDivElement>("#onboarding-toggle-login");
const registerTabsHighlight = document.querySelector<HTMLDivElement>("#onboarding-auth-highlight");
const registerPanel = document.querySelector<HTMLFormElement>("#onboarding-register-panel");
const loginPanel = document.querySelector<HTMLFormElement>("#onboarding-login-panel");
const registerLoginEmailInput = document.querySelector<HTMLInputElement>("#onboarding-login-email");
const registerLoginPasswordInput = document.querySelector<HTMLInputElement>("#onboarding-login-password");
const registerLoginButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-login-existing");
const registerLoginError = document.querySelector<HTMLDivElement>("#onboarding-login-error");

// Subscription confirmation elements
const onboardingOverlay = document.querySelector<HTMLDivElement>("#onboarding-overlay");
const onboardingContainer = document.querySelector<HTMLDivElement>("#onboarding-overlay .onboarding-container");
const onboardingPlanSelection = document.querySelector<HTMLDivElement>("#onboarding-plan-selection");
const onboardingPricingHost = document.querySelector<HTMLDivElement>("#onboarding-pricing-host");
const subscriptionForm = document.querySelector<HTMLDivElement>("#form-subscription");
const subscriptionAutoLoginButton = document.querySelector<HTMLButtonElement>(
	"#onboarding-btn-subscription-auto-login"
);
const subscriptionReturnButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-subscription-return");
const subscriptionStatus = document.querySelector<HTMLDivElement>("#onboarding-subscription-status");

// Cloud sync setup elements (onboarding)
const cloudSyncEnableCheckbox = document.querySelector<HTMLInputElement>("#onboarding-cloud-sync-enable");
const cloudSyncTitle = document.querySelector<HTMLHeadingElement>("#onboarding-cloud-sync-title");
const cloudSyncSubtitle = document.querySelector<HTMLParagraphElement>("#onboarding-cloud-sync-subtitle");
const cloudSyncEnableGroup = document.querySelector<HTMLDivElement>("#onboarding-cloud-sync-enable-group");
const cloudSyncPasswordInput = document.querySelector<HTMLInputElement>("#onboarding-cloud-sync-password");
const cloudSyncPasswordConfirmGroup = document.querySelector<HTMLDivElement>(
	"#onboarding-cloud-sync-password-confirm-group"
);
const cloudSyncPasswordConfirmInput = document.querySelector<HTMLInputElement>(
	"#onboarding-cloud-sync-password-confirm"
);
const cloudSyncStatus = document.querySelector<HTMLDivElement>("#onboarding-cloud-sync-status");
const cloudSyncContinueButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-cloud-sync-continue");
const cloudSyncSkipButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-cloud-sync-skip");

// Advanced settings elements (Power User Path)
const advancedModelSelect = document.querySelector<HTMLSelectElement>("#onboarding-model-select");
const advancedTemperature = document.querySelector<HTMLInputElement>("#onboarding-temperature");
const advancedTemperatureValue = document.querySelector<HTMLSpanElement>("#onboarding-temperature-value");
const advancedMaxOutputTokens = document.querySelector<HTMLInputElement>("#onboarding-max-output-tokens");
const advancedThinkingEnabled = document.querySelector<HTMLInputElement>("#onboarding-thinking-enabled");
const advancedThinkingHint = document.querySelector<HTMLParagraphElement>("#onboarding-thinking-hint");
const advancedThinkingBudget = document.querySelector<HTMLInputElement>("#onboarding-thinking-budget");
const advancedAutoscroll = document.querySelector<HTMLInputElement>("#onboarding-autoscroll");
const advancedStreamResponses = document.querySelector<HTMLInputElement>("#onboarding-stream-responses");
const advancedRpgGroupChatsProgressAutomatically = document.querySelector<HTMLInputElement>(
	"#onboarding-rpg-group-chats-progress-automatically"
);
const advancedDisallowPersonaPinging = document.querySelector<HTMLInputElement>("#onboarding-disallow-persona-pinging");
const advancedDynamicGroupChatPingOnly = document.querySelector<HTMLInputElement>(
	"#onboarding-dynamic-group-chat-ping-only"
);
const advancedPrimaryContinueButton = document.querySelector<HTMLButtonElement>(
	"#onboarding-btn-advanced-primary-continue"
);
const advancedBehaviorContinueButton = document.querySelector<HTMLButtonElement>(
	"#onboarding-btn-advanced-behavior-continue"
);

// Summary elements
const summaryFinishButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-finish");
const summaryApiKeyContent = document.querySelector<HTMLDivElement>("#summary-apikey-content");
const summarySubscriptionContent = document.querySelector<HTMLDivElement>("#summary-subscription-content");
const summarySubscriptionHeadline = document.querySelector<HTMLParagraphElement>("#summary-subscription-headline");
const summarySubscriptionSelection = document.querySelector<HTMLParagraphElement>("#summary-subscription-selection");

// Check all required elements exist
const requiredElements = {
	easyPathButton,
	powerPathButton,
	skipOnboardingButton,
	themeModeLight: themeModeButtons.light,
	themeModeAuto: themeModeButtons.auto,
	themeModeDark: themeModeButtons.dark,
	themeColorBlue: themeColorButtons.blue,
	themeColorRed: themeColorButtons.red,
	themeColorGreen: themeColorButtons.green,
	themeColorPurple: themeColorButtons.purple,
	themeColorMonochrome: themeColorButtons.monochrome,
	themeContinueButton,
	accountSelectorPfp,
	accountSelectorEmail,
	accountSelectorTierBadge,
	continueWithAccountButton,
	useDifferentAccountButton,
	confirmTitle,
	confirmSubtitle,
	confirmAccountPfp,
	confirmAccountEmail,
	confirmAccountTierBadge,
	confirmContinueButton,
	confirmDifferentAccountButton,
	chooseApiKeyButton,
	chooseSubscriptionButton,
	apiKeyInput,
	validateApiKeyButton,
	apiKeyStatus,
	openRouterApiKeyInput,
	validateOpenRouterApiKeyButton,
	openRouterApiKeyStatus,
	apiKeyNextButton,
	registerEmailInput,
	registerPasswordInput,
	registerPasswordConfirmInput,
	registerTermsCheckbox,
	registerSubmitButton,
	registerSkipButton,
	registerError,
	registerToggleRegisterButton,
	registerToggleLoginButton,
	registerTabsContainer,
	registerTabsHighlight,
	registerPanel,
	loginPanel,
	registerLoginEmailInput,
	registerLoginPasswordInput,
	registerLoginButton,
	registerLoginError,
	onboardingOverlay,
	onboardingContainer,
	onboardingPlanSelection,
	onboardingPricingHost,
	subscriptionForm,
	subscriptionAutoLoginButton,
	subscriptionReturnButton,
	subscriptionStatus,
	cloudSyncEnableCheckbox,
	cloudSyncTitle,
	cloudSyncSubtitle,
	cloudSyncEnableGroup,
	cloudSyncPasswordInput,
	cloudSyncPasswordConfirmGroup,
	cloudSyncPasswordConfirmInput,
	cloudSyncStatus,
	cloudSyncContinueButton,
	cloudSyncSkipButton,
	advancedModelSelect,
	advancedTemperature,
	advancedTemperatureValue,
	advancedMaxOutputTokens,
	advancedThinkingEnabled,
	advancedThinkingHint,
	advancedThinkingBudget,
	advancedAutoscroll,
	advancedStreamResponses,
	advancedRpgGroupChatsProgressAutomatically,
	advancedDisallowPersonaPinging,
	advancedDynamicGroupChatPingOnly,
	advancedPrimaryContinueButton,
	advancedBehaviorContinueButton,
	summaryFinishButton,
	summaryApiKeyContent,
	summarySubscriptionContent,
	summarySubscriptionHeadline,
	summarySubscriptionSelection
};

for (const [name, element] of Object.entries(requiredElements)) {
	if (!element) {
		console.error(`Onboarding element missing: ${name}`);
		throw new Error(`Onboarding component is not properly initialized: ${name} is missing`);
	}
}

type AuthMode = "register" | "login";
let activeAuthMode: AuthMode = "register";
let refreshAdvancedSettingsFromStorage: (() => void) | null = null;
let hasCloudSyncEnabledForCurrentUser = false;
type OnboardingCloudSyncMode = "setup" | "unlock" | "enable";
let onboardingCloudSyncMode: OnboardingCloudSyncMode = "setup";

function hasAnyValidatedApiKey(): boolean {
	return onboardingService.getState().apiKeyValidated;
}

async function getOnboardingModelAccess(): Promise<ChatModelAccess> {
	const currentUser = await supabaseService.getCurrentUser();
	const subscription = currentUser ? await supabaseService.getUserSubscription() : null;
	const tier = supabaseService.getSubscriptionTier(subscription);
	const hasPremiumAccess =
		tier === "pro" ||
		tier === "pro_plus" ||
		tier === "max" ||
		onboardingService.getState().setupOption === "subscription";

	return {
		hasGeminiAccess:
			hasPremiumAccess || (localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "").trim().length > 0,
		hasOpenRouterAccess:
			hasPremiumAccess || (localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "").trim().length > 0
	};
}

function buildOptionGroup(label: string, options: { id: string; label: string }[]): HTMLOptGroupElement {
	const optGroup = document.createElement("optgroup");
	optGroup.label = label;

	for (const option of options) {
		const element = document.createElement("option");
		element.value = option.id;
		element.textContent = formatChatModelLabel(option);
		optGroup.append(element);
	}

	return optGroup;
}

async function refreshOnboardingModelOptions(preferredModel?: string): Promise<void> {
	const access = await getOnboardingModelAccess();
	const available = getAccessibleChatModels(access);
	const currentValue =
		preferredModel || advancedModelSelect!.value || localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL) || "";

	advancedModelSelect!.replaceChildren();

	const geminiModels = available.filter((model) => GEMINI_CHAT_MODELS.some((candidate) => candidate.id === model.id));
	const openRouterModels = available.filter((model) =>
		OPENROUTER_CHAT_MODELS.some((candidate) => candidate.id === model.id)
	);

	if (geminiModels.length > 0) {
		advancedModelSelect!.append(buildOptionGroup("Gemini", geminiModels));
	}

	if (openRouterModels.length > 0) {
		advancedModelSelect!.append(buildOptionGroup("OpenRouter", openRouterModels));
	}

	if (available.length === 0) {
		const option = document.createElement("option");
		option.value = "";
		option.textContent = "Add or validate a key to unlock models";
		option.disabled = true;
		option.selected = true;
		advancedModelSelect!.append(option);
		advancedModelSelect!.disabled = true;
		return;
	}

	advancedModelSelect!.disabled = false;
	advancedModelSelect!.value = getValidChatModel(currentValue, access) || getDefaultChatModel(access);
}

/**
 * Initialize onboarding component
 */
export function initialize(): void {
	setupPathSelection();
	setupThemeSelection();
	setupAccountSelector();
	setupAccountConfirmation();
	setupApiOrSubscriptionChoice();
	setupApiKeySetup();
	setupPlanSelection();
	setupRegistration();
	setupSubscriptionConfirmation();
	setupCloudSyncSetup();
	setupAdvancedSettings();
	setupSummary();
}

/**
 * Path selection step handlers
 */
function setupPathSelection(): void {
	easyPathButton!.addEventListener("click", () => {
		void (async () => {
			onboardingService.setPath(OnboardingPath.EASY);
			onboardingService.goToStep(OnboardingStep.THEME_SELECTION);
		})();
	});

	powerPathButton!.addEventListener("click", () => {
		void (async () => {
			onboardingService.setPath(OnboardingPath.POWER);
			onboardingService.goToStep(OnboardingStep.THEME_SELECTION);
		})();
	});

	skipOnboardingButton!.addEventListener("click", () => {
		onboardingService.hide();
	});
}

/**
 * Theme selection step handlers
 */
function setupThemeSelection(): void {
	// Set up mode buttons
	Object.entries(themeModeButtons).forEach(([mode, button]) => {
		button!.addEventListener("click", () => {
			// Remove active from all mode buttons
			Object.values(themeModeButtons).forEach((btn) => btn!.classList.remove("active"));
			// Add active to clicked button
			button!.classList.add("active");

			// Apply theme immediately for preview
			if (mode === "auto") {
				themeService.setAutoMode();
				onboardingService.setSelectedMode(themeService.getCurrentTheme().mode, "auto");
			} else {
				const themeMode = mode as ThemeMode;
				themeService.setMode(themeMode, "manual");
				onboardingService.setSelectedMode(themeMode, "manual");
			}
		});
	});

	// Set up color theme buttons
	Object.entries(themeColorButtons).forEach(([theme, button]) => {
		button!.addEventListener("click", () => {
			// Remove active from all theme buttons
			Object.values(themeColorButtons).forEach((btn) => btn!.classList.remove("active"));
			// Add active to clicked button
			button!.classList.add("active");

			// Apply theme immediately for preview and store in onboarding state
			const colorTheme = theme as ColorTheme;
			themeService.setColorTheme(colorTheme);
			onboardingService.setSelectedTheme(colorTheme);
		});
	});

	// Continue button - route to account selector or API/subscription based on auth
	themeContinueButton!.addEventListener("click", () => {
		void (async () => {
			// Check if user is logged in and determine routing
			const user = await supabaseService.getCurrentUser();
			if (user) {
				const subscription = await supabaseService.getUserSubscription();
				const tier = supabaseService.getSubscriptionTier(subscription);

				// If user has a paid subscription, show account selector
				if (tier === "pro" || tier === "pro_plus" || tier === "max") {
					await prepareAccountSelector(user, subscription, tier);
					onboardingService.goToStep(OnboardingStep.ACCOUNT_SELECTOR);
					return;
				}
			}

			// Otherwise, show normal API or Subscription choice
			onboardingService.goToStep(OnboardingStep.API_OR_SUBSCRIPTION);
		})();
	});
}

/**
 * Account selector step handlers (for logged-in Pro/Max users)
 */
function setupAccountSelector(): void {
	continueWithAccountButton!.addEventListener("click", () => {
		void (async () => {
			// Mark setup as subscription (since they're already subscribed)
			onboardingService.setSetupOption("subscription");

			// Route based on selected path (Easy or Power)
			await routeToCloudSyncOrSettings();
		})();
	});

	useDifferentAccountButton!.addEventListener("click", () => {
		void (async () => {
			// Clear any pending credentials since user is switching accounts
			onboardingService.setPendingCredentials(null);
			// Logout and go back to API_OR_SUBSCRIPTION
			await supabaseService.logout();
			onboardingService.goToStep(OnboardingStep.API_OR_SUBSCRIPTION);
		})();
	});
}

/**
 * Account confirmation step handlers (for logged-in users)
 * This is dynamic and changes behavior based on setup option
 */
function setupAccountConfirmation(): void {
	confirmContinueButton!.addEventListener("click", () => {
		void (async () => {
			const setupOption = onboardingService.getState().setupOption;

			if (setupOption === "subscription") {
				// Continue to plan selection for subscription flow
				onboardingService.goToStep(OnboardingStep.PLAN_SELECTION);
			} else if (setupOption === "api-key") {
				// Continue to settings or summary based on path
				await routeToCloudSyncOrSettings();
			}
		})();
	});

	confirmDifferentAccountButton!.addEventListener("click", () => {
		void (async () => {
			// Clear any pending credentials since user is switching accounts
			onboardingService.setPendingCredentials(null);
			// Logout and show registration/login dialogs
			await supabaseService.logout();
			onboardingService.goToStep(OnboardingStep.REGISTRATION);
			prepareRegistrationStep("login", { focus: true });
		})();
	});
}

/**
 * Prepare account selector with user data
 */
async function prepareAccountSelector(
	user: Awaited<ReturnType<typeof supabaseService.getCurrentUser>>,
	subscription: Awaited<ReturnType<typeof supabaseService.getUserSubscription>>,
	tier: ReturnType<typeof supabaseService.getSubscriptionTier>
): Promise<void> {
	if (!user) return;

	// Set profile picture
	const profile = await supabaseService.getUserProfile();
	if (profile?.avatar) {
		accountSelectorPfp!.src = profile.avatar;
	}

	// Set email
	accountSelectorEmail!.textContent = user.email || "No email";

	// Set tier badge
	const tierLabel = tier === "pro" ? "Pro" : tier === "pro_plus" ? "Pro Plus" : tier === "max" ? "Max" : "Free";
	accountSelectorTierBadge!.textContent = tierLabel;
	accountSelectorTierBadge!.classList.remove(
		"badge-tier-free",
		"badge-tier-pro",
		"badge-tier-pro-plus",
		"badge-tier-pro_plus",
		"badge-tier-max"
	);
	accountSelectorTierBadge!.classList.add(`badge-tier-${tier}`);
}

/**
 * Prepare account confirmation with user data
 */
async function prepareAccountConfirmation(options?: { title?: string; subtitle?: string }): Promise<void> {
	const user = await supabaseService.getCurrentUser();
	if (!user) return;

	// Set dynamic title and subtitle
	if (options?.title) {
		confirmTitle!.textContent = options.title;
	} else {
		confirmTitle!.textContent = "Continue with Your Account";
	}

	if (options?.subtitle) {
		confirmSubtitle!.textContent = options.subtitle;
	} else {
		confirmSubtitle!.textContent = "You're logged in. Continue to proceed.";
	}

	// Set profile picture
	const profile = await supabaseService.getUserProfile();
	if (profile?.avatar) {
		confirmAccountPfp!.src = profile.avatar;
	}

	// Set email
	confirmAccountEmail!.textContent = user.email || "No email";

	// Get subscription tier for badge
	const subscription = await supabaseService.getUserSubscription();
	const tier = supabaseService.getSubscriptionTier(subscription);
	const tierLabel = tier === "pro" ? "Pro" : tier === "pro_plus" ? "Pro Plus" : tier === "max" ? "Max" : "Free";
	confirmAccountTierBadge!.textContent = tierLabel;
	confirmAccountTierBadge!.classList.remove(
		"badge-tier-free",
		"badge-tier-pro",
		"badge-tier-pro-plus",
		"badge-tier-pro_plus",
		"badge-tier-max"
	);
	confirmAccountTierBadge!.classList.add(`badge-tier-${tier}`);
}

/**
 * API vs Subscription choice step handlers
 */
function setupApiOrSubscriptionChoice(): void {
	chooseApiKeyButton!.addEventListener("click", () => {
		void (async () => {
			onboardingService.setSetupOption("api-key");
			onboardingService.setPendingCredentials(null);

			apiKeyInput!.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.API_KEY) || "";
			openRouterApiKeyInput!.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY) || "";

			onboardingService.goToStep(OnboardingStep.API_KEY_SETUP);
		})();
	});

	chooseSubscriptionButton!.addEventListener("click", () => {
		void (async () => {
			onboardingService.setSetupOption("subscription");
			onboardingService.setPendingCredentials(null);

			// Check if user is logged in
			const user = await supabaseService.getCurrentUser();
			if (user) {
				// User is logged in (Free tier), show account confirmation
				await prepareAccountConfirmation({
					title: "Continue with Your Account",
					subtitle: "You're logged in. Continue to select a subscription plan."
				});
				onboardingService.goToStep(OnboardingStep.ACCOUNT_CONFIRMATION);
			} else {
				// User not logged in, show registration
				onboardingService.goToStep(OnboardingStep.REGISTRATION);
				prepareRegistrationStep("register", { focus: true });
			}
		})();
	});
}

/**
 * API key setup step handlers
 */
function setupApiKeySetup(): void {
	const updateApiKeyNextState = () => {
		const hasValidatedKey =
			apiKeyStatus!.classList.contains("status-success") ||
			openRouterApiKeyStatus!.classList.contains("status-success");

		onboardingService.setApiKeyValidated(hasValidatedKey);
		apiKeyNextButton!.disabled = !hasValidatedKey;
	};

	const revealContinueButton = () => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const onboardingOverlay = document.querySelector("#onboarding-overlay");
				if (onboardingOverlay) {
					onboardingOverlay.scrollTo({ top: onboardingOverlay.scrollHeight, behavior: "smooth" });
				}
			});
		});
	};

	const runValidation = async (args: {
		input: HTMLInputElement;
		button: HTMLButtonElement;
		statusElement: HTMLDivElement;
		storageKey: string;
		validator: (apiKey: string) => Promise<boolean>;
		loadingMessage: string;
		successMessage: string;
		errorMessage: string;
		idleLabel: string;
	}) => {
		const apiKey = args.input.value.trim();
		if (!apiKey) {
			showApiKeyStatus(args.statusElement, "Please enter an API key", "error");
			updateApiKeyNextState();
			return;
		}

		args.button.disabled = true;
		args.button.textContent = "Validating...";
		showApiKeyStatus(args.statusElement, args.loadingMessage, "loading");

		try {
			const isValid = await args.validator(apiKey);
			if (!isValid) {
				showApiKeyStatus(args.statusElement, args.errorMessage, "error");
				updateApiKeyNextState();
				return;
			}

			showApiKeyStatus(args.statusElement, args.successMessage, "success");
			localStorage.setItem(args.storageKey, apiKey);
			settingsService.loadSettings();
			await refreshOnboardingModelOptions(localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL) || undefined);
			updateApiKeyNextState();
			revealContinueButton();
		} catch (error) {
			console.error("API key validation failed:", error);
			showApiKeyStatus(args.statusElement, args.errorMessage, "error");
			updateApiKeyNextState();
		} finally {
			args.button.disabled = false;
			args.button.textContent = args.idleLabel;
		}
	};

	validateApiKeyButton!.addEventListener("click", () => {
		void (async () => {
			await runValidation({
				input: apiKeyInput!,
				button: validateApiKeyButton!,
				statusElement: apiKeyStatus!,
				storageKey: SETTINGS_STORAGE_KEYS.API_KEY,
				validator: validateGeminiApiKey,
				loadingMessage: "Testing your Gemini key...",
				successMessage: "✓ Gemini key is valid!",
				errorMessage: "✗ Invalid Gemini key. Please check and try again.",
				idleLabel: "Validate Gemini Key"
			});
		})();
	});

	validateOpenRouterApiKeyButton!.addEventListener("click", () => {
		void (async () => {
			await runValidation({
				input: openRouterApiKeyInput!,
				button: validateOpenRouterApiKeyButton!,
				statusElement: openRouterApiKeyStatus!,
				storageKey: SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY,
				validator: validateOpenRouterApiKey,
				loadingMessage: "Testing your OpenRouter key...",
				successMessage: "✓ OpenRouter key is valid!",
				errorMessage: "✗ Invalid OpenRouter key. Please check and try again.",
				idleLabel: "Validate OpenRouter Key"
			});
		})();
	});

	apiKeyNextButton!.addEventListener("click", () => {
		void (async () => {
			if (!hasAnyValidatedApiKey()) {
				return;
			}

			onboardingService.setSetupOption("api-key");
			onboardingService.setPendingCredentials(null);

			// Check if user is logged in
			const user = await supabaseService.getCurrentUser();
			if (user) {
				// User is logged in, show account confirmation
				await prepareAccountConfirmation({
					title: "Continue with Your Account",
					subtitle: "Choose an account to continue to finish onboarding."
				});
				onboardingService.goToStep(OnboardingStep.ACCOUNT_CONFIRMATION);
			} else {
				// User not logged in, show registration
				onboardingService.goToStep(OnboardingStep.REGISTRATION);
				prepareRegistrationStep("register", { focus: true });
			}
		})();
	});

	// Reset next button state when input changes
	const handleApiKeyInputChange = async (args: { statusElement: HTMLDivElement; storageKey: string }) => {
		localStorage.removeItem(args.storageKey);
		hideApiKeyStatus(args.statusElement);
		const hasValidatedKey =
			apiKeyStatus!.classList.contains("status-success") ||
			openRouterApiKeyStatus!.classList.contains("status-success");
		onboardingService.setApiKeyValidated(hasValidatedKey);
		apiKeyNextButton!.disabled = !hasValidatedKey;
		await refreshOnboardingModelOptions(localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL) || undefined);
	};

	apiKeyInput!.addEventListener("input", () => {
		void handleApiKeyInputChange({ statusElement: apiKeyStatus!, storageKey: SETTINGS_STORAGE_KEYS.API_KEY });
	});

	openRouterApiKeyInput!.addEventListener("input", () => {
		void handleApiKeyInputChange({
			statusElement: openRouterApiKeyStatus!,
			storageKey: SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY
		});
	});
}

/**
 * Plan selection step handlers (for subscription flow)
 */
type OnboardingPlanType = "pro" | "pro_plus" | "max";
type OnboardingBillingMode = "monthly" | "yearly";
type OnboardingSubscriptionSummary = {
	planLabel: string;
	billingLabel: string;
};

const subscriptionFormOriginalParent = subscriptionForm?.parentNode ?? null;
const subscriptionFormOriginalNextSibling = subscriptionForm?.nextSibling ?? null;
let hasInitializedOnboardingPricing = false;

function setupPlanSelection(): void {
	initializeOnboardingPricing();
	syncOnboardingPricingMount();
}

function getOnboardingBillingMode(): OnboardingBillingMode {
	return subscriptionForm?.dataset.billing === "monthly" ? "monthly" : "yearly";
}

function setOnboardingBillingMode(mode: OnboardingBillingMode): void {
	if (subscriptionForm) {
		subscriptionForm.dataset.billing = mode;
	}

	if (onboardingPlanSelection) {
		onboardingPlanSelection.dataset.billing = mode;
	}
}

function getSelectedPriceIdForPlan(plan: OnboardingPlanType, billingMode: OnboardingBillingMode): string {
	switch (plan) {
		case "pro":
			return billingMode === "yearly" ? SubscriptionPriceIDs.PRO_YEARLY : SubscriptionPriceIDs.PRO_MONTHLY;
		case "pro_plus":
			return billingMode === "yearly"
				? SubscriptionPriceIDs.PRO_PLUS_YEARLY
				: SubscriptionPriceIDs.PRO_PLUS_MONTHLY;
		case "max":
			return billingMode === "yearly" ? SubscriptionPriceIDs.MAX_YEARLY : SubscriptionPriceIDs.MAX_MONTHLY;
	}
}

function getSubscriptionSummaryFromPriceId(priceId: string | null): OnboardingSubscriptionSummary | null {
	switch (priceId) {
		case SubscriptionPriceIDs.PRO_MONTHLY:
			return { planLabel: "Pro", billingLabel: "Monthly" };
		case SubscriptionPriceIDs.PRO_YEARLY:
			return { planLabel: "Pro", billingLabel: "Yearly" };
		case SubscriptionPriceIDs.PRO_PLUS_MONTHLY:
			return { planLabel: "Pro Plus", billingLabel: "Monthly" };
		case SubscriptionPriceIDs.PRO_PLUS_YEARLY:
			return { planLabel: "Pro Plus", billingLabel: "Yearly" };
		case SubscriptionPriceIDs.MAX_MONTHLY:
			return { planLabel: "Max", billingLabel: "Monthly" };
		case SubscriptionPriceIDs.MAX_YEARLY:
			return { planLabel: "Max", billingLabel: "Yearly" };
		default:
			return null;
	}
}

function isCloudSyncEligibleTier(tier: ReturnType<typeof supabaseService.getSubscriptionTier>): boolean {
	return tier === "pro" || tier === "pro_plus" || tier === "max";
}

function initializeOnboardingPricing(): void {
	if (hasInitializedOnboardingPricing) {
		return;
	}

	if (
		!subscriptionForm ||
		!onboardingPricingHost ||
		!onboardingPlanSelection ||
		!onboardingOverlay ||
		!onboardingContainer
	) {
		throw new Error("Missing onboarding pricing elements");
	}

	hasInitializedOnboardingPricing = true;

	const billingButtons = Array.from(subscriptionForm.querySelectorAll<HTMLButtonElement>("[data-billing-option]"));
	billingButtons.forEach((button) => {
		button.addEventListener(
			"click",
			() => {
				const nextMode = button.dataset.billingOption === "monthly" ? "monthly" : "yearly";
				setOnboardingBillingMode(nextMode);
			},
			{ capture: true }
		);
	});

	const planButtons: Array<{ plan: OnboardingPlanType; selector: string }> = [
		{ plan: "pro", selector: "#btn-subscribe-pro" },
		{ plan: "pro_plus", selector: "#btn-subscribe-pro-plus" },
		{ plan: "max", selector: "#btn-subscribe-max" }
	];

	planButtons.forEach(({ plan, selector }) => {
		const button = subscriptionForm.querySelector<HTMLButtonElement>(selector);
		if (!button) return;

		button.addEventListener(
			"click",
			(event) => {
				void (async () => {
					if (onboardingPlanSelection.classList.contains("hidden")) {
						return;
					}

					event.preventDefault();
					event.stopImmediatePropagation();
					onboardingService.setSelectedPriceId(getSelectedPriceIdForPlan(plan, getOnboardingBillingMode()));
					await routeToCloudSyncOrSettings();
				})();
			},
			{ capture: true }
		);
	});

	const observer = new MutationObserver(() => syncOnboardingPricingMount());
	observer.observe(onboardingPlanSelection, { attributes: true, attributeFilter: ["class"] });
	observer.observe(onboardingOverlay, { attributes: true, attributeFilter: ["class"] });
}

function syncOnboardingPricingMount(): void {
	if (!subscriptionForm || !onboardingPricingHost || !subscriptionFormOriginalParent) {
		return;
	}

	const shouldMountInOnboarding =
		!onboardingOverlay?.classList.contains("hidden") && !onboardingPlanSelection?.classList.contains("hidden");

	onboardingOverlay?.classList.toggle("onboarding-overlay-pricing-mode", shouldMountInOnboarding);
	onboardingContainer?.classList.toggle("onboarding-container-pricing-mode", shouldMountInOnboarding);

	if (shouldMountInOnboarding) {
		if (subscriptionForm.parentNode !== onboardingPricingHost) {
			onboardingPricingHost.replaceChildren(subscriptionForm);
		}
		subscriptionForm.classList.remove("hidden");
		subscriptionForm.style.opacity = "1";
		setOnboardingBillingMode(getOnboardingBillingMode());
		return;
	}

	if (subscriptionForm.parentNode !== subscriptionFormOriginalParent) {
		if (
			subscriptionFormOriginalNextSibling &&
			subscriptionFormOriginalNextSibling.parentNode === subscriptionFormOriginalParent
		) {
			subscriptionFormOriginalParent.insertBefore(subscriptionForm, subscriptionFormOriginalNextSibling);
		} else {
			subscriptionFormOriginalParent.appendChild(subscriptionForm);
		}
	}

	subscriptionForm.classList.add("hidden");
}

/**
 * Registration step handlers
 */
function setupRegistration(): void {
	const registrationInputs = [registerEmailInput, registerPasswordInput, registerPasswordConfirmInput];
	registrationInputs.forEach((input) => {
		input?.addEventListener("input", () => registerError!.classList.add("hidden"));
	});

	[registerLoginEmailInput, registerLoginPasswordInput].forEach((input) => {
		input?.addEventListener("input", resetLoginError);
	});

	registerToggleRegisterButton!.addEventListener("click", () => {
		resetRegistrationFeedback();
		setAuthMode("register", { focus: true });
	});

	registerToggleLoginButton!.addEventListener("click", () => {
		resetRegistrationFeedback();
		setAuthMode("login", { focus: true });
	});

	registerToggleRegisterButton!.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			resetRegistrationFeedback();
			setAuthMode("register", { focus: true });
		}
	});

	registerToggleLoginButton!.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			resetRegistrationFeedback();
			setAuthMode("login", { focus: true });
		}
	});

	registerPanel!.addEventListener("submit", (e) => {
		void (async () => {
			e.preventDefault();

			const email = registerEmailInput!.value.trim();
			const password = registerPasswordInput!.value;
			const passwordConfirm = registerPasswordConfirmInput!.value;
			const termsAccepted = registerTermsCheckbox!.checked;

			resetRegistrationFeedback();

			// Validation
			if (!email || !password) {
				showRegisterError("Email and password are required");
				return;
			}

			if (password !== passwordConfirm) {
				showRegisterError("Passwords do not match");
				return;
			}

			if (!termsAccepted) {
				showRegisterError("You must accept the terms and conditions");
				return;
			}

			// Disable button and show loading
			registerSubmitButton!.disabled = true;
			const originalText = registerSubmitButton!.textContent ?? "Register";
			registerSubmitButton!.textContent = "Creating Account...";

			try {
				await supabaseService.createAccount(email, password);

				toastService.info({
					title: "Check Your Email",
					text: "Please check your email for a verification link to activate your account."
				});

				onboardingService.setRegistrationCompleted(true);
				onboardingService.setPendingCredentials({ email, password });

				// Both flows require email confirmation
				onboardingService.goToStep(OnboardingStep.SUBSCRIPTION_SETUP);
				prepareSubscriptionConfirmation();
			} catch (error) {
				console.error("Registration failed:", error);
				showRegisterError((error as Error).message || "Registration failed, please try again");
			} finally {
				registerSubmitButton!.disabled = false;
				registerSubmitButton!.textContent = originalText;
			}
		})();
	});

	registerSkipButton!.addEventListener("click", () => {
		void (async () => {
			if (registerSkipButton!.disabled) {
				return;
			}

			onboardingService.setRegistrationCompleted(false);
			onboardingService.setPendingCredentials(null);
			await routeToCloudSyncOrSettings();
		})();
	});

	loginPanel!.addEventListener("submit", (event) => {
		void (async () => {
			event.preventDefault();

			const email = registerLoginEmailInput!.value.trim();
			const password = registerLoginPasswordInput!.value;

			resetLoginError();

			if (!email || !password) {
				showLoginError("Email and password are required");
				return;
			}

			const originalText = registerLoginButton!.textContent ?? "Log In";
			registerLoginButton!.disabled = true;
			registerLoginButton!.textContent = "Signing In...";

			try {
				await supabaseService.login(email, password);
				onboardingService.setRegistrationCompleted(true);
				onboardingService.setPendingCredentials(null);

				toastService.info({
					title: "Signed in",
					text: "Welcome back! You're ready to continue."
				});

				if (isSubscriptionFlow()) {
					// Check if user already has a Pro/Max subscription
					const user = await supabaseService.getCurrentUser();
					const subscription = await supabaseService.getUserSubscription();
					const tier = supabaseService.getSubscriptionTier(subscription);

					if (tier === "pro" || tier === "pro_plus" || tier === "max") {
						// User already has subscription, show account selector
						await prepareAccountSelector(user, subscription, tier);
						onboardingService.goToStep(OnboardingStep.ACCOUNT_SELECTOR);
					} else {
						// User is Free tier, continue to plan selection
						onboardingService.goToStep(OnboardingStep.PLAN_SELECTION);
					}
				} else {
					await routeToCloudSyncOrSettings();
				}
			} catch (error) {
				console.error("Login failed:", error);
				showLoginError((error as Error).message || "Login failed, please try again");
			} finally {
				registerLoginButton!.disabled = false;
				registerLoginButton!.textContent = originalText;
			}
		})();
	});

	setAuthMode(activeAuthMode);
}

/**
 * Map price IDs to Stripe purchase type strings
 */
function getPurchaseTypeFromPriceId(priceId: string): string | null {
	const mapping: Record<string, string> = {
		[SubscriptionPriceIDs.PRO_MONTHLY]: "pro_monthly",
		[SubscriptionPriceIDs.PRO_YEARLY]: "pro_yearly",
		[SubscriptionPriceIDs.PRO_PLUS_MONTHLY]: "pro_plus_monthly",
		[SubscriptionPriceIDs.PRO_PLUS_YEARLY]: "pro_plus_yearly",
		[SubscriptionPriceIDs.MAX_MONTHLY]: "max_monthly",
		[SubscriptionPriceIDs.MAX_YEARLY]: "max_yearly"
	};
	return mapping[priceId] || null;
}

/**
 * Summary step handlers
 */
function setupSummary(): void {
	summaryFinishButton!.addEventListener("click", () => {
		void (async () => {
			const selectedPriceId = onboardingService.getSelectedPriceId();

			// Apply theme settings from onboarding state before everything else
			applyThemeSettings();

			// Apply Easy path settings for ALL outcomes
			const selectedPath = onboardingService.getState().selectedPath;
			if (selectedPath === OnboardingPath.EASY && !hasCloudSyncEnabledForCurrentUser) {
				await applyEasyPathSettings();
			}

			// Subscription flow - redirect to Stripe checkout
			if (selectedPriceId) {
				try {
					summaryFinishButton!.disabled = true;
					summaryFinishButton!.textContent = "Redirecting...";

					// Determine purchase type based on price ID
					const purchaseType = getPurchaseTypeFromPriceId(selectedPriceId);
					if (!purchaseType) {
						throw new Error("Invalid price ID");
					}

					const { data, error } = await supabaseService.supabase.functions.invoke("stripe", {
						method: "POST",
						body: JSON.stringify({ purchaseType })
					});

					if (error) {
						console.error("Stripe checkout creation failed:", error);
						throw new Error(error.message || "Stripe checkout failed");
					}

					const url = data.url;
					if (!url) {
						console.error("Stripe returned no URL", data);
						throw new Error("No checkout URL returned");
					}

					onboardingService.markCompleted();

					// Redirect to Stripe checkout
					window.location.href = url;
				} catch (error) {
					console.error("Checkout error:", error);
					summaryFinishButton!.disabled = false;
					summaryFinishButton!.textContent = "Continue to Checkout";
					toastService.danger({
						title: "Checkout Failed",
						text: "Unable to start checkout. Please try again."
					});
				}
			} else {
				// API key flow - normal completion
				onboardingService.setPendingCredentials(null);

				// Navigate to Chats tab
				navigateToChatTab();

				onboardingService.hide();
				toastService.info({
					title: "Welcome to Zodiac!",
					text: "You're all set~"
				});
			}
		})();
	});
}

/**
 * Apply default settings for Easy path onboarding
 */
async function applyEasyPathSettings(): Promise<void> {
	const access = await getOnboardingModelAccess();

	// Set Easy path defaults in localStorage
	localStorage.setItem(SETTINGS_STORAGE_KEYS.AUTOSCROLL, "true");
	localStorage.setItem(SETTINGS_STORAGE_KEYS.STREAM_RESPONSES, "true");
	localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, getDefaultChatModel(access));
	localStorage.setItem(SETTINGS_STORAGE_KEYS.MAX_TOKENS, "1000");
	localStorage.setItem(SETTINGS_STORAGE_KEYS.ENABLE_THINKING, "true");
	localStorage.setItem(SETTINGS_STORAGE_KEYS.THINKING_BUDGET, "500");
	localStorage.setItem(SETTINGS_STORAGE_KEYS.TEMPERATURE, "60"); // Temperature is stored as 0-100, 0.6 = 60

	// Reload settings to apply changes to UI
	settingsService.loadSettings();
}

/**
 * Apply theme settings from onboarding state to persist them
 */
function applyThemeSettings(): void {
	const selectedTheme = onboardingService.getSelectedTheme();
	const selectedMode = onboardingService.getSelectedMode();
	const selectedPreference = onboardingService.getSelectedPreference();

	// Apply theme settings if they were selected during onboarding
	if (selectedTheme) {
		themeService.setColorTheme(selectedTheme);
	}

	if (selectedMode && selectedPreference) {
		if (selectedPreference === "auto") {
			themeService.setAutoMode();
		} else {
			themeService.setMode(selectedMode, "manual");
		}
	}
}

/**
 * Navigate to the Chats tab in the sidebar
 */
function navigateToChatTab(): void {
	const navbar = document.querySelector<HTMLElement>('.navbar[data-target-id="sidebar-content"]');
	if (!navbar) return;

	const chatsTab = navbar.querySelector<HTMLElement>(".navbar-tab:first-child");
	if (chatsTab) {
		chatsTab.click();
	}
}

/**
 * Render summary step based on whether subscription was selected
 */
function renderSummary(): void {
	const selectedPriceId = onboardingService.getSelectedPriceId();
	const selectedSubscriptionSummary = getSubscriptionSummaryFromPriceId(selectedPriceId);

	if (selectedPriceId) {
		// Subscription flow
		summaryApiKeyContent!.classList.add("hidden");
		summarySubscriptionContent!.classList.remove("hidden");
		summarySubscriptionHeadline!.textContent = selectedSubscriptionSummary
			? `You'll be redirected to checkout to start ${selectedSubscriptionSummary.planLabel}.`
			: "You'll be redirected to checkout to complete your subscription.";
		summarySubscriptionSelection!.textContent = selectedSubscriptionSummary
			? `${selectedSubscriptionSummary.planLabel} plan - ${selectedSubscriptionSummary.billingLabel} billing - encrypted cloud sync included`
			: "Encrypted cloud sync is included with your subscription.";
		summaryFinishButton!.textContent = "Continue to Checkout";
	} else {
		// API key flow
		summaryApiKeyContent!.classList.remove("hidden");
		summarySubscriptionContent!.classList.add("hidden");
		summarySubscriptionHeadline!.textContent = "You'll be redirected to checkout to complete your subscription.";
		summarySubscriptionSelection!.textContent = "Encrypted cloud sync is included with your subscription.";
		summaryFinishButton!.textContent = "Start Chatting";
	}
}

function setupSubscriptionConfirmation(): void {
	subscriptionAutoLoginButton!.addEventListener("click", () => {
		void (async () => {
			const credentials = onboardingService.getPendingCredentials();

			if (!credentials) {
				showSubscriptionStatus(
					"We couldn't find your saved credentials. Use a different account to continue.",
					"error"
				);
				return;
			}

			const originalText = subscriptionAutoLoginButton!.textContent ?? "I've confirmed my email";
			subscriptionAutoLoginButton!.disabled = true;
			subscriptionAutoLoginButton!.textContent = "Signing in...";
			showSubscriptionStatus("Signing you in...", "loading");

			try {
				await supabaseService.login(credentials.email, credentials.password);
				onboardingService.setRegistrationCompleted(true);
				onboardingService.setPendingCredentials(null);

				showSubscriptionStatus("You're signed in! Redirecting...", "success");

				// Check if user already has a paid subscription (edge case)
				const user = await supabaseService.getCurrentUser();
				const subscription = await supabaseService.getUserSubscription();
				const tier = supabaseService.getSubscriptionTier(subscription);

				if (tier === "pro" || tier === "pro_plus" || tier === "max") {
					// User already has subscription, show account selector
					toastService.info({
						title: "Signed in",
						text: "Welcome back! You're ready to continue."
					});
					await prepareAccountSelector(user, subscription, tier);
					onboardingService.goToStep(OnboardingStep.ACCOUNT_SELECTOR);
				} else {
					// User is Free tier, route based on setup option
					const setupOption = onboardingService.getState().setupOption;

					if (setupOption === "subscription") {
						// Subscription flow - go to plan selection
						toastService.info({
							title: "Signed in",
							text: "You're ready to explore Zodiac Pro."
						});
						onboardingService.goToStep(OnboardingStep.PLAN_SELECTION);
					} else {
						// API key flow - go to summary
						toastService.info({
							title: "Signed in",
							text: "Welcome! You're all set."
						});
						await routeToCloudSyncOrSettings();
					}
				}
			} catch (error) {
				console.error("Automatic login failed:", error);
				showSubscriptionStatus((error as Error).message || "Login failed, please try again.", "error");
			} finally {
				subscriptionAutoLoginButton!.disabled = false;
				subscriptionAutoLoginButton!.textContent = originalText;
			}
		})();
	});

	subscriptionReturnButton!.addEventListener("click", () => {
		// Clear pending credentials when user returns to try a different account
		onboardingService.setPendingCredentials(null);
		onboardingService.goToStep(OnboardingStep.REGISTRATION);
		prepareRegistrationStep("login", { focus: true });
	});
}

function setupCloudSyncSetup(): void {
	const updateCloudSyncInputState = () => {
		if (onboardingCloudSyncMode === "unlock" || onboardingCloudSyncMode === "enable") {
			cloudSyncPasswordInput!.disabled = false;
			cloudSyncPasswordConfirmInput!.disabled = true;
			cloudSyncSkipButton!.classList.remove("hidden");
			return;
		}

		const enableSync = cloudSyncEnableCheckbox!.checked;
		cloudSyncPasswordInput!.disabled = !enableSync;
		cloudSyncPasswordConfirmInput!.disabled = !enableSync;
		cloudSyncSkipButton!.classList.toggle("hidden", !enableSync);
	};

	const resetCloudSyncStatus = () => {
		cloudSyncStatus!.classList.add("hidden");
		cloudSyncStatus!.classList.remove("status-loading", "status-success", "status-error");
		cloudSyncStatus!.textContent = "";
	};

	const showCloudSyncStatus = (message: string, type: "loading" | "success" | "error") => {
		resetCloudSyncStatus();
		cloudSyncStatus!.textContent = message;
		cloudSyncStatus!.classList.remove("hidden");
		cloudSyncStatus!.classList.add(`status-${type}`);
	};

	cloudSyncEnableCheckbox!.addEventListener("change", () => {
		if (onboardingCloudSyncMode !== "setup") {
			return;
		}

		updateCloudSyncInputState();
		resetCloudSyncStatus();
	});

	cloudSyncPasswordInput!.addEventListener("input", resetCloudSyncStatus);
	cloudSyncPasswordConfirmInput!.addEventListener("input", resetCloudSyncStatus);

	cloudSyncSkipButton!.addEventListener("click", () => {
		void (async () => {
			if (onboardingCloudSyncMode === "setup") {
				syncService.markSyncPromptSeen();
			}
			await routeToSettingsOrSummary();
		})();
	});

	cloudSyncContinueButton!.addEventListener("click", () => {
		void (async () => {
			if (onboardingCloudSyncMode === "unlock") {
				const password = cloudSyncPasswordInput!.value;
				if (!password) {
					showCloudSyncStatus("Password is required.", "error");
					return;
				}

				cloudSyncContinueButton!.disabled = true;
				cloudSyncContinueButton!.textContent = "Unlocking...";
				showCloudSyncStatus("Unlocking cloud sync...", "loading");

				try {
					const unlockSuccess = await syncService.unlock(password);
					if (!unlockSuccess) {
						showCloudSyncStatus("Incorrect password. Please try again.", "error");
						return;
					}

					const didApplySyncedSettings = await syncService.applySyncedSettingsToLocalStorage();
					if (didApplySyncedSettings) {
						settingsService.loadSettings();
						themeService.reloadFromStorage();
					}

					await syncService.pullAll();
					settingsService.loadSettings();
					themeService.reloadFromStorage();

					showCloudSyncStatus("Synced settings loaded.", "success");
					await routeToSettingsOrSummary();
				} finally {
					cloudSyncContinueButton!.disabled = false;
					cloudSyncContinueButton!.textContent = "Unlock and Continue";
				}
				return;
			}

			if (onboardingCloudSyncMode === "enable") {
				const password = cloudSyncPasswordInput!.value;
				if (!password) {
					showCloudSyncStatus("Password is required.", "error");
					return;
				}

				cloudSyncContinueButton!.disabled = true;
				cloudSyncContinueButton!.textContent = "Re-enabling...";
				showCloudSyncStatus("Re-enabling cloud sync...", "loading");

				try {
					const enableSuccess = await syncService.enableSync(password, { strategy: "pull-remote" });
					if (!enableSuccess) {
						showCloudSyncStatus("Incorrect password. Please try again.", "error");
						return;
					}

					hasCloudSyncEnabledForCurrentUser = true;
					const didApplySyncedSettings = await syncService.applySyncedSettingsToLocalStorage();
					if (didApplySyncedSettings) {
						settingsService.loadSettings();
						themeService.reloadFromStorage();
					}
					settingsService.loadSettings();
					themeService.reloadFromStorage();

					showCloudSyncStatus("Cloud sync re-enabled.", "success");
					await routeToSettingsOrSummary();
				} finally {
					cloudSyncContinueButton!.disabled = false;
					cloudSyncContinueButton!.textContent = "Re-enable and Continue";
				}
				return;
			}

			if (!cloudSyncEnableCheckbox!.checked) {
				syncService.markSyncPromptSeen();
				await routeToSettingsOrSummary();
				return;
			}

			const password = cloudSyncPasswordInput!.value;
			const passwordConfirm = cloudSyncPasswordConfirmInput!.value;

			if (!password) {
				showCloudSyncStatus("Password is required.", "error");
				return;
			}

			if (password.length < 8) {
				showCloudSyncStatus("Password must be at least 8 characters.", "error");
				return;
			}

			if (password !== passwordConfirm) {
				showCloudSyncStatus("Passwords do not match.", "error");
				return;
			}

			cloudSyncContinueButton!.disabled = true;
			cloudSyncContinueButton!.textContent = "Setting up...";
			showCloudSyncStatus("Setting up cloud sync...", "loading");

			try {
				const success = await syncService.setupSync(password);
				if (!success) {
					showCloudSyncStatus("Setup failed. Please try again.", "error");
					return;
				}

				syncService.markSyncPromptSeen();
				await syncService.pullAll();
				settingsService.loadSettings();
				themeService.reloadFromStorage();
				showCloudSyncStatus("Cloud sync enabled.", "success");
				await routeToSettingsOrSummary();
			} finally {
				cloudSyncContinueButton!.disabled = false;
				cloudSyncContinueButton!.textContent = "Continue";
			}
		})();
	});

	applyCloudSyncModeUi(onboardingCloudSyncMode);
	updateCloudSyncInputState();
}

function applyCloudSyncModeUi(mode: OnboardingCloudSyncMode): void {
	if (mode === "unlock") {
		cloudSyncTitle!.textContent = "Unlock Cloud Sync";
		cloudSyncSubtitle!.textContent = "Enter your encryption password to load your synced settings";
		cloudSyncEnableGroup!.classList.add("hidden");
		cloudSyncPasswordConfirmGroup!.classList.add("hidden");
		cloudSyncSkipButton!.classList.remove("hidden");
		cloudSyncSkipButton!.textContent = "Continue without synced settings";
		cloudSyncContinueButton!.textContent = "Unlock and Continue";
		return;
	}

	if (mode === "enable") {
		cloudSyncTitle!.textContent = "Re-enable Cloud Sync";
		cloudSyncSubtitle!.textContent =
			"Encrypted cloud data already exists. Re-enable sync with your encryption password.";
		cloudSyncEnableGroup!.classList.add("hidden");
		cloudSyncPasswordConfirmGroup!.classList.add("hidden");
		cloudSyncSkipButton!.classList.remove("hidden");
		cloudSyncSkipButton!.textContent = "Keep Sync Disabled";
		cloudSyncContinueButton!.textContent = "Re-enable and Continue";
		return;
	}

	cloudSyncTitle!.textContent = "Enable Cloud Sync";
	cloudSyncSubtitle!.textContent = "Included with Pro, Pro Plus, and Max — set it up now or keep data local";
	cloudSyncEnableGroup!.classList.remove("hidden");
	cloudSyncPasswordConfirmGroup!.classList.remove("hidden");
	cloudSyncSkipButton!.textContent = "Keep Data Local";
	cloudSyncContinueButton!.textContent = "Continue";
}

function prepareCloudSyncSetupStep(mode: OnboardingCloudSyncMode): void {
	onboardingCloudSyncMode = mode;

	applyCloudSyncModeUi(onboardingCloudSyncMode);

	cloudSyncEnableCheckbox!.checked = true;
	cloudSyncPasswordInput!.value = "";
	cloudSyncPasswordConfirmInput!.value = "";
	cloudSyncPasswordInput!.disabled = false;
	cloudSyncPasswordConfirmInput!.disabled = onboardingCloudSyncMode !== "setup";
	cloudSyncSkipButton!.classList.remove("hidden");
	cloudSyncStatus!.classList.add("hidden");
	cloudSyncStatus!.classList.remove("status-loading", "status-success", "status-error");
	cloudSyncStatus!.textContent = "";
}

async function routeToCloudSyncOrSettings(): Promise<void> {
	const cloudSyncMode = await getOnboardingCloudSyncMode();
	if (cloudSyncMode) {
		prepareCloudSyncSetupStep(cloudSyncMode);
		onboardingService.goToStep(OnboardingStep.CLOUD_SYNC_SETUP);
		return;
	}

	const shouldPromptUnlock = await hydrateRemoteSettingsForOnboarding();
	if (shouldPromptUnlock) {
		prepareCloudSyncSetupStep("unlock");
		onboardingService.goToStep(OnboardingStep.CLOUD_SYNC_SETUP);
		return;
	}

	await routeToSettingsOrSummary();
}

async function hydrateRemoteSettingsForOnboarding(): Promise<boolean> {
	const user = await supabaseService.getCurrentUser();
	if (!user) {
		hasCloudSyncEnabledForCurrentUser = false;
		return false;
	}

	const subscription = await supabaseService.getUserSubscription();
	const tier = supabaseService.getSubscriptionTier(subscription);
	if (!isCloudSyncEligibleTier(tier)) {
		hasCloudSyncEnabledForCurrentUser = false;
		return false;
	}

	const preferences = await syncService.fetchSyncPreferences();
	hasCloudSyncEnabledForCurrentUser = preferences?.syncEnabled === true;

	if (!hasCloudSyncEnabledForCurrentUser) {
		return false;
	}

	const didApplySyncedSettings = await syncService.applySyncedSettingsToLocalStorage();
	if (didApplySyncedSettings) {
		settingsService.loadSettings();
		return false;
	}

	return true;
}

/**
 * Advanced settings step handlers (Power User Path)
 */
function setupAdvancedSettings(): void {
	let hasCustomThinkingBudget = false;
	let maxOutputTokensValidationTimer: ReturnType<typeof setTimeout> | null = null;
	let thinkingBudgetValidationTimer: ReturnType<typeof setTimeout> | null = null;

	const calculateRecommendedThinkingBudget = (maxOutputTokens: number): number => {
		return Math.max(128, Math.floor(maxOutputTokens * 0.5));
	};

	const applyRecommendedThinkingBudgetFromCurrentOutput = (options?: { clampOutput?: boolean }) => {
		if (options?.clampOutput) {
			clampMaxOutputTokens();
		}

		if (hasCustomThinkingBudget) {
			return;
		}

		const parsedMaxOutputTokens = parseInt(advancedMaxOutputTokens!.value, 10);
		if (isNaN(parsedMaxOutputTokens)) {
			return;
		}

		const recommendedThinkingBudget = calculateRecommendedThinkingBudget(parsedMaxOutputTokens);
		advancedThinkingBudget!.value = recommendedThinkingBudget.toString();
	};

	const clampMaxOutputTokens = () => {
		const parsedValue = parseInt(advancedMaxOutputTokens!.value, 10);
		if (isNaN(parsedValue) || parsedValue < 128) {
			advancedMaxOutputTokens!.value = "128";
			return;
		}

		if (parsedValue > 65536) {
			advancedMaxOutputTokens!.value = "65536";
			return;
		}

		advancedMaxOutputTokens!.value = parsedValue.toString();
	};

	// Load current or default settings
	const loadDefaultSettings = async () => {
		const access = await getOnboardingModelAccess();
		await refreshOnboardingModelOptions(localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL) || undefined);
		advancedModelSelect!.value = getValidChatModel(localStorage.getItem(SETTINGS_STORAGE_KEYS.MODEL), access);
		advancedTemperature!.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.TEMPERATURE) || "60";
		updateTemperatureDisplay();
		advancedMaxOutputTokens!.value = localStorage.getItem(SETTINGS_STORAGE_KEYS.MAX_TOKENS) || "1000";
		clampMaxOutputTokens();
		advancedThinkingEnabled!.checked = localStorage.getItem(SETTINGS_STORAGE_KEYS.ENABLE_THINKING) !== "false";
		const maxOutputTokens = parseInt(advancedMaxOutputTokens!.value, 10);
		const recommendedThinkingBudget = calculateRecommendedThinkingBudget(maxOutputTokens);
		const storedThinkingBudget = localStorage.getItem(SETTINGS_STORAGE_KEYS.THINKING_BUDGET);
		if (storedThinkingBudget === null) {
			advancedThinkingBudget!.value = recommendedThinkingBudget.toString();
			hasCustomThinkingBudget = false;
		} else {
			const parsedThinkingBudget = parseInt(storedThinkingBudget, 10);
			const isValidThinkingBudget =
				!isNaN(parsedThinkingBudget) && (parsedThinkingBudget >= 128 || parsedThinkingBudget === -1);

			if (!isValidThinkingBudget) {
				advancedThinkingBudget!.value = recommendedThinkingBudget.toString();
				hasCustomThinkingBudget = false;
			} else {
				advancedThinkingBudget!.value = parsedThinkingBudget.toString();
				hasCustomThinkingBudget = parsedThinkingBudget !== recommendedThinkingBudget;
			}
		}
		advancedAutoscroll!.checked = localStorage.getItem(SETTINGS_STORAGE_KEYS.AUTOSCROLL) !== "false";
		advancedStreamResponses!.checked = localStorage.getItem(SETTINGS_STORAGE_KEYS.STREAM_RESPONSES) !== "false";
		advancedRpgGroupChatsProgressAutomatically!.checked =
			(localStorage.getItem(SETTINGS_STORAGE_KEYS.RPG_GROUP_CHATS_PROGRESS_AUTOMATICALLY) ?? "false") === "true";
		advancedDisallowPersonaPinging!.checked =
			(localStorage.getItem(SETTINGS_STORAGE_KEYS.DISALLOW_PERSONA_PINGING) ?? "false") === "true";
		advancedDynamicGroupChatPingOnly!.checked =
			(localStorage.getItem(SETTINGS_STORAGE_KEYS.DYNAMIC_GROUP_CHAT_PING_ONLY) ?? "false") === "true";

		// Trigger model change to set thinking restrictions
		updateThinkingRestrictions();
		updateThinkingBudgetState();
	};

	// Update temperature display
	const updateTemperatureDisplay = () => {
		const value = parseInt(advancedTemperature!.value);
		const temp = (value / 100).toFixed(2);
		advancedTemperatureValue!.textContent = temp;
	};

	// Update thinking restrictions based on selected model (mirroring ThinkingSelector.component.ts)
	const updateThinkingRestrictions = () => {
		const selectedModel = advancedModelSelect!.value;

		if (modelRequiresThinking(selectedModel)) {
			advancedThinkingEnabled!.checked = true;
			advancedThinkingEnabled!.disabled = true;
			advancedThinkingHint!.style.display = "";
			advancedThinkingHint!.textContent = "Thinking is required for this model.";
		} else if (!modelSupportsThinking(selectedModel)) {
			advancedThinkingEnabled!.checked = false;
			advancedThinkingEnabled!.disabled = true;
			advancedThinkingHint!.style.display = "";
			advancedThinkingHint!.textContent = "Thinking is not available for this model.";
		} else {
			advancedThinkingEnabled!.disabled = false;
			advancedThinkingHint!.style.display = "none";
		}

		// Update thinking budget state after changing checkbox
		updateThinkingBudgetState();
	};

	// Update thinking budget input state based on checkbox
	const updateThinkingBudgetState = () => {
		advancedThinkingBudget!.disabled = !advancedThinkingEnabled!.checked;
	};

	// Validate thinking budget input
	const validateThinkingBudget = () => {
		const value = parseInt(advancedThinkingBudget!.value);
		if (isNaN(value) || (value < 128 && value !== -1)) {
			advancedThinkingBudget!.value = "128";
		}
	};

	// Temperature slider handler
	advancedTemperature!.addEventListener("input", updateTemperatureDisplay);

	// Max output tokens handlers
	advancedMaxOutputTokens!.addEventListener("input", () => {
		applyRecommendedThinkingBudgetFromCurrentOutput();

		if (maxOutputTokensValidationTimer) {
			clearTimeout(maxOutputTokensValidationTimer);
		}

		maxOutputTokensValidationTimer = setTimeout(() => {
			applyRecommendedThinkingBudgetFromCurrentOutput({ clampOutput: true });
			maxOutputTokensValidationTimer = null;
		}, 1000);
	});

	advancedMaxOutputTokens!.addEventListener("change", () => {
		if (maxOutputTokensValidationTimer) {
			clearTimeout(maxOutputTokensValidationTimer);
			maxOutputTokensValidationTimer = null;
		}

		applyRecommendedThinkingBudgetFromCurrentOutput({ clampOutput: true });
	});

	// Model selector handler
	advancedModelSelect!.addEventListener("change", updateThinkingRestrictions);

	// Thinking checkbox handler
	advancedThinkingEnabled!.addEventListener("change", updateThinkingBudgetState);

	// Thinking budget validation
	advancedThinkingBudget!.addEventListener("input", () => {
		hasCustomThinkingBudget = true;

		if (thinkingBudgetValidationTimer) {
			clearTimeout(thinkingBudgetValidationTimer);
		}

		thinkingBudgetValidationTimer = setTimeout(() => {
			validateThinkingBudget();
			thinkingBudgetValidationTimer = null;
		}, 1000);
	});

	advancedThinkingBudget!.addEventListener("change", () => {
		hasCustomThinkingBudget = true;

		if (thinkingBudgetValidationTimer) {
			clearTimeout(thinkingBudgetValidationTimer);
			thinkingBudgetValidationTimer = null;
		}

		validateThinkingBudget();
	});

	// Continue button (page 1) - proceed to behavior settings
	advancedPrimaryContinueButton!.addEventListener("click", () => {
		onboardingService.goToStep(OnboardingStep.ADVANCED_SETTINGS_BEHAVIOR);
	});

	// Continue button (page 2) - save settings and go to summary
	advancedBehaviorContinueButton!.addEventListener("click", () => {
		if (maxOutputTokensValidationTimer) {
			clearTimeout(maxOutputTokensValidationTimer);
			maxOutputTokensValidationTimer = null;
		}

		if (thinkingBudgetValidationTimer) {
			clearTimeout(thinkingBudgetValidationTimer);
			thinkingBudgetValidationTimer = null;
		}

		clampMaxOutputTokens();
		validateThinkingBudget();

		// Save all settings to localStorage
		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, advancedModelSelect!.value);
		localStorage.setItem(SETTINGS_STORAGE_KEYS.TEMPERATURE, advancedTemperature!.value);
		localStorage.setItem(SETTINGS_STORAGE_KEYS.MAX_TOKENS, advancedMaxOutputTokens!.value);
		localStorage.setItem(SETTINGS_STORAGE_KEYS.ENABLE_THINKING, advancedThinkingEnabled!.checked.toString());
		localStorage.setItem(SETTINGS_STORAGE_KEYS.THINKING_BUDGET, advancedThinkingBudget!.value);
		localStorage.setItem(SETTINGS_STORAGE_KEYS.AUTOSCROLL, advancedAutoscroll!.checked.toString());
		localStorage.setItem(SETTINGS_STORAGE_KEYS.STREAM_RESPONSES, advancedStreamResponses!.checked.toString());
		localStorage.setItem(
			SETTINGS_STORAGE_KEYS.RPG_GROUP_CHATS_PROGRESS_AUTOMATICALLY,
			advancedRpgGroupChatsProgressAutomatically!.checked.toString()
		);
		localStorage.setItem(
			SETTINGS_STORAGE_KEYS.DISALLOW_PERSONA_PINGING,
			advancedDisallowPersonaPinging!.checked.toString()
		);
		localStorage.setItem(
			SETTINGS_STORAGE_KEYS.DYNAMIC_GROUP_CHAT_PING_ONLY,
			advancedDynamicGroupChatPingOnly!.checked.toString()
		);

		// Reload settings to apply changes to UI
		settingsService.loadSettings();

		// Go to summary
		onboardingService.goToStep(OnboardingStep.SUMMARY);
		renderSummary();
	});

	// Load defaults when the advanced settings step is shown
	// This will be called from wherever the step transition happens
	refreshAdvancedSettingsFromStorage = () => {
		void loadDefaultSettings();
	};
	void loadDefaultSettings();
}

/**
 * Helper: Route to either Advanced Settings (Power path) or Summary (Easy path)
 */
async function routeToSettingsOrSummary(): Promise<void> {
	const selectedPath = onboardingService.getState().selectedPath;

	if (selectedPath === OnboardingPath.POWER) {
		refreshAdvancedSettingsFromStorage?.();
		// Power path - show advanced settings first page
		onboardingService.goToStep(OnboardingStep.ADVANCED_SETTINGS_PRIMARY);
	} else {
		// Easy path - go straight to summary
		onboardingService.goToStep(OnboardingStep.SUMMARY);
		renderSummary();
	}
}

/**
 * Helper: Show API key validation status
 */
function showApiKeyStatus(element: HTMLDivElement, message: string, type: "loading" | "success" | "error"): void {
	element.textContent = message;
	element.classList.remove("hidden", "status-loading", "status-success", "status-error");
	element.classList.add(`status-${type}`);
}

/**
 * Helper: Hide API key status
 */
function hideApiKeyStatus(element: HTMLDivElement): void {
	element.classList.add("hidden");
	element.classList.remove("status-loading", "status-success", "status-error");
	element.textContent = "";
}

/**
 * Helper: Show registration error
 */
function showRegisterError(message: string): void {
	const errorMessage = registerError!.querySelector<HTMLSpanElement>("#onboarding-register-error-message");
	if (errorMessage) {
		errorMessage.textContent = message;
	}
	registerError!.classList.remove("hidden");
}

function showLoginError(message: string): void {
	const errorMessage = registerLoginError!.querySelector<HTMLSpanElement>("#onboarding-login-error-message");
	if (errorMessage) {
		errorMessage.textContent = message;
	}
	registerLoginError!.classList.remove("hidden");
}

function resetLoginError(): void {
	registerLoginError!.classList.add("hidden");
}

function resetRegistrationFeedback(): void {
	registerError!.classList.add("hidden");
	resetLoginError();
}

function prepareRegistrationStep(mode: AuthMode = "register", options: { focus?: boolean } = {}): void {
	resetRegistrationFeedback();
	setAuthMode(mode, { focus: options.focus });
	registerSubmitButton!.textContent = "Register";
}

function setAuthMode(mode: AuthMode, options: { focus?: boolean } = {}): void {
	activeAuthMode = mode;
	const isRegister = mode === "register";
	const tabs = registerTabsContainer
		? Array.from(registerTabsContainer.querySelectorAll<HTMLElement>(".navbar-tab"))
		: [];
	const targetIndex = isRegister ? 0 : 1;

	if (registerTabsHighlight && tabs.length > 0) {
		const highlightInset = "0.1875rem";
		const availableWidth = `calc(100% - (${highlightInset} * 2))`;
		registerTabsHighlight.style.width = `calc(${availableWidth} / ${tabs.length})`;
		registerTabsHighlight.style.left = `calc(${highlightInset} + ((${availableWidth} / ${tabs.length}) * ${targetIndex}))`;
	}

	tabs.forEach((tab, index) => {
		const isActive = index === targetIndex;
		tab.classList.toggle("navbar-tab-active", isActive);
		tab.setAttribute("aria-selected", isActive ? "true" : "false");
		tab.tabIndex = isActive ? 0 : -1;
	});

	registerPanel!.classList.toggle("hidden", !isRegister);
	registerPanel!.setAttribute("aria-hidden", isRegister ? "false" : "true");
	loginPanel!.classList.toggle("hidden", isRegister);
	loginPanel!.setAttribute("aria-hidden", isRegister ? "true" : "false");

	updateSkipButtonState();

	if (options.focus) {
		if (isRegister) {
			registerEmailInput!.focus();
		} else {
			registerLoginEmailInput!.focus();
		}
	}
}

async function getOnboardingCloudSyncMode(): Promise<OnboardingCloudSyncMode | null> {
	const user = await supabaseService.getCurrentUser();
	if (!user) {
		return null;
	}

	const subscription = await supabaseService.getUserSubscription();
	const tier = supabaseService.getSubscriptionTier(subscription);
	if (!isCloudSyncEligibleTier(tier)) {
		return null;
	}

	const preferences = await syncService.fetchSyncPreferences();
	if (!preferences) {
		return "setup";
	}

	if (preferences.syncEnabled === false) {
		const hasEncryptionMaterial =
			!!preferences.encryptionSalt && !!preferences.keyVerification && !!preferences.keyVerificationIv;
		return hasEncryptionMaterial ? "enable" : "setup";
	}

	return null;
}

function updateSkipButtonState(): void {
	const subscriptionFlow = isSubscriptionFlow();
	const allowSkip = !subscriptionFlow && activeAuthMode === "register";

	registerSkipButton!.classList.toggle("hidden", !allowSkip);
	registerSkipButton!.disabled = !allowSkip;

	if (!allowSkip) {
		registerSkipButton!.setAttribute("aria-hidden", "true");
	} else {
		registerSkipButton!.removeAttribute("aria-hidden");
	}
}

function isSubscriptionFlow(): boolean {
	return onboardingService.getState().setupOption === "subscription";
}

function prepareSubscriptionConfirmation(): void {
	resetSubscriptionStatus();
	const credentials = onboardingService.getPendingCredentials();

	subscriptionAutoLoginButton!.textContent = "I've confirmed my email";

	if (!credentials) {
		subscriptionAutoLoginButton!.disabled = true;
		showSubscriptionStatus(
			"We couldn't find your saved credentials. Use a different account to continue.",
			"error"
		);
		return;
	}

	subscriptionAutoLoginButton!.disabled = false;
}

function showSubscriptionStatus(message: string, type: "loading" | "success" | "error"): void {
	resetSubscriptionStatus();
	subscriptionStatus!.textContent = message;
	subscriptionStatus!.classList.remove("hidden");
	subscriptionStatus!.classList.add(`status-${type}`);
}

function resetSubscriptionStatus(): void {
	subscriptionStatus!.classList.add("hidden");
	subscriptionStatus!.classList.remove("status-loading", "status-success", "status-error");
	subscriptionStatus!.textContent = "";
}

// Initialize the component
initialize();

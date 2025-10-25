/**
 * Onboarding component - handles user interaction and flow logic
 */

import { GoogleGenAI } from "@google/genai";
import { OnboardingPath, OnboardingStep } from "../../models/Onboarding";
import { SubscriptionPriceIDs } from "../../models/Price";
import * as onboardingService from "../../services/Onboarding.service";
import * as supabaseService from "../../services/Supabase.service";
import * as settingsService from "../../services/Settings.service";
import * as toastService from "../../services/Toast.service";

// Path selection buttons
const easyPathButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-easy");
const powerPathButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-power");
const skipOnboardingButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-skip");

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
const confirmDifferentAccountButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-confirm-different-account");

// API vs Subscription choice buttons
const chooseApiKeyButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-choose-api");
const chooseSubscriptionButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-choose-subscription");

// API key setup elements
const apiKeyInput = document.querySelector<HTMLInputElement>("#onboarding-api-key");
const validateApiKeyButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-validate-api");
const apiKeyStatus = document.querySelector<HTMLDivElement>("#onboarding-api-key-status");
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
const registerPanel = document.querySelector<HTMLDivElement>("#onboarding-register-panel");
const loginPanel = document.querySelector<HTMLDivElement>("#onboarding-login-panel");
const registerLoginEmailInput = document.querySelector<HTMLInputElement>("#onboarding-login-email");
const registerLoginPasswordInput = document.querySelector<HTMLInputElement>("#onboarding-login-password");
const registerLoginButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-login-existing");
const registerLoginError = document.querySelector<HTMLDivElement>("#onboarding-login-error");

// Subscription confirmation elements
const selectProButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-select-pro");
const selectMaxButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-select-max");
const subscriptionAutoLoginButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-subscription-auto-login");
const subscriptionReturnButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-subscription-return");
const subscriptionStatus = document.querySelector<HTMLDivElement>("#onboarding-subscription-status");

// Advanced settings elements (Power User Path)
const advancedModelSelect = document.querySelector<HTMLSelectElement>("#onboarding-model-select");
const advancedTemperature = document.querySelector<HTMLInputElement>("#onboarding-temperature");
const advancedTemperatureValue = document.querySelector<HTMLSpanElement>("#onboarding-temperature-value");
const advancedThinkingEnabled = document.querySelector<HTMLInputElement>("#onboarding-thinking-enabled");
const advancedThinkingHint = document.querySelector<HTMLParagraphElement>("#onboarding-thinking-hint");
const advancedThinkingBudget = document.querySelector<HTMLInputElement>("#onboarding-thinking-budget");
const advancedAutoscroll = document.querySelector<HTMLInputElement>("#onboarding-autoscroll");
const advancedStreamResponses = document.querySelector<HTMLInputElement>("#onboarding-stream-responses");
const advancedContinueButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-advanced-continue");

// Summary elements
const summaryFinishButton = document.querySelector<HTMLButtonElement>("#onboarding-btn-finish");
const summaryApiKeyContent = document.querySelector<HTMLDivElement>("#summary-apikey-content");
const summarySubscriptionContent = document.querySelector<HTMLDivElement>("#summary-subscription-content");

// Check all required elements exist
const requiredElements = {
    easyPathButton,
    powerPathButton,
    skipOnboardingButton,
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
    selectProButton,
    selectMaxButton,
    subscriptionAutoLoginButton,
    subscriptionReturnButton,
    subscriptionStatus,
    advancedModelSelect,
    advancedTemperature,
    advancedTemperatureValue,
    advancedThinkingEnabled,
    advancedThinkingHint,
    advancedThinkingBudget,
    advancedAutoscroll,
    advancedStreamResponses,
    advancedContinueButton,
    summaryFinishButton,
    summaryApiKeyContent,
    summarySubscriptionContent
};

for (const [name, element] of Object.entries(requiredElements)) {
    if (!element) {
        console.error(`Onboarding element missing: ${name}`);
        throw new Error(`Onboarding component is not properly initialized: ${name} is missing`);
    }
}

type AuthMode = "register" | "login";
let activeAuthMode: AuthMode = "register";

/**
 * Initialize onboarding component
 */
export function initialize(): void {
    setupPathSelection();
    setupAccountSelector();
    setupAccountConfirmation();
    setupApiOrSubscriptionChoice();
    setupApiKeySetup();
    setupPlanSelection();
    setupRegistration();
    setupSubscriptionConfirmation();
    setupAdvancedSettings();
    setupSummary();
}

/**
 * Path selection step handlers
 */
function setupPathSelection(): void {
    easyPathButton!.addEventListener("click", async () => {
        onboardingService.setPath(OnboardingPath.EASY);
        
        // Check if user is logged in and determine routing
        const user = await supabaseService.getCurrentUser();
        if (user) {
            const subscription = await supabaseService.getUserSubscription();
            const tier = supabaseService.getSubscriptionTier(subscription);
            
            // If user has Pro/Max subscription, show account selector
            if (tier === 'pro' || tier === 'max') {
                await prepareAccountSelector(user, subscription, tier);
                onboardingService.goToStep(OnboardingStep.ACCOUNT_SELECTOR);
                return;
            }
        }
        
        // Otherwise, show normal API or Subscription choice
        onboardingService.goToStep(OnboardingStep.API_OR_SUBSCRIPTION);
    });
    
    powerPathButton!.addEventListener("click", async () => {
        onboardingService.setPath(OnboardingPath.POWER);
        
        // Check if user is logged in and determine routing (same as Easy path)
        const user = await supabaseService.getCurrentUser();
        if (user) {
            const subscription = await supabaseService.getUserSubscription();
            const tier = supabaseService.getSubscriptionTier(subscription);
            
            // If user has Pro/Max subscription, show account selector
            if (tier === 'pro' || tier === 'max') {
                await prepareAccountSelector(user, subscription, tier);
                onboardingService.goToStep(OnboardingStep.ACCOUNT_SELECTOR);
                return;
            }
        }
        
        // Otherwise, show normal API or Subscription choice
        onboardingService.goToStep(OnboardingStep.API_OR_SUBSCRIPTION);
    });

    skipOnboardingButton!.addEventListener("click", () => {
        onboardingService.hide();
    });
}

/**
 * Account selector step handlers (for logged-in Pro/Max users)
 */
function setupAccountSelector(): void {
    continueWithAccountButton!.addEventListener("click", () => {
        // Mark setup as subscription (since they're already subscribed)
        onboardingService.setSetupOption("subscription");
        
        // Route based on selected path (Easy or Power)
        routeToSettingsOrSummary();
    });

    useDifferentAccountButton!.addEventListener("click", async () => {
        // Clear any pending credentials since user is switching accounts
        onboardingService.setPendingCredentials(null);
        // Logout and go back to API_OR_SUBSCRIPTION
        await supabaseService.logout();
        onboardingService.goToStep(OnboardingStep.API_OR_SUBSCRIPTION);
    });
}

/**
 * Account confirmation step handlers (for logged-in users)
 * This is dynamic and changes behavior based on setup option
 */
function setupAccountConfirmation(): void {
    confirmContinueButton!.addEventListener("click", () => {
        const setupOption = onboardingService.getState().setupOption;
        
        if (setupOption === "subscription") {
            // Continue to plan selection for subscription flow
            onboardingService.goToStep(OnboardingStep.PLAN_SELECTION);
        } else if (setupOption === "api-key") {
            // Continue to settings or summary based on path
            routeToSettingsOrSummary();
        }
    });

    confirmDifferentAccountButton!.addEventListener("click", async () => {
        // Clear any pending credentials since user is switching accounts
        onboardingService.setPendingCredentials(null);
        // Logout and show registration/login dialogs
        await supabaseService.logout();
        onboardingService.goToStep(OnboardingStep.REGISTRATION);
        prepareRegistrationStep("login", { focus: true });
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
    accountSelectorEmail!.textContent = user.email || 'No email';
    
    // Set tier badge
    const tierLabel = tier === 'pro' ? 'Pro' : tier === 'max' ? 'Max' : 'Free';
    accountSelectorTierBadge!.textContent = tierLabel;
    accountSelectorTierBadge!.classList.remove('badge-tier-free', 'badge-tier-pro', 'badge-tier-max');
    accountSelectorTierBadge!.classList.add(`badge-tier-${tier}`);
}

/**
 * Prepare account confirmation with user data
 */
async function prepareAccountConfirmation(options?: { 
    title?: string; 
    subtitle?: string; 
}): Promise<void> {
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
    confirmAccountEmail!.textContent = user.email || 'No email';
    
    // Get subscription tier for badge
    const subscription = await supabaseService.getUserSubscription();
    const tier = supabaseService.getSubscriptionTier(subscription);
    const tierLabel = tier === 'pro' ? 'Pro' : tier === 'max' ? 'Max' : 'Free';
    confirmAccountTierBadge!.textContent = tierLabel;
    confirmAccountTierBadge!.classList.remove('badge-tier-free', 'badge-tier-pro', 'badge-tier-max');
    confirmAccountTierBadge!.classList.add(`badge-tier-${tier}`);
}

/**
 * API vs Subscription choice step handlers
 */
function setupApiOrSubscriptionChoice(): void {
    chooseApiKeyButton!.addEventListener("click", async () => {
        onboardingService.setSetupOption("api-key");
        onboardingService.setPendingCredentials(null);
        
        // Prefill API key if it exists in localStorage
        const existingApiKey = localStorage.getItem("API_KEY");
        if (existingApiKey) {
            apiKeyInput!.value = existingApiKey;
        }
        
        onboardingService.goToStep(OnboardingStep.API_KEY_SETUP);
    });
    
    chooseSubscriptionButton!.addEventListener("click", async () => {
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
    });
}

/**
 * API key setup step handlers
 */
function setupApiKeySetup(): void {
    validateApiKeyButton!.addEventListener("click", async () => {
        const apiKey = apiKeyInput!.value.trim();
        
        if (!apiKey) {
            showApiKeyStatus("Please enter an API key", "error");
            return;
        }
        
        // Disable button and show loading state
        validateApiKeyButton!.disabled = true;
        validateApiKeyButton!.textContent = "Validating...";
        showApiKeyStatus("Testing your API key...", "loading");
        
        try {
            // Test the API key with a simple call to Gemini 2.5 Flash Lite
            const ai = new GoogleGenAI({ apiKey });
            await ai.models.generateContent({
                model: "gemini-flash-lite-latest",
                contents: "Say 'Hello' in one word."
            });
            
            // Success!
            showApiKeyStatus("✓ API key is valid!", "success");
            onboardingService.setApiKeyValidated(true);
            
            // Save to localStorage
            localStorage.setItem("API_KEY", apiKey);
            settingsService.loadSettings();
            
            // Enable next button
            apiKeyNextButton!.disabled = false;
            
            // Scroll to bottom to reveal the Continue button (wait for browser paint)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const onboardingOverlay = document.querySelector("#onboarding-overlay");
                    if (onboardingOverlay) {
                        onboardingOverlay.scrollTo({ top: onboardingOverlay.scrollHeight, behavior: 'smooth' });
                    }
                });
            });
        } catch (error) {
            console.error("API key validation failed:", error);
            showApiKeyStatus("✗ Invalid API key. Please check and try again.", "error");
            onboardingService.setApiKeyValidated(false);
            apiKeyNextButton!.disabled = true;
        } finally {
            validateApiKeyButton!.disabled = false;
            validateApiKeyButton!.textContent = "Validate API Key";
        }
    });
    
    apiKeyNextButton!.addEventListener("click", async () => {
        if (!onboardingService.getState().apiKeyValidated) {
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
    });
    
    // Reset next button state when input changes
    apiKeyInput!.addEventListener("input", () => {
        apiKeyNextButton!.disabled = true;
        onboardingService.setApiKeyValidated(false);
        hideApiKeyStatus();
    });
}

/**
 * Plan selection step handlers (for subscription flow)
 */
function setupPlanSelection(): void {
    selectProButton!.addEventListener("click", () => {
        onboardingService.setSelectedPriceId(SubscriptionPriceIDs.PRO_MONTHLY);
        routeToSettingsOrSummary();
    });

    selectMaxButton!.addEventListener("click", () => {
        // Max tier coming soon - button is disabled but add guard just in case
        if (selectMaxButton!.disabled) {
            return;
        }
        onboardingService.setSelectedPriceId(SubscriptionPriceIDs.MAX_MONTHLY);
        routeToSettingsOrSummary();
    });
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

    registerSubmitButton!.addEventListener("click", async (e) => {
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
    });
    
    registerSkipButton!.addEventListener("click", () => {
        if (registerSkipButton!.disabled) {
            return;
        }

        onboardingService.setRegistrationCompleted(false);
        onboardingService.setPendingCredentials(null);
        routeToSettingsOrSummary();
    });

    registerLoginButton!.addEventListener("click", async (event) => {
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
                
                if (tier === 'pro' || tier === 'max') {
                    // User already has subscription, show account selector
                    await prepareAccountSelector(user, subscription, tier);
                    onboardingService.goToStep(OnboardingStep.ACCOUNT_SELECTOR);
                } else {
                    // User is Free tier, continue to plan selection
                    onboardingService.goToStep(OnboardingStep.PLAN_SELECTION);
                }
            } else {
                routeToSettingsOrSummary();
            }
        } catch (error) {
            console.error("Login failed:", error);
            showLoginError((error as Error).message || "Login failed, please try again");
        } finally {
            registerLoginButton!.disabled = false;
            registerLoginButton!.textContent = originalText;
        }
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
        [SubscriptionPriceIDs.MAX_MONTHLY]: "max_monthly",
        [SubscriptionPriceIDs.MAX_YEARLY]: "max_yearly"
    };
    return mapping[priceId] || null;
}

/**
 * Summary step handlers
 */
function setupSummary(): void {
    summaryFinishButton!.addEventListener("click", async () => {
        const selectedPriceId = onboardingService.getSelectedPriceId();
        
        // Apply Easy path settings for ALL outcomes
        const selectedPath = onboardingService.getState().selectedPath;
        if (selectedPath === OnboardingPath.EASY) {
            applyEasyPathSettings();
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

                // Redirect to Stripe checkout
                window.location.href = url;
            } catch (error) {
                console.error("Checkout error:", error);
                summaryFinishButton!.disabled = false;
                summaryFinishButton!.textContent = "Complete Checkout";
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
    });
}

/**
 * Apply default settings for Easy path onboarding
 */
function applyEasyPathSettings(): void {
    // Set Easy path defaults in localStorage
    localStorage.setItem("autoscroll", "true");
    localStorage.setItem("streamResponses", "true");
    localStorage.setItem("model", "gemini-flash-latest");
    localStorage.setItem("maxTokens", "1000");
    localStorage.setItem("enableThinking", "true");
    localStorage.setItem("thinkingBudget", "500");
    localStorage.setItem("TEMPERATURE", "60"); // Temperature is stored as 0-100, 0.6 = 60
    
    // Reload settings to apply changes to UI
    settingsService.loadSettings();
}

/**
 * Navigate to the Chats tab in the sidebar
 */
function navigateToChatTab(): void {
    const navbar = document.querySelector<HTMLElement>('.navbar[data-target-id="sidebar-content"]');
    if (!navbar) return;
    
    const chatsTab = navbar.querySelector<HTMLElement>('.navbar-tab:first-child');
    if (chatsTab) {
        chatsTab.click();
    }
}

/**
 * Render summary step based on whether subscription was selected
 */
function renderSummary(): void {
    const selectedPriceId = onboardingService.getSelectedPriceId();
    
    if (selectedPriceId) {
        // Subscription flow
        summaryApiKeyContent!.classList.add("hidden");
        summarySubscriptionContent!.classList.remove("hidden");
        summaryFinishButton!.textContent = "Complete Checkout";
    } else {
        // API key flow
        summaryApiKeyContent!.classList.remove("hidden");
        summarySubscriptionContent!.classList.add("hidden");
        summaryFinishButton!.textContent = "Start Chatting";
    }
}

function setupSubscriptionConfirmation(): void {
    subscriptionAutoLoginButton!.addEventListener("click", async () => {
        const credentials = onboardingService.getPendingCredentials();

        if (!credentials) {
            showSubscriptionStatus("We couldn't find your saved credentials. Use a different account to continue.", "error");
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
            
            // Check if user already has a Pro/Max subscription (edge case)
            const user = await supabaseService.getCurrentUser();
            const subscription = await supabaseService.getUserSubscription();
            const tier = supabaseService.getSubscriptionTier(subscription);
            
            if (tier === 'pro' || tier === 'max') {
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
                
                if (setupOption === 'subscription') {
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
                    routeToSettingsOrSummary();
                }
            }
        } catch (error) {
            console.error("Automatic login failed:", error);
            showSubscriptionStatus((error as Error).message || "Login failed, please try again.", "error");
        } finally {
            subscriptionAutoLoginButton!.disabled = false;
            subscriptionAutoLoginButton!.textContent = originalText;
        }
    });

    subscriptionReturnButton!.addEventListener("click", () => {
        // Clear pending credentials when user returns to try a different account
        onboardingService.setPendingCredentials(null);
        onboardingService.goToStep(OnboardingStep.REGISTRATION);
        prepareRegistrationStep("login", { focus: true });
    });
}

/**
 * Advanced settings step handlers (Power User Path)
 */
function setupAdvancedSettings(): void {
    // Load current or default settings
    const loadDefaultSettings = () => {
        advancedModelSelect!.value = localStorage.getItem("model") || "gemini-flash-latest";
        advancedTemperature!.value = localStorage.getItem("TEMPERATURE") || "60";
        updateTemperatureDisplay();
        advancedThinkingEnabled!.checked = localStorage.getItem("enableThinking") !== "false";
        advancedThinkingBudget!.value = localStorage.getItem("thinkingBudget") || "500";
        advancedAutoscroll!.checked = localStorage.getItem("autoscroll") !== "false";
        advancedStreamResponses!.checked = localStorage.getItem("streamResponses") !== "false";
        
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
        
        if (selectedModel === "gemini-2.5-pro") {
            // Pro model: force thinking enabled
            advancedThinkingEnabled!.checked = true;
            advancedThinkingEnabled!.disabled = true;
            advancedThinkingHint!.style.display = '';
            advancedThinkingHint!.textContent = "Thinking is required for this model.";
        } else {
            // Other models: thinking is optional
            advancedThinkingEnabled!.disabled = false;
            advancedThinkingHint!.style.display = 'none';
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

    // Model selector handler
    advancedModelSelect!.addEventListener("change", updateThinkingRestrictions);

    // Thinking checkbox handler
    advancedThinkingEnabled!.addEventListener("change", updateThinkingBudgetState);

    // Thinking budget validation
    advancedThinkingBudget!.addEventListener("change", validateThinkingBudget);

    // Continue button - save settings and go to summary
    advancedContinueButton!.addEventListener("click", () => {
        // Save all settings to localStorage
        localStorage.setItem("model", advancedModelSelect!.value);
        localStorage.setItem("TEMPERATURE", advancedTemperature!.value);
        localStorage.setItem("enableThinking", advancedThinkingEnabled!.checked.toString());
        localStorage.setItem("thinkingBudget", advancedThinkingBudget!.value);
        localStorage.setItem("autoscroll", advancedAutoscroll!.checked.toString());
        localStorage.setItem("streamResponses", advancedStreamResponses!.checked.toString());
        
        // Set remaining default
        localStorage.setItem("maxTokens", "1000");
        
        // Reload settings to apply changes to UI
        settingsService.loadSettings();
        
        // Go to summary
        onboardingService.goToStep(OnboardingStep.SUMMARY);
        renderSummary();
    });

    // Load defaults when the advanced settings step is shown
    // This will be called from wherever the step transition happens
    loadDefaultSettings();
}

/**
 * Helper: Route to either Advanced Settings (Power path) or Summary (Easy path)
 */
function routeToSettingsOrSummary(): void {
    const selectedPath = onboardingService.getState().selectedPath;
    
    if (selectedPath === OnboardingPath.POWER) {
        // Power path - show advanced settings first
        onboardingService.goToStep(OnboardingStep.ADVANCED_SETTINGS);
    } else {
        // Easy path - go straight to summary
        onboardingService.goToStep(OnboardingStep.SUMMARY);
        renderSummary();
    }
}

/**
 * Helper: Show API key validation status
 */
function showApiKeyStatus(message: string, type: "loading" | "success" | "error"): void {
    apiKeyStatus!.textContent = message;
    apiKeyStatus!.classList.remove("hidden", "status-loading", "status-success", "status-error");
    apiKeyStatus!.classList.add(`status-${type}`);
}

/**
 * Helper: Hide API key status
 */
function hideApiKeyStatus(): void {
    apiKeyStatus!.classList.add("hidden");
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
        registerTabsHighlight.style.width = `calc(100% / ${tabs.length})`;
        registerTabsHighlight.style.left = `calc(100% / ${tabs.length} * ${targetIndex})`;
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
        showSubscriptionStatus("We couldn't find your saved credentials. Use a different account to continue.", "error");
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

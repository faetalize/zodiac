/**
 * Onboarding service - manages onboarding flow state and navigation
 */

import type { ColorTheme, ThemeMode, ThemePreference } from "../types/Theme";
import {
    OnboardingPath,
    OnboardingPendingCredentials,
    OnboardingSetupOption,
    OnboardingStep,
    OnboardingState
} from "../types/Onboarding";

let currentState: OnboardingState = {
    currentStep: OnboardingStep.PATH_SELECTION,
    selectedPath: null,
    selectedTheme: null,
    selectedMode: null,
    selectedPreference: null,
    apiKeyValidated: false,
    registrationCompleted: false,
    setupOption: null,
    pendingCredentials: null,
    selectedPriceId: null
};

const onboardingOverlay = document.querySelector<HTMLDivElement>("#onboarding-overlay");

if (!onboardingOverlay) {
    console.error("Onboarding overlay not found in DOM");
}

function getOverlay(): HTMLDivElement {
    if (!onboardingOverlay) {
        throw new Error("Onboarding overlay element is missing");
    }
    return onboardingOverlay;
}

/**
 * Show the onboarding overlay and reset state
 */
export function show(): void {
    // Reset state
    currentState = {
        currentStep: OnboardingStep.PATH_SELECTION,
        selectedPath: null,
        selectedTheme: null,
        selectedMode: null,
        selectedPreference: null,
        apiKeyValidated: false,
        registrationCompleted: false,
        setupOption: null,
        pendingCredentials: null,
        selectedPriceId: null
    };
    
    getOverlay().classList.remove("hidden");
    goToStep(OnboardingStep.PATH_SELECTION);
}


/**
 * Check if onboarding should auto-show on first run
 */
export async function shouldShowOnboarding(): Promise<boolean> {
   return localStorage.getItem("onboardingCompleted") !== "true";
}

/**
 * Hide the onboarding overlay
 */
export function hide(): void {
    getOverlay().classList.add("hidden");
    // Mark onboarding as completed so it doesn't show again on future visits
    localStorage.setItem("onboardingCompleted", "true");
    // Clear any pending credentials for security
    currentState.pendingCredentials = null;
}

/**
 * Navigate to a specific step
 */
export function goToStep(step: OnboardingStep): void {
    currentState.currentStep = step;
    
    const overlay = getOverlay();
    
    // Hide all steps
    const allSteps = overlay.querySelectorAll<HTMLDivElement>(".onboarding-step");
    allSteps.forEach(s => s.classList.add("hidden"));
    
    // Show target step
    const targetStep = overlay.querySelector<HTMLDivElement>(`#onboarding-${step}`);
    if (targetStep) {
        targetStep.classList.remove("hidden");
    }
    
    // Scroll to top of onboarding overlay
    overlay.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Set the selected path (easy or power user)
 */
export function setPath(path: OnboardingPath): void {
    currentState.selectedPath = path;
}

/**
 * Get current state
 */
export function getState(): OnboardingState {
    return { ...currentState };
}

/**
 * Mark API key as validated
 */
export function setApiKeyValidated(validated: boolean): void {
    currentState.apiKeyValidated = validated;
}

/**
 * Mark registration as completed
 */
export function setRegistrationCompleted(completed: boolean): void {
    currentState.registrationCompleted = completed;
}

export function setSetupOption(option: OnboardingSetupOption): void {
    currentState.setupOption = option;
}

export function setPendingCredentials(credentials: OnboardingPendingCredentials | null): void {
    currentState.pendingCredentials = credentials;
}

export function getPendingCredentials(): OnboardingPendingCredentials | null {
    return currentState.pendingCredentials ? { ...currentState.pendingCredentials } : null;
}

export function setSelectedPriceId(priceId: string | null): void {
    currentState.selectedPriceId = priceId;
}

export function getSelectedPriceId(): string | null {
    return currentState.selectedPriceId;
}

export function setSelectedTheme(theme: ColorTheme): void {
    currentState.selectedTheme = theme;
}

export function getSelectedTheme(): ColorTheme | null {
    return currentState.selectedTheme;
}

export function setSelectedMode(mode: ThemeMode, preference: ThemePreference): void {
    currentState.selectedMode = mode;
    currentState.selectedPreference = preference;
}

export function getSelectedMode(): ThemeMode | null {
    return currentState.selectedMode;
}

export function getSelectedPreference(): ThemePreference | null {
    return currentState.selectedPreference;
}

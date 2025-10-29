/**
 * Onboarding flow types and enums
 */

import type { ColorTheme, ThemeMode, ThemePreference } from './Theme';

export enum OnboardingPath {
    EASY = 'easy',
    POWER = 'power'
}

export enum OnboardingStep {
    PATH_SELECTION = 'path-selection',
    THEME_SELECTION = 'theme-selection',
    ACCOUNT_SELECTOR = 'account-selector',
    API_OR_SUBSCRIPTION = 'api-or-subscription',
    ACCOUNT_CONFIRMATION = 'account-confirmation',
    API_KEY_SETUP = 'api-key-setup',
    PLAN_SELECTION = 'plan-selection',
    SUBSCRIPTION_SETUP = 'subscription-setup',
    REGISTRATION = 'registration',
    ADVANCED_SETTINGS = 'advanced-settings',
    SUMMARY = 'summary'
}

export type OnboardingSetupOption = "api-key" | "subscription" | null;

export interface OnboardingPendingCredentials {
    email: string;
    password: string;
}

export interface OnboardingState {
    currentStep: OnboardingStep;
    selectedPath: OnboardingPath | null;
    selectedTheme: ColorTheme | null;
    selectedMode: ThemeMode | null;
    selectedPreference: ThemePreference | null;
    apiKeyValidated: boolean;
    registrationCompleted: boolean;
    setupOption: OnboardingSetupOption;
    pendingCredentials: OnboardingPendingCredentials | null;
    selectedPriceId: string | null;
}

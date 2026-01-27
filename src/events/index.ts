/**
 * Typed custom events for cross-component communication.
 * 
 * This module provides type-safe event creation and listening utilities.
 * All custom events used in the application should be defined here.
 */

import type { Session } from "@supabase/supabase-js";
import type { SubscriptionTier, UserSubscription, ImageGenerationRecord } from "../types/Supabase";
import type { User } from "../types/User";
import type { ChatModel } from "../types/Models";
import type { DbChat } from "../types/Chat";

// ================================================================================
// EVENT DETAIL TYPES
// ================================================================================

// --- Authentication & User Events ---

export interface AuthStateChangedDetail {
    loggedIn: boolean;
    session?: Session;
    subscription?: UserSubscription | null;
    imageGenerationRecord?: ImageGenerationRecord | null;
}

export interface PasswordRecoveryDetail {
    session: Session;
}

export interface ProfileUpdatedDetail {
    user?: User;
}

export interface ProfileRefreshedDetail {
    user: User;
}

export interface AccountEmailChangedDetail {
    email: string;
}

export interface OpenEmailUpdateDetail {
    currentEmail: string;
}

// --- Subscription Events ---

export interface SubscriptionUpdatedDetail {
    tier: SubscriptionTier;
}

export interface SubscriptionRefreshedDetail {
    subDetails: UserSubscription;
}

export interface ImageGenerationRecordRefreshedDetail {
    imageGenerationRecord: ImageGenerationRecord;
}

export interface InsufficientImageCreditsDetail {
    insufficient: boolean;
}

// --- Generation State Events ---

export interface GenerationStateChangedDetail {
    isGenerating: boolean;
}

// --- Chat Events ---

export interface ChatLoadedDetail {
    chat: DbChat | null;
}

export interface OpenGroupChatEditorDetail {
    chatId: number;
}

// --- RPG Group Chat Events ---

export interface RoundStateChangedDetail {
    isUserTurn: boolean;
    currentRoundIndex: number;
    roundComplete: boolean;
    nextRoundNumber: number;
    startsNewRound?: boolean;
    nextSpeakerId?: string;
}

// --- Dynamic Group Chat Events ---

export interface GroupChatTypingChangedDetail {
    chatId: number;
    personaIds: string[];
}

// --- Model & Settings Events ---

export interface ChatModelChangedDetail {
    model: ChatModel | string;
}

export interface ThinkingToggledDetail {
    enabled: boolean;
}

export interface EditModelChangedDetail {
    model: string;
}

export interface PremiumEndpointPreferenceChangedDetail {
    preferred: boolean;
}

// --- Image Mode Events ---

export interface ImageGenerationToggledDetail {
    enabled: boolean;
}

export interface ImageEditingToggledDetail {
    enabled: boolean;
}

export interface AttachImageFromChatDetail {
    file: File;
    toggleEditing: boolean;
}

// --- Attachment Events ---

export interface AttachmentRemovedDetail {
    name: string;
    size: number;
    type: string;
    lastModified: number;
    signature: string;
}

export interface AttachmentAddedDetail {
    count: number;
}

export interface HistoryImageRemovedDetail {
    // No detail payload
}

// --- Personality Form Events ---

export interface ToneExamplesSetDetail {
    toneExamples: string[];
}

export interface TagsSetDetail {
    tags: string[];
}

// Empty detail types for reset events
export interface ToneExamplesResetDetail {
    // No detail payload
}

export interface TagsResetDetail {
    // No detail payload
}

// --- Lora Events ---

export interface LoraStateChangedDetail {
    // No detail payload - listeners should query current state
}

// ================================================================================
// EVENT NAME CONSTANTS
// ================================================================================

export const EventNames = {
    // Authentication & User
    AUTH_STATE_CHANGED: 'auth-state-changed',
    PASSWORD_RECOVERY: 'password-recovery',
    PROFILE_UPDATED: 'profile-updated',
    PROFILE_REFRESHED: 'profile-refreshed',
    ACCOUNT_EMAIL_CHANGED: 'account-email-changed',
    OPEN_EMAIL_UPDATE: 'open-email-update',
    
    // Subscription
    SUBSCRIPTION_UPDATED: 'subscription-updated',
    SUBSCRIPTION_REFRESHED: 'subscription-refreshed',
    IMAGE_GENERATION_RECORD_REFRESHED: 'image-generation-record-refreshed',
    INSUFFICIENT_IMAGE_CREDITS: 'insufficient-image-credits',
    
    // Generation State
    GENERATION_STATE_CHANGED: 'generation-state-changed',
    
    // Chat
    CHAT_LOADED: 'chat-loaded',
    OPEN_GROUP_CHAT_EDITOR: 'open-group-chat-editor',
    
    // RPG Group Chat
    ROUND_STATE_CHANGED: 'round-state-changed',

    // Dynamic Group Chat
    GROUP_CHAT_TYPING_CHANGED: 'group-chat-typing-changed',
    
    // Model & Settings
    CHAT_MODEL_CHANGED: 'chat-model-changed',
    THINKING_TOGGLED: 'thinking-toggled',
    EDIT_MODEL_CHANGED: 'edit-model-changed',
    PREMIUM_ENDPOINT_PREFERENCE_CHANGED: 'premium-endpoint-preference-changed',
    
    // Image Mode
    IMAGE_GENERATION_TOGGLED: 'image-generation-toggled',
    IMAGE_EDITING_TOGGLED: 'image-editing-toggled',
    ATTACH_IMAGE_FROM_CHAT: 'attach-image-from-chat',
    
    // Attachments
    ATTACHMENT_REMOVED: 'attachmentremoved',
    ATTACHMENT_ADDED: 'attachment-added',
    HISTORY_IMAGE_REMOVED: 'history-image-removed',
    
    // Personality Form (element-scoped, not window)
    TONE_EXAMPLES_SET: 'toneExamples:set',
    TONE_EXAMPLES_RESET: 'toneExamples:reset',
    TAGS_SET: 'tags:set',
    TAGS_RESET: 'tags:reset',
    
    // Lora
    LORA_STATE_CHANGED: 'lora-state-changed',
} as const;

export type EventName = typeof EventNames[keyof typeof EventNames];

// ================================================================================
// EVENT MAP (for type inference)
// ================================================================================

/**
 * Maps event names to their detail types.
 * Used for type-safe event creation and listening.
 */
export interface AppEventMap {
    // Authentication & User
    [EventNames.AUTH_STATE_CHANGED]: AuthStateChangedDetail;
    [EventNames.PASSWORD_RECOVERY]: PasswordRecoveryDetail;
    [EventNames.PROFILE_UPDATED]: ProfileUpdatedDetail;
    [EventNames.PROFILE_REFRESHED]: ProfileRefreshedDetail;
    [EventNames.ACCOUNT_EMAIL_CHANGED]: AccountEmailChangedDetail;
    [EventNames.OPEN_EMAIL_UPDATE]: OpenEmailUpdateDetail;
    
    // Subscription
    [EventNames.SUBSCRIPTION_UPDATED]: SubscriptionUpdatedDetail;
    [EventNames.SUBSCRIPTION_REFRESHED]: SubscriptionRefreshedDetail;
    [EventNames.IMAGE_GENERATION_RECORD_REFRESHED]: ImageGenerationRecordRefreshedDetail;
    [EventNames.INSUFFICIENT_IMAGE_CREDITS]: InsufficientImageCreditsDetail;
    
    // Generation State
    [EventNames.GENERATION_STATE_CHANGED]: GenerationStateChangedDetail;
    
    // Chat
    [EventNames.CHAT_LOADED]: ChatLoadedDetail;
    [EventNames.OPEN_GROUP_CHAT_EDITOR]: OpenGroupChatEditorDetail;
    
    // RPG Group Chat
    [EventNames.ROUND_STATE_CHANGED]: RoundStateChangedDetail;

    // Dynamic Group Chat
    [EventNames.GROUP_CHAT_TYPING_CHANGED]: GroupChatTypingChangedDetail;
    
    // Model & Settings
    [EventNames.CHAT_MODEL_CHANGED]: ChatModelChangedDetail;
    [EventNames.THINKING_TOGGLED]: ThinkingToggledDetail;
    [EventNames.EDIT_MODEL_CHANGED]: EditModelChangedDetail;
    [EventNames.PREMIUM_ENDPOINT_PREFERENCE_CHANGED]: PremiumEndpointPreferenceChangedDetail;
    
    // Image Mode
    [EventNames.IMAGE_GENERATION_TOGGLED]: ImageGenerationToggledDetail;
    [EventNames.IMAGE_EDITING_TOGGLED]: ImageEditingToggledDetail;
    [EventNames.ATTACH_IMAGE_FROM_CHAT]: AttachImageFromChatDetail;
    
    // Attachments
    [EventNames.ATTACHMENT_REMOVED]: AttachmentRemovedDetail;
    [EventNames.ATTACHMENT_ADDED]: AttachmentAddedDetail;
    [EventNames.HISTORY_IMAGE_REMOVED]: HistoryImageRemovedDetail;
    
    // Personality Form
    [EventNames.TONE_EXAMPLES_SET]: ToneExamplesSetDetail;
    [EventNames.TONE_EXAMPLES_RESET]: ToneExamplesResetDetail;
    [EventNames.TAGS_SET]: TagsSetDetail;
    [EventNames.TAGS_RESET]: TagsResetDetail;
    
    // Lora
    [EventNames.LORA_STATE_CHANGED]: LoraStateChangedDetail;
}

// ================================================================================
// TYPED EVENT CLASS
// ================================================================================

/**
 * A typed CustomEvent that ensures the detail type matches the event name.
 */
export type TypedCustomEvent<K extends keyof AppEventMap> = CustomEvent<AppEventMap[K]>;

// ================================================================================
// EVENT CREATION HELPERS
// ================================================================================

/**
 * Creates a typed CustomEvent with the correct detail type.
 * 
 * @example
 * const event = createEvent('auth-state-changed', { loggedIn: true, session });
 * window.dispatchEvent(event);
 */
export function createEvent<K extends keyof AppEventMap>(
    name: K,
    detail: AppEventMap[K],
    options?: Omit<CustomEventInit<AppEventMap[K]>, 'detail'>
): CustomEvent<AppEventMap[K]> {
    return new CustomEvent(name, { detail, ...options });
}

/**
 * Creates an event with no detail payload.
 * 
 * @example
 * const event = createEmptyEvent('lora-state-changed');
 * window.dispatchEvent(event);
 */
export function createEmptyEvent<K extends keyof AppEventMap>(
    name: K,
    options?: Omit<CustomEventInit<AppEventMap[K]>, 'detail'>
): CustomEvent<AppEventMap[K]> {
    return new CustomEvent(name, { detail: {} as AppEventMap[K], ...options });
}

// ================================================================================
// EVENT DISPATCHING HELPERS
// ================================================================================

/**
 * Dispatches a typed event on the window object.
 * 
 * @example
 * dispatchAppEvent('generation-state-changed', { isGenerating: true });
 */
export function dispatchAppEvent<K extends keyof AppEventMap>(
    name: K,
    detail: AppEventMap[K],
    options?: Omit<CustomEventInit<AppEventMap[K]>, 'detail'>
): void {
    window.dispatchEvent(createEvent(name, detail, options));
}

/**
 * Dispatches an event with no detail payload on the window object.
 * 
 * @example
 * dispatchEmptyAppEvent('lora-state-changed');
 */
export function dispatchEmptyAppEvent<K extends keyof AppEventMap>(
    name: K,
    options?: Omit<CustomEventInit<AppEventMap[K]>, 'detail'>
): void {
    window.dispatchEvent(createEmptyEvent(name, options));
}

/**
 * Dispatches a typed event on the document object.
 * Useful for events that bubble up from elements.
 * 
 * @example
 * dispatchDocumentEvent('chat-model-changed', { model: 'gemini-2.0-flash' });
 */
export function dispatchDocumentEvent<K extends keyof AppEventMap>(
    name: K,
    detail: AppEventMap[K],
    options?: Omit<CustomEventInit<AppEventMap[K]>, 'detail'>
): void {
    document.dispatchEvent(createEvent(name, detail, { bubbles: true, ...options }));
}

/**
 * Dispatches a typed event on a specific element.
 * 
 * @example
 * dispatchElementEvent(formElement, 'toneExamples:set', { toneExamples: ['hello', 'world'] });
 */
export function dispatchElementEvent<K extends keyof AppEventMap>(
    element: EventTarget,
    name: K,
    detail: AppEventMap[K],
    options?: Omit<CustomEventInit<AppEventMap[K]>, 'detail'>
): void {
    element.dispatchEvent(createEvent(name, detail, options));
}

// ================================================================================
// EVENT LISTENING HELPERS
// ================================================================================

/**
 * Type-safe event listener callback.
 */
export type AppEventListener<K extends keyof AppEventMap> = (
    event: CustomEvent<AppEventMap[K]>
) => void;

/**
 * Adds a typed event listener to the window object.
 * Returns a cleanup function to remove the listener.
 * 
 * @example
 * const cleanup = onAppEvent('auth-state-changed', (event) => {
 *     console.log(event.detail.loggedIn);
 * });
 * // Later: cleanup();
 */
export function onAppEvent<K extends keyof AppEventMap>(
    name: K,
    listener: AppEventListener<K>,
    options?: AddEventListenerOptions
): () => void {
    const handler = listener as EventListener;
    window.addEventListener(name, handler, options);
    return () => window.removeEventListener(name, handler, options);
}

/**
 * Adds a typed event listener to the document object.
 * Returns a cleanup function to remove the listener.
 * 
 * @example
 * const cleanup = onDocumentEvent('chat-model-changed', (event) => {
 *     console.log(event.detail.model);
 * });
 */
export function onDocumentEvent<K extends keyof AppEventMap>(
    name: K,
    listener: AppEventListener<K>,
    options?: AddEventListenerOptions
): () => void {
    const handler = listener as EventListener;
    document.addEventListener(name, handler, options);
    return () => document.removeEventListener(name, handler, options);
}

/**
 * Adds a typed event listener to a specific element.
 * Returns a cleanup function to remove the listener.
 * 
 * @example
 * const cleanup = onElementEvent(formElement, 'toneExamples:set', (event) => {
 *     console.log(event.detail.toneExamples);
 * });
 */
export function onElementEvent<K extends keyof AppEventMap>(
    element: EventTarget,
    name: K,
    listener: AppEventListener<K>,
    options?: AddEventListenerOptions
): () => void {
    const handler = listener as EventListener;
    element.addEventListener(name, handler, options);
    return () => element.removeEventListener(name, handler, options);
}

/**
 * Adds a one-time typed event listener.
 * Automatically removes itself after the first invocation.
 * 
 * @example
 * onceAppEvent('auth-state-changed', (event) => {
 *     console.log('Auth state changed once:', event.detail.loggedIn);
 * });
 */
export function onceAppEvent<K extends keyof AppEventMap>(
    name: K,
    listener: AppEventListener<K>
): () => void {
    return onAppEvent(name, listener, { once: true });
}

// ================================================================================
// TYPE GUARD HELPERS
// ================================================================================

/**
 * Type guard to check if an event is a specific typed app event.
 * 
 * @example
 * window.addEventListener('auth-state-changed', (event) => {
 *     if (isAppEvent(event, 'auth-state-changed')) {
 *         console.log(event.detail.loggedIn); // Properly typed!
 *     }
 * });
 */
export function isAppEvent<K extends keyof AppEventMap>(
    event: Event,
    name: K
): event is CustomEvent<AppEventMap[K]> {
    return event.type === name && event instanceof CustomEvent;
}

/**
 * Extracts the detail from an event with type safety.
 * Returns undefined if the event doesn't match or has no detail.
 * 
 * @example
 * window.addEventListener('auth-state-changed', (event) => {
 *     const detail = getEventDetail(event, 'auth-state-changed');
 *     if (detail) {
 *         console.log(detail.loggedIn);
 *     }
 * });
 */
export function getEventDetail<K extends keyof AppEventMap>(
    event: Event,
    name: K
): AppEventMap[K] | undefined {
    if (isAppEvent(event, name)) {
        return event.detail;
    }
    return undefined;
}

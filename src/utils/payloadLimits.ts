import type { SubscriptionTier } from "../types/Supabase";

export const PRO_MESSAGE_CHARACTER_LIMIT = 5000;
export const PRO_PLUS_MESSAGE_CHARACTER_LIMIT = 15000;
export const MESSAGE_LIMIT_UPSELL_THRESHOLD = 0.8;

export interface MessagePayloadLimitState {
	limit: number | null;
	characterCount: number;
	remaining: number | null;
	isNearLimit: boolean;
	isOverLimit: boolean;
}

export function getPremiumMessageCharacterLimit(
	tier: SubscriptionTier | null | undefined,
	isPremiumEndpointPreferred: boolean
): number | null {
	if (!isPremiumEndpointPreferred) {
		return null;
	}

	if (tier === "pro") {
		return PRO_MESSAGE_CHARACTER_LIMIT;
	}

	if (tier === "pro_plus" || tier === "max") {
		return PRO_PLUS_MESSAGE_CHARACTER_LIMIT;
	}

	return null;
}

export function countMessageCharacters(message: string): number {
	return Array.from(message).length;
}

export function truncateToCharacterLimit(message: string, limit: number): string {
	if (limit <= 0) {
		return "";
	}
	return Array.from(message).slice(0, limit).join("");
}

export function getMessagePayloadLimitState(message: string, limit: number | null): MessagePayloadLimitState {
	const characterCount = countMessageCharacters(message);

	if (limit === null) {
		return {
			limit,
			characterCount,
			remaining: null,
			isNearLimit: false,
			isOverLimit: false
		};
	}

	return {
		limit,
		characterCount,
		remaining: Math.max(0, limit - characterCount),
		isNearLimit: characterCount >= Math.floor(limit * MESSAGE_LIMIT_UPSELL_THRESHOLD),
		isOverLimit: characterCount > limit
	};
}

export function validateMessagePayloadLimit(message: string, limit: number | null): MessagePayloadLimitState {
	return getMessagePayloadLimitState(message, limit);
}

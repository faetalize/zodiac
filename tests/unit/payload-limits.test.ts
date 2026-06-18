import { describe, expect, it } from "vitest";

import {
	countMessageCharacters,
	getMessagePayloadLimitState,
	getPremiumMessageCharacterLimit,
	PRO_MESSAGE_CHARACTER_LIMIT,
	PRO_PLUS_MESSAGE_CHARACTER_LIMIT,
	truncateToCharacterLimit
} from "../../src/utils/payloadLimits";

describe("payload limits", () => {
	it("does not limit logged-out, free, or BYOK premium-pref-disabled users", () => {
		expect(getPremiumMessageCharacterLimit("free", true)).toBeNull();
		expect(getPremiumMessageCharacterLimit(null, true)).toBeNull();
		expect(getPremiumMessageCharacterLimit("pro", false)).toBeNull();
		expect(getPremiumMessageCharacterLimit("pro_plus", false)).toBeNull();
		expect(getPremiumMessageCharacterLimit("max", false)).toBeNull();
	});

	it("returns premium endpoint character limits by paid tier", () => {
		expect(getPremiumMessageCharacterLimit("pro", true)).toBe(PRO_MESSAGE_CHARACTER_LIMIT);
		expect(getPremiumMessageCharacterLimit("pro_plus", true)).toBe(PRO_PLUS_MESSAGE_CHARACTER_LIMIT);
		expect(getPremiumMessageCharacterLimit("max", true)).toBe(PRO_PLUS_MESSAGE_CHARACTER_LIMIT);
	});

	it("counts unicode code points instead of UTF-16 code units", () => {
		expect(countMessageCharacters("a😀b")).toBe(3);
		expect(truncateToCharacterLimit("a😀b", 2)).toBe("a😀");
	});

	it("marks messages near and over the active limit", () => {
		expect(getMessagePayloadLimitState("x".repeat(3999), PRO_MESSAGE_CHARACTER_LIMIT)).toMatchObject({
			isNearLimit: false,
			isOverLimit: false,
			remaining: 1001
		});
		expect(getMessagePayloadLimitState("x".repeat(4000), PRO_MESSAGE_CHARACTER_LIMIT)).toMatchObject({
			isNearLimit: true,
			isOverLimit: false,
			remaining: 1000
		});
		expect(getMessagePayloadLimitState("x".repeat(5001), PRO_MESSAGE_CHARACTER_LIMIT)).toMatchObject({
			isNearLimit: true,
			isOverLimit: true,
			remaining: 0
		});
	});
});

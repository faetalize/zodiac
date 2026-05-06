import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/services/Supabase.service", () => ({
	supabase: {},
	getCurrentUser: vi.fn(),
	getSubscriptionTier: vi.fn(),
	getUserSubscription: vi.fn()
}));

vi.mock("../../../src/services/Crypto.service", () => ({
	isUnlocked: vi.fn(() => false)
}));

vi.mock("../../../src/services/BlobStore.service", () => ({}));

vi.mock("../../../src/services/Toast.service", () => ({
	warn: vi.fn()
}));

vi.mock("../../../src/services/Db.service", () => ({
	db: {}
}));

vi.mock("../../../src/utils/helpers", () => ({
	fileToBase64: vi.fn()
}));

vi.mock("../../../src/events", () => ({
	dispatchAppEvent: vi.fn()
}));

describe("sync quota errors", () => {
	it("recognizes storage quota failures from thrown errors and Supabase payloads", async () => {
		const { isSyncQuotaExceededError } = await import("../../../src/services/Sync.service");

		expect(isSyncQuotaExceededError(new Error("Cloud sync storage quota exceeded"))).toBe(true);
		expect(
			isSyncQuotaExceededError({
				message: "trg_enforce_quota_synced_messages failed",
				details: "Storage quota exceeded"
			})
		).toBe(true);
		expect(isSyncQuotaExceededError({ message: "network request failed" })).toBe(false);
	});

	it("builds user-facing quota copy with usage percentage", async () => {
		const { buildSyncQuotaExceededToastText } = await import("../../../src/services/Sync.service");

		expect(buildSyncQuotaExceededToastText({ usedBytes: 9.5 * 1024 * 1024, quotaBytes: 10 * 1024 * 1024 })).toBe(
			"Your latest change was saved on this device, but it was not committed to cloud sync. Cloud storage is 9.5 MB of 10 MB used (95% filled)."
		);
	});

	it("adds an upgrade action for non-Max subscriptions", async () => {
		const { buildSyncQuotaExceededToastOptions } = await import("../../../src/services/Sync.service");
		const button = document.createElement("button");
		button.id = "btn-show-subscription-options";
		const clickSpy = vi.spyOn(button, "click");
		document.body.appendChild(button);

		const options = buildSyncQuotaExceededToastOptions({ usedBytes: 10, quotaBytes: 10 }, "pro");
		options.actions?.[0]?.onClick(() => {});

		expect(options.title).toBe("Cloud sync storage is full");
		expect(options.actions?.[0]?.label).toBe("See upgrade options");
		expect(clickSpy).toHaveBeenCalledOnce();
		expect(buildSyncQuotaExceededToastOptions({ usedBytes: 10, quotaBytes: 10 }, "max").actions).toEqual([]);
	});
});

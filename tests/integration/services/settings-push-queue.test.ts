import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";

const syncTestState = vi.hoisted(() => {
	const state = {
		encryptedSettings: [] as Array<Record<string, string>>,
		activeUpserts: 0,
		maxConcurrentUpserts: 0,
		pendingUpserts: [] as Array<() => void>,
		from: vi.fn((table: string) => {
			if (table === "user_sync_preferences") {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							maybeSingle: vi.fn(async () => ({
								data: {
									sync_enabled: true,
									encryption_salt: "aa",
									key_verification: "bb",
									key_verification_iv: "cc"
								},
								error: null
							}))
						}))
					}))
				};
			}

			if (table === "user_synced_settings") {
				return {
					upsert: vi.fn(
						() =>
							new Promise<{ error: null }>((resolve) => {
								state.activeUpserts += 1;
								state.maxConcurrentUpserts = Math.max(state.maxConcurrentUpserts, state.activeUpserts);
								state.pendingUpserts.push(() => {
									state.activeUpserts -= 1;
									resolve({ error: null });
								});
							})
					)
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		}),
		reset() {
			this.encryptedSettings = [];
			this.activeUpserts = 0;
			this.maxConcurrentUpserts = 0;
			this.pendingUpserts = [];
			this.from.mockClear();
		},
		resolveNextUpsert() {
			const resolve = this.pendingUpserts.shift();
			if (!resolve) throw new Error("No pending settings upsert to resolve");
			resolve();
		}
	};
	return state;
});

vi.mock("../../../src/services/Supabase.service", () => ({
	supabase: {
		from: syncTestState.from
	},
	getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
	getSubscriptionTier: vi.fn(() => "pro"),
	getUserSubscription: vi.fn(async () => null)
}));

vi.mock("../../../src/services/Crypto.service", () => ({
	isUnlocked: vi.fn(() => true),
	getCachedKey: vi.fn(() => ({})),
	fromHex: vi.fn(() => new Uint8Array([1])),
	toHex: vi.fn(() => "hex"),
	encrypt: vi.fn(async (_key: CryptoKey, plaintext: string) => {
		syncTestState.encryptedSettings.push(JSON.parse(plaintext));
		return { ciphertext: new Uint8Array([1]), iv: new Uint8Array([2]) };
	})
}));

vi.mock("../../../src/services/BlobStore.service", () => ({
	BLOB_SIZE_THRESHOLD: 1_000_000,
	clearCache: vi.fn()
}));

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

async function importActiveSyncService() {
	const syncService = await import("../../../src/services/Sync.service");
	await syncService.fetchSyncPreferences();
	return syncService;
}

describe("settings push queue", () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.resetModules();
		localStorage.clear();
		syncTestState.reset();
	});

	it("collapses debounced settings pushes into one trailing upload", async () => {
		vi.useFakeTimers();
		const syncService = await importActiveSyncService();

		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, "first-model");
		syncService.queueSettingsPush({ label: "settings", debounceMs: 2000 });

		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, "second-model");
		syncService.queueSettingsPush({ label: "settings", debounceMs: 2000 });

		await vi.advanceTimersByTimeAsync(1999);
		expect(syncTestState.encryptedSettings).toEqual([]);

		await vi.advanceTimersByTimeAsync(1);

		expect(syncTestState.encryptedSettings).toEqual([{ [SETTINGS_STORAGE_KEYS.MODEL]: "second-model" }]);
		syncTestState.resolveNextUpsert();
	});

	it("serializes immediate settings pushes so the latest snapshot uploads last", async () => {
		const syncService = await importActiveSyncService();

		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, "first-model");
		syncService.queueSettingsPush({ label: "settings" });

		await vi.waitFor(() => expect(syncTestState.pendingUpserts).toHaveLength(1));

		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, "second-model");
		syncService.queueSettingsPush({ label: "settings" });

		await Promise.resolve();
		expect(syncTestState.encryptedSettings).toEqual([{ [SETTINGS_STORAGE_KEYS.MODEL]: "first-model" }]);
		expect(syncTestState.pendingUpserts).toHaveLength(1);

		syncTestState.resolveNextUpsert();
		await vi.waitFor(() => expect(syncTestState.pendingUpserts).toHaveLength(1));

		expect(syncTestState.encryptedSettings).toEqual([
			{ [SETTINGS_STORAGE_KEYS.MODEL]: "first-model" },
			{ [SETTINGS_STORAGE_KEYS.MODEL]: "second-model" }
		]);
		expect(syncTestState.maxConcurrentUpserts).toBe(1);

		syncTestState.resolveNextUpsert();
	});
});

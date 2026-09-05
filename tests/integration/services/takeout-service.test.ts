import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";
import { createTakeoutDocument } from "../../../src/utils/takeout";
import { makeChat } from "../../fixtures/chats";
import { makePersona } from "../../fixtures/personas";

const dbMock = vi.hoisted(() => ({
	chats: {
		toArray: vi.fn(),
		bulkPut: vi.fn()
	},
	personalities: {
		toArray: vi.fn(),
		bulkPut: vi.fn()
	},
	transaction: vi.fn(async (_mode: string, _chats: unknown, _personas: unknown, task: () => Promise<void>) => {
		await task();
	})
}));

const syncServiceMock = vi.hoisted(() => ({
	fetchSyncPreferences: vi.fn(),
	isOnlineSyncEnabled: vi.fn(),
	isSyncActive: vi.fn(),
	getSyncStatus: vi.fn(),
	getPendingSyncOperationCount: vi.fn(),
	fetchSyncedChatsMetadata: vi.fn(),
	fetchAllSyncedChatMessages: vi.fn(),
	materializeMessagesForPortableExport: vi.fn(),
	isChatSnapshotFullyHydrated: vi.fn(),
	fetchSyncedPersonas: vi.fn(),
	fetchSyncedSettingsObject: vi.fn(),
	pushPersona: vi.fn(),
	upsertSyncedChat: vi.fn(),
	pushSettings: vi.fn(),
	pullAll: vi.fn()
}));

const supabaseServiceMock = vi.hoisted(() => ({
	getCurrentUser: vi.fn(),
	getUserSubscription: vi.fn(),
	getSubscriptionTier: vi.fn()
}));

const chatsServiceMock = vi.hoisted(() => ({ initialize: vi.fn() }));
const personalityServiceMock = vi.hoisted(() => ({ reloadFromDb: vi.fn() }));
const loraServiceMock = vi.hoisted(() => ({ initialize: vi.fn() }));
const settingsServiceMock = vi.hoisted(() => ({ loadSettings: vi.fn() }));
const eventMock = vi.hoisted(() => ({ dispatchAppEvent: vi.fn() }));

vi.mock("../../../src/services/Db.service", () => ({ db: dbMock }));
vi.mock("../../../src/services/Sync.service", () => syncServiceMock);
vi.mock("../../../src/services/Supabase.service", () => supabaseServiceMock);
vi.mock("../../../src/services/Chats.service", () => chatsServiceMock);
vi.mock("../../../src/services/Personality.service", () => personalityServiceMock);
vi.mock("../../../src/services/Lora.service", () => loraServiceMock);
vi.mock("../../../src/services/Settings.service", () => settingsServiceMock);
vi.mock("../../../src/events", () => eventMock);

describe("Takeout service source and destination routing", () => {
	beforeEach(() => {
		vi.resetModules();
		dbMock.chats.toArray.mockReset();
		dbMock.chats.bulkPut.mockReset();
		dbMock.personalities.toArray.mockReset();
		dbMock.personalities.bulkPut.mockReset();
		dbMock.transaction.mockClear();
		for (const mock of Object.values(syncServiceMock)) mock.mockReset();
		for (const mock of Object.values(supabaseServiceMock)) mock.mockReset();
		chatsServiceMock.initialize.mockReset();
		personalityServiceMock.reloadFromDb.mockReset();
		loraServiceMock.initialize.mockReset();
		settingsServiceMock.loadSettings.mockReset();
		eventMock.dispatchAppEvent.mockReset();
		syncServiceMock.isOnlineSyncEnabled.mockReturnValue(false);
		syncServiceMock.isSyncActive.mockReturnValue(false);
		syncServiceMock.getSyncStatus.mockReturnValue("idle");
		syncServiceMock.getPendingSyncOperationCount.mockReturnValue(0);
		syncServiceMock.isChatSnapshotFullyHydrated.mockReturnValue(true);
		syncServiceMock.pushPersona.mockResolvedValue(true);
		syncServiceMock.upsertSyncedChat.mockResolvedValue(true);
		syncServiceMock.pushSettings.mockResolvedValue(true);
		syncServiceMock.pullAll.mockResolvedValue(undefined);
		dbMock.chats.toArray.mockResolvedValue([]);
		dbMock.personalities.toArray.mockResolvedValue([]);
		supabaseServiceMock.getCurrentUser.mockResolvedValue(null);
		supabaseServiceMock.getUserSubscription.mockResolvedValue(null);
		supabaseServiceMock.getSubscriptionTier.mockReturnValue("free");
	});

	it("preflights local conflicts and commits copied IDs with rewritten dependencies in one local transaction", async () => {
		const importedPersona = makePersona({ id: "persona-conflict", name: "Imported" });
		const importedChat = makeChat({
			id: "chat-conflict",
			content: [{ role: "model", parts: [{ text: "Hello" }], personalityid: importedPersona.id }]
		});
		const document = await createTakeoutDocument({
			source: "local",
			categories: ["chats", "personas", "pins"],
			chats: [importedChat],
			personas: [importedPersona],
			settings: {
				[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS]: JSON.stringify([importedChat.id]),
				[SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS]: JSON.stringify([importedPersona.id])
			}
		});
		dbMock.chats.toArray.mockResolvedValue([makeChat({ id: importedChat.id, title: "Existing" })]);
		dbMock.personalities.toArray.mockResolvedValue([makePersona({ id: importedPersona.id, name: "Existing" })]);

		const { inspectTakeoutImport, commitTakeoutImport } = await import("../../../src/services/Takeout.service");
		const inspection = await inspectTakeoutImport(
			[new File([JSON.stringify(document)], "backup.json", { type: "application/json" })],
			"local"
		);
		expect(inspection.conflicts).toEqual({ chats: 1, personas: 1, roleplay: 0 });

		const generatedIds = ["persona-copy", "chat-copy"];
		const result = await commitTakeoutImport(inspection, "copy", {
			createId: () => generatedIds.shift()!
		});

		expect(dbMock.transaction).toHaveBeenCalledTimes(1);
		expect(dbMock.personalities.bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({ id: "persona-copy", name: "Imported" })
		]);
		expect(dbMock.chats.bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({
				id: "chat-copy",
				content: [expect.objectContaining({ personalityid: "persona-copy" })]
			})
		]);
		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS)!)).toEqual(["persona-copy"]);
		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS)!)).toEqual(["chat-copy"]);
		expect(result).toMatchObject({
			destination: "local",
			imported: { chats: 1, personas: 1, settings: 2 },
			failed: { chats: 0, personas: 0, settings: 0 },
			partial: false
		});
	});

	it("exports from IndexedDB and allowlisted local settings when cloud sync is disabled", async () => {
		const chat = makeChat({ id: "local-chat" });
		const persona = makePersona({ id: "local-persona" });
		dbMock.chats.toArray.mockResolvedValue([chat]);
		dbMock.personalities.toArray.mockResolvedValue([persona]);
		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, "openai/gpt-5.4");
		localStorage.setItem(SETTINGS_STORAGE_KEYS.API_KEY, "must-not-export");

		const { buildTakeoutExport } = await import("../../../src/services/Takeout.service");
		const result = await buildTakeoutExport(["chats", "personas", "settings"]);

		expect(result.source).toBe("local");
		expect(result.document.payload.chats?.[0].id).toBe("local-chat");
		expect(result.document.payload.personas?.[0].id).toBe("local-persona");
		expect(result.document.payload.settings).toEqual({
			[SETTINGS_STORAGE_KEYS.MODEL]: "openai/gpt-5.4"
		});
		expect(syncServiceMock.fetchSyncedChatsMetadata).not.toHaveBeenCalled();
	});

	it("uses complete cloud records and materializes message media when cloud sync is active", async () => {
		const metadata = makeChat({ id: "cloud-chat", content: [] });
		const fullMessages = makeChat().content;
		const materializedMessages = structuredClone(fullMessages);
		const persona = makePersona({ id: "cloud-persona" });
		syncServiceMock.isOnlineSyncEnabled.mockReturnValue(true);
		syncServiceMock.isSyncActive.mockReturnValue(true);
		syncServiceMock.getSyncStatus.mockReturnValue("synced");
		syncServiceMock.fetchSyncedChatsMetadata.mockResolvedValue([metadata]);
		syncServiceMock.fetchAllSyncedChatMessages.mockResolvedValue(fullMessages);
		syncServiceMock.materializeMessagesForPortableExport.mockResolvedValue(materializedMessages);
		syncServiceMock.fetchSyncedPersonas.mockResolvedValue([persona]);
		syncServiceMock.fetchSyncedSettingsObject.mockResolvedValue({
			[SETTINGS_STORAGE_KEYS.MODEL]: "google/gemini-2.5-pro"
		});

		const { buildTakeoutExport } = await import("../../../src/services/Takeout.service");
		const result = await buildTakeoutExport(["chats", "media", "personas", "settings"]);

		expect(result.source).toBe("cloud");
		expect(syncServiceMock.fetchAllSyncedChatMessages).toHaveBeenCalledWith("cloud-chat", { signal: undefined });
		expect(syncServiceMock.materializeMessagesForPortableExport).toHaveBeenCalledWith(fullMessages);
		expect(result.document.payload.chats?.[0].content).toEqual(materializedMessages);
		expect(dbMock.chats.toArray).not.toHaveBeenCalled();
	});

	it("rejects a cloud export when the fetched message snapshot is incomplete", async () => {
		const metadata = makeChat({ id: "cloud-chat", content: [] });
		syncServiceMock.isOnlineSyncEnabled.mockReturnValue(true);
		syncServiceMock.isSyncActive.mockReturnValue(true);
		syncServiceMock.getSyncStatus.mockReturnValue("synced");
		syncServiceMock.fetchSyncedChatsMetadata.mockResolvedValue([metadata]);
		syncServiceMock.fetchAllSyncedChatMessages.mockResolvedValue(makeChat().content);
		syncServiceMock.isChatSnapshotFullyHydrated.mockReturnValue(false);

		const { buildTakeoutExport } = await import("../../../src/services/Takeout.service");
		await expect(buildTakeoutExport(["chats"])).rejects.toThrow(/complete message history/i);
	});

	it("cancels before reading or downloading data when its export signal is aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		const { buildTakeoutExport } = await import("../../../src/services/Takeout.service");
		await expect(buildTakeoutExport(["chats"], undefined, controller.signal)).rejects.toMatchObject({
			name: "AbortError"
		});
		expect(dbMock.chats.toArray).not.toHaveBeenCalled();
	});

	it.each([
		[false, "idle", 0, /unlock/i],
		[true, "offline", 0, /offline/i],
		[true, "synced", 2, /pending/i]
	] as const)(
		"refuses an incomplete cloud export (active=%s status=%s pending=%s)",
		async (active, status, pending, expectedMessage) => {
			syncServiceMock.isOnlineSyncEnabled.mockReturnValue(true);
			syncServiceMock.isSyncActive.mockReturnValue(active);
			syncServiceMock.getSyncStatus.mockReturnValue(status);
			syncServiceMock.getPendingSyncOperationCount.mockReturnValue(pending);

			const { buildTakeoutExport } = await import("../../../src/services/Takeout.service");
			await expect(buildTakeoutExport(["chats"])).rejects.toThrow(expectedMessage);
			expect(dbMock.chats.toArray).not.toHaveBeenCalled();
		}
	);

	it("offers Cloud Sync only to an authenticated eligible user and does not present Local while sync is enabled", async () => {
		supabaseServiceMock.getCurrentUser.mockResolvedValue({ id: "user-1" });
		supabaseServiceMock.getUserSubscription.mockResolvedValue({ subscription_status: "active" });
		supabaseServiceMock.getSubscriptionTier.mockReturnValue("pro");

		const { getTakeoutImportDestinations } = await import("../../../src/services/Takeout.service");
		await expect(getTakeoutImportDestinations()).resolves.toEqual({
			local: { available: true },
			cloud: { available: true, ready: false }
		});

		syncServiceMock.isOnlineSyncEnabled.mockReturnValue(true);
		syncServiceMock.isSyncActive.mockReturnValue(true);
		await expect(getTakeoutImportDestinations()).resolves.toEqual({
			local: {
				available: false,
				reason: "Disable Cloud Sync before importing only to this browser."
			},
			cloud: { available: true, ready: true }
		});
	});

	it("commits an eligible cloud import through sync APIs without writing directly to IndexedDB", async () => {
		const persona = makePersona({ id: "cloud-import-persona" });
		const chat = makeChat({ id: "cloud-import-chat" });
		const document = await createTakeoutDocument({
			source: "local",
			categories: ["chats", "personas", "settings"],
			chats: [chat],
			personas: [persona],
			settings: { [SETTINGS_STORAGE_KEYS.MODEL]: "openai/gpt-5.4" }
		});
		syncServiceMock.isOnlineSyncEnabled.mockReturnValue(true);
		syncServiceMock.isSyncActive.mockReturnValue(true);
		syncServiceMock.getSyncStatus.mockReturnValue("synced");
		syncServiceMock.fetchSyncedChatsMetadata.mockResolvedValue([]);
		syncServiceMock.fetchSyncedPersonas.mockResolvedValue([]);
		syncServiceMock.fetchSyncedSettingsObject.mockResolvedValue({});
		supabaseServiceMock.getCurrentUser.mockResolvedValue({ id: "user-1" });
		supabaseServiceMock.getUserSubscription.mockResolvedValue({ subscription_status: "active" });
		supabaseServiceMock.getSubscriptionTier.mockReturnValue("pro");

		const { inspectTakeoutImport, commitTakeoutImport } = await import("../../../src/services/Takeout.service");
		const inspection = await inspectTakeoutImport(
			[new File([JSON.stringify(document)], "backup.json", { type: "application/json" })],
			"cloud"
		);
		const result = await commitTakeoutImport(inspection, "overwrite");

		expect(syncServiceMock.pushPersona).toHaveBeenCalledWith(expect.objectContaining({ id: persona.id }));
		expect(syncServiceMock.upsertSyncedChat).toHaveBeenCalledWith(
			expect.objectContaining({ id: chat.id }),
			undefined
		);
		expect(syncServiceMock.pushSettings).toHaveBeenCalledWith({
			[SETTINGS_STORAGE_KEYS.MODEL]: "openai/gpt-5.4"
		});
		expect(dbMock.transaction).not.toHaveBeenCalled();
		expect(result.partial).toBe(false);
	});

	it("reports and skips a cloud chat whose imported persona dependency failed", async () => {
		const persona = makePersona({ id: "dependent-persona" });
		const chat = makeChat({
			id: "dependent-chat",
			content: [{ role: "model", parts: [{ text: "Hello" }], personalityid: persona.id }]
		});
		const document = await createTakeoutDocument({
			source: "local",
			categories: ["chats", "personas"],
			chats: [chat],
			personas: [persona],
			settings: {}
		});
		syncServiceMock.isOnlineSyncEnabled.mockReturnValue(true);
		syncServiceMock.isSyncActive.mockReturnValue(true);
		syncServiceMock.getSyncStatus.mockReturnValue("synced");
		syncServiceMock.fetchSyncedChatsMetadata.mockResolvedValue([]);
		syncServiceMock.fetchSyncedPersonas.mockResolvedValue([]);
		syncServiceMock.fetchSyncedSettingsObject.mockResolvedValue({});
		syncServiceMock.pushPersona.mockResolvedValue(false);
		supabaseServiceMock.getCurrentUser.mockResolvedValue({ id: "user-1" });
		supabaseServiceMock.getUserSubscription.mockResolvedValue({ subscription_status: "active" });
		supabaseServiceMock.getSubscriptionTier.mockReturnValue("pro");

		const { inspectTakeoutImport, commitTakeoutImport } = await import("../../../src/services/Takeout.service");
		const inspection = await inspectTakeoutImport(
			[new File([JSON.stringify(document)], "backup.json", { type: "application/json" })],
			"cloud"
		);
		const result = await commitTakeoutImport(inspection, "overwrite");

		expect(syncServiceMock.upsertSyncedChat).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			imported: { chats: 0, personas: 0 },
			failed: { chats: 1, personas: 1 },
			partial: true
		});
		expect(result.errors.join(" ")).toMatch(/depends on a persona that failed/i);
	});
});

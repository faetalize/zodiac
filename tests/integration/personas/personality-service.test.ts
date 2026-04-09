import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../../../src/services/Db.service";
import type { Personality } from "../../../src/types/Personality";
import { makePersona } from "../../fixtures/personas";
import { waitForCondition } from "../../helpers/async";
import { resetIndexedDb } from "../../helpers/db";
import { bootstrapDom } from "../../helpers/dom";

vi.mock("../../../src/services/Sync.service", () => ({
	isOnlineSyncEnabled: vi.fn(() => false),
	isSyncActive: vi.fn(() => false),
	fetchSyncedPersonas: vi.fn(async () => []),
	deleteSyncedPersona: vi.fn(async () => true),
	pushPersona: vi.fn(async () => true)
}));

vi.mock("../../../src/services/Pinning.service", () => ({
	getPinnedPersonaIds: vi.fn(() => []),
	isPersonaPinned: vi.fn(() => false),
	togglePersonaPinned: vi.fn(async () => {}),
	removePersonaPin: vi.fn(async () => {}),
	clearPersonaPins: vi.fn(async () => {})
}));

vi.mock("../../../src/services/Supabase.service", () => ({
	getMarketplacePersonaVersion: vi.fn(async () => ({ exists: false, version: 0 })),
	getMarketplacePersonaVersions: vi.fn(async () => new Map()),
	fetchMarketplacePersona: vi.fn()
}));

vi.mock("../../../src/services/Overlay.service", () => ({
	showAddPersonalityForm: vi.fn(),
	showEditPersonalityForm: vi.fn(),
	closeOverlay: vi.fn()
}));

vi.mock("../../../src/services/Toast.service", () => ({
	info: vi.fn(),
	danger: vi.fn(),
	warn: vi.fn()
}));

vi.mock("../../../src/events", () => ({
	onAppEvent: vi.fn()
}));

vi.mock("../../../src/utils/helpers", () => ({
	showElement: vi.fn()
}));

function bootstrapPersonalityDom(): void {
	bootstrapDom(`
        <div id="personalitiesDiv"></div>
    `);
}

function makeLocalPersonality(overrides: Partial<Personality> = {}): Personality {
	const {
		id: _id,
		dateAdded: _dateAdded,
		lastModified: _lastModified,
		syncedFrom: _syncedFrom,
		version: _version,
		localModifications: _localModifications,
		...personality
	} = makePersona(overrides);

	return personality;
}

async function loadPersonalityService() {
	const dbService = await import("../../../src/services/Db.service");
	const personalityService = await import("../../../src/services/Personality.service");

	await personalityService.reloadFromDb();

	return {
		db: dbService.db,
		personalityService
	};
}

async function waitForPersonaDeletion(db: Db, id: string): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (!(await db.personalities.get(id))) {
			return;
		}

		await new Promise((resolve) => window.setTimeout(resolve, 0));
	}

	throw new Error(`Timed out waiting for persona ${id} to be deleted`);
}

describe("Personality.service persona CRUD", () => {
	let db: Db | undefined;

	beforeEach(async () => {
		vi.resetModules();
		await resetIndexedDb();
		bootstrapPersonalityDom();
	});

	afterEach(async () => {
		db?.close();
		db = undefined;
		await resetIndexedDb();
	});

	it("creates a persona and persists it", async () => {
		const { db: testDb, personalityService } = await loadPersonalityService();
		db = testDb;

		const created = await personalityService.add(
			makeLocalPersonality({
				name: "Created Persona",
				description: "Created during the integration test.",
				prompt: "Stay focused.",
				category: "assistant",
				toneExamples: ["Absolutely. Let me handle that."]
			}),
			"persona-created"
		);

		expect(created).toBe(true);

		const storedPersona = await testDb.personalities.get("persona-created");
		expect(storedPersona).toMatchObject({
			id: "persona-created",
			name: "Created Persona",
			description: "Created during the integration test.",
			prompt: "Stay focused.",
			category: "assistant",
			toneExamples: ["Absolutely. Let me handle that."]
		});

		const allPersonas = await personalityService.getAll();
		expect(allPersonas).toEqual([
			expect.objectContaining({
				id: "persona-created",
				name: "Created Persona"
			})
		]);

		const createdCard = document.querySelector<HTMLElement>("#personality-persona-created");
		expect(createdCard).not.toBeNull();
		expect(createdCard?.querySelector<HTMLInputElement>("input[name='personality']")?.value).toBe(
			"Created Persona"
		);
		expect(document.querySelector("#personalitiesDiv .card-personality:not([id])")).not.toBeNull();
		expect(document.querySelector("#btn-add-personality")).not.toBeNull();
	});

	it("pushes persona creation through the sync boundary when cloud sync is active", async () => {
		const syncService = await import("../../../src/services/Sync.service");
		const { db: testDb, personalityService } = await loadPersonalityService();
		db = testDb;

		vi.mocked(syncService.isOnlineSyncEnabled).mockReturnValue(true);
		vi.mocked(syncService.isSyncActive).mockReturnValue(true);
		vi.mocked(syncService.fetchSyncedPersonas).mockResolvedValue([]);
		vi.mocked(syncService.pushPersona).mockResolvedValue(true);

		const created = await personalityService.add(
			makeLocalPersonality({
				name: "Synced Persona",
				description: "Created while cloud sync is active.",
				prompt: "Keep things synchronized."
			}),
			"persona-synced"
		);

		expect(created).toBe(true);
		expect(syncService.pushPersona).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "persona-synced",
				name: "Synced Persona",
				description: "Created while cloud sync is active."
			})
		);
		expect(await testDb.personalities.get("persona-synced")).toBeUndefined();
		expect(document.querySelector("#personality-persona-synced")).not.toBeNull();
		expect(
			document.querySelector<HTMLInputElement>("#personality-persona-synced input[name='personality']")?.value
		).toBe("Synced Persona");
	});

	it("edits an existing persona without affecting others", async () => {
		const { db: testDb, personalityService } = await loadPersonalityService();
		db = testDb;

		await personalityService.add(
			makeLocalPersonality({
				name: "Alpha Persona",
				description: "Original alpha description."
			}),
			"persona-alpha"
		);
		await personalityService.add(
			makeLocalPersonality({
				name: "Beta Persona",
				description: "Leave this persona alone."
			}),
			"persona-beta"
		);

		document.querySelector<HTMLInputElement>("#personality-persona-alpha input[name='personality']")?.click();
		expect((await personalityService.getSelected())?.name).toBe("Alpha Persona");

		const untouchedBefore = await testDb.personalities.get("persona-beta");

		await personalityService.edit(
			"persona-alpha",
			makeLocalPersonality({
				name: "Alpha Persona Updated",
				description: "Updated alpha description.",
				prompt: "Be precise.",
				category: "character",
				tags: ["updated"]
			})
		);

		const updatedPersona = await testDb.personalities.get("persona-alpha");
		expect(updatedPersona).toMatchObject({
			id: "persona-alpha",
			name: "Alpha Persona Updated",
			description: "Updated alpha description.",
			prompt: "Be precise.",
			category: "character",
			tags: ["updated"]
		});
		expect(updatedPersona?.lastModified).toBeGreaterThan(updatedPersona?.dateAdded ?? 0);

		const untouchedAfter = await testDb.personalities.get("persona-beta");
		expect(untouchedAfter).toEqual(untouchedBefore);

		const allPersonas = await personalityService.getAll();
		expect(allPersonas).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "persona-alpha", name: "Alpha Persona Updated" }),
				expect.objectContaining({ id: "persona-beta", name: "Beta Persona" })
			])
		);
		expect((await personalityService.getSelected())?.name).toBe("Alpha Persona Updated");

		expect(document.querySelector("#personality-persona-alpha")).not.toBeNull();
		expect(
			document.querySelector<HTMLInputElement>("#personality-persona-alpha input[name='personality']")?.value
		).toBe("Alpha Persona Updated");
		expect(document.querySelector("#personality-persona-beta")).not.toBeNull();
	});

	it("pushes synced persona edits through the sync boundary without affecting others", async () => {
		const syncService = await import("../../../src/services/Sync.service");
		const alphaOriginal = makePersona({
			id: "persona-synced-alpha",
			name: "Synced Alpha",
			description: "Original synced alpha description.",
			prompt: "Original synced alpha prompt.",
			syncedFrom: "market-alpha",
			version: 7,
			dateAdded: 1_700_000_000_000,
			lastModified: 1_700_000_000_000
		});
		const betaOriginal = makePersona({
			id: "persona-synced-beta",
			name: "Synced Beta",
			description: "Leave this synced persona alone.",
			prompt: "Beta prompt.",
			syncedFrom: "market-beta",
			version: 4,
			dateAdded: 1_700_000_100_000,
			lastModified: 1_700_000_100_000
		});
		const remotePersonasById = new Map([
			[alphaOriginal.id, alphaOriginal],
			[betaOriginal.id, betaOriginal]
		]);

		vi.mocked(syncService.isOnlineSyncEnabled).mockReturnValue(true);
		vi.mocked(syncService.isSyncActive).mockReturnValue(true);
		vi.mocked(syncService.fetchSyncedPersonas).mockImplementation(async () => {
			return Array.from(remotePersonasById.values()).map((persona) => structuredClone(persona));
		});
		vi.mocked(syncService.pushPersona).mockImplementation(async (persona) => {
			remotePersonasById.set(persona.id, structuredClone(persona));
			return true;
		});

		const { db: testDb, personalityService } = await loadPersonalityService();
		db = testDb;

		document
			.querySelector<HTMLInputElement>("#personality-persona-synced-alpha input[name='personality']")
			?.click();
		expect((await personalityService.getSelected())?.name).toBe("Synced Alpha");

		const untouchedBefore = structuredClone(remotePersonasById.get("persona-synced-beta"));

		await personalityService.edit(
			"persona-synced-alpha",
			makeLocalPersonality({
				name: "Synced Alpha Updated",
				description: "Updated synced alpha description.",
				prompt: "Keep synced edits precise.",
				category: "assistant",
				tags: ["synced", "updated"]
			})
		);

		const updatedRemote = remotePersonasById.get("persona-synced-alpha");
		expect(syncService.pushPersona).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "persona-synced-alpha",
				name: "Synced Alpha Updated",
				description: "Updated synced alpha description.",
				prompt: "Keep synced edits precise.",
				category: "assistant",
				tags: ["synced", "updated"],
				syncedFrom: "market-alpha",
				version: 0,
				dateAdded: alphaOriginal.dateAdded
			})
		);
		expect(updatedRemote).toMatchObject({
			id: "persona-synced-alpha",
			name: "Synced Alpha Updated",
			description: "Updated synced alpha description.",
			prompt: "Keep synced edits precise.",
			category: "assistant",
			tags: ["synced", "updated"],
			syncedFrom: "market-alpha",
			version: 0,
			dateAdded: alphaOriginal.dateAdded
		});
		expect(updatedRemote?.lastModified).toBeGreaterThan(alphaOriginal.lastModified);
		expect(remotePersonasById.get("persona-synced-beta")).toEqual(untouchedBefore);

		expect(await testDb.personalities.toArray()).toEqual([]);
		expect((await personalityService.getSelected())?.name).toBe("Synced Alpha Updated");
		expect(document.querySelector("#personality-persona-synced-alpha")).not.toBeNull();
		expect(
			document.querySelector<HTMLInputElement>("#personality-persona-synced-alpha input[name='personality']")
				?.value
		).toBe("Synced Alpha Updated");
		expect(
			document.querySelector<HTMLInputElement>("#personality-persona-synced-alpha input[name='personality']")
				?.checked
		).toBe(true);
		expect(document.querySelector("#personality-persona-synced-beta")).not.toBeNull();
	});

	it("deletes a persona and removes it from the UI", async () => {
		const { db: testDb, personalityService } = await loadPersonalityService();
		db = testDb;

		await personalityService.add(
			makeLocalPersonality({
				name: "Delete Me",
				description: "This persona should be removed."
			}),
			"persona-delete"
		);
		await personalityService.add(
			makeLocalPersonality({
				name: "Keep Me",
				description: "This persona should remain."
			}),
			"persona-keep"
		);

		document.querySelector<HTMLInputElement>("#personality-persona-delete input[name='personality']")?.click();
		expect((await personalityService.getSelected())?.name).toBe("Delete Me");

		document.querySelector<HTMLButtonElement>("#personality-persona-delete .btn-delete-card")?.click();

		await waitForPersonaDeletion(testDb, "persona-delete");

		expect(await testDb.personalities.get("persona-delete")).toBeUndefined();
		expect(await testDb.personalities.get("persona-keep")).toMatchObject({
			id: "persona-keep",
			name: "Keep Me"
		});

		const allPersonas = await personalityService.getAll();
		expect(allPersonas).toEqual([expect.objectContaining({ id: "persona-keep", name: "Keep Me" })]);
		expect((await personalityService.getSelected())?.name).toBe("zodiac");

		expect(document.querySelector("#personality-persona-delete")).toBeNull();
		expect(document.querySelector("#personality-persona-keep")).not.toBeNull();
		expect(
			document.querySelector<HTMLInputElement>(
				"#personalitiesDiv .card-personality:not([id]) input[name='personality']"
			)?.checked
		).toBe(true);
	});

	it("deletes a selected synced persona and falls back to the default persona", async () => {
		const syncService = await import("../../../src/services/Sync.service");
		const remotePersonasById = new Map([
			[
				"persona-synced-delete",
				makePersona({
					id: "persona-synced-delete",
					name: "Delete Synced Persona",
					description: "This synced persona should be removed.",
					syncedFrom: "market-delete",
					version: 3
				})
			],
			[
				"persona-synced-keep",
				makePersona({
					id: "persona-synced-keep",
					name: "Keep Synced Persona",
					description: "This synced persona should remain.",
					syncedFrom: "market-keep",
					version: 5
				})
			]
		]);

		vi.mocked(syncService.isOnlineSyncEnabled).mockReturnValue(true);
		vi.mocked(syncService.isSyncActive).mockReturnValue(true);
		vi.mocked(syncService.fetchSyncedPersonas).mockImplementation(async () => {
			return Array.from(remotePersonasById.values()).map((persona) => structuredClone(persona));
		});
		vi.mocked(syncService.deleteSyncedPersona).mockImplementation(async (id: string) => {
			return remotePersonasById.delete(id);
		});

		const { db: testDb, personalityService } = await loadPersonalityService();
		db = testDb;

		document
			.querySelector<HTMLInputElement>("#personality-persona-synced-delete input[name='personality']")
			?.click();
		expect((await personalityService.getSelected())?.name).toBe("Delete Synced Persona");

		document.querySelector<HTMLButtonElement>("#personality-persona-synced-delete .btn-delete-card")?.click();

		await waitForCondition(
			() => !remotePersonasById.has("persona-synced-delete"),
			"Timed out waiting for synced persona deletion"
		);

		expect(syncService.deleteSyncedPersona).toHaveBeenCalledWith("persona-synced-delete");
		expect(await testDb.personalities.toArray()).toEqual([]);
		expect(remotePersonasById.get("persona-synced-keep")).toMatchObject({
			id: "persona-synced-keep",
			name: "Keep Synced Persona"
		});

		const allPersonas = await personalityService.getAll();
		expect(allPersonas).toEqual([
			expect.objectContaining({ id: "persona-synced-keep", name: "Keep Synced Persona" })
		]);
		expect((await personalityService.getSelected())?.name).toBe("zodiac");

		expect(document.querySelector("#personality-persona-synced-delete")).toBeNull();
		expect(document.querySelector("#personality-persona-synced-keep")).not.toBeNull();
		expect(
			document.querySelector<HTMLInputElement>(
				"#personalitiesDiv .card-personality:not([id]) input[name='personality']"
			)?.checked
		).toBe(true);
	});
});

describe("Personality.service persona card rendering", () => {
	beforeEach(() => {
		vi.resetModules();
		bootstrapPersonalityDom();
	});

	it("renders a complete sidebar card for a local persona", async () => {
		const { personalityService } = await loadPersonalityService();

		const card = personalityService.generateCard(
			makeLocalPersonality({
				name: "Rendered Persona",
				description: "Rendered in the sidebar.",
				image: "https://example.com/rendered.png"
			}),
			"persona-rendered"
		);

		document.querySelector("#personalitiesDiv")?.append(card);

		expect(card.id).toBe("personality-persona-rendered");
		expect(card.querySelector(".personality-title")?.textContent).toBe("Rendered Persona");
		expect(card.querySelector(".personality-description")?.textContent).toBe("Rendered in the sidebar.");
		expect(card.querySelector<HTMLInputElement>("input[name='personality']")?.value).toBe("Rendered Persona");
		expect(card.querySelector<HTMLImageElement>(".background-img")?.getAttribute("src")).toBe(
			"https://example.com/rendered.png"
		);
		expect(card.querySelector(".btn-pin-card")).not.toBeNull();
		expect(card.querySelector(".btn-edit-card")).not.toBeNull();
		expect(card.querySelector(".btn-share-card")).not.toBeNull();
		expect(card.querySelector(".btn-delete-card")).not.toBeNull();
	});
});

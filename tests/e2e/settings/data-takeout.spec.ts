import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

async function openDataManagement(page: Page): Promise<void> {
	await page.locator(".navbar-tab").filter({ hasText: "Settings" }).first().click();
	await page.locator('[data-settings-target="data"]').click();
	await expect(page.locator('[data-settings-page="data"]')).toBeVisible();
}

async function seedTakeoutRecords(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { db } = await importModule("/services/Db.service.ts");
		await db.personalities.put({
			id: "persona-takeout",
			name: "Takeout Persona",
			image: "",
			description: "Portable persona",
			prompt: "Stay portable.",
			aggressiveness: 0,
			sensuality: 0,
			independence: 50,
			nsfw: false,
			internetEnabled: false,
			roleplayEnabled: true,
			toneExamples: [],
			tags: [],
			category: "character",
			dateAdded: 1_725_000_000_000,
			lastModified: 1_725_000_000_000
		});
		await db.chats.put({
			id: "chat-takeout",
			title: "Takeout Chat",
			timestamp: 1_725_000_000_000,
			content: [
				{
					role: "model",
					parts: [{ text: "Portable message" }],
					personalityid: "persona-takeout"
				}
			]
		});
		localStorage.setItem("pinnedChatIds", JSON.stringify(["chat-takeout"]));
		localStorage.setItem("pinnedPersonaIds", JSON.stringify(["persona-takeout"]));
	});
}

test("exports one selective takeout and restores its logical IDs through the adaptive import sheet", async ({
	page
}) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await seedTakeoutRecords(page);
	await openDataManagement(page);

	await expect(page.locator("#btn-bulk-import-chats")).toHaveCount(0);
	await expect(page.locator("#btn-export-all-chats")).toHaveCount(0);
	await page.locator("#btn-export-data").click();
	await expect(page.locator("#takeout-export-sheet")).toBeVisible();
	await expect(page.locator("#takeout-export-source")).toContainText("this browser");
	await expect(page.locator("#takeout-select-all")).toBeChecked();
	await expect(page.locator("#takeout-category-apiKeys")).not.toBeChecked();

	const downloadPromise = page.waitForEvent("download");
	await page.locator("#btn-takeout-export").click();
	const download = await downloadPromise;
	const downloadPath = await download.path();
	if (!downloadPath) throw new Error("Takeout download did not produce a readable file.");
	const takeoutBytes = await readFile(downloadPath);
	const takeout = JSON.parse(takeoutBytes.toString("utf8"));

	expect(takeout.format).toBe("zozo-chat-takeout");
	expect(takeout.schemaVersion).toBe(1);
	expect(takeout.payload.chats[0].id).toBe("chat-takeout");
	expect(takeout.payload.personas[0].id).toBe("persona-takeout");
	expect(takeout.payload.settings.API_KEY).toBeUndefined();
	expect(takeout.payload.settings.OPENROUTER_API_KEY).toBeUndefined();
	await expect(page.locator("#takeout-export-status")).toContainText("1 chat");
	await page.locator("#btn-takeout-export-close").click();

	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { db } = await importModule("/services/Db.service.ts");
		await db.chats.clear();
		await db.personalities.clear();
		localStorage.removeItem("pinnedChatIds");
		localStorage.removeItem("pinnedPersonaIds");
	});

	await page.locator("#btn-import-data").click();
	await expect(page.locator("#takeout-import-sheet")).toBeVisible();
	await page.locator("#takeout-import-files").setInputFiles({
		name: "zozo-chat-takeout.json",
		mimeType: "application/json",
		buffer: takeoutBytes
	});
	await page.locator("#btn-takeout-import").click();
	await expect(page.locator("#takeout-import-status")).toContainText("Imported 1 chat and 1 persona");

	const restored = await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { db } = await importModule("/services/Db.service.ts");
		const chats = await db.chats.toArray();
		const personas = await db.personalities.toArray();
		return {
			chatIds: chats.map((chat: { id: string }) => chat.id),
			personaIds: personas.map((persona: { id: string }) => persona.id),
			messagePersonaId: chats[0]?.content[0]?.personalityid,
			pinnedChatIds: JSON.parse(localStorage.getItem("pinnedChatIds") ?? "[]"),
			pinnedPersonaIds: JSON.parse(localStorage.getItem("pinnedPersonaIds") ?? "[]")
		};
	});

	expect(restored).toEqual({
		chatIds: ["chat-takeout"],
		personaIds: ["persona-takeout"],
		messagePersonaId: "persona-takeout",
		pinnedChatIds: ["chat-takeout"],
		pinnedPersonaIds: ["persona-takeout"]
	});
});

test("restoring conflicts as copies remaps the imported chat to the copied persona", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");

	const takeout = await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { createTakeoutDocument } = await importModule("/utils/takeout.ts");
		return await createTakeoutDocument({
			source: "local",
			categories: ["chats", "personas"],
			personas: [
				{
					id: "persona-conflict",
					name: "Imported Persona",
					image: "",
					description: "Imported",
					prompt: "Imported prompt",
					aggressiveness: 0,
					sensuality: 0,
					independence: 50,
					nsfw: false,
					internetEnabled: false,
					roleplayEnabled: true,
					toneExamples: [],
					tags: [],
					category: "character",
					dateAdded: 100,
					lastModified: 100
				}
			],
			chats: [
				{
					id: "chat-conflict",
					title: "Imported Chat",
					timestamp: 100,
					content: [
						{
							role: "model",
							parts: [{ text: "Imported message" }],
							personalityid: "persona-conflict"
						}
					]
				}
			],
			settings: {}
		});
	});

	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { db } = await importModule("/services/Db.service.ts");
		await db.personalities.put({
			id: "persona-conflict",
			name: "Existing Persona",
			image: "",
			description: "Existing",
			prompt: "Existing prompt",
			aggressiveness: 0,
			sensuality: 0,
			independence: 50,
			nsfw: false,
			internetEnabled: false,
			roleplayEnabled: true,
			toneExamples: [],
			tags: [],
			category: "character",
			dateAdded: 200,
			lastModified: 200
		});
		await db.chats.put({
			id: "chat-conflict",
			title: "Existing Chat",
			timestamp: 200,
			content: [
				{
					role: "model",
					parts: [{ text: "Existing message" }],
					personalityid: "persona-conflict"
				}
			]
		});
	});

	await openDataManagement(page);
	await page.locator("#btn-import-data").click();
	await page.locator("#takeout-import-files").setInputFiles({
		name: "conflicting-takeout.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(takeout))
	});
	await page.locator("#btn-takeout-import").click();

	await expect(page.locator("#takeout-conflicts")).toBeVisible();
	await expect(page.locator("#takeout-conflict-title")).toHaveText(
		"Some entries have IDs that already exist in the target. Should we restore them as copies, or overwrite?"
	);
	await page.locator("#btn-takeout-copy").click();
	await expect(page.locator("#takeout-import-status")).toContainText("Imported 1 chat and 1 persona");

	const records = await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { db } = await importModule("/services/Db.service.ts");
		return {
			chats: await db.chats.toArray(),
			personas: await db.personalities.toArray()
		};
	});
	const importedPersona = records.personas.find((persona: { name: string }) => persona.name === "Imported Persona");
	const importedChat = records.chats.find((chat: { title: string }) => chat.title === "Imported Chat");
	expect(records.personas).toHaveLength(2);
	expect(records.chats).toHaveLength(2);
	expect(importedPersona.id).not.toBe("persona-conflict");
	expect(importedChat.id).not.toBe("chat-conflict");
	expect(importedChat.content[0].personalityid).toBe(importedPersona.id);
});

test("importing a takeout containing an API key keeps the danger confirmation accessible and clickable", async ({
	page
}) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");

	const takeout = await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { createTakeoutDocument } = await importModule("/utils/takeout.ts");
		return await createTakeoutDocument({
			source: "local",
			categories: ["apiKeys"],
			chats: [],
			personas: [],
			settings: { API_KEY: "imported-test-api-key" }
		});
	});

	await openDataManagement(page);
	await page.locator("#btn-import-data").click();
	await page.locator("#takeout-import-files").setInputFiles({
		name: "takeout-with-api-key.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(takeout))
	});
	await page.locator("#btn-takeout-import").click();

	await expect(page.locator("#dialog")).toBeVisible();
	await expect(page.locator("#dialog-message")).toContainText("readable BYOK API keys");
	await expect(page.locator("#btn-dialog-ok")).toBeVisible();
	await expect(page.locator("#btn-dialog-ok")).toBeEnabled();
	await page.locator("#btn-dialog-ok").click({ trial: true });
});

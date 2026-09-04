import { describe, expect, it } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../src/constants/SettingsStorageKeys";
import type { DbChat } from "../../src/types/Chat";
import type { DbPersonality } from "../../src/types/Personality";
import type { TakeoutDocument } from "../../src/types/Takeout";
import {
	TAKEOUT_FORMAT,
	TAKEOUT_SCHEMA_VERSION,
	createTakeoutDocument,
	deserializeTakeoutChat,
	parseImportText,
	planTakeoutImport
} from "../../src/utils/takeout";
import { makeChat } from "../fixtures/chats";
import { makeUserMessage } from "../fixtures/messages";
import { makePersona } from "../fixtures/personas";

const EXPORTED_AT = "2026-09-04T12:00:00.000Z";

async function resign(takeout: TakeoutDocument): Promise<void> {
	const { integrity: _oldIntegrity, ...content } = takeout;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(content)));
	takeout.integrity.digest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
		""
	);
}

function takeoutArgs(overrides: Record<string, unknown> = {}) {
	return {
		source: "local" as const,
		categories: ["chats", "media", "personas", "settings", "pins"] as const,
		chats: [] as DbChat[],
		personas: [] as DbPersonality[],
		settings: {} as Record<string, string>,
		exportedAt: EXPORTED_AT,
		...overrides
	};
}

describe("Zozo Chat takeout format", () => {
	it("creates a versioned, integrity-checked document while preserving logical IDs and attachment bytes", async () => {
		const attachment = new File(["hello takeout"], "notes.txt", {
			type: "text/plain",
			lastModified: 1_725_000_000_000
		});
		const persona = makePersona({ id: "persona-source" });
		const chat = makeChat({
			id: "chat-source",
			content: [
				makeUserMessage("hello", {
					personalityid: persona.id,
					parts: [{ text: "hello", attachments: [attachment] }]
				})
			]
		});

		const takeout = await createTakeoutDocument(
			takeoutArgs({
				chats: [chat],
				personas: [persona],
				settings: {
					[SETTINGS_STORAGE_KEYS.MODEL]: "openai/gpt-5.4",
					[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS]: JSON.stringify([chat.id])
				}
			})
		);

		expect(takeout.format).toBe(TAKEOUT_FORMAT);
		expect(takeout.schemaVersion).toBe(TAKEOUT_SCHEMA_VERSION);
		expect(takeout.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
		expect(takeout.exportedAt).toBe(EXPORTED_AT);
		expect(takeout.payload.chats?.[0].id).toBe("chat-source");
		expect(takeout.payload.personas?.[0].id).toBe("persona-source");
		expect(takeout.manifest.counts).toMatchObject({
			chats: 1,
			messages: 1,
			personas: 1,
			attachments: 1
		});
		expect(takeout.integrity).toMatchObject({ algorithm: "SHA-256" });

		const portableAttachment = takeout.payload.chats?.[0].content[0].parts[0].attachments?.[0];
		expect(portableAttachment).toMatchObject({
			name: "notes.txt",
			mimeType: "text/plain",
			size: 13,
			lastModified: 1_725_000_000_000,
			base64: "aGVsbG8gdGFrZW91dA=="
		});

		const parsed = await parseImportText(JSON.stringify(takeout), "zozo-chat-takeout.json");
		expect(parsed.kind).toBe("unified");
		expect(parsed.payload.chats?.[0].id).toBe("chat-source");

		const restoredChat = deserializeTakeoutChat(parsed.payload.chats![0]);
		const restoredAttachment = Array.from(restoredChat.content[0].parts[0].attachments ?? [])[0];
		expect(restoredAttachment).toMatchObject({
			name: "notes.txt",
			type: "text/plain",
			size: 13,
			lastModified: 1_725_000_000_000
		});
	});

	it("omits media cleanly when media is not selected", async () => {
		const chat = makeChat({
			content: [
				makeUserMessage("media", {
					parts: [
						{
							text: "media",
							inlineData: { data: "aGVsbG8=", mimeType: "text/plain" },
							attachments: [new File(["hello"], "hello.txt", { type: "text/plain" })]
						}
					],
					generatedImages: [{ mimeType: "image/png", base64: "aW1hZ2U=" }]
				})
			]
		});

		const takeout = await createTakeoutDocument(takeoutArgs({ categories: ["chats"], chats: [chat] }));
		const message = takeout.payload.chats![0].content[0];

		expect(message.parts[0].inlineData).toBeUndefined();
		expect(message.parts[0].attachments).toBeUndefined();
		expect(message.generatedImages).toBeUndefined();
		expect(takeout.manifest.counts.attachments).toBe(0);
		expect(takeout.manifest.counts.generatedImages).toBe(0);
	});

	it("uses an allowlist for settings and requires the API-key category for readable credentials", async () => {
		const storedSettings = {
			[SETTINGS_STORAGE_KEYS.MODEL]: "openai/gpt-5.4",
			[SETTINGS_STORAGE_KEYS.THEME_SETTINGS]: JSON.stringify({
				colorTheme: "blue",
				mode: "dark",
				preference: "manual"
			}),
			[SETTINGS_STORAGE_KEYS.API_KEY]: "gemini-secret",
			[SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY]: "openrouter-secret",
			[SETTINGS_STORAGE_KEYS.CLOUD_MEDIA_MIGRATION_V1_DONE]: "true",
			"sb-project-auth-token": "must-never-export",
			"zodiac-sync-offline-queue": "must-never-export"
		};

		const withoutCredentials = await createTakeoutDocument(
			takeoutArgs({ categories: ["settings", "themes"], settings: storedSettings })
		);
		expect(withoutCredentials.payload.settings).toEqual({
			[SETTINGS_STORAGE_KEYS.MODEL]: "openai/gpt-5.4",
			[SETTINGS_STORAGE_KEYS.THEME_SETTINGS]: storedSettings[SETTINGS_STORAGE_KEYS.THEME_SETTINGS]
		});

		const withCredentials = await createTakeoutDocument(
			takeoutArgs({ categories: ["settings", "themes", "apiKeys"], settings: storedSettings })
		);
		expect(withCredentials.payload.settings).toMatchObject({
			[SETTINGS_STORAGE_KEYS.API_KEY]: "gemini-secret",
			[SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY]: "openrouter-secret"
		});
		expect(withCredentials.payload.settings).not.toHaveProperty(
			SETTINGS_STORAGE_KEYS.CLOUD_MEDIA_MIGRATION_V1_DONE
		);
		expect(withCredentials.payload.settings).not.toHaveProperty("sb-project-auth-token");
		expect(withCredentials.payload.settings).not.toHaveProperty("zodiac-sync-offline-queue");
	});

	it("counts LoRAs, pins, and roleplay records instead of their storage keys", async () => {
		const takeout = await createTakeoutDocument(
			takeoutArgs({
				categories: ["loras", "pins", "roleplay"],
				settings: {
					[SETTINGS_STORAGE_KEYS.LORAS]: JSON.stringify(["lora-1", "lora-2"]),
					[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS]: JSON.stringify(["chat-1", "chat-2"]),
					[SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS]: JSON.stringify(["persona-1"]),
					[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES]: JSON.stringify([
						{ id: "custom:scene", label: "Scene" }
					]),
					[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS]: JSON.stringify([
						{ id: "custom-action", label: "Action", text: "acts", category: "custom:scene" }
					]),
					[SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS]: JSON.stringify(["custom-action"])
				}
			})
		);

		expect(takeout.manifest.counts).toMatchObject({ loras: 2, pins: 3, roleplay: 3 });
	});

	it("rejects a takeout whose payload no longer matches its integrity digest", async () => {
		const takeout = await createTakeoutDocument(takeoutArgs({ chats: [makeChat({ id: "chat-integrity" })] }));
		takeout.payload.chats![0].title = "tampered";

		await expect(parseImportText(JSON.stringify(takeout), "takeout.json")).rejects.toThrow(/integrity/i);
	});

	it("rejects a correctly signed document that contains an unknown or out-of-category setting", async () => {
		const takeout = await createTakeoutDocument(
			takeoutArgs({ categories: ["settings"], settings: { [SETTINGS_STORAGE_KEYS.MODEL]: "openai/gpt-5.4" } })
		);
		takeout.payload.settings!["sb-project-auth-token"] = "must-never-import";
		await resign(takeout);

		await expect(parseImportText(JSON.stringify(takeout), "takeout.json")).rejects.toThrow(/setting/i);
	});

	it("rejects a signed document whose payload contains a category omitted by its manifest", async () => {
		const takeout = await createTakeoutDocument(
			takeoutArgs({ categories: ["chats"], chats: [makeChat({ id: "undeclared-chat" })] })
		);
		takeout.manifest.categories = [];
		await resign(takeout);

		await expect(parseImportText(JSON.stringify(takeout), "takeout.json")).rejects.toThrow(/chats category/i);
	});

	it("rejects a signed attachment descriptor whose declared size does not match its bytes", async () => {
		const chat = makeChat({
			content: [
				makeUserMessage("attachment", {
					parts: [{ attachments: [new File(["hello"], "hello.txt", { type: "text/plain" })] }]
				})
			]
		});
		const takeout = await createTakeoutDocument(takeoutArgs({ categories: ["chats", "media"], chats: [chat] }));
		takeout.payload.chats![0].content[0].parts[0].attachments![0].size = 999;
		await resign(takeout);

		const parsed = await parseImportText(JSON.stringify(takeout), "takeout.json");
		expect(() => deserializeTakeoutChat(parsed.payload.chats![0])).toThrow(/attachment size/i);
	});

	it.each([
		["single legacy chat", JSON.stringify({ title: "Legacy chat", timestamp: 123, content: [] }), "chats", 1],
		["legacy chat array", JSON.stringify([{ title: "One", timestamp: 1, content: [] }]), "chats", 1],
		[
			"single legacy persona",
			JSON.stringify({ name: "Legacy persona", prompt: "Hello", image: "" }),
			"personas",
			1
		],
		["legacy persona array", JSON.stringify([{ name: "One", prompt: "Hello", image: "" }]), "personas", 1]
	] as const)("detects a %s by validated shape", async (_label, text, category, count) => {
		const parsed = await parseImportText(text, "legacy.json");
		expect(parsed.kind).toBe("legacy");
		expect(parsed.categories).toEqual([category]);
		expect(parsed.payload[category]).toHaveLength(count);
	});
});

describe("takeout import planning", () => {
	it("preserves logical IDs when the destination has no conflicts", () => {
		const persona = makePersona({ id: "persona-source" });
		const chat = makeChat({
			id: "chat-source",
			content: [makeUserMessage("Hello", { personalityid: persona.id })]
		});

		const plan = planTakeoutImport({
			payload: { chats: [chat], personas: [persona], settings: {} },
			existingChats: [],
			existingPersonas: [],
			resolution: "copy",
			createId: () => {
				throw new Error("No ID should be generated for a conflict-free restore");
			}
		});

		expect(plan.chats[0].id).toBe("chat-source");
		expect(plan.personas[0].id).toBe("persona-source");
		expect(plan.chats[0].content[0].personalityid).toBe("persona-source");
	});

	it("maps copied persona and chat IDs through every dependency in the imported package", () => {
		const importedPersona = makePersona({ id: "persona-conflict", name: "Imported persona" });
		const importedChat = makeChat({
			id: "chat-conflict",
			content: [makeUserMessage("Hello", { personalityid: importedPersona.id })],
			groupChat: {
				mode: "rpg",
				participantIds: [importedPersona.id],
				rpg: { turnOrder: [importedPersona.id, "user"] },
				dynamic: {
					allowPings: true,
					maxMessageGuardById: { [importedPersona.id]: 4 }
				}
			}
		});
		const generatedIds = ["persona-copy", "chat-copy"];

		const plan = planTakeoutImport({
			payload: {
				personas: [importedPersona],
				chats: [importedChat],
				settings: {
					[SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS]: JSON.stringify([importedPersona.id]),
					[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS]: JSON.stringify([importedChat.id])
				}
			},
			existingPersonas: [makePersona({ id: importedPersona.id, name: "Existing persona" })],
			existingChats: [makeChat({ id: importedChat.id, title: "Existing chat" })],
			resolution: "copy",
			createId: () => generatedIds.shift()!
		});

		expect(plan.personaIdMap).toEqual({ "persona-conflict": "persona-copy" });
		expect(plan.chatIdMap).toEqual({ "chat-conflict": "chat-copy" });
		expect(plan.personas[0].id).toBe("persona-copy");
		expect(plan.chats[0].id).toBe("chat-copy");
		expect(plan.chats[0].content[0].personalityid).toBe("persona-copy");
		expect(plan.chats[0].groupChat?.participantIds).toEqual(["persona-copy"]);
		expect(plan.chats[0].groupChat?.rpg?.turnOrder).toEqual(["persona-copy", "user"]);
		expect(plan.chats[0].groupChat?.dynamic?.maxMessageGuardById).toEqual({ "persona-copy": 4 });
		expect(JSON.parse(plan.settings[SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS])).toEqual(["persona-copy"]);
		expect(JSON.parse(plan.settings[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS])).toEqual(["chat-copy"]);
	});

	it("keeps IDs unchanged when the user chooses overwrite", () => {
		const importedPersona = makePersona({ id: "persona-conflict", name: "Imported persona" });
		const importedChat = makeChat({
			id: "chat-conflict",
			content: [makeUserMessage("Hello", { personalityid: importedPersona.id })]
		});

		const plan = planTakeoutImport({
			payload: { personas: [importedPersona], chats: [importedChat], settings: {} },
			existingPersonas: [makePersona({ id: importedPersona.id, name: "Existing persona" })],
			existingChats: [makeChat({ id: importedChat.id, title: "Existing chat" })],
			resolution: "overwrite",
			createId: () => {
				throw new Error("Overwrite must retain source IDs");
			}
		});

		expect(plan.personas[0].id).toBe("persona-conflict");
		expect(plan.chats[0].id).toBe("chat-conflict");
		expect(plan.chats[0].content[0].personalityid).toBe("persona-conflict");
	});

	it("remaps copied roleplay categories and actions through imported favorites", () => {
		const plan = planTakeoutImport({
			payload: {
				settings: {
					[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES]: JSON.stringify([
						{ id: "custom:scene", label: "Imported scene" }
					]),
					[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS]: JSON.stringify([
						{
							id: "custom-action",
							label: "Imported action",
							text: "does the imported action",
							category: "custom:scene"
						}
					]),
					[SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS]: JSON.stringify(["custom-action"])
				}
			},
			existingChats: [],
			existingPersonas: [],
			existingSettings: {
				[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES]: JSON.stringify([
					{ id: "custom:scene", label: "Existing scene" }
				]),
				[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS]: JSON.stringify([
					{
						id: "custom-action",
						label: "Existing action",
						text: "does the existing action",
						category: "custom:scene"
					}
				]),
				[SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS]: JSON.stringify(["custom-action"])
			},
			resolution: "copy",
			createId: (() => {
				const ids = ["scene-copy", "action-copy"];
				return () => ids.shift()!;
			})()
		});

		const categories = JSON.parse(plan.settings[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES]);
		const actions = JSON.parse(plan.settings[SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS]);
		const favorites = JSON.parse(plan.settings[SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS]);
		expect(categories).toEqual([
			{ id: "custom:scene", label: "Existing scene" },
			{ id: "custom:scene-copy", label: "Imported scene" }
		]);
		expect(actions).toEqual([
			expect.objectContaining({ id: "custom-action", text: "does the existing action" }),
			expect.objectContaining({
				id: "custom-action-copy",
				text: "does the imported action",
				category: "custom:scene-copy"
			})
		]);
		expect(favorites).toEqual(["custom-action", "custom-action-copy"]);
		expect(plan.conflicts.roleplay).toBe(2);
	});

	it("skips records that already exist with equivalent content", () => {
		const persona = makePersona({ id: "persona-same" });
		const chat = makeChat({ id: "chat-same" });

		const plan = planTakeoutImport({
			payload: { personas: [persona], chats: [chat], settings: {} },
			existingPersonas: [structuredClone(persona)],
			existingChats: [structuredClone(chat)],
			resolution: "copy",
			createId: () => {
				throw new Error("Equivalent records must not be copied");
			}
		});

		expect(plan.personas).toEqual([]);
		expect(plan.chats).toEqual([]);
		expect(plan.skipped).toEqual({ chats: 1, personas: 1, roleplay: 0 });
		expect(plan.personaIdMap).toEqual({ "persona-same": "persona-same" });
		expect(plan.chatIdMap).toEqual({ "chat-same": "chat-same" });
	});

	it("rejects duplicate logical IDs inside the imported package before planning writes", () => {
		expect(() =>
			planTakeoutImport({
				payload: {
					chats: [
						makeChat({ id: "duplicate-chat", title: "First" }),
						makeChat({ id: "duplicate-chat", title: "Second" })
					]
				},
				existingChats: [],
				existingPersonas: [],
				resolution: "copy"
			})
		).toThrow(/duplicate chat id/i);
	});

	it("preserves and reports an unresolved persona reference instead of linking it to another persona", () => {
		const plan = planTakeoutImport({
			payload: {
				chats: [
					makeChat({
						id: "orphan-chat",
						content: [makeUserMessage("Hello", { personalityid: "missing-persona" })]
					})
				]
			},
			existingChats: [],
			existingPersonas: [],
			resolution: "copy"
		});

		expect(plan.chats[0].content[0].personalityid).toBe("missing-persona");
		expect(plan.warnings.join(" ")).toMatch(/missing-persona/);
	});
});

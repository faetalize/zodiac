import { v4 as uuidv4 } from "uuid";
import { APP_VERSION } from "../constants/App";
import {
	DEFAULT_TAKEOUT_CATEGORIES,
	TAKEOUT_CATEGORIES,
	TAKEOUT_FORMAT,
	TAKEOUT_SCHEMA_VERSION,
	TAKEOUT_SETTING_KEYS
} from "../constants/Takeout";
import { SETTINGS_STORAGE_KEYS } from "../constants/SettingsStorageKeys";
import type { DbChat } from "../types/Chat";
import type { Message } from "../types/Message";
import type { DbPersonality, Personality } from "../types/Personality";
import type {
	ParsedTakeout,
	TakeoutCategory,
	TakeoutChat,
	TakeoutConflictResolution,
	TakeoutDocument,
	TakeoutImportPlan,
	TakeoutMessage,
	TakeoutPayload,
	TakeoutSource
} from "../types/Takeout";

export { DEFAULT_TAKEOUT_CATEGORIES, TAKEOUT_CATEGORIES, TAKEOUT_FORMAT, TAKEOUT_SCHEMA_VERSION };

interface CreateTakeoutDocumentArgs {
	source: TakeoutSource;
	categories: readonly TakeoutCategory[];
	chats: DbChat[];
	personas: DbPersonality[];
	settings: Record<string, string>;
	exportedAt?: string;
	appVersion?: string;
}

interface PlanTakeoutImportArgs {
	payload: {
		chats?: Array<DbChat | TakeoutChat>;
		personas?: Array<DbPersonality | (Personality & { id?: string })>;
		settings?: Record<string, string>;
	};
	existingChats: DbChat[];
	existingPersonas: DbPersonality[];
	existingSettings?: Record<string, string>;
	resolution: TakeoutConflictResolution;
	createId?: () => string;
}

const RESERVED_PERSONA_REFERENCES = new Set(["-1", "user", "__narrator__"]);

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error(`Failed to read attachment ${file.name}`));
		reader.onload = () => {
			const result = String(reader.result ?? "");
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.readAsDataURL(file);
	});
}

function base64ToFile(base64: string, name: string, mimeType: string, lastModified: number): File {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new File([bytes], name, { type: mimeType, lastModified });
}

function cloneWithoutRuntimeFields<T extends object>(value: T, runtimeFields: readonly string[]): any {
	const clone: Record<string, unknown> = {};
	for (const [key, fieldValue] of Object.entries(value)) {
		if (!runtimeFields.includes(key) && fieldValue !== undefined) clone[key] = fieldValue;
	}
	return clone;
}

async function serializeMessage(message: Message, includeMedia: boolean): Promise<TakeoutMessage> {
	const serialized = cloneWithoutRuntimeFields(message, ["parts", "generatedImages"]);
	const parts = [];

	for (const part of message.parts || []) {
		const portablePart = cloneWithoutRuntimeFields(part, ["attachments", "_thoughtSignatureRef"]);
		if (!includeMedia) {
			delete portablePart.inlineData;
		} else {
			const attachments = Array.from(part.attachments || []);
			if (attachments.length > 0) {
				portablePart.attachments = await Promise.all(
					attachments.map(async (attachment) => {
						if ((attachment as File & { _blobRef?: unknown })._blobRef && attachment.size === 0) {
							throw new Error(
								`Attachment ${attachment.name} still has an unresolved cloud blob reference.`
							);
						}
						return {
							__takeoutAttachment: true as const,
							name: attachment.name,
							mimeType: attachment.type || "application/octet-stream",
							size: attachment.size,
							lastModified: attachment.lastModified,
							base64: await fileToBase64(attachment)
						};
					})
				);
			}
		}
		parts.push(portablePart);
	}

	serialized.parts = parts;
	if (includeMedia && Array.isArray(message.generatedImages)) {
		serialized.generatedImages = message.generatedImages.map((image) => {
			if (image._blobRef && !image.base64) {
				throw new Error(`Generated image still has an unresolved cloud blob reference.`);
			}
			return cloneWithoutRuntimeFields(image, ["_blobRef", "_thoughtSignatureRef"]);
		});
	}

	return serialized as TakeoutMessage;
}

async function serializeChat(chat: DbChat, includeMedia: boolean): Promise<TakeoutChat> {
	return {
		...cloneWithoutRuntimeFields(chat, ["content", "lastModified"]),
		id: chat.id,
		content: await Promise.all((chat.content || []).map((message) => serializeMessage(message, includeMedia))),
		lastModified: chat.lastModified ? new Date(chat.lastModified).toISOString() : undefined
	};
}

function collectSettings(
	storedSettings: Record<string, string>,
	categories: ReadonlySet<TakeoutCategory>
): Record<string, string> {
	const selectedKeys = new Set<string>();
	for (const [category, keys] of Object.entries(TAKEOUT_SETTING_KEYS) as Array<
		[Exclude<TakeoutCategory, "chats" | "media" | "personas">, readonly string[]]
	>) {
		if (!categories.has(category)) continue;
		for (const key of keys) selectedKeys.add(key);
	}

	const settings: Record<string, string> = {};
	for (const key of selectedKeys) {
		if (Object.hasOwn(storedSettings, key)) settings[key] = storedSettings[key];
	}
	return settings;
}

function countSettingsByCategory(settings: Record<string, string>, category: TakeoutCategory): number {
	if (!(category in TAKEOUT_SETTING_KEYS)) return 0;
	const values = TAKEOUT_SETTING_KEYS[category as keyof typeof TAKEOUT_SETTING_KEYS]
		.filter((key) => Object.hasOwn(settings, key))
		.map((key) => settings[key]);
	if (category === "loras" || category === "pins") {
		return values.reduce((total, value) => total + parseStoredStrings(value).length, 0);
	}
	if (category === "roleplay") {
		return values.reduce((total, value) => {
			try {
				const parsed = JSON.parse(value);
				return total + (Array.isArray(parsed) ? parsed.length : 1);
			} catch {
				return total + 1;
			}
		}, 0);
	}
	return values.length;
}

function countPortableMedia(chats: TakeoutChat[]): {
	attachments: number;
	generatedImages: number;
	mediaBytes: number;
} {
	let attachments = 0;
	let generatedImages = 0;
	let mediaBytes = 0;
	for (const chat of chats) {
		for (const message of chat.content) {
			generatedImages += message.generatedImages?.length ?? 0;
			for (const image of message.generatedImages || []) {
				mediaBytes += Math.floor((image.base64.length * 3) / 4);
			}
			for (const part of message.parts) {
				attachments += part.attachments?.length ?? 0;
				for (const attachment of part.attachments || []) mediaBytes += attachment.size;
				if (part.inlineData?.data) mediaBytes += Math.floor((part.inlineData.data.length * 3) / 4);
			}
		}
	}
	return { attachments, generatedImages, mediaBytes };
}

function integrityInput(document: Omit<TakeoutDocument, "integrity">): string {
	return JSON.stringify(document);
}

async function sha256(value: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createTakeoutDocument(args: CreateTakeoutDocumentArgs): Promise<TakeoutDocument> {
	const invalidCategory = args.categories.find((category) => !TAKEOUT_CATEGORIES.includes(category));
	if (invalidCategory) throw new Error(`Unsupported takeout category: ${invalidCategory}`);

	const categorySet = new Set(args.categories);
	const categories = TAKEOUT_CATEGORIES.filter((category) => categorySet.has(category));
	const includeChats = categorySet.has("chats");
	const includeMedia = includeChats && categorySet.has("media");
	const chats = includeChats ? await Promise.all(args.chats.map((chat) => serializeChat(chat, includeMedia))) : [];
	const personas = categorySet.has("personas") ? structuredClone(args.personas) : [];
	const settings = collectSettings(args.settings, categorySet);
	const media = countPortableMedia(chats);

	const payload: TakeoutPayload = {};
	if (includeChats) payload.chats = chats;
	if (categorySet.has("personas")) payload.personas = personas;
	if (Object.keys(settings).length > 0) payload.settings = settings;

	const withoutIntegrity: Omit<TakeoutDocument, "integrity"> = {
		format: TAKEOUT_FORMAT,
		schemaVersion: TAKEOUT_SCHEMA_VERSION,
		appVersion: args.appVersion ?? APP_VERSION,
		exportedAt: args.exportedAt ?? new Date().toISOString(),
		source: args.source,
		manifest: {
			categories,
			omittedCategories: TAKEOUT_CATEGORIES.filter((category) => !categorySet.has(category)),
			counts: {
				chats: chats.length,
				messages: chats.reduce((total, chat) => total + chat.content.length, 0),
				personas: personas.length,
				attachments: media.attachments,
				generatedImages: media.generatedImages,
				settings: countSettingsByCategory(settings, "settings"),
				themes: countSettingsByCategory(settings, "themes"),
				loras: countSettingsByCategory(settings, "loras"),
				pins: countSettingsByCategory(settings, "pins"),
				roleplay: countSettingsByCategory(settings, "roleplay"),
				apiKeys: countSettingsByCategory(settings, "apiKeys")
			},
			mediaBytes: media.mediaBytes,
			apiKeysIncluded: categorySet.has("apiKeys")
		},
		payload
	};

	return {
		...withoutIntegrity,
		integrity: {
			algorithm: "SHA-256",
			digest: await sha256(integrityInput(withoutIntegrity))
		}
	};
}

function isObject(value: unknown): value is Record<string, any> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLegacyChat(value: unknown): value is DbChat {
	return isObject(value) && typeof value.title === "string" && Array.isArray(value.content);
}

function isLegacyPersona(value: unknown): value is DbPersonality {
	return isObject(value) && typeof value.name === "string" && typeof value.prompt === "string";
}

function takeoutCategoryForSetting(key: string): TakeoutCategory | undefined {
	for (const [category, keys] of Object.entries(TAKEOUT_SETTING_KEYS) as Array<
		[TakeoutCategory, readonly string[]]
	>) {
		if (keys.includes(key)) return category;
	}
	return undefined;
}

function validateTakeoutPayload(
	payload: unknown,
	categories: readonly TakeoutCategory[]
): asserts payload is TakeoutPayload {
	if (!isObject(payload)) throw new Error("Takeout payload is missing or invalid.");
	if (payload.chats !== undefined && !categories.includes("chats")) {
		throw new Error("Takeout payload contains chats without declaring the chats category.");
	}
	if (payload.personas !== undefined && !categories.includes("personas")) {
		throw new Error("Takeout payload contains personas without declaring the personas category.");
	}
	if (payload.chats !== undefined && (!Array.isArray(payload.chats) || !payload.chats.every(isLegacyChat))) {
		throw new Error("Takeout chats are invalid.");
	}
	if (
		payload.personas !== undefined &&
		(!Array.isArray(payload.personas) || !payload.personas.every(isLegacyPersona))
	) {
		throw new Error("Takeout personas are invalid.");
	}
	if (payload.settings !== undefined && !isObject(payload.settings)) {
		throw new Error("Takeout settings are invalid.");
	}
	for (const [key, value] of Object.entries(payload.settings || {})) {
		const category = takeoutCategoryForSetting(key);
		if (!category || !categories.includes(category)) {
			throw new Error(`Takeout setting “${key}” is not allowed by its manifest categories.`);
		}
		if (typeof value !== "string") throw new Error(`Takeout setting “${key}” must be a string.`);
	}
}

function validateManifestCounts(document: TakeoutDocument): void {
	const chats = document.payload.chats || [];
	const personas = document.payload.personas || [];
	const media = countPortableMedia(chats);
	const actual = {
		chats: chats.length,
		messages: chats.reduce((total, chat) => total + chat.content.length, 0),
		personas: personas.length,
		attachments: media.attachments,
		generatedImages: media.generatedImages,
		settings: countSettingsByCategory(document.payload.settings || {}, "settings"),
		themes: countSettingsByCategory(document.payload.settings || {}, "themes"),
		loras: countSettingsByCategory(document.payload.settings || {}, "loras"),
		pins: countSettingsByCategory(document.payload.settings || {}, "pins"),
		roleplay: countSettingsByCategory(document.payload.settings || {}, "roleplay"),
		apiKeys: countSettingsByCategory(document.payload.settings || {}, "apiKeys")
	};
	for (const [key, count] of Object.entries(actual)) {
		if (document.manifest.counts[key as keyof typeof actual] !== count) {
			throw new Error(`Takeout manifest count mismatch for ${key}.`);
		}
	}
}

export async function parseImportText(text: string, _fileName = "takeout.json"): Promise<ParsedTakeout> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("Import file is not valid JSON.");
	}

	if (isObject(parsed) && parsed.format === TAKEOUT_FORMAT) {
		if (parsed.schemaVersion !== TAKEOUT_SCHEMA_VERSION) {
			throw new Error(`Unsupported takeout schema version: ${String(parsed.schemaVersion)}.`);
		}
		if (!isObject(parsed.manifest) || !isObject(parsed.integrity)) {
			throw new Error("Takeout manifest or integrity data is missing.");
		}
		if (
			!Array.isArray(parsed.manifest.categories) ||
			parsed.manifest.categories.some(
				(category: unknown) =>
					typeof category !== "string" || !TAKEOUT_CATEGORIES.includes(category as TakeoutCategory)
			) ||
			new Set(parsed.manifest.categories).size !== parsed.manifest.categories.length
		) {
			throw new Error("Takeout manifest categories are invalid.");
		}
		if (typeof parsed.appVersion !== "string" || !parsed.appVersion) {
			throw new Error("Takeout app version is missing.");
		}
		if (parsed.source !== "local" && parsed.source !== "cloud") {
			throw new Error("Takeout source is invalid.");
		}
		validateTakeoutPayload(parsed.payload, parsed.manifest.categories as TakeoutCategory[]);
		const document = parsed as TakeoutDocument;
		if (document.integrity.algorithm !== "SHA-256" || typeof document.integrity.digest !== "string") {
			throw new Error("Takeout integrity metadata is invalid.");
		}
		const { integrity: _integrity, ...withoutIntegrity } = document;
		const actualDigest = await sha256(integrityInput(withoutIntegrity));
		if (actualDigest !== document.integrity.digest) {
			throw new Error("Takeout integrity check failed. The file may be incomplete or corrupted.");
		}
		validateManifestCounts(document);
		return {
			kind: "unified",
			categories: [...document.manifest.categories],
			payload: document.payload,
			manifest: document.manifest
		};
	}

	const entries = Array.isArray(parsed) ? parsed : [parsed];
	if (entries.length === 0) throw new Error("Import file contains no records.");
	if (entries.every(isLegacyChat)) {
		return { kind: "legacy", categories: ["chats"], payload: { chats: entries as TakeoutChat[] } };
	}
	if (entries.every(isLegacyPersona)) {
		return { kind: "legacy", categories: ["personas"], payload: { personas: entries as DbPersonality[] } };
	}
	throw new Error("Import file is not a supported Zozo Chat, chat, or persona format.");
}

export function deserializeTakeoutChat(chat: TakeoutChat): DbChat {
	const content = chat.content.map((message) => {
		const parts = message.parts.map((part) => {
			const { attachments, ...rest } = part;
			return {
				...rest,
				...(attachments
					? {
							attachments: attachments.map((attachment) => {
								const file = base64ToFile(
									attachment.base64,
									attachment.name,
									attachment.mimeType,
									attachment.lastModified
								);
								if (file.size !== attachment.size) {
									throw new Error(`Takeout attachment size mismatch for “${attachment.name}”.`);
								}
								return file;
							})
						}
					: {})
			};
		});
		return { ...message, parts } as Message;
	});

	return {
		...chat,
		content,
		lastModified: chat.lastModified ? new Date(chat.lastModified) : undefined
	};
}

function comparable(value: unknown): string {
	function normalize(input: unknown): unknown {
		if (input instanceof Date) return input.toISOString();
		if (input instanceof File) {
			return { name: input.name, type: input.type, size: input.size, lastModified: input.lastModified };
		}
		if (Array.isArray(input)) return input.map(normalize);
		if (!isObject(input)) return input;
		return Object.fromEntries(
			Object.keys(input)
				.filter((key) => input[key] !== undefined)
				.sort()
				.map((key) => [key, normalize(input[key])])
		);
	}
	return JSON.stringify(normalize(value));
}

function cloneChatForImport(chat: DbChat | TakeoutChat): DbChat {
	const candidate = chat as TakeoutChat;
	const hasPortableAttachment = candidate.content?.some((message) =>
		message.parts?.some((part) =>
			part.attachments?.some((attachment) => isObject(attachment) && attachment.__takeoutAttachment === true)
		)
	);
	const cloned = hasPortableAttachment ? deserializeTakeoutChat(candidate) : structuredClone(chat as DbChat);
	const rawTimestamp = (chat as any).timestamp;
	const parsedTimestamp =
		typeof rawTimestamp === "number" ? rawTimestamp : new Date(rawTimestamp ?? Number.NaN).getTime();
	cloned.timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
	const rawLastModified = (chat as any).lastModified;
	if (rawLastModified !== undefined) {
		const parsedLastModified = rawLastModified instanceof Date ? rawLastModified : new Date(rawLastModified);
		cloned.lastModified = Number.isNaN(parsedLastModified.getTime()) ? undefined : parsedLastModified;
	}
	for (const message of cloned.content || []) {
		for (const part of message.parts || []) {
			if (!Array.isArray(part.attachments)) continue;
			const validFiles = part.attachments.filter((attachment): attachment is File => attachment instanceof File);
			if (validFiles.length > 0) part.attachments = validFiles;
			else delete part.attachments;
		}
	}
	return cloned;
}

function normalizePersonaForImport(
	persona: DbPersonality | (Personality & { id?: string }),
	id: string
): DbPersonality {
	const now = Date.now();
	const source = structuredClone(persona) as Partial<DbPersonality>;
	return {
		...source,
		id,
		name: typeof source.name === "string" && source.name.trim() ? source.name : "Imported persona",
		image: typeof source.image === "string" ? source.image : "",
		description: typeof source.description === "string" ? source.description : "",
		prompt: typeof source.prompt === "string" ? source.prompt : "",
		aggressiveness: typeof source.aggressiveness === "number" ? source.aggressiveness : 0,
		sensuality: typeof source.sensuality === "number" ? source.sensuality : 0,
		independence: typeof source.independence === "number" ? source.independence : 50,
		nsfw: typeof source.nsfw === "boolean" ? source.nsfw : false,
		internetEnabled: typeof source.internetEnabled === "boolean" ? source.internetEnabled : false,
		roleplayEnabled: typeof source.roleplayEnabled === "boolean" ? source.roleplayEnabled : false,
		toneExamples: Array.isArray(source.toneExamples) ? source.toneExamples : [],
		tags: Array.isArray(source.tags) ? source.tags : [],
		category: source.category ?? "character",
		dateAdded: typeof source.dateAdded === "number" ? source.dateAdded : now,
		lastModified: typeof source.lastModified === "number" ? source.lastModified : now
	};
}

function createUniqueId(used: Set<string>, createId: () => string, prefix = ""): string {
	for (let attempt = 0; attempt < 100; attempt++) {
		const candidate = `${prefix}${createId()}`;
		if (candidate && !used.has(candidate)) {
			used.add(candidate);
			return candidate;
		}
	}
	throw new Error("Unable to generate a unique ID for the imported copy.");
}

function remapPersonaReference(id: string, map: Record<string, string>): string {
	if (RESERVED_PERSONA_REFERENCES.has(id)) return id;
	return map[id] ?? id;
}

function remapChatPersonas(chat: DbChat, personaIdMap: Record<string, string>): DbChat {
	for (const message of chat.content) {
		if (message.personalityid) {
			message.personalityid = remapPersonaReference(message.personalityid, personaIdMap);
		}
	}
	if (!chat.groupChat) return chat;

	chat.groupChat.participantIds = chat.groupChat.participantIds.map((id) => remapPersonaReference(id, personaIdMap));
	if (chat.groupChat.rpg?.turnOrder) {
		chat.groupChat.rpg.turnOrder = chat.groupChat.rpg.turnOrder.map((id) =>
			remapPersonaReference(id, personaIdMap)
		);
	}
	const guards = chat.groupChat.dynamic?.maxMessageGuardById;
	if (guards) {
		chat.groupChat.dynamic!.maxMessageGuardById = Object.fromEntries(
			Object.entries(guards).map(([id, value]) => [remapPersonaReference(id, personaIdMap), value])
		);
	}
	return chat;
}

function chatPersonaReferences(chat: DbChat): Set<string> {
	const references = new Set<string>();
	for (const message of chat.content) {
		if (message.personalityid && !RESERVED_PERSONA_REFERENCES.has(message.personalityid)) {
			references.add(message.personalityid);
		}
	}
	for (const id of chat.groupChat?.participantIds || []) {
		if (!RESERVED_PERSONA_REFERENCES.has(id)) references.add(id);
	}
	for (const id of chat.groupChat?.rpg?.turnOrder || []) {
		if (!RESERVED_PERSONA_REFERENCES.has(id)) references.add(id);
	}
	for (const id of Object.keys(chat.groupChat?.dynamic?.maxMessageGuardById || {})) {
		if (!RESERVED_PERSONA_REFERENCES.has(id)) references.add(id);
	}
	return references;
}

function assertUniqueSourceIds(entries: Array<{ id?: string }>, label: string): void {
	const seen = new Set<string>();
	for (const entry of entries) {
		if (typeof entry.id !== "string" || !entry.id) continue;
		if (seen.has(entry.id)) throw new Error(`Import contains duplicate ${label} ID “${entry.id}”.`);
		seen.add(entry.id);
	}
}

function parseStoredObjects(raw: string | undefined): Array<Record<string, any>> {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isObject) : [];
	} catch {
		return [];
	}
}

function parseStoredStrings(raw: string | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
	} catch {
		return [];
	}
}

function mergeStoredIds(
	existingRaw: string | undefined,
	importedRaw: string | undefined,
	map: Record<string, string>
): string | undefined {
	if (importedRaw === undefined) return undefined;
	const existing = parseStoredStrings(existingRaw);
	const imported = parseStoredStrings(importedRaw).map((id) => map[id] ?? id);
	return JSON.stringify([...new Set([...existing, ...imported])]);
}

function planRoleplaySettings(args: {
	settings: Record<string, string>;
	existingSettings: Record<string, string>;
	resolution: TakeoutConflictResolution;
	createId: () => string;
	conflicts: { roleplay: number };
	skipped: { roleplay: number };
}): Record<string, string> {
	const { settings, existingSettings, resolution, createId, conflicts, skipped } = args;
	const categoryKey = SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES;
	const actionKey = SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS;
	const favoritesKey = SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS;
	const importedCategories = parseStoredObjects(settings[categoryKey]);
	const importedActions = parseStoredObjects(settings[actionKey]);
	if (settings[categoryKey] === undefined && settings[actionKey] === undefined) return settings;

	let mergedCategories = parseStoredObjects(existingSettings[categoryKey]);
	const existingCategories = new Map(
		mergedCategories.filter((entry) => typeof entry.id === "string").map((entry) => [entry.id as string, entry])
	);
	const categoryIdMap: Record<string, string> = {};
	const usedCategoryIds = new Set(existingCategories.keys());

	for (const category of importedCategories) {
		const sourceId =
			typeof category.id === "string" && category.id
				? category.id
				: createUniqueId(usedCategoryIds, createId, "custom:");
		const existing = existingCategories.get(sourceId);
		if (existing && comparable(existing) === comparable({ ...category, id: sourceId })) {
			categoryIdMap[sourceId] = sourceId;
			skipped.roleplay++;
			continue;
		}

		let targetId = sourceId;
		if (existing) {
			conflicts.roleplay++;
			if (resolution === "copy") targetId = createUniqueId(usedCategoryIds, createId, "custom:");
			else mergedCategories = mergedCategories.filter((entry) => entry.id !== sourceId);
		}
		usedCategoryIds.add(targetId);
		categoryIdMap[sourceId] = targetId;
		mergedCategories.push({ ...category, id: targetId });
	}

	let mergedActions = parseStoredObjects(existingSettings[actionKey]);
	const existingActions = new Map(
		mergedActions.filter((entry) => typeof entry.id === "string").map((entry) => [entry.id as string, entry])
	);
	const actionIdMap: Record<string, string> = {};
	const usedActionIds = new Set(existingActions.keys());
	for (const action of importedActions) {
		const sourceId =
			typeof action.id === "string" && action.id ? action.id : createUniqueId(usedActionIds, createId, "custom-");
		const remappedCategory =
			typeof action.category === "string" ? (categoryIdMap[action.category] ?? action.category) : action.category;
		const candidate = { ...action, id: sourceId, category: remappedCategory };
		const existing = existingActions.get(sourceId);
		if (existing && comparable(existing) === comparable(candidate)) {
			actionIdMap[sourceId] = sourceId;
			skipped.roleplay++;
			continue;
		}

		let targetId = sourceId;
		if (existing) {
			conflicts.roleplay++;
			if (resolution === "copy") targetId = createUniqueId(usedActionIds, createId, "custom-");
			else mergedActions = mergedActions.filter((entry) => entry.id !== sourceId);
		}
		usedActionIds.add(targetId);
		actionIdMap[sourceId] = targetId;
		mergedActions.push({ ...candidate, id: targetId });
	}

	const planned = { ...settings };
	if (settings[categoryKey] !== undefined) planned[categoryKey] = JSON.stringify(mergedCategories);
	if (settings[actionKey] !== undefined) planned[actionKey] = JSON.stringify(mergedActions);
	if (settings[favoritesKey] !== undefined) {
		planned[favoritesKey] = JSON.stringify([
			...new Set([
				...parseStoredStrings(existingSettings[favoritesKey]),
				...parseStoredStrings(settings[favoritesKey]).map((id) => actionIdMap[id] ?? id)
			])
		]);
	}
	return planned;
}

export function planTakeoutImport(args: PlanTakeoutImportArgs): TakeoutImportPlan {
	const createId = args.createId ?? uuidv4;
	assertUniqueSourceIds((args.payload.personas || []) as Array<{ id?: string }>, "persona");
	assertUniqueSourceIds((args.payload.chats || []) as Array<{ id?: string }>, "chat");
	const existingPersonas = new Map(args.existingPersonas.map((persona) => [persona.id, persona]));
	const existingChats = new Map(args.existingChats.map((chat) => [chat.id, chat]));
	const personaIdMap: Record<string, string> = {};
	const chatIdMap: Record<string, string> = {};
	const skipped = { chats: 0, personas: 0, roleplay: 0 };
	const conflicts = { chats: 0, personas: 0, roleplay: 0 };
	const personas: DbPersonality[] = [];
	const usedPersonaIds = new Set(args.existingPersonas.map((persona) => persona.id));

	for (const source of args.payload.personas || []) {
		const sourceId = typeof source.id === "string" && source.id && source.id !== "-1" ? source.id : undefined;
		const initialId = sourceId ?? createUniqueId(usedPersonaIds, createId);
		const normalized = normalizePersonaForImport(source, initialId);
		const existing = sourceId ? existingPersonas.get(sourceId) : undefined;

		if (existing && comparable(existing) === comparable(normalized)) {
			personaIdMap[sourceId!] = sourceId!;
			skipped.personas++;
			continue;
		}
		let targetId = initialId;
		if (existing) {
			conflicts.personas++;
			if (args.resolution === "copy") targetId = createUniqueId(usedPersonaIds, createId);
		}
		usedPersonaIds.add(targetId);
		if (sourceId) personaIdMap[sourceId] = targetId;
		personas.push({ ...normalized, id: targetId });
	}

	const candidateChats = (args.payload.chats || []).map(cloneChatForImport);
	const plannedChatInputs: Array<{ chat: DbChat; sourceId?: string; targetId: string }> = [];
	const usedChatIds = new Set(args.existingChats.map((chat) => chat.id));
	for (const chat of candidateChats) {
		const sourceId = typeof chat.id === "string" && chat.id ? chat.id : undefined;
		const initialId = sourceId ?? createUniqueId(usedChatIds, createId);
		const normalized = { ...chat, id: initialId };
		const existing = sourceId ? existingChats.get(sourceId) : undefined;
		if (existing && comparable(existing) === comparable(normalized)) {
			chatIdMap[sourceId!] = sourceId!;
			skipped.chats++;
			continue;
		}
		let targetId = initialId;
		if (existing) {
			conflicts.chats++;
			if (args.resolution === "copy") targetId = createUniqueId(usedChatIds, createId);
		}
		usedChatIds.add(targetId);
		if (sourceId) chatIdMap[sourceId] = targetId;
		plannedChatInputs.push({ chat: normalized, sourceId, targetId });
	}

	const chats = plannedChatInputs.map(({ chat, targetId }) =>
		remapChatPersonas({ ...structuredClone(chat), id: targetId }, personaIdMap)
	);
	const knownPersonaIds = new Set([
		...args.existingPersonas.map((persona) => persona.id),
		...personas.map((persona) => persona.id),
		...Object.values(personaIdMap)
	]);
	const warnings: string[] = [];
	for (const chat of chats) {
		for (const personaId of chatPersonaReferences(chat)) {
			if (knownPersonaIds.has(personaId)) continue;
			warnings.push(
				`Chat “${chat.title || chat.id}” references persona ID “${personaId}”, which is not present in the import or destination.`
			);
		}
	}
	const existingSettings = args.existingSettings || {};
	const settings = planRoleplaySettings({
		settings: { ...(args.payload.settings || {}) },
		existingSettings,
		resolution: args.resolution,
		createId,
		conflicts,
		skipped
	});
	const pinnedPersonas = mergeStoredIds(
		existingSettings[SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS],
		settings[SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS],
		personaIdMap
	);
	const pinnedChats = mergeStoredIds(
		existingSettings[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS],
		settings[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS],
		chatIdMap
	);
	if (pinnedPersonas !== undefined) settings[SETTINGS_STORAGE_KEYS.PINNED_PERSONA_IDS] = pinnedPersonas;
	if (pinnedChats !== undefined) settings[SETTINGS_STORAGE_KEYS.PINNED_CHAT_IDS] = pinnedChats;
	const pinnedModels = mergeStoredIds(
		existingSettings[SETTINGS_STORAGE_KEYS.PINNED_MODEL_IDS],
		settings[SETTINGS_STORAGE_KEYS.PINNED_MODEL_IDS],
		{}
	);
	if (pinnedModels !== undefined) settings[SETTINGS_STORAGE_KEYS.PINNED_MODEL_IDS] = pinnedModels;
	const loras = mergeStoredIds(
		existingSettings[SETTINGS_STORAGE_KEYS.LORAS],
		settings[SETTINGS_STORAGE_KEYS.LORAS],
		{}
	);
	if (loras !== undefined) settings[SETTINGS_STORAGE_KEYS.LORAS] = loras;

	return { chats, personas, settings, chatIdMap, personaIdMap, conflicts, skipped, warnings };
}

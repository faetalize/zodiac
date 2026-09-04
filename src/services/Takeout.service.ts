import { TAKEOUT_SETTING_KEYS } from "../constants/Takeout";
import { dispatchAppEvent } from "../events";
import type { DbChat } from "../types/Chat";
import type { DbPersonality } from "../types/Personality";
import type {
	ParsedTakeout,
	TakeoutCategory,
	TakeoutConflictResolution,
	TakeoutDestination,
	TakeoutDocument,
	TakeoutImportPlan,
	TakeoutPayload,
	TakeoutSource
} from "../types/Takeout";
import { createTakeoutDocument, parseImportText, planTakeoutImport } from "../utils/takeout";
import * as chatsService from "./Chats.service";
import { db } from "./Db.service";
import * as loraService from "./Lora.service";
import * as personalityService from "./Personality.service";
import * as settingsService from "./Settings.service";
import * as supabaseService from "./Supabase.service";
import * as syncService from "./Sync.service";

export interface TakeoutProgress {
	phase: "reading" | "media" | "packaging" | "validating" | "importing" | "done";
	completed: number;
	total: number;
	message: string;
}

export interface TakeoutDestinationOption {
	available: boolean;
	ready?: boolean;
	reason?: string;
}

export interface TakeoutImportDestinations {
	local: TakeoutDestinationOption;
	cloud: TakeoutDestinationOption;
}

export interface BuildTakeoutExportResult {
	source: TakeoutSource;
	document: TakeoutDocument;
	filename: string;
}

export interface TakeoutImportInspection {
	destination: TakeoutDestination;
	kind: ParsedTakeout["kind"];
	categories: TakeoutCategory[];
	payload: TakeoutPayload;
	existingChats: DbChat[];
	existingPersonas: DbPersonality[];
	existingSettings: Record<string, string>;
	conflicts: {
		chats: number;
		personas: number;
		roleplay: number;
	};
	warnings: string[];
}

export interface TakeoutImportResult {
	destination: TakeoutDestination;
	categories: TakeoutCategory[];
	imported: {
		chats: number;
		messages: number;
		personas: number;
		attachments: number;
		generatedImages: number;
		settings: number;
	};
	skipped: {
		chats: number;
		personas: number;
		roleplay: number;
	};
	failed: {
		chats: number;
		personas: number;
		settings: number;
	};
	partial: boolean;
	errors: string[];
	warnings: string[];
}

function countImportedChatContent(chats: DbChat[]): {
	messages: number;
	attachments: number;
	generatedImages: number;
} {
	let messages = 0;
	let attachments = 0;
	let generatedImages = 0;
	for (const chat of chats) {
		messages += chat.content.length;
		for (const message of chat.content) {
			generatedImages += message.generatedImages?.length ?? 0;
			for (const part of message.parts) attachments += Array.from(part.attachments || []).length;
		}
	}
	return { messages, attachments, generatedImages };
}

interface CommitTakeoutImportOptions {
	createId?: () => string;
	onProgress?: (progress: TakeoutProgress) => void;
}

function readLocalPortableSettings(): Record<string, string> {
	const settings: Record<string, string> = {};
	for (const key of Object.values(TAKEOUT_SETTING_KEYS).flat()) {
		const value = localStorage.getItem(key);
		if (value !== null) settings[key] = value;
	}
	return settings;
}

function assertCloudExportReady(): void {
	if (!syncService.isSyncActive()) {
		throw new Error("Unlock Cloud Sync before exporting a complete takeout.");
	}
	const status = syncService.getSyncStatus();
	if (status === "offline") throw new Error("Cloud Sync is offline. Reconnect and sync before exporting.");
	if (status === "syncing") throw new Error("Cloud Sync is still syncing. Wait for it to finish before exporting.");
	if (status === "error") throw new Error("Cloud Sync has an error. Resolve it before exporting.");
	if (syncService.getPendingSyncOperationCount() > 0) {
		throw new Error("Cloud Sync has pending changes. Sync them before exporting.");
	}
}

function report(onProgress: ((progress: TakeoutProgress) => void) | undefined, progress: TakeoutProgress): void {
	onProgress?.(progress);
}

export async function buildTakeoutExport(
	categories: readonly TakeoutCategory[],
	onProgress?: (progress: TakeoutProgress) => void,
	signal?: AbortSignal
): Promise<BuildTakeoutExportResult> {
	signal?.throwIfAborted();
	if (categories.length === 0) throw new Error("Select at least one category to export.");

	const source: TakeoutSource = syncService.isOnlineSyncEnabled() ? "cloud" : "local";
	if (source === "cloud") assertCloudExportReady();

	report(onProgress, { phase: "reading", completed: 0, total: 1, message: `Reading ${source} data…` });

	let chats: DbChat[] = [];
	let personas: DbPersonality[] = [];
	let settings: Record<string, string> = {};

	if (source === "local") {
		signal?.throwIfAborted();
		if (categories.includes("chats")) chats = await db.chats.toArray();
		if (categories.includes("personas")) personas = await db.personalities.toArray();
		settings = readLocalPortableSettings();
	} else {
		if (categories.includes("chats")) {
			const metadata = await syncService.fetchSyncedChatsMetadata();
			const includeMedia = categories.includes("media");
			for (let index = 0; index < metadata.length; index++) {
				signal?.throwIfAborted();
				const chat = metadata[index];
				report(onProgress, {
					phase: includeMedia ? "media" : "reading",
					completed: index,
					total: metadata.length,
					message: `Reading chat ${index + 1} of ${metadata.length}…`
				});
				const fetchedMessages = await syncService.fetchAllSyncedChatMessages(chat.id, { signal });
				if (fetchedMessages === null) {
					throw new Error(`Failed to read complete message history for “${chat.title || chat.id}”.`);
				}
				if (!syncService.isChatSnapshotFullyHydrated(chat.id, fetchedMessages.length)) {
					throw new Error(`Failed to read complete message history for “${chat.title || chat.id}”.`);
				}
				const content = includeMedia
					? await syncService.materializeMessagesForPortableExport(fetchedMessages)
					: fetchedMessages;
				signal?.throwIfAborted();
				chats.push({ ...chat, content });
			}
		}
		if (categories.includes("personas")) personas = await syncService.fetchSyncedPersonas();
		settings = (await syncService.fetchSyncedSettingsObject()) ?? {};
	}

	report(onProgress, { phase: "packaging", completed: 0, total: 1, message: "Building takeout file…" });
	signal?.throwIfAborted();
	const document = await createTakeoutDocument({ source, categories, chats, personas, settings });
	signal?.throwIfAborted();
	report(onProgress, { phase: "done", completed: 1, total: 1, message: "Takeout is ready." });

	const date = document.exportedAt.slice(0, 10);
	return { source, document, filename: `zozo-chat-takeout-${date}.json` };
}

export async function getTakeoutImportDestinations(): Promise<TakeoutImportDestinations> {
	const syncEnabled = syncService.isOnlineSyncEnabled();
	const user = await supabaseService.getCurrentUser();
	const subscription = user ? await supabaseService.getUserSubscription() : null;
	const tier = supabaseService.getSubscriptionTier(subscription);
	const cloudEligible = !!user && (tier === "pro" || tier === "pro_plus" || tier === "max");

	return {
		local: syncEnabled
			? {
					available: false,
					reason: "Disable Cloud Sync before importing only to this browser."
				}
			: { available: true },
		cloud: cloudEligible
			? { available: true, ready: syncService.isSyncActive() }
			: {
					available: false,
					reason: user ? "Cloud Sync requires an eligible plan." : "Sign in to use Cloud Sync."
				}
	};
}

function readFileText(file: File): Promise<string> {
	if (typeof file.text === "function") return file.text();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}.`));
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.readAsText(file);
	});
}

async function parseImportFiles(files: readonly File[]): Promise<ParsedTakeout> {
	if (files.length === 0) throw new Error("Choose at least one takeout, chat, or persona file.");
	const parsed = [];
	for (const file of files) parsed.push(await parseImportText(await readFileText(file), file.name));
	if (parsed.some((entry) => entry.kind === "unified")) {
		if (parsed.length !== 1) {
			throw new Error("Import one unified takeout at a time. Multiple selection is supported for legacy files.");
		}
		return parsed[0];
	}

	const categories = new Set<TakeoutCategory>();
	const payload: TakeoutPayload = {};
	for (const entry of parsed) {
		entry.categories.forEach((category) => categories.add(category));
		if (entry.payload.chats) payload.chats = [...(payload.chats || []), ...entry.payload.chats];
		if (entry.payload.personas) payload.personas = [...(payload.personas || []), ...entry.payload.personas];
	}
	return { kind: "legacy", categories: [...categories], payload };
}

async function readCompleteCloudChats(): Promise<DbChat[]> {
	const metadata = await syncService.fetchSyncedChatsMetadata();
	const chats: DbChat[] = [];
	for (const chat of metadata) {
		const messages = await syncService.fetchAllSyncedChatMessages(chat.id);
		if (messages === null) throw new Error(`Failed to inspect cloud chat “${chat.title || chat.id}”.`);
		if (!syncService.isChatSnapshotFullyHydrated(chat.id, messages.length)) {
			throw new Error(`Failed to inspect the complete cloud chat “${chat.title || chat.id}”.`);
		}
		const content = await syncService.materializeMessagesForPortableExport(messages);
		chats.push({ ...chat, content });
	}
	return chats;
}

async function assertImportDestinationReady(destination: TakeoutDestination): Promise<void> {
	const destinations = await getTakeoutImportDestinations();
	const option = destinations[destination];
	if (!option.available) throw new Error(option.reason ?? `${destination} import is unavailable.`);
	if (destination === "cloud" && !option.ready) {
		throw new Error("Set up or unlock Cloud Sync before importing to it.");
	}
}

export async function inspectTakeoutImport(
	files: readonly File[],
	destination: TakeoutDestination,
	onProgress?: (progress: TakeoutProgress) => void
): Promise<TakeoutImportInspection> {
	await assertImportDestinationReady(destination);
	report(onProgress, { phase: "validating", completed: 0, total: files.length, message: "Validating import…" });
	const parsed = await parseImportFiles(files);
	const existingChats = destination === "cloud" ? await readCompleteCloudChats() : await db.chats.toArray();
	const existingPersonas =
		destination === "cloud" ? await syncService.fetchSyncedPersonas() : await db.personalities.toArray();
	const existingSettings =
		destination === "cloud" ? ((await syncService.fetchSyncedSettingsObject()) ?? {}) : readLocalPortableSettings();
	const previewPlan = planTakeoutImport({
		payload: parsed.payload,
		existingChats,
		existingPersonas,
		existingSettings,
		resolution: "overwrite"
	});
	report(onProgress, {
		phase: "validating",
		completed: files.length,
		total: files.length,
		message: "Import is ready."
	});

	return {
		destination,
		kind: parsed.kind,
		categories: parsed.categories,
		payload: parsed.payload,
		existingChats,
		existingPersonas,
		existingSettings,
		conflicts: previewPlan.conflicts,
		warnings: previewPlan.warnings
	};
}

function captureStoredValues(keys: string[]): Map<string, string | null> {
	return new Map(keys.map((key) => [key, localStorage.getItem(key)]));
}

function restoreStoredValues(snapshot: Map<string, string | null>): void {
	for (const [key, value] of snapshot) {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	}
}

function applySettings(settings: Record<string, string>): void {
	for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
}

async function commitLocalImport(plan: TakeoutImportPlan): Promise<void> {
	const settingKeys = Object.keys(plan.settings);
	const previousSettings = captureStoredValues(settingKeys);
	try {
		await db.transaction("rw", db.chats, db.personalities, async () => {
			if (plan.personas.length > 0) await db.personalities.bulkPut(plan.personas);
			if (plan.chats.length > 0) await db.chats.bulkPut(plan.chats);
			applySettings(plan.settings);
		});
	} catch (error) {
		restoreStoredValues(previousSettings);
		throw error;
	}

	dispatchAppEvent("settings-loaded-from-storage", {});
	settingsService.loadSettings();
	await loraService.initialize();
	await chatsService.initialize();
	await personalityService.reloadFromDb();
}

async function commitCloudImport(
	plan: TakeoutImportPlan,
	inspection: TakeoutImportInspection,
	onProgress?: (progress: TakeoutProgress) => void
): Promise<TakeoutImportResult> {
	const result: TakeoutImportResult = {
		destination: "cloud",
		categories: inspection.categories,
		imported: { chats: 0, messages: 0, personas: 0, attachments: 0, generatedImages: 0, settings: 0 },
		skipped: plan.skipped,
		failed: { chats: 0, personas: 0, settings: 0 },
		partial: false,
		errors: [],
		warnings: plan.warnings
	};
	const total = plan.personas.length + plan.chats.length + (Object.keys(plan.settings).length > 0 ? 1 : 0);
	let completed = 0;
	const failedPersonaIds = new Set<string>();

	for (const persona of plan.personas) {
		const ok = await syncService.pushPersona(persona);
		if (ok) result.imported.personas++;
		else {
			result.failed.personas++;
			failedPersonaIds.add(persona.id);
			result.errors.push(`Failed to import persona “${persona.name || persona.id}”.`);
		}
		report(onProgress, { phase: "importing", completed: ++completed, total, message: "Importing personas…" });
	}

	const existingChats = new Map(inspection.existingChats.map((chat) => [chat.id, chat]));
	for (const chat of plan.chats) {
		const personaReferences = new Set<string>();
		for (const message of chat.content) {
			if (message.personalityid) personaReferences.add(message.personalityid);
		}
		for (const id of chat.groupChat?.participantIds || []) personaReferences.add(id);
		for (const id of chat.groupChat?.rpg?.turnOrder || []) personaReferences.add(id);
		for (const id of Object.keys(chat.groupChat?.dynamic?.maxMessageGuardById || {})) personaReferences.add(id);
		if ([...personaReferences].some((id) => failedPersonaIds.has(id))) {
			result.failed.chats++;
			result.errors.push(`Chat “${chat.title || chat.id}” depends on a persona that failed to import.`);
			report(onProgress, {
				phase: "importing",
				completed: ++completed,
				total,
				message: "Skipping a chat with a failed dependency…"
			});
			continue;
		}
		const ok = await syncService.upsertSyncedChat(chat, existingChats.get(chat.id));
		if (ok) {
			result.imported.chats++;
			const contentCounts = countImportedChatContent([chat]);
			result.imported.messages += contentCounts.messages;
			result.imported.attachments += contentCounts.attachments;
			result.imported.generatedImages += contentCounts.generatedImages;
		} else {
			result.failed.chats++;
			result.errors.push(`Failed to import chat “${chat.title || chat.id}”.`);
		}
		report(onProgress, { phase: "importing", completed: ++completed, total, message: "Importing chats…" });
	}

	if (Object.keys(plan.settings).length > 0) {
		const mergedSettings = { ...inspection.existingSettings, ...plan.settings };
		const ok = await syncService.pushSettings(mergedSettings);
		if (ok) {
			applySettings(plan.settings);
			result.imported.settings = Object.keys(plan.settings).length;
			dispatchAppEvent("settings-loaded-from-storage", {});
		} else {
			result.failed.settings = Object.keys(plan.settings).length;
			result.errors.push("Failed to import settings to Cloud Sync.");
		}
		completed++;
	}

	result.partial = result.failed.chats + result.failed.personas + result.failed.settings > 0;
	await syncService.pullAll();
	return result;
}

export async function commitTakeoutImport(
	inspection: TakeoutImportInspection,
	resolution: TakeoutConflictResolution,
	options: CommitTakeoutImportOptions = {}
): Promise<TakeoutImportResult> {
	await assertImportDestinationReady(inspection.destination);
	const plan = planTakeoutImport({
		payload: inspection.payload,
		existingChats: inspection.existingChats,
		existingPersonas: inspection.existingPersonas,
		existingSettings: inspection.existingSettings,
		resolution,
		createId: options.createId
	});

	if (inspection.destination === "cloud") {
		return await commitCloudImport(plan, inspection, options.onProgress);
	}

	report(options.onProgress, {
		phase: "importing",
		completed: 0,
		total: plan.chats.length + plan.personas.length,
		message: "Restoring data to this browser…"
	});
	await commitLocalImport(plan);
	const contentCounts = countImportedChatContent(plan.chats);
	const result: TakeoutImportResult = {
		destination: "local",
		categories: inspection.categories,
		imported: {
			chats: plan.chats.length,
			messages: contentCounts.messages,
			personas: plan.personas.length,
			attachments: contentCounts.attachments,
			generatedImages: contentCounts.generatedImages,
			settings: Object.keys(plan.settings).length
		},
		skipped: plan.skipped,
		failed: { chats: 0, personas: 0, settings: 0 },
		partial: false,
		errors: [],
		warnings: plan.warnings
	};
	report(options.onProgress, { phase: "done", completed: 1, total: 1, message: "Import complete." });
	return result;
}

export function downloadTakeout(takeout: TakeoutDocument, filename: string): void {
	const blob = new Blob([JSON.stringify(takeout, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = documentElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.style.display = "none";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function documentElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
	return document.createElement(tagName);
}

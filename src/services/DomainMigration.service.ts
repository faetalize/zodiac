import { DEFAULT_TAKEOUT_CATEGORIES, TAKEOUT_SETTING_KEYS } from "../constants/Takeout";
import { DEFAULT_IMAGE_EDIT_MODEL, DEFAULT_IMAGE_MODEL } from "../constants/ImageModels";
import { SETTINGS_STORAGE_KEYS } from "../constants/SettingsStorageKeys";
import { holdStartupPresentation, releaseStartupPresentation } from "./StartupPresentation.service";
import * as surfaceService from "./Surface.service";

const destination = import.meta.env.DEV ? window.location.origin : "https://chat.zozo.sh";
const devArrivalStateKey = "zozo-dev-migration-arrived";
const signalKey = "migration";
type MigrationSignal = "takeout-v1" | "cloud" | "empty" | "continue";
type StartApp = (deferOnboarding: boolean) => Promise<void>;

interface LocalInventory {
	chats: number;
	personas: number;
	preferences: boolean;
	apiKeys: boolean;
}

function must<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing migration element: ${id}`);
	return element as T;
}

// Only defaults written automatically by startup are excluded. Stored scalar
// preferences otherwise represent a user choice, even when that choice is false.
async function readLocalInventory(): Promise<LocalInventory> {
	const { db } = await import("./Db.service");
	const [chats, personas] = await Promise.all([db.chats.count(), db.personalities.count()]);
	let preferences = false;
	let apiKeys = false;
	for (const [category, keys] of Object.entries(TAKEOUT_SETTING_KEYS)) {
		for (const key of keys) {
			const value = localStorage.getItem(key);
			if (!value?.trim()) continue;
			if (category === "apiKeys") {
				apiKeys = true;
				continue;
			}
			if (key === SETTINGS_STORAGE_KEYS.IMAGE_MODEL && value === DEFAULT_IMAGE_MODEL) continue;
			if (key === SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL && value === DEFAULT_IMAGE_EDIT_MODEL) continue;
			const isCollection =
				category === "loras" ||
				category === "pins" ||
				[
					SETTINGS_STORAGE_KEYS.ROLEPLAY_FAVORITE_ACTIONS,
					SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_CATEGORIES,
					SETTINGS_STORAGE_KEYS.ROLEPLAY_CUSTOM_ACTIONS
				].some((collectionKey) => collectionKey === key);
			if (isCollection) {
				const entries: unknown = JSON.parse(value);
				if (!Array.isArray(entries)) throw new Error(`Unable to read saved ${category}.`);
				if (entries.length === 0) continue;
			}
			preferences = true;
		}
	}
	return { chats, personas, preferences, apiKeys };
}

async function hasEnabledCloudSync(signal: AbortSignal): Promise<boolean> {
	// Loading the client alone does not start profile hydration or sync prompts.
	const { supabase } = await import("./SupabaseClient");
	const {
		data: { session },
		error: sessionError
	} = await supabase.auth.getSession();
	if (sessionError) throw new Error("Unable to check your sign-in — please reconnect and retry");
	if (!session) return false;
	const { data, error } = await supabase
		.from("user_sync_preferences")
		.select("sync_enabled")
		.eq("user_id", session.user.id)
		.abortSignal(signal)
		.maybeSingle();
	if (error) throw new Error("Unable to check whether Cloud Sync is enabled — please reconnect and retry");
	if (data && typeof data.sync_enabled !== "boolean") throw new Error("Cloud Sync returned an invalid preference");
	return data?.sync_enabled === true;
}

async function checkSource(): Promise<"cloud" | LocalInventory> {
	const controller = new AbortController();
	let timeout: number | undefined;
	try {
		return await Promise.race([
			(async () => {
				if (await hasEnabledCloudSync(controller.signal)) return "cloud" as const;
				return await readLocalInventory();
			})(),
			new Promise<never>((_, reject) => {
				timeout = window.setTimeout(() => {
					controller.abort();
					reject(
						new Error("The data check took too long — reconnect or close other Zodiac tabs, then retry")
					);
				}, 15_000);
			})
		]);
	} finally {
		window.clearTimeout(timeout);
	}
}

function navigate(signal: MigrationSignal): void {
	// Dev keeps its exact origin (including protocol/port). Never forward the
	// old path, query parameters, or auth material to either destination.
	window.location.replace(`${destination}/?${signalKey}=${signal}`);
}

async function receiveMigration(startApp: StartApp, signal: MigrationSignal): Promise<void> {
	if (signal === "takeout-v1") holdStartupPresentation();
	await startApp(signal === "takeout-v1");
	if (signal !== "takeout-v1") return;
	const takeout = await import("../components/static/DataTakeout.component");
	takeout.openTakeoutImport({
		instructions: "Choose the file you exported from Zodiac",
		onClose: releaseStartupPresentation
	});
}

export async function initializeDomainMigration(startApp: StartApp): Promise<void> {
	if (import.meta.env.DEV) {
		const testMigration = must<HTMLButtonElement>("btn-debug-migration");
		testMigration.classList.remove("hidden");
		testMigration.onclick = () => {
			const state = { ...window.history.state };
			delete state[devArrivalStateKey];
			window.history.replaceState(state, "", window.location.href);
			window.location.reload();
		};
	}
	if (import.meta.env.DEV || window.location.hostname === "chat.zozo.sh") {
		const url = new URL(window.location.href);
		const signal = url.searchParams.get(signalKey);
		if (signal === "takeout-v1" || signal === "cloud" || signal === "empty" || signal === "continue") {
			await receiveMigration(startApp, signal);
			// Consume only after the importer has opened successfully. Preserve
			// unrelated parameters and any auth hash on the destination itself.
			url.searchParams.delete(signalKey);
			window.history.replaceState(
				import.meta.env.DEV ? { ...window.history.state, [devArrivalStateKey]: true } : window.history.state,
				"",
				url
			);
			if (!import.meta.env.DEV) return;
		} else if (import.meta.env.DEV && window.history.state?.[devArrivalStateKey]) {
			// On dev the two sides share an origin. Keep refreshes of this history
			// entry on the arrival side after consuming the one-time URL signal.
			await startApp(false);
		}
	}
	if (import.meta.env.DEV && window.history.state?.[devArrivalStateKey]) {
		return;
	}
	if (!import.meta.env.DEV && window.location.hostname !== "zodiac.faetalize.dev") {
		await startApp(false);
		return;
	}

	let appPromise: Promise<void> | undefined;
	const loadApp = () =>
		(appPromise ??= startApp(true).catch((error: unknown) => {
			appPromise = undefined;
			throw error;
		}));
	const sheet = must("domain-migration-sheet");
	const status = must("domain-migration-status");
	const exportButton = must<HTMLButtonElement>("btn-migration-export");
	const continueButton = must<HTMLButtonElement>("btn-migration-continue");
	const retryButton = must<HTMLButtonElement>("btn-migration-retry");
	const confirmation = must<HTMLInputElement>("migration-confirmed");
	const localContent = sheet.querySelectorAll<HTMLElement>("[data-local-migration]");
	let checking = false;
	let downloaded = false;

	async function check(): Promise<void> {
		if (checking) return;
		let requiresInteraction = false;
		checking = true;
		confirmation.checked = false;
		confirmation.disabled = true;
		continueButton.disabled = true;
		exportButton.disabled = true;
		localContent.forEach((element) => element.classList.add("hidden"));
		retryButton.classList.add("hidden");
		status.textContent = "";
		status.classList.add("hidden");
		try {
			const source = await checkSource();
			if (source === "cloud") {
				navigate("cloud");
				return;
			}
			if (!source.chats && !source.personas && !source.preferences && !source.apiKeys) {
				navigate("empty");
				return;
			}
			await loadApp();
			exportButton.disabled = false;
			confirmation.disabled = false;
			localContent.forEach((element) => element.classList.remove("hidden"));
			requiresInteraction = true;
		} catch (error) {
			status.textContent = (error instanceof Error ? error.message : "Unable to check your local data").replace(
				/\.+$/,
				""
			);
			status.classList.remove("hidden");
			retryButton.classList.remove("hidden");
			requiresInteraction = true;
		} finally {
			checking = false;
			// Redirect-only visits never mount a migration surface or change the
			// theme. Present UI only when there is something for the user to do.
			if (requiresInteraction) {
				const { themeService } = await import("./Theme.service");
				themeService.reloadFromStorage();
				surfaceService.show(sheet.id);
			}
		}
	}

	confirmation.addEventListener("change", () => {
		continueButton.disabled = !confirmation.checked;
	});
	continueButton.addEventListener("click", () => {
		if (confirmation.checked) navigate(downloaded ? "takeout-v1" : "continue");
	});
	retryButton.addEventListener("click", () => {
		void check();
	});
	exportButton.addEventListener("click", () => {
		void (async () => {
			const takeout = await import("../components/static/DataTakeout.component");
			takeout.openTakeoutExport({
				source: "local",
				categories: DEFAULT_TAKEOUT_CATEGORIES,
				onDownloadInitiated: () => {
					downloaded = true;
					status.textContent = "";
					status.classList.add("hidden");
				},
				onClose: () => surfaceService.show(sheet.id)
			});
		})();
	});
	holdStartupPresentation();
	await check();
}

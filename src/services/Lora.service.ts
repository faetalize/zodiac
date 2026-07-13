import type { LoRAInfo, LoRAState } from "../types/Lora";
import { LORA_STORAGE_KEY } from "../types/Lora";
import { isLoraBaseModelSupported } from "../constants/Loras";
import { supabase } from "./Supabase.service";
import { dispatchAppEvent, dispatchEmptyAppEvent } from "../events";
import * as syncService from "./Sync.service";

const LORA_GET_METDATA_ENDPOINT_SLUG = "get-lora-metadata-x";

let loras: LoRAInfo[] = [];
let loraState: LoRAState[] = [];

export const initialLoraState: Omit<LoRAState, "lora"> = { strength: 1, enabled: false };

export function getLoraState(): LoRAState[] {
	//build from loras
	const state = loras.map((lora) => {
		return {
			lora,
			strength:
				loraState.find((entry) => entry.lora.modelVersionId === lora.modelVersionId)?.strength ??
				initialLoraState.strength,
			enabled:
				loraState.find((entry) => entry.lora.modelVersionId === lora.modelVersionId)?.enabled ??
				initialLoraState.enabled
		};
	});
	return state;
}
function upsertLoraState(lora: LoRAState) {
	const index = loraState.findIndex((entry) => entry.lora.modelVersionId === lora.lora.modelVersionId);
	if (index !== -1) {
		loraState[index] = lora;
	} else {
		loraState.push(lora);
	}
}

function readFromLocalstorage(): string[] {
	try {
		const raw = localStorage.getItem(LORA_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		// Basic shape validation
		return parsed.filter((x: unknown): x is string => typeof x === "string");
	} catch {
		return [];
	}
}
function writeToLocalstorage(list: string[]): void {
	localStorage.setItem(LORA_STORAGE_KEY, JSON.stringify(list));
}

function queueLoraSettingsSync(): void {
	syncService.queueSettingsPush({ label: "LoRA settings" });
}

function deleteFromLocalstorage(modelVersionId: string): void {
	console.log("Deleting LoRA from localstorage:", modelVersionId);
	const urls = readFromLocalstorage();
	const filtered = urls.filter((url) => !url.includes(modelVersionId));
	writeToLocalstorage(filtered);
	queueLoraSettingsSync();
}

export function getAll(): LoRAInfo[] {
	return loras;
}

export type AddLoraResult =
	| { status: "added"; lora: LoRAInfo }
	| { status: "duplicate" }
	| { status: "unsupported"; baseModel: string }
	| { status: "failed" };

export async function add(url: string): Promise<AddLoraResult> {
	const urlTrimmed = url.trim();
	const urls = readFromLocalstorage();
	// prevent duplicates early return
	if (urls.some((existingUrl) => existingUrl === urlTrimmed)) {
		console.log("[LoRA] LoRA URL already exists in localstorage:", urlTrimmed);
		return { status: "duplicate" };
	}
	const loraDetails = await getLoraMetadata([urlTrimmed]);
	if (!loraDetails || loraDetails.length === 0) {
		return { status: "failed" };
	}
	const lora = loraDetails[0];
	if (loras.some((existingLora) => existingLora.modelVersionId === lora.modelVersionId)) {
		console.log("[LoRA] LoRA model version already exists:", lora.modelVersionId);
		return { status: "duplicate" };
	}
	if (!isLoraBaseModelSupported(lora.baseModel)) {
		console.warn("[LoRA] Rejected LoRA with unsupported base model:", lora.baseModel);
		return { status: "unsupported", baseModel: lora.baseModel };
	}
	urls.push(lora.url);
	writeToLocalstorage(urls);
	queueLoraSettingsSync();

	loras.push(lora);
	return { status: "added", lora };
}

export async function initialize(): Promise<void> {
	loras = [];
	loraState = [];
	const all = readFromLocalstorage();
	const uniqueUrls = [...new Set(all)];
	const info = await getLoraMetadata(uniqueUrls);
	const lorasByUrl = new Map<string, LoRAInfo>();
	const lorasByModelVersionId = new Map<string, LoRAInfo>();
	if (info && info.length > 0) {
		for (const lora of info) {
			lorasByUrl.set(lora.url, lora);
			if (!lorasByModelVersionId.has(lora.modelVersionId)) {
				lorasByModelVersionId.set(lora.modelVersionId, lora);
				loras.push(lora);
			}
		}
	}
	const keptModelVersionIds = new Set<string>();
	const normalizedUrls = uniqueUrls.filter((url) => {
		let resolvedLora = lorasByUrl.get(url);
		if (!resolvedLora) {
			try {
				const modelVersionId = new URL(url).searchParams.get("modelVersionId");
				if (modelVersionId) {
					resolvedLora = lorasByModelVersionId.get(modelVersionId);
				}
			} catch {
				// Preserve invalid or unresolved URLs rather than treating them as deleted metadata.
			}
		}
		if (!resolvedLora) return true;
		if (keptModelVersionIds.has(resolvedLora.modelVersionId)) return false;
		keptModelVersionIds.add(resolvedLora.modelVersionId);
		return true;
	});
	const removedDuplicateCount = all.length - normalizedUrls.length;
	if (removedDuplicateCount > 0) {
		writeToLocalstorage(normalizedUrls);
		queueLoraSettingsSync();
	}
	loraState = loras.map((lora) => ({ lora, ...initialLoraState }));
	dispatchAppEvent("lora-list-refreshed", { removedDuplicateCount });
}

export async function getLoraMetadata(urls: string[]): Promise<LoRAInfo[] | void> {
	if (!urls || urls.length === 0) {
		return;
	}
	const { data, error } = await supabase.functions.invoke<LoRAInfo[]>(LORA_GET_METDATA_ENDPOINT_SLUG, {
		body: { urls }
	});
	if (error) {
		console.error("[LoRA] Error loading LoRA metadata:", error);
		return;
	}
	if (data) {
		return data;
	}
}

export function deleteLora(modelVersionId: string) {
	loras = loras.filter((entry) => entry.modelVersionId !== modelVersionId);
	deleteFromLocalstorage(modelVersionId);
}

export function toggleLora(modelVersionId: string, enabled: boolean) {
	const state = getLoraState().find((entry) => entry.lora.modelVersionId === modelVersionId);
	if (state) {
		state.enabled = enabled;
		upsertLoraState(state);
		// Dispatch event to notify components that LoRA state changed
		dispatchEmptyAppEvent("lora-state-changed");
	}
}

export function setLoraStrength(modelVersionId: string, strength: number) {
	const state = getLoraState().find((entry) => entry.lora.modelVersionId === modelVersionId);
	if (state) {
		state.strength = strength;
		upsertLoraState(state);
		// Dispatch event to notify components that LoRA state changed
		dispatchEmptyAppEvent("lora-state-changed");
	}
}

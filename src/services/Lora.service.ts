import { LoRAInfo, LORA_STORAGE_KEY, LoRAState } from "../models/Lora";
import { supabase } from "./Supabase.service";

let loras: LoRAInfo[] = [];
let loraState: LoRAState[] = [];

export const initialLoraState: Omit<LoRAState, "lora"> = { strength: 1, enabled: false }

export function getLoraState(): LoRAState[] {
    //build from loras
    const state = loras.map((lora) => {
        return {
            lora,
            strength: loraState.find(entry => entry.lora.modelVersionId === lora.modelVersionId)?.strength ?? initialLoraState.strength,
            enabled: loraState.find(entry => entry.lora.modelVersionId === lora.modelVersionId)?.enabled ?? initialLoraState.enabled
        }
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
function deleteFromLocalstorage(modelVersionId: string): void {
    console.log("Deleting LoRA from localstorage:", modelVersionId);
    const urls = readFromLocalstorage();
    const filtered = urls.filter((url) => !url.includes(modelVersionId));
    writeToLocalstorage(filtered);
}

export function getAll(): LoRAInfo[] {
    return loras;
}

export async function add(url: string): Promise<LoRAInfo | void> {
    const urlTrimmed = url.trim();
    const urls = readFromLocalstorage();
    // prevent duplicates early return
    if (urls.some((existingUrl) => existingUrl === urlTrimmed)) {
        console.log("[LoRA] LoRA URL already exists in localstorage:", urlTrimmed);
        return;
    }
    const loraDetails = await getLoraMetadata([urlTrimmed]);
    if (loraDetails && loraDetails.length > 0) {
        urls.push(loraDetails[0].url);
        writeToLocalstorage(urls);

        loras.push(...loraDetails);
        return loraDetails[0];
    }

}

export async function initialize(): Promise<void> {
    const all = readFromLocalstorage();
    const info = await getLoraMetadata(all);
    if (info && info.length > 0) {
        loras.push(...info);
    }
    loraState = loras.map((lora) => ({ lora, ...initialLoraState }));
}

export async function getLoraMetadata(urls: string[]): Promise<LoRAInfo[] | void> {
    if (!urls || urls.length === 0) {
        return;
    }
    const { data, error } = await supabase.functions.invoke<LoRAInfo[]>('get-lora-metadata', {
        body: { urls },
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
    }
}

export function setLoraStrength(modelVersionId: string, strength: number) {
    const state = getLoraState().find((entry) => entry.lora.modelVersionId === modelVersionId);
    if (state) {
        state.strength = strength;
        upsertLoraState(state);
    }
}
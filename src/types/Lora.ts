import type { ImageModel } from "./Models";
import { SETTINGS_STORAGE_KEYS } from "../constants/SettingsStorageKeys";

export const LORA_STORAGE_KEY = SETTINGS_STORAGE_KEYS.LORAS;

export interface LoRAInfo {
	baseModel: ImageModel;
	name: string;
	trainedWords: string[];
	modelVersionId: string;
	url: string;
	downloadUrl: string;
	fileName?: string;
}

export interface LoRAState {
	lora: LoRAInfo;
	strength: number;
	enabled: boolean;
}

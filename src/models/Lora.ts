import { ImageModel } from "./Models";

export const LORA_STORAGE_KEY = "loras";

export interface LoRAInfo {
    baseModel: ImageModel,
    name: string,
    trainedWords: string[],
    modelVersionId: string,
    url: string,
    downloadUrl: string,
    fileName?: string,
}

export interface LoRAState { lora: LoRAInfo; strength: number; enabled: boolean }
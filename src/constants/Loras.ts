import type { LoraArchitecture } from "../types/ImageModels";

/**
 * LoRA allowlist. Runware's model-upload architecture enum is the source of truth:
 * a LoRA is usable only when its Civitai BaseModel string maps to the Runware
 * architecture of the selected image model. When adding a model, first verify on
 * Runware that the architecture exists and accepts LoRA uploads, then list the
 * corresponding Civitai BaseModel strings here (exact values from
 * civitai.com/api/v1/enums). Unlisted base models cannot be added.
 * Keep in sync with the same table in zozo-edge (supabase/functions/handle-max-request).
 */
export const CIVITAI_BASE_MODEL_TO_LORA_ARCHITECTURE: Record<string, LoraArchitecture> = {
	Illustrious: "illustrious",
	"SDXL 1.0": "sdxl",
	"SDXL 0.9": "sdxl"
};

export function loraArchitectureFromCivitaiBaseModel(baseModel: string | undefined): LoraArchitecture | null {
	const normalized = baseModel?.trim().toLowerCase();
	if (!normalized) return null;
	for (const [civitaiBaseModel, architecture] of Object.entries(CIVITAI_BASE_MODEL_TO_LORA_ARCHITECTURE)) {
		if (civitaiBaseModel.toLowerCase() === normalized) return architecture;
	}
	return null;
}

export function isLoraBaseModelSupported(baseModel: string | undefined): boolean {
	return loraArchitectureFromCivitaiBaseModel(baseModel) !== null;
}

export function supportedLoraBaseModelLabels(): string[] {
	return Object.keys(CIVITAI_BASE_MODEL_TO_LORA_ARCHITECTURE);
}

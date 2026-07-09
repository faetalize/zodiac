export enum ImageModelId {
	ILLUSTRIOUS = "illustrious",
	BLXL = "biglust",
	SEEDREAM = "seedream",
	QWEN = "qwen",
	PRUNA = "pruna",
	SEEDREAM_5_0_PRO = "seedream-5-0-pro",
	SEEDREAM_4_5 = "seedream-4-5",
	QWEN_2_0_PRO = "qwen-2-0-pro",
	QWEN_2_0 = "qwen-2-0"
}

export enum ImageModelProvider {
	GOOGLE = "GOOGLE",
	OPENROUTER = "OPENROUTER",
	EDGE = "EDGE"
}

export enum ImagePromptType {
	TAG = "TAG",
	SEMANTIC = "SEMANTIC"
}

/**
 * Runware model-upload architecture values. Runware is the source of truth for
 * LoRA support: a model can only use LoRAs when it is served from open weights
 * on Runware under one of these architectures.
 */
export type LoraArchitecture = "illustrious" | "sdxl";

export interface ImageModelDefinition {
	id: ImageModelId;
	label: string;
	providers: ImageModelProvider[];
	generation: boolean;
	editing: boolean;
	promptType: ImagePromptType;
	/** Absent means the model does not support LoRAs (e.g. provider-hosted API models). */
	loraArchitecture?: LoraArchitecture;
	maxInputImages?: number;
}

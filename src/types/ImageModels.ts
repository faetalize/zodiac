export enum ImageModelId {
	ILLUSTRIOUS = "illustrious",
	BLXL = "biglust",
	SEEDREAM = "seedream",
	QWEN = "qwen",
	PRUNA = "pruna",
	SEEDREAM_5_0_PRO = "seedream-5-0-pro",
	SEEDREAM_4_5 = "seedream-4-5",
	QWEN_2_0_PRO = "qwen-2-0-pro",
	QWEN_2_0 = "qwen-2-0",
	GEMINI_2_5_FLASH_IMAGE = "gemini-2.5-flash-image",
	GEMINI_3_PRO_IMAGE_PREVIEW = "gemini-3-pro-image-preview",
	GEMINI_3_1_FLASH_IMAGE_PREVIEW = "gemini-3.1-flash-image-preview",
	GROK_IMAGINE_IMAGE_QUALITY = "grok-imagine-image-quality"
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
	/** OpenRouter uses a provider-prefixed model ID for some Google image models. */
	openRouterModelId?: string;
}

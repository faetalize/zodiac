export enum ImageModelId {
	ILLUSTRIOUS = "illustrious",
	BLXL = "biglust",
	SEEDREAM = "seedream",
	QWEN = "qwen",
	PRUNA = "pruna"
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

export enum BaseModel {
	SDXL = "sdxl",
	ILLUSTRIOUS = "illustrious"
}

export interface ImageModelDefinition {
	id: ImageModelId;
	label: string;
	providers: ImageModelProvider[];
	generation: boolean;
	editing: boolean;
	promptType: ImagePromptType;
	baseModel?: BaseModel;
	maxInputImages?: number;
}

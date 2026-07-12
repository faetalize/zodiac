import { ImageModelId, ImageModelProvider, ImagePromptType, type ImageModelDefinition } from "../types/ImageModels";

export const IMAGE_MODELS: ImageModelDefinition[] = [
	{
		id: ImageModelId.ILLUSTRIOUS,
		label: "Illustrious (Anime)",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: false,
		promptType: ImagePromptType.TAG,
		loraArchitecture: "illustrious"
	},
	{
		id: ImageModelId.BLXL,
		label: "BLXL (Realism)",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: false,
		promptType: ImagePromptType.TAG,
		loraArchitecture: "sdxl"
	},
	{
		id: ImageModelId.QWEN,
		label: "Qwen Image Edit",
		providers: [ImageModelProvider.EDGE],
		generation: false,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 3
	},
	{
		id: ImageModelId.QWEN_2_0_PRO,
		label: "Qwen 2.0 Pro",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 3
	},
	{
		id: ImageModelId.QWEN_2_0,
		label: "Qwen 2.0",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 3
	},
	{
		id: ImageModelId.SEEDREAM,
		label: "Seedream 4.0 Edit",
		providers: [ImageModelProvider.EDGE],
		generation: false,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 5
	},
	{
		id: ImageModelId.SEEDREAM_5_0_PRO,
		label: "Seedream 5.0 Pro",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 5
	},
	{
		id: ImageModelId.SEEDREAM_4_5,
		label: "Seedream 4.5",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 5
	},
	{
		id: ImageModelId.PRUNA,
		label: "P-Image Edit",
		providers: [ImageModelProvider.EDGE],
		generation: false,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 5
	},
	{
		id: ImageModelId.GEMINI_2_5_FLASH_IMAGE,
		label: "Nano Banana",
		providers: [ImageModelProvider.EDGE, ImageModelProvider.OPENROUTER, ImageModelProvider.GOOGLE],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 5,
		openRouterModelId: "google/gemini-2.5-flash-image"
	},
	{
		id: ImageModelId.GEMINI_3_PRO_IMAGE_PREVIEW,
		label: "Nano Banana Pro",
		providers: [ImageModelProvider.EDGE, ImageModelProvider.OPENROUTER, ImageModelProvider.GOOGLE],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 5,
		openRouterModelId: "google/gemini-3-pro-image-preview"
	},
	{
		id: ImageModelId.GEMINI_3_1_FLASH_IMAGE_PREVIEW,
		label: "Nano Banana 2",
		providers: [ImageModelProvider.EDGE, ImageModelProvider.OPENROUTER, ImageModelProvider.GOOGLE],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 5,
		openRouterModelId: "google/gemini-3.1-flash-image-preview"
	},
	{
		id: ImageModelId.GROK_IMAGINE_IMAGE_QUALITY,
		label: "Grok Imagine Image Quality",
		providers: [ImageModelProvider.EDGE, ImageModelProvider.OPENROUTER],
		generation: true,
		editing: true,
		promptType: ImagePromptType.SEMANTIC,
		maxInputImages: 3,
		openRouterModelId: "x-ai/grok-imagine-image-quality"
	}
];

export const DEFAULT_IMAGE_MODEL = ImageModelId.ILLUSTRIOUS;
export const DEFAULT_IMAGE_EDIT_MODEL = ImageModelId.QWEN;

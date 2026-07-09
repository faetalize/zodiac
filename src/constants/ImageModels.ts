import {
	BaseModel,
	ImageModelId,
	ImageModelProvider,
	ImagePromptType,
	type ImageModelDefinition
} from "../types/ImageModels";

export const IMAGE_MODELS: ImageModelDefinition[] = [
	{
		id: ImageModelId.ILLUSTRIOUS,
		label: "Illustrious (Anime)",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: false,
		promptType: ImagePromptType.TAG,
		baseModel: BaseModel.ILLUSTRIOUS
	},
	{
		id: ImageModelId.BLXL,
		label: "BLXL (Realism)",
		providers: [ImageModelProvider.EDGE],
		generation: true,
		editing: false,
		promptType: ImagePromptType.TAG,
		baseModel: BaseModel.SDXL
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
	}
];

export const DEFAULT_IMAGE_MODEL = ImageModelId.ILLUSTRIOUS;
export const DEFAULT_IMAGE_EDIT_MODEL = ImageModelId.QWEN;

import { ImageModelId } from "../types/Models";

export const MODEL_IMAGE_LIMITS: Readonly<Partial<Record<ImageModelId, number>>> = {
	[ImageModelId.QWEN]: 3,
	[ImageModelId.SEEDREAM]: 5,
	[ImageModelId.PRUNA]: 5
} as const;

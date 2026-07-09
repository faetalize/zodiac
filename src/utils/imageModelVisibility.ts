import { IMAGE_MODELS } from "../constants/ImageModels";
import { ImageModelProvider, type ImageModelDefinition } from "../types/ImageModels";

export type ImageModelProviderAvailability = (provider: ImageModelProvider) => boolean;

export function isImageModelVisible(
	model: ImageModelDefinition,
	isProviderAvailable: ImageModelProviderAvailability
): boolean {
	return model.providers.some(isProviderAvailable);
}

export function getVisibleImageModels(
	isProviderAvailable: ImageModelProviderAvailability,
	models: ImageModelDefinition[] = IMAGE_MODELS
): ImageModelDefinition[] {
	return models.filter((model) => isImageModelVisible(model, isProviderAvailable));
}

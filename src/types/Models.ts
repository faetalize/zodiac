import { IMAGE_MODELS } from "../constants/ImageModels";

export {
	ImageModelId,
	ImageModelProvider,
	ImagePromptType,
	type ImageModelDefinition,
	type LoraArchitecture
} from "./ImageModels";

export enum ChatModel {
	PRO = "gemini-3.1-pro-preview",
	FLASH = "gemini-3.5-flash",
	FLASH_3_PREV = "gemini-3-flash-preview",
	FLASH_LITE = "gemini-3.1-flash-lite",
	NANO_BANANA = "gemini-2.5-flash-image",
	NANO_BANANA_PRO = "gemini-3-pro-image-preview",
	NANO_BANANA_2 = "gemini-3.1-flash-image-preview",
	PRO_2_5 = "gemini-2.5-pro",
	FLASH_2_5 = "gemini-2.5-flash",
	FLASH_LITE_2_5 = "gemini-2.5-flash-lite"
}

const GEMINI_TO_OPENROUTER_CHAT_MODEL_IDS = new Map<string, string>([
	[ChatModel.FLASH_LITE, "google/gemini-3.1-flash-lite"],
	[ChatModel.FLASH_3_PREV, "google/gemini-3-flash-preview"],
	[ChatModel.FLASH, "google/gemini-3.5-flash"],
	[ChatModel.FLASH_2_5, "google/gemini-2.5-flash"],
	[ChatModel.FLASH_LITE_2_5, "google/gemini-2.5-flash-lite"],
	[ChatModel.PRO, "google/gemini-3.1-pro-preview"],
	[ChatModel.PRO_2_5, "google/gemini-2.5-pro"],
	[ChatModel.NANO_BANANA, "google/gemini-2.5-flash-image"],
	[ChatModel.NANO_BANANA_PRO, "google/gemini-3-pro-image-preview"],
	[ChatModel.NANO_BANANA_2, "google/gemini-3.1-flash-image-preview"]
]);

export type ModelProvider = "gemini" | "openrouter";

export interface ChatModelDefinition {
	id: string;
	label: string;
	premiumLabel?: string;
	provider: ModelProvider;
	localOnly?: boolean;
	mega?: boolean;
	modelPickerGroup?: string;
	supportsThinking: boolean;
	requiresThinking?: boolean;
	supportsTemperature: boolean;
	supportsImageInput: boolean;
	supportsFileInput: boolean;
	supportsImageOutput: boolean;
	outputModalities?: ("text" | "image")[];
	consumesImageCredits?: boolean;
	roleplayModeSuggester?: boolean;
	roleplaySuggestionThinkingCap?: number;
}

export interface ChatModelAccess {
	hasGeminiAccess: boolean;
	hasOpenRouterAccess: boolean;
	isPremiumEndpointPreferred?: boolean;
}

export const DEFAULT_GEMINI_CHAT_MODEL = ChatModel.FLASH;
export const DEFAULT_OPENROUTER_CHAT_MODEL = "openai/gpt-5.4";
export const DEFAULT_OPENROUTER_NARRATOR_MODEL = DEFAULT_OPENROUTER_CHAT_MODEL;
export const DEFAULT_OPENROUTER_TITLE_MODEL = "z-ai/glm-5";
const UI_DISABLED_CHAT_MODELS = new Set(["openai/gpt-5.4-pro"]);

export function requiresThoughtSignaturesInHistory(model: string): boolean {
	return model === ChatModel.NANO_BANANA_PRO || model === ChatModel.NANO_BANANA_2;
}

export const GEMINI_CHAT_MODELS: ChatModelDefinition[] = [
	{
		id: ChatModel.FLASH_LITE,
		label: "Gemini 3.1 Flash Lite",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Flash Lite",
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: ChatModel.FLASH,
		label: "Gemini 3.5 Flash",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Flash",
		roleplayModeSuggester: true,
		supportsThinking: true,
		requiresThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: ChatModel.FLASH_3_PREV,
		label: "Gemini 3 Flash Preview",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Flash",
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: ChatModel.PRO,
		label: "Gemini 3.1 Pro Preview",
		provider: "gemini",
		localOnly: true,
		mega: true,
		modelPickerGroup: "Pro",
		roleplayModeSuggester: true,
		supportsThinking: true,
		requiresThinking: true,
		roleplaySuggestionThinkingCap: 128,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: ChatModel.PRO_2_5,
		label: "Gemini 2.5 Pro",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Pro",
		supportsThinking: true,
		requiresThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: ChatModel.FLASH_2_5,
		label: "Gemini 2.5 Flash",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Flash",
		supportsThinking: false,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: ChatModel.FLASH_LITE_2_5,
		label: "Gemini 2.5 Flash Lite",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Flash Lite",
		supportsThinking: false,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: ChatModel.NANO_BANANA,
		label: "Gemini 2.5 Flash Image (Nano Banana)",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Flash",
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: true
	},
	{
		id: ChatModel.NANO_BANANA_PRO,
		label: "Gemini 3.0 Pro Image (Nano Banana Pro)",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Pro",
		supportsThinking: true,
		requiresThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: true
	},
	{
		id: ChatModel.NANO_BANANA_2,
		label: "Gemini 3.1 Flash Image (Nano Banana 2)",
		provider: "gemini",
		localOnly: true,
		mega: false,
		modelPickerGroup: "Flash",
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: true
	}
];

function openRouterGeminiVariant(localModelId: ChatModel, openRouterModelId: string): ChatModelDefinition {
	const localModel = GEMINI_CHAT_MODELS.find((model) => model.id === localModelId);
	if (!localModel) throw new Error(`Missing local Gemini model: ${localModelId}`);

	return {
		...localModel,
		id: openRouterModelId,
		label: `${localModel.label} via OpenRouter`,
		premiumLabel: localModel.label,
		provider: "openrouter",
		localOnly: undefined
	};
}

export const OPENROUTER_CHAT_MODELS: ChatModelDefinition[] = [
	openRouterGeminiVariant(ChatModel.FLASH_LITE, "google/gemini-3.1-flash-lite"),
	openRouterGeminiVariant(ChatModel.FLASH_3_PREV, "google/gemini-3-flash-preview"),
	openRouterGeminiVariant(ChatModel.FLASH, "google/gemini-3.5-flash"),
	openRouterGeminiVariant(ChatModel.FLASH_2_5, "google/gemini-2.5-flash"),
	openRouterGeminiVariant(ChatModel.FLASH_LITE_2_5, "google/gemini-2.5-flash-lite"),
	openRouterGeminiVariant(ChatModel.PRO, "google/gemini-3.1-pro-preview"),
	openRouterGeminiVariant(ChatModel.PRO_2_5, "google/gemini-2.5-pro"),
	openRouterGeminiVariant(ChatModel.NANO_BANANA, "google/gemini-2.5-flash-image"),
	openRouterGeminiVariant(ChatModel.NANO_BANANA_PRO, "google/gemini-3-pro-image-preview"),
	openRouterGeminiVariant(ChatModel.NANO_BANANA_2, "google/gemini-3.1-flash-image-preview"),
	{
		id: "openai/gpt-5.4",
		label: "GPT-5.4",
		provider: "openrouter",
		mega: false,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: "openai/gpt-5.5",
		label: "GPT-5.5",
		provider: "openrouter",
		mega: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: "openai/gpt-5.4-pro",
		label: "GPT-5.4 Pro",
		provider: "openrouter",
		mega: true,
		supportsThinking: true,
		requiresThinking: true,
		roleplaySuggestionThinkingCap: 128,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: "openai/gpt-oss-120b",
		label: "GPT-OSS 120B",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		requiresThinking: true,
		roleplaySuggestionThinkingCap: 128,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "openai/gpt-5.3-chat",
		label: "GPT-5.3 Chat",
		provider: "openrouter",
		mega: false,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: "openai/gpt-4o",
		label: "GPT-4o",
		provider: "openrouter",
		mega: false,
		supportsThinking: false,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: true,
		supportsImageOutput: false
	},
	{
		id: "anthropic/claude-sonnet-4.6",
		label: "Claude Sonnet 4.6",
		provider: "openrouter",
		mega: false,
		modelPickerGroup: "Sonnet",
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "anthropic/claude-haiku-4.5",
		label: "Claude Haiku 4.5",
		provider: "openrouter",
		mega: false,
		modelPickerGroup: "Haiku",
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "anthropic/claude-opus-4.6",
		label: "Claude Opus 4.6",
		provider: "openrouter",
		mega: true,
		modelPickerGroup: "Opus",
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "anthropic/claude-opus-4.7",
		label: "Claude Opus 4.7",
		provider: "openrouter",
		mega: true,
		modelPickerGroup: "Opus",
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "anthropic/claude-opus-4.8",
		label: "Claude Opus 4.8",
		provider: "openrouter",
		mega: true,
		modelPickerGroup: "Opus",
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "deepseek/deepseek-v4-pro",
		label: "DeepSeek V4 Pro",
		provider: "openrouter",
		mega: false,
		modelPickerGroup: "Pro",
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "deepseek/deepseek-v4-flash",
		label: "DeepSeek V4 Flash",
		provider: "openrouter",
		mega: false,
		modelPickerGroup: "Flash",
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "x-ai/grok-imagine-image-quality",
		label: "Grok Imagine Image Quality",
		provider: "openrouter",
		mega: false,
		supportsThinking: false,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: true,
		outputModalities: ["image"],
		consumesImageCredits: true
	},
	{
		id: "google/gemma-4-31b-it",
		label: "Gemma 4 31B",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "z-ai/glm-5",
		label: "GLM 5",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "z-ai/glm-5.1",
		label: "GLM 5.1",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "z-ai/glm-5.2",
		label: "GLM 5.2",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "inception/mercury-2",
		label: "Mercury 2",
		provider: "openrouter",
		mega: false,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "qwen/qwen3.5-397b-a17b",
		label: "Qwen3.5 397B",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "qwen/qwen3.5-plus-02-15",
		label: "Qwen3.5 Plus",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "qwen/qwen3.6-plus",
		label: "Qwen3.6 Plus",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "qwen/qwen3.6-max-preview",
		label: "Qwen3.6 Max Preview",
		provider: "openrouter",
		mega: true,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "qwen/qwen3.7-plus",
		label: "Qwen3.7 Plus",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "qwen/qwen3.7-max",
		label: "Qwen3.7 Max",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: false,
		supportsFileInput: false,
		supportsImageOutput: false
	},
	{
		id: "x-ai/grok-4.3",
		label: "Grok 4.3",
		provider: "openrouter",
		mega: false,
		roleplayModeSuggester: true,
		supportsThinking: true,
		supportsTemperature: true,
		supportsImageInput: true,
		supportsFileInput: false,
		supportsImageOutput: false
	}
];

export const CHAT_MODELS: ChatModelDefinition[] = [...GEMINI_CHAT_MODELS, ...OPENROUTER_CHAT_MODELS];

const chatModelMap = new Map(CHAT_MODELS.map((model) => [model.id, model]));

export function getChatModelDefinition(model: string | null | undefined): ChatModelDefinition | undefined {
	if (!model) return undefined;
	return chatModelMap.get(model);
}

export function isKnownChatModel(model: string | null | undefined): boolean {
	return !!getChatModelDefinition(model);
}

export function isGeminiModel(model: string | null | undefined): boolean {
	return getChatModelDefinition(model)?.provider === "gemini";
}

export function isOpenRouterModel(model: string | null | undefined): boolean {
	return getChatModelDefinition(model)?.provider === "openrouter";
}

export function modelSupportsThinking(model: string | null | undefined): boolean {
	return getChatModelDefinition(model)?.supportsThinking === true;
}

export function modelRequiresThinking(model: string | null | undefined): boolean {
	return getChatModelDefinition(model)?.requiresThinking === true;
}

export function getRoleplaySuggestionThinkingCap(model: string | null | undefined): number | undefined {
	return getChatModelDefinition(model)?.roleplaySuggestionThinkingCap;
}

export function modelSupportsTemperature(_model: string | null | undefined): boolean {
	return true;
}

export function getAccessibleChatModels(access: ChatModelAccess): ChatModelDefinition[] {
	return CHAT_MODELS.filter((model) => {
		if (UI_DISABLED_CHAT_MODELS.has(model.id)) {
			return false;
		}

		if (access.isPremiumEndpointPreferred && model.localOnly) {
			return false;
		}

		if (model.provider === "gemini") return access.hasGeminiAccess;
		return access.hasOpenRouterAccess;
	});
}

export function getAccessibleRoleplaySuggestionModels(access: ChatModelAccess): ChatModelDefinition[] {
	return getAccessibleChatModels(access).filter((model) => model.roleplayModeSuggester === true);
}

export function formatChatModelLabel(
	model: Pick<ChatModelDefinition, "label" | "premiumLabel" | "mega">,
	options: { usePremiumLabel?: boolean } = {}
): string {
	const label = options.usePremiumLabel ? (model.premiumLabel ?? model.label) : model.label;
	return model.mega ? `${label} [MEGA]` : label;
}

export function getPremiumEndpointChatModel(model: string | null | undefined): string | undefined {
	if (!model) return undefined;
	const definition = getChatModelDefinition(model);
	const mappedModel = GEMINI_TO_OPENROUTER_CHAT_MODEL_IDS.get(model);
	if (mappedModel && (definition?.localOnly || !definition)) return mappedModel;
	if (!definition?.localOnly) return model;
	return mappedModel;
}

export function formatOriginModelLabel(originModel: string | null | undefined): string {
	if (!originModel) return "";

	const chatDefinition = getChatModelDefinition(originModel);
	if (chatDefinition) {
		return formatChatModelLabel(chatDefinition);
	}

	return IMAGE_MODELS.find((model) => model.id === originModel)?.label ?? originModel;
}

export function getDefaultChatModel(access: ChatModelAccess): string {
	if (access.isPremiumEndpointPreferred && access.hasOpenRouterAccess) {
		return getPremiumEndpointChatModel(DEFAULT_GEMINI_CHAT_MODEL) ?? DEFAULT_OPENROUTER_CHAT_MODEL;
	}

	if (access.hasGeminiAccess) {
		return DEFAULT_GEMINI_CHAT_MODEL;
	}

	if (access.hasOpenRouterAccess) {
		return DEFAULT_OPENROUTER_CHAT_MODEL;
	}

	return DEFAULT_GEMINI_CHAT_MODEL;
}

export function getValidChatModel(model: string | null | undefined, access: ChatModelAccess): string {
	const availableModels = getAccessibleChatModels(access);
	const preferredModel = access.isPremiumEndpointPreferred ? getPremiumEndpointChatModel(model) : model;
	if (preferredModel && availableModels.some((candidate) => candidate.id === preferredModel)) {
		return preferredModel;
	}

	return availableModels[0]?.id ?? getDefaultChatModel(access);
}

export function getValidRoleplaySuggestionModel(model: string | null | undefined, access: ChatModelAccess): string {
	const availableModels = getAccessibleRoleplaySuggestionModels(access);
	const preferredModel = access.isPremiumEndpointPreferred ? getPremiumEndpointChatModel(model) : model;
	if (preferredModel && availableModels.some((candidate) => candidate.id === preferredModel)) {
		return preferredModel;
	}

	return availableModels[0]?.id ?? getDefaultChatModel(access);
}

export function getPreferredNarratorLocalModel(args: {
	geminiApiKey?: string | null;
	openRouterApiKey?: string | null;
}): string {
	if ((args.geminiApiKey || "").trim()) {
		return ChatModel.FLASH;
	}

	if ((args.openRouterApiKey || "").trim()) {
		return DEFAULT_OPENROUTER_NARRATOR_MODEL;
	}

	return ChatModel.FLASH;
}

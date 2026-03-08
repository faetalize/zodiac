export enum ChatModel {
    PRO = "gemini-3.1-pro-preview",
    FLASH = "gemini-3-flash-preview",
    FLASH_LITE_LATEST = "gemini-flash-lite-latest",
    NANO_BANANA = "gemini-2.5-flash-image",
    NANO_BANANA_PRO = "gemini-3-pro-image-preview",
    NANO_BANANA_2 = "gemini-3.1-flash-image-preview",
}

export enum ImageModel {
    ULTRA = "imagen-4.0-ultra-generate-001",
    ILLUSTRIOUS = "illustrious",
    BLXL = "biglust",
}

export enum ImageModelLabel {
    ULTRA = "Imagen 4.0 Ultra",
    ILLUSTRIOUS = "Illustrious (Anime)",
    BLXL = "BLXL (Realism)",
}

export enum ImageEditModel {
    SEEDREAM = "seedream",
    QWEN = "qwen",
    PRUNA = "pruna",
}

export type ModelProvider = "gemini" | "openrouter";

export interface ChatModelDefinition {
    id: string;
    label: string;
    provider: ModelProvider;
    supportsThinking: boolean;
    requiresThinking?: boolean;
    supportsTemperature: boolean;
    supportsImageInput: boolean;
    supportsFileInput: boolean;
    supportsImageOutput: boolean;
}

export interface ChatModelAccess {
    hasGeminiAccess: boolean;
    hasOpenRouterAccess: boolean;
}

export const DEFAULT_GEMINI_CHAT_MODEL = ChatModel.FLASH;
export const DEFAULT_OPENROUTER_CHAT_MODEL = "openai/gpt-5.4";
export const DEFAULT_OPENROUTER_NARRATOR_MODEL = DEFAULT_OPENROUTER_CHAT_MODEL;

export const GEMINI_CHAT_MODELS: ChatModelDefinition[] = [
    {
        id: ChatModel.FLASH_LITE_LATEST,
        label: "Gemini Flash Lite",
        provider: "gemini",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: false,
        supportsFileInput: true,
        supportsImageOutput: false,
    },
    {
        id: ChatModel.FLASH,
        label: "Gemini Flash",
        provider: "gemini",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: true,
        supportsFileInput: true,
        supportsImageOutput: false,
    },
    {
        id: ChatModel.PRO,
        label: "Gemini Pro",
        provider: "gemini",
        supportsThinking: true,
        requiresThinking: true,
        supportsTemperature: true,
        supportsImageInput: true,
        supportsFileInput: true,
        supportsImageOutput: false,
    },
    {
        id: ChatModel.NANO_BANANA_PRO,
        label: "Gemini Pro Image (Nano Banana Pro)",
        provider: "gemini",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: true,
        supportsFileInput: true,
        supportsImageOutput: true,
    },
    {
        id: ChatModel.NANO_BANANA_2,
        label: "Gemini Flash Image (Nano Banana 2)",
        provider: "gemini",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: true,
        supportsFileInput: true,
        supportsImageOutput: true,
    },
];

export const OPENROUTER_CHAT_MODELS: ChatModelDefinition[] = [
    {
        id: "openai/gpt-5.4",
        label: "OpenRouter - GPT-5.4",
        provider: "openrouter",
        supportsThinking: true,
        supportsTemperature: false,
        supportsImageInput: true,
        supportsFileInput: true,
        supportsImageOutput: false,
    },
    {
        id: "anthropic/claude-sonnet-4.6",
        label: "OpenRouter - Claude Sonnet 4.6",
        provider: "openrouter",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: true,
        supportsFileInput: false,
        supportsImageOutput: false,
    },
    {
        id: "z-ai/glm-5",
        label: "OpenRouter - GLM 5",
        provider: "openrouter",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: false,
        supportsFileInput: false,
        supportsImageOutput: false,
    },
    {
        id: "qwen/qwen3.5-397b-a17b",
        label: "OpenRouter - Qwen3.5 397B",
        provider: "openrouter",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: true,
        supportsFileInput: false,
        supportsImageOutput: false,
    },
    {
        id: "qwen/qwen3.5-plus-02-15",
        label: "OpenRouter - Qwen3.5 Plus",
        provider: "openrouter",
        supportsThinking: true,
        supportsTemperature: true,
        supportsImageInput: true,
        supportsFileInput: false,
        supportsImageOutput: false,
    },
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

export function modelSupportsTemperature(model: string | null | undefined): boolean {
    return getChatModelDefinition(model)?.supportsTemperature !== false;
}

export function getAccessibleChatModels(access: ChatModelAccess): ChatModelDefinition[] {
    return CHAT_MODELS.filter((model) => {
        if (model.provider === "gemini") return access.hasGeminiAccess;
        return access.hasOpenRouterAccess;
    });
}

export function getDefaultChatModel(access: ChatModelAccess): string {
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
    if (model && availableModels.some((candidate) => candidate.id === model)) {
        return model;
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

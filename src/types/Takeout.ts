import type { DbChat } from "./Chat";
import type { GeneratedImage, Message } from "./Message";
import type { DbPersonality } from "./Personality";

export type TakeoutCategory =
	| "chats"
	| "media"
	| "personas"
	| "settings"
	| "themes"
	| "loras"
	| "pins"
	| "roleplay"
	| "apiKeys";

export type TakeoutSource = "local" | "cloud";
export type TakeoutDestination = "local" | "cloud";
export type TakeoutConflictResolution = "copy" | "overwrite";

export interface TakeoutAttachment {
	__takeoutAttachment: true;
	name: string;
	mimeType: string;
	size: number;
	lastModified: number;
	base64: string;
}

export type TakeoutMessagePart = Omit<Message["parts"][number], "attachments" | "_thoughtSignatureRef"> & {
	attachments?: TakeoutAttachment[];
};

export type TakeoutGeneratedImage = Omit<GeneratedImage, "_blobRef" | "_thoughtSignatureRef">;

export type TakeoutMessage = Omit<Message, "parts" | "generatedImages"> & {
	parts: TakeoutMessagePart[];
	generatedImages?: TakeoutGeneratedImage[];
};

export type TakeoutChat = Omit<DbChat, "content" | "lastModified"> & {
	content: TakeoutMessage[];
	lastModified?: string;
};

export interface TakeoutPayload {
	chats?: TakeoutChat[];
	personas?: DbPersonality[];
	settings?: Record<string, string>;
}

export interface TakeoutCounts {
	chats: number;
	messages: number;
	personas: number;
	attachments: number;
	generatedImages: number;
	settings: number;
	themes: number;
	loras: number;
	pins: number;
	roleplay: number;
	apiKeys: number;
}

export interface TakeoutManifest {
	categories: TakeoutCategory[];
	omittedCategories: TakeoutCategory[];
	counts: TakeoutCounts;
	mediaBytes: number;
	apiKeysIncluded: boolean;
}

export interface TakeoutDocument {
	format: string;
	schemaVersion: number;
	appVersion: string;
	exportedAt: string;
	source: TakeoutSource;
	manifest: TakeoutManifest;
	payload: TakeoutPayload;
	integrity: {
		algorithm: "SHA-256";
		digest: string;
	};
}

export interface ParsedTakeout {
	kind: "unified" | "legacy";
	categories: TakeoutCategory[];
	payload: TakeoutPayload;
	manifest?: TakeoutManifest;
}

export interface TakeoutImportPlan {
	chats: DbChat[];
	personas: DbPersonality[];
	settings: Record<string, string>;
	chatIdMap: Record<string, string>;
	personaIdMap: Record<string, string>;
	conflicts: {
		chats: number;
		personas: number;
		roleplay: number;
	};
	skipped: {
		chats: number;
		personas: number;
		roleplay: number;
	};
	warnings: string[];
}

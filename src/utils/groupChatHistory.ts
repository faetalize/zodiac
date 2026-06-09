import type { Content } from "@google/genai";

import type { Message } from "../types/Message";
import type { DbChat } from "../types/Chat";

import { NARRATOR_PERSONALITY_ID } from "./personalityMarkers";
import { maybePrefixSpeaker } from "./chatHistory";
import { processAttachmentsToParts, processGeneratedImagesToParts } from "./chatHistoryBuilder";
import { resolveThoughtSignature } from "./blobResolver";

export async function constructGeminiChatHistoryForGroupChat(
	currentChat: DbChat,
	args: {
		speakerNameById: Map<string, string>;
		userName: string;
		enforceThoughtSignatures?: boolean;
		skipThoughtSignatureValidator: string;
	}
): Promise<{ history: Content[]; pinnedHistoryIndices: number[] }> {
	const history: Content[] = [];
	const pinnedHistoryIndices: number[] = [];
	const shouldEnforceThoughtSignatures = args.enforceThoughtSignatures === true;

	const speakerNameForMessage = (m: Message): string => {
		if (m.role === "user") return (args.userName || "User").toString();
		if (m.personalityid === NARRATOR_PERSONALITY_ID) return "Narrator";
		const id = (m.personalityid ?? "").toString();
		return args.speakerNameById.get(id) ?? "Unknown";
	};

	for (let index = 0; index < currentChat.content.length; index++) {
		const dbMessage = currentChat.content[index];
		if (dbMessage.hidden) continue;

		const aggregatedParts: any[] = [];
		const speaker = speakerNameForMessage(dbMessage);
		let hasThoughtSignature = false;

		for (const part of dbMessage.parts) {
			const text = (part.text || "").toString();
			const attachments = part.attachments || [];

			if (part.thought) {
				continue;
			}

			if (text.trim().length > 0) {
				const partObj: any = { text: maybePrefixSpeaker(text, speaker) };
				const resolvedSignature = dbMessage.role === "model" ? await resolveThoughtSignature(part) : undefined;
				const ts =
					resolvedSignature ||
					(dbMessage.role === "model" && shouldEnforceThoughtSignatures
						? args.skipThoughtSignatureValidator
						: undefined);
				if (ts && !hasThoughtSignature) {
					partObj.thoughtSignature = ts;
					hasThoughtSignature = true;
				}
				aggregatedParts.push(partObj);
			}

			const attachmentParts = await processAttachmentsToParts({
				attachments,
				shouldProcess: attachments.length > 0
			});
			aggregatedParts.push(...attachmentParts);
		}

		const genAiMessage: Content = { role: dbMessage.role, parts: aggregatedParts };

		const imageParts = await processGeneratedImagesToParts({
			images: dbMessage.generatedImages,
			shouldProcess: !!dbMessage.generatedImages,
			enforceThoughtSignatures: shouldEnforceThoughtSignatures,
			skipThoughtSignatureValidator: args.skipThoughtSignatureValidator,
			suppressThoughtSignature: hasThoughtSignature
		});
		if (imageParts.length > 0) {
			genAiMessage.parts?.push(...imageParts);
		}

		if (genAiMessage.parts && genAiMessage.parts.length > 0) {
			history.push(genAiMessage);
		}
	}

	return { history, pinnedHistoryIndices };
}

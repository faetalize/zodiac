import type { Content } from "@google/genai";

import type { Message } from "../types/Message";
import type { DbChat } from "../types/Chat";

import { NARRATOR_PERSONALITY_ID } from "./personalityMarkers";
import { maybePrefixSpeaker } from "./chatHistory";
import {
    findLastAttachmentIndex,
    findLastGeneratedImageIndex,
    processAttachmentsToParts,
    processGeneratedImagesToParts,
} from "./chatHistoryBuilder";

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

    const lastImageIndex = findLastGeneratedImageIndex(currentChat.content);
    const lastAttachmentIndex = findLastAttachmentIndex(currentChat.content);

    for (let index = 0; index < currentChat.content.length; index++) {
        const dbMessage = currentChat.content[index];
        if (dbMessage.hidden) continue;

        const aggregatedParts: any[] = [];
        const speaker = speakerNameForMessage(dbMessage);

        for (const part of dbMessage.parts) {
            const text = (part.text || "").toString();
            const attachments = part.attachments || [];

            if (text.trim().length > 0 || part.thoughtSignature) {
                const partObj: any = { text: maybePrefixSpeaker(text, speaker) };
                partObj.thoughtSignature = part.thoughtSignature ?? (shouldEnforceThoughtSignatures ? args.skipThoughtSignatureValidator : undefined);
                aggregatedParts.push(partObj);
            }

            const attachmentParts = await processAttachmentsToParts({
                attachments,
                shouldProcess: attachments.length > 0 && index === lastAttachmentIndex,
            });
            aggregatedParts.push(...attachmentParts);
        }

        const genAiMessage: Content = { role: dbMessage.role, parts: aggregatedParts };

        const imageParts = processGeneratedImagesToParts({
            images: dbMessage.generatedImages,
            shouldProcess: !!dbMessage.generatedImages && index === lastImageIndex,
            enforceThoughtSignatures: shouldEnforceThoughtSignatures,
            skipThoughtSignatureValidator: args.skipThoughtSignatureValidator,
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

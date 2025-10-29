import { Chat } from "../models/Chat";
import { GeneratedImage, Message } from "../models/Message";

export interface EditableImage {
    dataUri: string; // data:image/{mimeType};base64,{data}
    messageIndex: number;
    source: 'user-attachment' | 'model-generated';
    imageIndex?: number; // for model-generated images (array index)
}

/**
 * Finds the last editable image in the chat history.
 * Priority: Last user attachment > Last model-generated image
 * Returns null if no images found.
 */
export async function findLastEditableImage(chat: Chat): Promise<EditableImage | null> {
    if (!chat || !chat.content || chat.content.length === 0) {
        return null;
    }

    let lastUserAttachment: EditableImage | null = null;
    let lastModelGenerated: EditableImage | null = null;

    // Scan from newest to oldest
    for (let i = chat.content.length - 1; i >= 0; i--) {
        const message = chat.content[i];

        // Skip hidden messages
        if (message.hidden) {
            continue;
        }

        // Check for user attachments (images only)
        if (message.role === 'user' && !lastUserAttachment) {
            const imageAttachment = await findImageInAttachments(message);
            if (imageAttachment) {
                lastUserAttachment = {
                    dataUri: imageAttachment,
                    messageIndex: i,
                    source: 'user-attachment'
                };
            }
        }

        // Check for model-generated images
        if (message.role === 'model' && !lastModelGenerated) {
            const generatedImage = findImageInGeneratedImages(message);
            if (generatedImage) {
                lastModelGenerated = {
                    dataUri: generatedImage.dataUri,
                    messageIndex: i,
                    source: 'model-generated',
                    imageIndex: generatedImage.index
                };
            }
        }

        // If we found both types, we can stop early (user attachment takes priority)
        if (lastUserAttachment) {
            return lastUserAttachment;
        }
    }

    // Return model-generated if no user attachment found
    return lastModelGenerated;
}

/**
 * Finds the first image attachment in a user message
 */
async function findImageInAttachments(message: Message): Promise<string | null> {
    if (!message.parts || message.parts.length === 0) {
        return null;
    }

    for (const part of message.parts) {
        if (!part.attachments || part.attachments.length === 0) {
            continue;
        }

        for (const attachment of Array.from(part.attachments)) {
            if (attachment.type.startsWith('image/')) {
                // Convert File to base64 data URI
                return await fileToDataUri(attachment);
            }
        }
    }

    return null;
}

/**
 * Finds the last generated image in a model message
 */
function findImageInGeneratedImages(message: Message): { dataUri: string; index: number } | null {
    if (!message.generatedImages || message.generatedImages.length === 0) {
        return null;
    }

    // Take the last generated image
    const lastIndex = message.generatedImages.length - 1;
    const image = message.generatedImages[lastIndex];

    return {
        dataUri: `data:${image.mimeType};base64,${image.base64}`,
        index: lastIndex
    };
}

/**
 * Converts a File object to a data URI string
 */
async function fileToDataUri(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Scrolls to a specific message in the chat container
 */
export function scrollToMessage(messageIndex: number): void {
    const messageContainer = document.querySelector('.message-container');
    if (!messageContainer) {
        console.warn('Message container not found');
        return;
    }

    const messageElement = messageContainer.children[messageIndex] as HTMLElement;
    if (!messageElement) {
        console.warn(`Message at index ${messageIndex} not found`);
        return;
    }

    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add a brief highlight effect
    messageElement.classList.add('message-highlighted');
    setTimeout(() => {
        messageElement.classList.remove('message-highlighted');
    }, 2000);
}

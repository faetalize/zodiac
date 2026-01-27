import * as messageService from '../../services/Message.service';
import * as helpers from '../../utils/helpers';
import * as personalityService from '../../services/Personality.service';
import { attachmentPreviewElement, getAttachmentCount } from './AttachmentPreview.component';
import * as toastService from '../../services/Toast.service';
import { formatFileListForToast, getFileSignature, isSupportedFileType, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, SUPPORTED_ACCEPT_ATTRIBUTE, SUPPORTED_TYPES_LABEL } from '../../utils/attachments';
import * as settingsService from '../../services/Settings.service';
import * as chatsService from '../../services/Chats.service';
import { db } from '../../services/Db.service';
import { findLastEditableImage, EditableImage } from '../../utils/imageHistory';
import { historyImagePreviewElement } from '../dynamic/HistoryImagePreview';
import { getSelectedEditingModel } from './ImageEditModelSelector.component';
import { updateImageCreditsLabelVisibility } from './ImageCreditsLabel.component';
import { MODEL_IMAGE_LIMITS } from '../../constants/ImageModels';

interface AttachmentRemovedDetail {
    signature: string;
}

const messageInput = document.querySelector<HTMLDivElement>("#messageInput");
const messageBox = document.querySelector<HTMLDivElement>("#message-box");
const attachmentsInput = document.querySelector<HTMLInputElement>("#attachments");
const attachmentPreview = document.querySelector<HTMLDivElement>("#attachment-preview");
const sendMessageButton = document.querySelector<HTMLButtonElement>("#btn-send");
const internetSearchToggle = document.querySelector<HTMLButtonElement>("#btn-internet");
const roleplayActionsMenu = document.querySelector<HTMLButtonElement>("#btn-roleplay");

//turn control elements (optional - for group chats)
const turnControlPanel = document.querySelector<HTMLDivElement>("#turn-control-panel");
const turnControlLabel = document.querySelector<HTMLSpanElement>("#turn-control-label");
const startTurnBtn = document.querySelector<HTMLButtonElement>("#btn-start-turn");
const startRoundText = document.querySelector<HTMLSpanElement>("#start-round-text");
const skipTurnBtn = document.querySelector<HTMLButtonElement>("#btn-skip-turn");
const rpgSettingsButton = document.querySelector<HTMLButtonElement>("#btn-rpg-settings");

if (!messageInput || !messageBox || !attachmentsInput || !attachmentPreview || !sendMessageButton || !internetSearchToggle || !roleplayActionsMenu) {
    console.error("Chat input component is missing some elements. Please check the HTML structure.");
    throw new Error("Chat input component is not properly initialized.");
}

const scrollbarWidth = helpers.getClientScrollbarWidth();
if (scrollbarWidth > 0) {
    document.documentElement.style.setProperty('--scroll-bar-width', `${scrollbarWidth}px`);
}

attachmentPreview.setAttribute("aria-live", "polite");
attachmentPreview.setAttribute("aria-atomic", "false");
messageBox.setAttribute("role", "group");
messageBox.setAttribute("aria-label", "Message input and attachment dropzone");

attachmentsInput.accept = SUPPORTED_ACCEPT_ATTRIBUTE;
attachmentsInput.multiple = true;

let attachmentState: File[] = Array.from(attachmentsInput.files || []);
let isInternetSearchEnabled = false;
let dragDepth = 0;
let currentHistoryImagePreview: HTMLElement | null = null;
let isImageEditingActive = false;
let isImageModeActive = false;
let hasInsufficientImageCredits = false;

let isUserTurnInRpg = true;
let isGroupChatContext = false;
let isRpgGroupChatContext = false;

async function updateRpgTurnControlUi(args: {
    isUserTurn: boolean;
    startsNewRound: boolean;
    nextRoundNumber: number;
    nextSpeakerId?: string;
}) {
    const { isUserTurn, startsNewRound, nextRoundNumber, nextSpeakerId } = args;

    isUserTurnInRpg = !!isUserTurn;
    if (messageInput) {
        const canEdit = !isCurrentlyGenerating && isUserTurnInRpg;
        messageInput.contentEditable = String(canEdit);
        messageInput.classList.toggle("disabled", !canEdit);
    }
    sendMessageButton?.classList.toggle("disabled", isRpgGroupChatContext && (!isUserTurnInRpg || isCurrentlyGenerating));

    if (isUserTurn) {
        if (turnControlLabel) turnControlLabel.textContent = "Your turn";
        startTurnBtn?.classList.add("hidden");
        skipTurnBtn?.classList.remove("hidden");
    } else {
        startTurnBtn?.classList.remove("hidden");
        skipTurnBtn?.classList.add("hidden");

        // Determine next speaker name
        let nextSpeakerName = "AI";
        if (nextSpeakerId) {
            const persona = await personalityService.get(nextSpeakerId);
            if (persona) nextSpeakerName = persona.name;
        }

        if (startsNewRound) {
            if (turnControlLabel) turnControlLabel.textContent = "Start next round";
            if (startRoundText && typeof nextRoundNumber === "number") {
                startRoundText.textContent = `Start Round ${nextRoundNumber}`;
                startTurnBtn?.setAttribute("aria-label", `Start Round ${nextRoundNumber}`);
            }
        } else {
            if (turnControlLabel) turnControlLabel.textContent = `${nextSpeakerName}'s turn`;
            if (startRoundText && typeof nextRoundNumber === "number") {
                startRoundText.textContent = `Continue`;
                startTurnBtn?.setAttribute("aria-label", `Continue`);
            }
        }
    }
}

internetSearchToggle.addEventListener("click", () => {
    isInternetSearchEnabled = !isInternetSearchEnabled;
    internetSearchToggle.classList.toggle("btn-toggled");
});

//enter key to send message but support shift+enter for new line on PC only
messageInput.addEventListener("keydown", (e: KeyboardEvent) => {
    const isMobile = settingsService.isMobile();

    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        // Don't send if insufficient credits
        if (hasInsufficientImageCredits) {
            toastService.warn({
                title: "Insufficient Image Credits",
                text: "You don't have enough credits for this image request. Please buy more credits or disable image mode."
            });
            return;
        }
        sendMessageButton.click();
    }
});

messageInput.addEventListener("blur", () => {
    /* no-op placeholder to mirror previous behaviour */
});

messageInput.addEventListener("focus", () => {
    if (!settingsService.isMobile()) {
        return;
    }

    window.requestAnimationFrame(() => {
        messageInput.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
});

messageInput.addEventListener("paste", (event: ClipboardEvent) => {
    const files = collectFilesFromClipboard(event);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const hasFiles = files.length > 0;
    const hasText = text.trim().length > 0;

    if (!hasFiles) {
        if (hasText) {
            event.preventDefault();
            document.execCommand("insertText", false, text.replace(/\r/g, ""));
        }
        return;
    }

    event.preventDefault();
    if (hasText) {
        document.execCommand("insertText", false, text.replace(/\r/g, ""));
    }
    addAttachments(files);
});

messageInput.addEventListener("input", () => {
    if (messageInput.innerHTML.trim() === "<br>" || messageInput.innerHTML.trim() === "<p><br></p>") {
        messageInput.innerHTML = "";
    }
});

attachmentsInput.addEventListener("change", (event) => {
    const files = Array.from(attachmentsInput.files || []);
    if (files.length === 0) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    addAttachments(files);
}, true);

attachmentPreview.addEventListener("attachmentremoved", (event: Event) => {
    const detail = (event as CustomEvent<AttachmentRemovedDetail>).detail;
    if (!detail?.signature) {
        return;
    }
    attachmentState = attachmentState.filter(file => getFileSignature(file) !== detail.signature);
    syncAttachmentInput();
});

messageBox.addEventListener("dragenter", handleDragEnter);
messageBox.addEventListener("dragover", handleDragOver);
messageBox.addEventListener("dragleave", handleDragLeave);
messageBox.addEventListener("drop", handleDrop);

messageInput.addEventListener("dragenter", handleDragEnter);
messageInput.addEventListener("dragover", handleDragOver);
messageInput.addEventListener("dragleave", handleDragLeave);
messageInput.addEventListener("drop", handleDrop);

//track if currently generating a response
let isCurrentlyGenerating = false;

sendMessageButton.addEventListener("click", async () => {
    //if generating, abort instead of send
    if (isCurrentlyGenerating) {
        messageService.abortGeneration();
        return;
    }

    // In RPG group chats, only allow sending during the user's turn.
    if (isRpgGroupChatContext && !isUserTurnInRpg) {
        toastService.warn({
            title: "Not your turn",
            text: "Wait for your turn, then send your message.",
        });
        return;
    }

    // Check for insufficient credits before sending
    if (hasInsufficientImageCredits) {
        toastService.warn({
            title: "Insufficient Image Credits",
            text: "You don't have enough credits for this image request. Please buy more credits or disable image mode."
        });
        return;
    }

    try {
        const message = helpers.getEncoded(messageInput.innerHTML);
        messageInput.innerHTML = "";
        await messageService.send(message);
    } catch (error: any) {
        toastService.danger({
            title: "Error sending message",
            text: JSON.stringify(error.message || error),
        });
        console.error(error);
        return;
    }
});

//listen for generation state changes to toggle send/stop button
window.addEventListener('generation-state-changed', (event: any) => {
    isCurrentlyGenerating = event.detail.isGenerating;

    // In RPG mode we lock input while generating, regardless of whose turn.
    if (isRpgGroupChatContext && messageInput) {
        const canEdit = !isCurrentlyGenerating && isUserTurnInRpg;
        messageInput.contentEditable = String(canEdit);
        messageInput.classList.toggle("disabled", !canEdit);
        sendMessageButton?.classList.toggle("disabled", !canEdit);
    }

    if (isCurrentlyGenerating) {
        sendMessageButton.textContent = 'stop';
        sendMessageButton.title = 'Stop generating';
        sendMessageButton.classList.add('generating');
        turnControlPanel?.classList.add('hidden');
        if (turnControlLabel) turnControlLabel.textContent = "AI responding...";
    } else {
        sendMessageButton.textContent = 'send';
        sendMessageButton.title = '';
        sendMessageButton.classList.remove('generating');

        //re-show turn control if it's an RPG group chat
        void chatsService.getCurrentChat(db).then(chat => {
            if (chat?.groupChat?.mode === "rpg") {
                turnControlPanel?.classList.remove('hidden');
            }
        });
    }
});

//listen for round state changes to update UI dynamically
window.addEventListener('round-state-changed', (event: any) => {
    const { isUserTurn, roundComplete, nextRoundNumber, startsNewRound, nextSpeakerId } = event.detail;

    void updateRpgTurnControlUi({ isUserTurn, startsNewRound, nextRoundNumber, nextSpeakerId });

    // auto-progress RPG group chats (never pause on AI)
    if (!isUserTurn && settingsService.getSettings().rpgGroupChatsProgressAutomatically) {
        const startNextRoundIfIdle = async () => {
            if (isCurrentlyGenerating) return;
            const chat = await chatsService.getCurrentChat(db);
            if (chat?.groupChat?.mode !== "rpg") return;
            await messageService.send("");
        };

        //round-state-changed is dispatched before generation-state-changed(false),
        //so wait for generation to finish, then kick off the next round.
        const onGenerationState = async (e: any) => {
            if (e?.detail?.isGenerating) return;
            window.removeEventListener('generation-state-changed', onGenerationState as any);
            try {
                // Let the originating send() fully unwind (sendInFlight reset, etc.)
                // before we trigger the next round.
                window.setTimeout(() => {
                    void startNextRoundIfIdle();
                }, 0);
            } catch (error: any) {
                toastService.danger({
                    title: "Error starting next round",
                    text: JSON.stringify(error?.message || error),
                });
            }
        };
        window.addEventListener('generation-state-changed', onGenerationState as any);
    }
});

//helper to insert skip feedback message into current round block
function insertSkipFeedback() {
    const messageContainer = document.querySelector<HTMLDivElement>(".message-container");
    if (!messageContainer) return;

    const skipNotice = document.createElement("div");
    skipNotice.className = "skip-notice";
    skipNotice.innerHTML = `<span class="material-symbols-outlined">skip_next</span> You skipped your turn`;

    //find the last round block and append there, or fallback to message container
    const roundBlocks = messageContainer.querySelectorAll<HTMLDivElement>(".round-block");
    const lastRoundBlock = roundBlocks[roundBlocks.length - 1];
    if (lastRoundBlock) {
        lastRoundBlock.append(skipNotice);
    } else {
        messageContainer.append(skipNotice);
    }

    //scroll to bottom
    const scrollContainer = document.querySelector<HTMLDivElement>("#scrollable-chat-container");
    if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
}

//skip turn button - skips user's turn and triggers next round
skipTurnBtn?.addEventListener("click", async () => {
    if (isCurrentlyGenerating) return;

    try {
        //insert visual feedback into current round
        insertSkipFeedback();

        //send with skipTurn to signal round completion
        await messageService.skipRpgTurn();
        //UI update is handled by round-state-changed event
    } catch (error: any) {
        toastService.danger({
            title: "Error skipping turn",
            text: JSON.stringify(error.message || error),
        });
    }
});

//start turn button - triggers AI participants before user's turn
startTurnBtn?.addEventListener("click", async () => {
    if (isCurrentlyGenerating) return;

    try {
        // send empty message to trigger AI turn (participants before user will respond)
        await messageService.send("");
    } catch (error: any) {
        toastService.danger({
            title: "Error starting turn",
            text: JSON.stringify(error.message || error),
        });
    }
});

rpgSettingsButton?.addEventListener("click", async () => {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat?.groupChat) return;

    // Ensure sidebar is visible
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (sidebar) {
        sidebar.style.display = "flex";
        helpers.showElement(sidebar, false);
    }

    // Switch to the Settings tab (3rd tab)
    const navbar = document.querySelector<HTMLElement>('.navbar[data-target-id="sidebar-content"]');
    const settingsTab = navbar?.querySelector<HTMLElement>(".navbar-tab:nth-child(3)");
    settingsTab?.click();

    // Open the Group chat Settings page
    const settingsSection = document.querySelector<HTMLElement>("#settings-section");
    const groupChatSettingsButton = settingsSection?.querySelector<HTMLElement>('[data-settings-target="groupchat"]');

    // If we're already in settings home, clicking this will navigate to the groupchat page.
    // If we're already inside another settings page, the click will still work because
    // SettingsNavigation attaches handlers directly to the home list items.
    groupChatSettingsButton?.click();
});

window.addEventListener("chat-loaded", async (e: any) => {
    const chat = e.detail.chat;

    isGroupChatContext = !!chat?.groupChat;
    isRpgGroupChatContext = chat?.groupChat?.mode === "rpg";

    // In any group chat context, the selected personality is not "the" recipient.
    if (isGroupChatContext) {
        messageInput?.setAttribute("placeholder", "Send a message");
    }

    // In group chats, disable single-chat-only controls.
    internetSearchToggle?.classList.toggle("hidden", isGroupChatContext);
    roleplayActionsMenu?.classList.toggle("hidden", isGroupChatContext);

    const imageBtn = document.querySelector<HTMLButtonElement>("#btn-image");
    const editBtn = document.querySelector<HTMLButtonElement>("#btn-edit");
    imageBtn?.classList.toggle("hidden", isGroupChatContext);
    editBtn?.classList.toggle("hidden", isGroupChatContext);

    if (isRpgGroupChatContext) {
        turnControlPanel?.classList.remove("hidden");

        //determine turn state from chat content
        const rpg = chat.groupChat?.rpg;
        const turnOrder: string[] = Array.isArray(rpg?.turnOrder) ? rpg.turnOrder : [];
        const participants: string[] = Array.isArray(chat.groupChat?.participantIds) ? chat.groupChat.participantIds : [];
        const effectiveOrder = turnOrder.length > 0 ? turnOrder : [...participants, "user"];
        const userIndex = effectiveOrder.indexOf("user");

        const allMessages = (chat.content || []) as any[];
        const isSkipTurnMarker = (m: any): boolean => {
            if (!m || m.role !== "user" || !m.hidden) return false;
            const parts = Array.isArray(m.parts) ? m.parts : [];
            return parts.some((p: any) => (p?.text ?? "").toString() === messageService.USER_SKIP_TURN_MARKER_TEXT);
        };

        //use "turn relevant" messages to determine current state
        //this includes the hidden skip-turn marker (counts as user completing their turn)
        const turnRelevantMessages = allMessages.filter((m: any) => !m.hidden || isSkipTurnMarker(m));
        const lastMessage = turnRelevantMessages[turnRelevantMessages.length - 1];

        let isUserTurn = false;
        let startsNewRound = false;
        let nextSpeakerId: string | undefined;

        //calculate next round number from existing messages
        const roundIndices = (chat.content || [])
            .filter((m: any) => typeof m.roundIndex === "number")
            .map((m: any) => m.roundIndex as number);
        const maxRoundIndex = roundIndices.length > 0 ? Math.max(...roundIndices) : 0;

        if (turnRelevantMessages.length === 0) {
            // Empty chat: next speaker is the first in the order.
            const nextSpeaker = effectiveOrder[0];
            nextSpeakerId = nextSpeaker;
            startsNewRound = true;
            isUserTurn = nextSpeaker === "user" || userIndex === 0 || userIndex === -1;
        } else {
            // Determine whose turn is next based on last speaker
            const lastSpeakerId = lastMessage.role === "user" ? "user" : lastMessage.personalityid;

            // Skip narrator messages when determining turn
            let effectiveLastSpeaker = lastSpeakerId;
            if (lastSpeakerId === "__narrator__") {
                // Look backwards for non-narrator message
                for (let i = turnRelevantMessages.length - 2; i >= 0; i--) {
                    const msg = turnRelevantMessages[i];
                    const speakerId = msg.role === "user" ? "user" : msg.personalityid;
                    if (speakerId !== "__narrator__") {
                        effectiveLastSpeaker = speakerId;
                        break;
                    }
                }
            }

            const lastSpeakerIndex = effectiveOrder.indexOf(String(effectiveLastSpeaker));
            if (lastSpeakerIndex === -1) {
                // Unknown speaker, default to user's turn
                isUserTurn = true;
                startsNewRound = false;
            } else {
                // Next speaker is the one after lastSpeaker in the order
                const nextIndex = (lastSpeakerIndex + 1) % effectiveOrder.length;
                const nextSpeaker = effectiveOrder[nextIndex];
                nextSpeakerId = nextSpeaker;
                isUserTurn = nextSpeaker === "user";
                startsNewRound = nextSpeaker === effectiveOrder[0];
            }
        }

        const nextRoundNumber = startsNewRound ? maxRoundIndex + 1 : Math.max(1, maxRoundIndex);

        void updateRpgTurnControlUi({ isUserTurn, startsNewRound, nextRoundNumber, nextSpeakerId });

        //auto-progress when loading into a state that requires starting the next round
        if (!isUserTurn && settingsService.getSettings().rpgGroupChatsProgressAutomatically) {
            //avoid double-triggers during initial load
            if (!isCurrentlyGenerating) {
                void messageService.send("");
            }
        }
    } else if (chat?.groupChat) {
        // Dynamic group chat
        turnControlPanel?.classList.add("hidden");
    } else {
        //Normal chat or empty
        turnControlPanel?.classList.add("hidden");
    }
});

const setupBottomBar = async () => {
    if (isGroupChatContext) {
        messageInput.setAttribute("placeholder", "Send a message");
        return;
    }

    const personality = await personalityService.getSelected();
    if (personality) {
        messageInput.setAttribute("placeholder", `Send a message to ${personality.name}`);
        if (personality.roleplayEnabled) {
            roleplayActionsMenu.classList.remove("hidden");
        }
        else {
            roleplayActionsMenu.classList.add("hidden");
        }
        if (personality.internetEnabled) {
            internetSearchToggle.classList.remove("hidden");
        }
        else {
            internetSearchToggle.classList.add("hidden");
        }
    }
    else {
        messageInput.setAttribute("placeholder", "Send a message");
    }

}


document.querySelector<HTMLDivElement>("#personalitiesDiv")!.addEventListener("change", async (e: Event) => {
    if ((e.target as HTMLSelectElement).name === "personality") {
        await setupBottomBar();
    }
});

await setupBottomBar();

// Listen for image editing toggle events
window.addEventListener('image-editing-toggled', async (event: any) => {
    isImageEditingActive = event.detail.enabled;

    if (!isImageEditingActive) {
        // Clear history preview when editing is disabled
        clearHistoryPreview();
    } else {
        // If toggled ON, enforce model-specific image limit
        enforceImageLimitForModel();
    }

    updateImageCreditsLabelVisibility();
});

// Listen for image generation toggle events
window.addEventListener('image-generation-toggled', (event: any) => {
    isImageModeActive = !!event.detail?.enabled;
    updateImageCreditsLabelVisibility();
});

// Listen for attachment changes
window.addEventListener('attachment-added', async () => {
    // Hide history preview when attachments are added
    if (isImageEditingActive) {
        clearHistoryPreview();
        enforceImageLimitForModel();
    }
});

// Listen for history image removal
window.addEventListener('history-image-removed', () => {
    currentHistoryImagePreview = null;
});

// Listen for attach-image-from-chat event (from Edit/Attach buttons in messages)
window.addEventListener('attach-image-from-chat', (event: any) => {
    const { file, toggleEditing } = event.detail;
    if (!file) return;

    // Mark this file as coming from chat history
    (file as any)._fromChatHistory = true;

    // Add the file using the existing addAttachments function
    addAttachments([file]);

    // Toggle editing mode if requested
    if (toggleEditing) {
        const editButton = document.querySelector<HTMLButtonElement>("#btn-edit");
        if (editButton && !editButton.classList.contains("btn-toggled")) {
            editButton.click();
        }
    }
});

// Listen for edit model changes (model-specific image limit)
window.addEventListener('edit-model-changed', (event: any) => {
    const model = event.detail.model;
    if (isImageEditingActive) {
        enforceImageLimitForModel();
    }
});

// Listen for insufficient image credits state changes
window.addEventListener('insufficient-image-credits', (event: any) => {
    hasInsufficientImageCredits = event.detail.insufficient;

    // Update send button disabled state
    if (hasInsufficientImageCredits) {
        sendMessageButton.disabled = true;
        sendMessageButton.classList.add('disabled');
        sendMessageButton.setAttribute('aria-disabled', 'true');
        sendMessageButton.title = 'Insufficient image credits';
    } else {
        sendMessageButton.disabled = false;
        sendMessageButton.classList.remove('disabled');
        sendMessageButton.setAttribute('aria-disabled', 'false');
        sendMessageButton.title = '';
    }
});

function addAttachments(rawFiles: File[]): void {
    if (!rawFiles.length) {
        return;
    }

    const files = dedupeFiles(rawFiles);
    const duplicateNames: string[] = [];
    const oversizedNames: string[] = [];
    const unsupportedNames: string[] = [];
    let limitReached = false;
    const added: File[] = [];
    const existingSignatures = new Set(attachmentState.map(getFileSignature));

    for (const file of files) {
        if (attachmentState.length + added.length >= MAX_ATTACHMENTS) {
            limitReached = true;
            break;
        }

        const displayName = getDisplayName(file);

        if (!isSupportedFileType(file)) {
            unsupportedNames.push(displayName);
            continue;
        }

        if (file.size > MAX_ATTACHMENT_BYTES) {
            oversizedNames.push(displayName);
            continue;
        }

        const signature = getFileSignature(file);
        if (existingSignatures.has(signature)) {
            duplicateNames.push(displayName);
            continue;
        }

        existingSignatures.add(signature);
        added.push(file);
    }

    if (added.length > 0) {
        let finalAdded = added;
        if (isImageEditingActive) {
            const editingModel = getSelectedEditingModel();
            const maxImages = MODEL_IMAGE_LIMITS[editingModel];
            if (maxImages) {
                const currentImageCount = attachmentState.filter(f => f.type.startsWith('image/')).length;
                const newImageFiles = added.filter(f => f.type.startsWith('image/'));
                const slotsRemaining = maxImages - currentImageCount;

                if (slotsRemaining < newImageFiles.length) {
                    const skippedCount = newImageFiles.length - Math.max(0, slotsRemaining);
                    const keptNewImages = newImageFiles.slice(0, Math.max(0, slotsRemaining));
                    const nonImageFiles = added.filter(f => !f.type.startsWith('image/'));
                    finalAdded = [...nonImageFiles, ...keptNewImages];
                    toastService.warn({
                        title: `${editingModel.charAt(0).toUpperCase() + editingModel.slice(1)} supports up to ${maxImages} image${maxImages > 1 ? 's' : ''}`,
                        text: `${skippedCount} image${skippedCount > 1 ? 's were' : ' was'} skipped (${currentImageCount} already attached, max ${maxImages}).`,
                    });
                }
            }
        }

        attachmentState = [...attachmentState, ...finalAdded];
        syncAttachmentInput();
        for (const file of finalAdded) {
            const preview = attachmentPreviewElement(file);
            preview.dataset.attachmentSignature = getFileSignature(file);
            attachmentPreview!.appendChild(preview);
        }
    } else {
        // ensure FileList is in sync even if we only removed/filtered files
        syncAttachmentInput();
    }

    if (duplicateNames.length) {
        toastService.warn({
            title: duplicateNames.length === 1 ? "Duplicate attachment skipped" : "Duplicate attachments skipped",
            text: formatFileListForToast(duplicateNames),
        });
    }

    if (oversizedNames.length) {
        toastService.warn({
            title: oversizedNames.length === 1 ? "File exceeds 5 MB limit" : "Files exceed 5 MB limit",
            text: formatFileListForToast(oversizedNames),
        });
    }

    if (unsupportedNames.length) {
        toastService.danger({
            title: unsupportedNames.length === 1 ? "Unsupported file type" : "Unsupported file types",
            text: `${formatFileListForToast(unsupportedNames)}\nSupported types: ${SUPPORTED_TYPES_LABEL}.`,
        });
    }

    if (limitReached) {
        toastService.warn({
            title: "Attachment limit reached",
            text: `You can attach up to ${MAX_ATTACHMENTS} files per message.`,
        });
    }
}

function syncAttachmentInput(): void {
    const dataTransfer = new DataTransfer();
    for (const file of attachmentState) {
        dataTransfer.items.add(file);
    }
    attachmentsInput!.files = dataTransfer.files;
}

function collectFilesFromClipboard(event: ClipboardEvent): File[] {
    const data = event.clipboardData;
    if (!data) {
        return [];
    }
    const files: File[] = [];
    for (const file of Array.from(data.files || [])) {
        if (file) {
            files.push(file);
        }
    }
    for (const item of Array.from(data.items || [])) {
        if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
                files.push(file);
            }
        }
    }
    return dedupeFiles(files);
}

function dedupeFiles(files: File[]): File[] {
    const seen = new Set<string>();
    const unique: File[] = [];
    for (const file of files) {
        const signature = getFileSignature(file);
        if (seen.has(signature)) {
            continue;
        }
        seen.add(signature);
        unique.push(file);
    }
    return unique;
}

function handleDragEnter(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (dragDepth === 0) {
        messageBox!.classList.add("drag-over");
    }
    dragDepth += 1;
}

function handleDragOver(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
    }
}

function handleDragLeave(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
        messageBox!.classList.remove("drag-over");
    }
}

function handleDrop(event: DragEvent): void {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const files = collectFilesFromDataTransfer(event.dataTransfer);
    if (files.length) {
        addAttachments(files);
    }
    resetDragState();
}

function collectFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
    if (!dataTransfer) {
        return [];
    }
    const files: File[] = [];
    for (const file of Array.from(dataTransfer.files || [])) {
        if (file) {
            files.push(file);
        }
    }
    for (const item of Array.from(dataTransfer.items || [])) {
        if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
                files.push(file);
            }
        }
    }
    return dedupeFiles(files);
}

function isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function resetDragState(): void {
    dragDepth = 0;
    messageBox!.classList.remove("drag-over");
}

function getDisplayName(file: File): string {
    return file.name?.trim() ? file.name : "Unnamed file";
}

/**
 * Updates or creates the history image preview based on current chat state
 */
async function updateHistoryPreview(): Promise<void> {
    // Don't show if there are attachments
    if (getAttachmentCount() > 0) {
        clearHistoryPreview();
        return;
    }

    const currentChat = await chatsService.getCurrentChat(db);
    if (!currentChat) {
        clearHistoryPreview();
        return;
    }

    const editableImage = await findLastEditableImage(currentChat);
    if (!editableImage) {
        clearHistoryPreview();
        return;
    }

    // Remove existing preview if any
    clearHistoryPreview();

    // Create and add new preview
    currentHistoryImagePreview = historyImagePreviewElement(editableImage);
    attachmentPreview!.appendChild(currentHistoryImagePreview);
}

/**
 * Clears the history image preview
 */
function clearHistoryPreview(): void {
    // Remove tracked preview
    if (currentHistoryImagePreview) {
        currentHistoryImagePreview.remove();
        currentHistoryImagePreview = null;
    }

    // Also remove any orphaned history previews that might exist in the DOM
    const orphanedPreviews = attachmentPreview?.querySelectorAll('.history-image-preview');
    orphanedPreviews?.forEach(preview => preview.remove());
}

function enforceImageLimitForModel(): void {
    const editingModel = getSelectedEditingModel();
    const maxImages = MODEL_IMAGE_LIMITS[editingModel];
    if (!maxImages) return;

    const imageFiles = attachmentState.filter(file => file.type.startsWith("image/"));
    if (imageFiles.length <= maxImages) {
        return;
    }

    let keptImages = 0;
    let removedImages = 0;
    const nextAttachmentState: File[] = [];

    for (const file of attachmentState) {
        if (!file.type.startsWith("image/")) {
            nextAttachmentState.push(file);
            continue;
        }

        if (keptImages < maxImages) {
            nextAttachmentState.push(file);
            keptImages += 1;
        } else {
            removedImages += 1;
        }
    }

    attachmentState = nextAttachmentState;
    syncAttachmentInput();

    // Rebuild attachment previews from state to avoid duplicates
    const previews = attachmentPreview?.querySelectorAll('.attachment-container:not(.history-image-preview)');
    previews?.forEach(preview => preview.remove());

    for (const file of attachmentState) {
        const preview = attachmentPreviewElement(file);
        preview.dataset.attachmentSignature = getFileSignature(file);
        attachmentPreview!.appendChild(preview);
    }

    const modelName = editingModel.charAt(0).toUpperCase() + editingModel.slice(1);
    toastService.warn({
        title: `${modelName} supports up to ${maxImages} image${maxImages > 1 ? 's' : ''}`,
        text: `${removedImages} image${removedImages > 1 ? 's were' : ' was'} removed.`,
    });
}

/**
 * Export function to get current history image data URI
 */
export function getCurrentHistoryImageDataUri(): string | null {
    if (!currentHistoryImagePreview) {
        return null;
    }

    const img = currentHistoryImagePreview.querySelector<HTMLImageElement>('.history-image-thumbnail');
    return img?.src || null;
}

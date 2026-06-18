import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_ATTACHMENTS } from "../../../src/utils/attachments";
import { bootstrapDom } from "../../helpers/dom";
import { MockDataTransfer, makeEmptyFileList } from "../../helpers/files";

vi.mock("../../../src/services/Message.service", () => ({
	send: vi.fn(async () => {}),
	abortGeneration: vi.fn(),
	getIsGenerating: vi.fn(() => false),
	skipRpgTurn: vi.fn(async () => {}),
	USER_SKIP_TURN_MARKER_TEXT: "__user_skip_turn__"
}));

vi.mock("../../../src/utils/helpers", () => ({
	getClientScrollbarWidth: vi.fn(() => 0),
	getEncoded: vi.fn((html: string) => html),
	showElement: vi.fn(),
	messageContainerScrollToBottom: vi.fn()
}));

vi.mock("../../../src/services/Personality.service", () => ({
	getSelected: vi.fn(async () => ({
		name: "Mock Persona",
		roleplayEnabled: false,
		internetEnabled: false
	})),
	get: vi.fn(async () => null),
	getDefault: vi.fn(() => ({
		name: "Mock Persona",
		roleplayEnabled: false,
		internetEnabled: false
	}))
}));

vi.mock("../../../src/services/Toast.service", () => ({
	info: vi.fn(),
	warn: vi.fn(),
	danger: vi.fn()
}));

vi.mock("../../../src/services/Settings.service", () => ({
	getSettings: vi.fn(() => ({
		rpgGroupChatsProgressAutomatically: false,
		allowPersonaPinging: true
	}))
}));

vi.mock("../../../src/services/Chats.service", () => ({
	getCurrentChatId: vi.fn(() => null),
	getCurrentChat: vi.fn(async () => null)
}));

vi.mock("../../../src/services/Db.service", () => ({
	db: {}
}));

vi.mock("../../../src/components/dynamic/HistoryImagePreview", () => ({
	historyImagePreviewElement: vi.fn(() => {
		const element = document.createElement("div");
		element.className = "history-image-preview";
		return element;
	})
}));

vi.mock("../../../src/components/static/ImageEditModelSelector.component", () => ({
	getSelectedEditingModel: vi.fn(() => "qwen")
}));

vi.mock("../../../src/components/static/ImageCreditsLabel.component", () => ({
	updateImageCreditsLabelVisibility: vi.fn()
}));

function bootstrapAttachmentDom(): void {
	bootstrapDom(`
        <div id="personalitiesDiv"></div>
        <div id="scrollable-chat-container"></div>
        <div id="bottom-ui-container">
            <div id="message-box">
                <div id="messageInput" contenteditable="true"></div>
                <div id="attachment-preview"></div>
            </div>
        </div>
        <input id="attachments" type="file">
        <button id="btn-send" type="button"></button>
        <button id="btn-internet" type="button"></button>
        <button id="btn-roleplay" type="button"></button>
        <div id="turn-control-panel" class="hidden"></div>
        <span id="turn-control-label"></span>
        <button id="btn-start-turn" type="button"></button>
        <span id="start-round-text"></span>
        <button id="btn-skip-turn" type="button"></button>
        <button id="btn-rpg-settings" type="button"></button>
    `);
}

function createFile(name: string, type: string, contents: string): File {
	return new File([contents], name, { type, lastModified: 1 });
}

function createSizedFile(name: string, type: string, size: number): File {
	return new File([new Uint8Array(size)], name, { type, lastModified: 1 });
}

function getAttachmentsInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>("#attachments");
	if (!input) {
		throw new Error("Missing #attachments");
	}
	return input;
}

function getAttachmentPreview(): HTMLDivElement {
	const preview = document.querySelector<HTMLDivElement>("#attachment-preview");
	if (!preview) {
		throw new Error("Missing #attachment-preview");
	}
	return preview;
}

function getDropTarget(): HTMLDivElement {
	const messageBox = document.querySelector<HTMLDivElement>("#message-box");
	if (!messageBox) {
		throw new Error("Missing #message-box");
	}
	return messageBox;
}

function dispatchDrop(files: File[]): void {
	const dataTransfer = new MockDataTransfer();
	for (const file of files) {
		dataTransfer.items.add(file);
	}

	const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
	Object.defineProperty(event, "dataTransfer", {
		value: dataTransfer,
		configurable: true
	});

	getDropTarget().dispatchEvent(event);
}

function getInputFiles(): File[] {
	return Array.from(getAttachmentsInput().files || []);
}

function getPreviewNames(): string[] {
	return Array.from(getAttachmentPreview().querySelectorAll<HTMLElement>(".attachment-container"))
		.map((element) => {
			return (
				element.querySelector<HTMLElement>(".attachment-name")?.textContent ??
				element.querySelector<HTMLImageElement>("img")?.alt ??
				""
			);
		})
		.filter(Boolean);
}

describe("ChatInput attachment drop workflow", () => {
	beforeEach(async () => {
		vi.resetModules();
		bootstrapAttachmentDom();
		Object.defineProperty(globalThis, "DataTransfer", {
			value: MockDataTransfer,
			configurable: true
		});
		Object.defineProperty(globalThis, "ResizeObserver", {
			value: class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
			configurable: true
		});

		const attachmentsInput = getAttachmentsInput();
		Object.defineProperty(attachmentsInput, "files", {
			value: makeEmptyFileList(),
			writable: true,
			configurable: true
		});

		await import("../../../src/components/static/ChatInput.component");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("drop attaches supported files to the backing input", async () => {
		const notesFile = createFile("notes.txt", "text/plain", "hello world");
		const markdownFile = createFile("notes.md", "text/markdown", "# hello");
		const jsonFile = createFile("data.json", "application/json", '{"ok":true}');
		const pdfFile = createFile("guide.pdf", "application/pdf", "pdf-content");
		const jpegFile = createFile("photo.jpg", "image/jpeg", "jpeg-content");

		dispatchDrop([notesFile, markdownFile, jsonFile, pdfFile, jpegFile]);

		expect(getInputFiles().map((file) => file.name)).toEqual([
			"notes.txt",
			"notes.md",
			"data.json",
			"guide.pdf",
			"photo.jpg"
		]);
		expect(getPreviewNames()).toEqual(["notes.txt", "notes.md", "data.json", "guide.pdf"]);
	});

	it("drop accepts png and jpeg extensions with matching MIME types", async () => {
		const pngFile = createFile("image.png", "image/png", "png-content");
		const jpegFile = createFile("photo.jpeg", "image/jpeg", "jpeg-content");

		dispatchDrop([pngFile, jpegFile]);

		expect(getInputFiles().map((file) => file.name)).toEqual(["image.png", "photo.jpeg"]);
	});

	it("drop accepts supported extensions when the browser reports an unknown MIME type", async () => {
		const markdownFile = createFile("notes.md", "", "# hello");
		const jsonFile = createFile("data.json", "application/octet-stream", '{"ok":true}');
		const textFile = createFile("notes.txt", "", "hello world");

		dispatchDrop([markdownFile, jsonFile, textFile]);

		expect(getInputFiles().map((file) => file.name)).toEqual(["notes.md", "data.json", "notes.txt"]);
		expect(getPreviewNames()).toEqual(["notes.md", "data.json", "notes.txt"]);
	});

	it("drop enforces the five file attachment limit", async () => {
		const toastService = await import("../../../src/services/Toast.service");
		const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, index) =>
			createFile(`notes-${index + 1}.txt`, "text/plain", "hello")
		);

		dispatchDrop(files);

		expect(getInputFiles().map((file) => file.name)).toEqual([
			"notes-1.txt",
			"notes-2.txt",
			"notes-3.txt",
			"notes-4.txt",
			"notes-5.txt"
		]);
		expect(vi.mocked(toastService.warn)).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Attachment limit reached"
			})
		);
	});

	it("drop dedupes duplicate files", async () => {
		const toastService = await import("../../../src/services/Toast.service");
		const duplicateFile = createFile("notes.txt", "text/plain", "hello world");

		dispatchDrop([duplicateFile]);
		dispatchDrop([duplicateFile]);

		expect(getInputFiles().map((file) => file.name)).toEqual(["notes.txt"]);
		expect(getPreviewNames()).toEqual(["notes.txt"]);
		expect(vi.mocked(toastService.warn)).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Duplicate attachment skipped"
			})
		);
	});

	it("drop rejects unsupported files", async () => {
		const toastService = await import("../../../src/services/Toast.service");
		const unsupportedFile = createFile("data.csv", "text/csv", "ok,true");

		dispatchDrop([unsupportedFile]);

		expect(getInputFiles()).toHaveLength(0);
		expect(getPreviewNames()).toEqual([]);
		expect(vi.mocked(toastService.danger)).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Unsupported file type"
			})
		);
	});

	it("drop rejects files with mismatched extension and MIME type", async () => {
		const toastService = await import("../../../src/services/Toast.service");
		const mismatchedFile = createFile("notes.txt", "application/json", '{"ok":true}');

		dispatchDrop([mismatchedFile]);

		expect(getInputFiles()).toHaveLength(0);
		expect(getPreviewNames()).toEqual([]);
		expect(vi.mocked(toastService.danger)).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "File type mismatch"
			})
		);
	});

	it("drop rejects files over their per-type size caps", async () => {
		const toastService = await import("../../../src/services/Toast.service");
		const oversizedTextFile = createSizedFile("too-large.txt", "text/plain", 512 * 1024 + 1);
		const oversizedMarkdownFile = createSizedFile("too-large.md", "text/markdown", 512 * 1024 + 1);
		const oversizedJsonFile = createSizedFile("too-large.json", "application/json", 512 * 1024 + 1);
		const oversizedPdfFile = createSizedFile("too-large.pdf", "application/pdf", 1024 * 1024 + 1);
		const oversizedPngFile = createSizedFile("too-large.png", "image/png", 5 * 1024 * 1024 + 1);
		const oversizedJpegFile = createSizedFile("too-large.jpg", "image/jpeg", 5 * 1024 * 1024 + 1);

		dispatchDrop([
			oversizedTextFile,
			oversizedMarkdownFile,
			oversizedJsonFile,
			oversizedPdfFile,
			oversizedPngFile,
			oversizedJpegFile
		]);

		expect(getInputFiles()).toHaveLength(0);
		expect(getPreviewNames()).toEqual([]);
		expect(vi.mocked(toastService.warn)).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Files exceed type limits"
			})
		);
	});

	it("removing an attachment updates the backing file input", async () => {
		const firstFile = createFile("notes.txt", "text/plain", "hello world");
		const secondFile = createFile("guide.pdf", "application/pdf", "pdf-content");

		dispatchDrop([firstFile, secondFile]);

		const removeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".btn-remove-attachment"));
		expect(removeButtons).toHaveLength(2);
		removeButtons[0]?.click();

		expect(getInputFiles().map((file) => file.name)).toEqual(["guide.pdf"]);
		expect(getPreviewNames()).toEqual(["guide.pdf"]);
	});
});

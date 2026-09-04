import { DEFAULT_TAKEOUT_CATEGORIES } from "../../constants/Takeout";
import { dispatchAppEvent, onAppEvent } from "../../events";
import type { TakeoutCategory, TakeoutConflictResolution, TakeoutDestination } from "../../types/Takeout";
import * as takeoutService from "../../services/Takeout.service";
import * as surfaceService from "../../services/Surface.service";
import * as syncService from "../../services/Sync.service";
import * as toastService from "../../services/Toast.service";
import { confirmDialogDanger } from "../../utils/helpers";
import { prepareSheets, transitionSheetHeight } from "./AdaptiveSheet.component";

function must<T extends Element>(selector: string): T {
	const element = document.querySelector<T>(selector);
	if (!element) throw new Error(`Missing data takeout element: ${selector}`);
	return element;
}

const openExportButton = must<HTMLButtonElement>("#btn-export-data");
const openImportButton = must<HTMLButtonElement>("#btn-import-data");
const exportSheet = must<HTMLElement>("#takeout-export-sheet");
const importSheet = must<HTMLElement>("#takeout-import-sheet");
const exportSource = must<HTMLElement>("#takeout-export-source");
const selectAll = must<HTMLInputElement>("#takeout-select-all");
const categoryInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="takeout-category"]'));
const chatsInput = must<HTMLInputElement>("#takeout-category-chats");
const mediaInput = must<HTMLInputElement>("#takeout-category-media");
const apiKeysInput = must<HTMLInputElement>("#takeout-category-apiKeys");
const apiKeyWarning = must<HTMLElement>("#takeout-api-key-warning");
const exportStatus = must<HTMLElement>("#takeout-export-status");
const exportButton = must<HTMLButtonElement>("#btn-takeout-export");
const exportCancelButton = must<HTMLButtonElement>("#btn-takeout-export-cancel");
const exportCloseButton = must<HTMLButtonElement>("#btn-takeout-export-close");
const importFiles = must<HTMLInputElement>("#takeout-import-files");
const importFileSummary = must<HTMLElement>("#takeout-file-summary");
const localDestination = must<HTMLInputElement>("#takeout-destination-local");
const cloudDestination = must<HTMLInputElement>("#takeout-destination-cloud");
const localDestinationNote = must<HTMLElement>("#takeout-destination-local-note");
const cloudDestinationNote = must<HTMLElement>("#takeout-destination-cloud-note");
const prepareCloudButton = must<HTMLButtonElement>("#btn-takeout-prepare-cloud");
const conflictPanel = must<HTMLElement>("#takeout-conflicts");
const conflictSummary = must<HTMLElement>("#takeout-conflict-summary");
const copyButton = must<HTMLButtonElement>("#btn-takeout-copy");
const overwriteButton = must<HTMLButtonElement>("#btn-takeout-overwrite");
const importStatus = must<HTMLElement>("#takeout-import-status");
const importButton = must<HTMLButtonElement>("#btn-takeout-import");
const importCloseButton = must<HTMLButtonElement>("#btn-takeout-import-close");

let exportBusy = false;
let importBusy = false;
let pendingInspection: takeoutService.TakeoutImportInspection | null = null;
let sensitiveImportConfirmed = false;
let exportAbortController: AbortController | null = null;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

function setExportBusy(busy: boolean): void {
	exportBusy = busy;
	exportButton.disabled = busy;
	exportCloseButton.disabled = busy;
	exportCancelButton.classList.toggle("hidden", !busy);
	selectAll.disabled = busy;
	categoryInputs.forEach((input) => {
		input.disabled = busy || (input === mediaInput && !chatsInput.checked);
	});
	exportButton.textContent = busy ? "Creating…" : "Create Takeout";
}

function setImportBusy(busy: boolean): void {
	importBusy = busy;
	importButton.disabled = busy;
	importCloseButton.disabled = busy;
	importFiles.disabled = busy;
	localDestination.disabled = busy || localDestination.dataset.available !== "true";
	cloudDestination.disabled = busy || cloudDestination.dataset.available !== "true";
	copyButton.disabled = busy;
	overwriteButton.disabled = busy;
	importButton.textContent = busy ? "Importing…" : "Review & Import";
}

function selectedCategories(): TakeoutCategory[] {
	return categoryInputs.filter((input) => input.checked).map((input) => input.value as TakeoutCategory);
}

function refreshCategoryState(): void {
	const nonSensitive = categoryInputs.filter((input) => input !== apiKeysInput);
	selectAll.checked = nonSensitive.every((input) => input.checked);
	selectAll.indeterminate = !selectAll.checked && nonSensitive.some((input) => input.checked);
	mediaInput.disabled = exportBusy || !chatsInput.checked;
	if (!chatsInput.checked) mediaInput.checked = false;
	apiKeyWarning.classList.toggle("hidden", !apiKeysInput.checked);
}

function resetExportSheet(): void {
	const defaults = new Set(DEFAULT_TAKEOUT_CATEGORIES);
	categoryInputs.forEach((input) => {
		input.checked = defaults.has(input.value as TakeoutCategory);
	});
	exportStatus.textContent = "";
	setExportBusy(false);
	refreshCategoryState();
	const source = syncService.isOnlineSyncEnabled() ? "Cloud Sync" : "this browser";
	exportSource.textContent = `Authoritative source: ${source}.`;
}

function resetImportSheet(): void {
	pendingInspection = null;
	sensitiveImportConfirmed = false;
	importFiles.value = "";
	importFileSummary.textContent = "No files selected.";
	importStatus.textContent = "";
	conflictPanel.classList.add("hidden");
	setImportBusy(false);
}

function prepareTakeoutSheet(sheet: HTMLElement): void {
	sheet.classList.add("adaptive-sheet");
	prepareSheets();
}

function updateProgress(element: HTMLElement, progress: takeoutService.TakeoutProgress): void {
	element.textContent =
		progress.total > 1 ? `${progress.message} ${progress.completed}/${progress.total}` : progress.message;
}

function formatExportResult(result: takeoutService.BuildTakeoutExportResult): string {
	const counts = result.document.manifest.counts;
	const details: string[] = [];
	const categories = new Set(result.document.manifest.categories);
	if (categories.has("chats"))
		details.push(`Chats: ${plural(counts.chats, "chat")}, ${plural(counts.messages, "message")}`);
	if (categories.has("media")) {
		details.push(
			`Media: ${plural(counts.attachments, "attachment")}, ${plural(counts.generatedImages, "generated image")}`
		);
	}
	if (categories.has("personas")) details.push(`Personas: ${plural(counts.personas, "persona")}`);
	if (categories.has("settings")) details.push(`Settings: ${plural(counts.settings, "value")}`);
	if (categories.has("themes")) details.push(`Themes: ${plural(counts.themes, "theme")}`);
	if (categories.has("loras")) details.push(`LoRAs: ${plural(counts.loras, "LoRA")}`);
	if (categories.has("pins")) details.push(`Pins: ${plural(counts.pins, "pin")}`);
	if (categories.has("roleplay")) details.push(`Roleplay: ${plural(counts.roleplay, "item")}`);
	const credentials = result.document.manifest.apiKeysIncluded
		? `${plural(counts.apiKeys, "API key")} included; keep this file secure.`
		: "API keys excluded.";
	return `Exported ${details.join("; ")}. ${credentials}`;
}

function formatImportResult(result: takeoutService.TakeoutImportResult): string {
	const imported = `Imported ${plural(result.imported.chats, "chat")} and ${plural(result.imported.personas, "persona")}`;
	const contents =
		result.imported.chats > 0
			? ` containing ${plural(result.imported.messages, "message")}, ${plural(result.imported.attachments, "attachment")}, and ${plural(result.imported.generatedImages, "generated image")}`
			: "";
	const settings = result.imported.settings > 0 ? `, plus ${plural(result.imported.settings, "setting")}` : "";
	const skipped = result.skipped.chats + result.skipped.personas + result.skipped.roleplay;
	const skippedText = skipped > 0 ? ` Skipped ${plural(skipped, "record")} already present.` : "";
	const failed = result.failed.chats + result.failed.personas + result.failed.settings;
	const failedText = failed > 0 ? ` Failed ${plural(failed, "item")}: ${result.errors.join(" ")}` : "";
	const warningText = result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(" ")}` : "";
	const categories = result.categories.map((category) => (category === "apiKeys" ? "API keys" : category)).join(", ");
	return `${imported}${contents}${settings} to ${result.destination === "cloud" ? "Cloud Sync" : "this browser"}. Categories: ${categories}.${skippedText}${failedText}${warningText}`;
}

async function refreshImportDestinations(): Promise<void> {
	importStatus.textContent = "Checking restore destinations…";
	try {
		const destinations = await takeoutService.getTakeoutImportDestinations();
		localDestination.dataset.available = String(destinations.local.available);
		cloudDestination.dataset.available = String(destinations.cloud.available);
		localDestination.disabled = !destinations.local.available;
		cloudDestination.disabled = !destinations.cloud.available;
		localDestinationNote.textContent = destinations.local.available
			? "Local IndexedDB and settings"
			: destinations.local.reason || "Unavailable";
		cloudDestinationNote.textContent = destinations.cloud.available
			? destinations.cloud.ready
				? "Ready and unlocked"
				: "Set up or unlock Cloud Sync before importing"
			: destinations.cloud.reason || "Unavailable";
		prepareCloudButton.classList.toggle(
			"hidden",
			!destinations.cloud.available || destinations.cloud.ready === true
		);
		if (destinations.local.available) localDestination.checked = true;
		else if (destinations.cloud.available) cloudDestination.checked = true;
		importStatus.textContent = "";
	} catch (error) {
		importStatus.textContent = error instanceof Error ? error.message : "Unable to check restore destinations.";
	}
}

async function createExport(): Promise<void> {
	const categories = selectedCategories();
	if (categories.length === 0) {
		exportStatus.textContent = "Select at least one category to export.";
		return;
	}
	setExportBusy(true);
	exportAbortController = new AbortController();
	try {
		const result = await takeoutService.buildTakeoutExport(
			categories,
			(progress) => updateProgress(exportStatus, progress),
			exportAbortController.signal
		);
		takeoutService.downloadTakeout(result.document, result.filename);
		const summary = formatExportResult(result);
		transitionSheetHeight(exportSheet, () => {
			exportStatus.textContent = summary;
		});
		toastService.info({ title: "Takeout created", text: summary });
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			exportStatus.textContent = "Export canceled. No takeout file was created.";
			return;
		}
		const message = error instanceof Error ? error.message : "Unable to create the takeout.";
		exportStatus.textContent = message;
		toastService.danger({ title: "Export failed", text: message });
	} finally {
		exportAbortController = null;
		setExportBusy(false);
	}
}

function selectedDestination(): TakeoutDestination | null {
	const selected = document.querySelector<HTMLInputElement>('input[name="takeout-destination"]:checked');
	return selected ? (selected.value as TakeoutDestination) : null;
}

async function commitImport(resolution: TakeoutConflictResolution): Promise<void> {
	if (!pendingInspection) return;
	setImportBusy(true);
	try {
		if (pendingInspection.categories.includes("apiKeys") && !sensitiveImportConfirmed) {
			const confirmed = await confirmDialogDanger(
				"This takeout contains readable BYOK API keys. Import them only if you trust the file and will keep the source secure."
			);
			if (!confirmed) {
				importStatus.textContent = "API-key import canceled. No data was changed.";
				return;
			}
			sensitiveImportConfirmed = true;
		}
		const result = await takeoutService.commitTakeoutImport(pendingInspection, resolution, {
			onProgress: (progress) => updateProgress(importStatus, progress)
		});
		const summary = formatImportResult(result);
		transitionSheetHeight(importSheet, () => {
			conflictPanel.classList.add("hidden");
			importStatus.textContent = summary;
		});
		toastService[result.partial ? "danger" : "info"]({
			title: result.partial ? "Import partially completed" : "Import complete",
			text: summary
		});
		pendingInspection = null;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to import the selected data.";
		importStatus.textContent = message;
		toastService.danger({ title: "Import failed", text: message });
	} finally {
		setImportBusy(false);
	}
}

async function reviewImport(): Promise<void> {
	const files = Array.from(importFiles.files || []);
	const destination = selectedDestination();
	if (files.length === 0) {
		importStatus.textContent = "Choose at least one takeout, chat, or persona file.";
		return;
	}
	if (!destination) {
		importStatus.textContent = "Choose an available restore destination.";
		return;
	}

	setImportBusy(true);
	conflictPanel.classList.add("hidden");
	try {
		pendingInspection = await takeoutService.inspectTakeoutImport(files, destination, (progress) =>
			updateProgress(importStatus, progress)
		);
		const conflictCount =
			pendingInspection.conflicts.chats +
			pendingInspection.conflicts.personas +
			pendingInspection.conflicts.roleplay;
		if (conflictCount > 0) {
			transitionSheetHeight(importSheet, () => {
				conflictSummary.textContent = `${plural(pendingInspection!.conflicts.chats, "chat")}, ${plural(pendingInspection!.conflicts.personas, "persona")}, and ${plural(pendingInspection!.conflicts.roleplay, "roleplay item")} conflict.`;
				conflictPanel.classList.remove("hidden");
				importStatus.textContent = "Choose how to resolve the conflicting IDs.";
			});
			copyButton.focus();
			return;
		}
		await commitImport("overwrite");
	} catch (error) {
		pendingInspection = null;
		const message = error instanceof Error ? error.message : "Unable to review the selected data.";
		importStatus.textContent = message;
		toastService.danger({ title: "Import unavailable", text: message });
	} finally {
		setImportBusy(false);
	}
}

selectAll.addEventListener("change", () => {
	categoryInputs.forEach((input) => {
		if (input !== apiKeysInput) input.checked = selectAll.checked;
	});
	refreshCategoryState();
});
categoryInputs.forEach((input) => input.addEventListener("change", refreshCategoryState));

openExportButton.addEventListener("click", () => {
	resetExportSheet();
	prepareTakeoutSheet(exportSheet);
	surfaceService.show(exportSheet.id);
});
openImportButton.addEventListener("click", () => {
	resetImportSheet();
	prepareTakeoutSheet(importSheet);
	surfaceService.show(importSheet.id);
	void refreshImportDestinations();
});
exportButton.addEventListener("click", () => void createExport());
exportCancelButton.addEventListener("click", () => exportAbortController?.abort());
exportCloseButton.addEventListener("click", () => surfaceService.close(exportSheet.id));
importButton.addEventListener("click", () => void reviewImport());
importCloseButton.addEventListener("click", () => surfaceService.close(importSheet.id));
prepareCloudButton.addEventListener("click", () => {
	const preferences = syncService.getCachedSyncPreferences();
	if (preferences?.syncEnabled) {
		dispatchAppEvent("sync-unlock-required", { isFirstSetup: false, mode: "unlock" });
		return;
	}
	const hasEncryptionMaterial =
		!!preferences?.encryptionSalt && !!preferences.keyVerification && !!preferences.keyVerificationIv;
	dispatchAppEvent("sync-unlock-required", {
		isFirstSetup: !hasEncryptionMaterial,
		mode: hasEncryptionMaterial ? "enable" : "setup"
	});
});
copyButton.addEventListener("click", () => void commitImport("copy"));
overwriteButton.addEventListener("click", () => void commitImport("overwrite"));
importFiles.addEventListener("change", () => {
	const files = Array.from(importFiles.files || []);
	importFileSummary.textContent =
		files.length === 0 ? "No files selected." : files.map((file) => file.name).join(", ");
	pendingInspection = null;
	conflictPanel.classList.add("hidden");
	importStatus.textContent = "";
});

document.addEventListener(
	"keydown",
	(event) => {
		if (event.key !== "Escape" || (!exportBusy && !importBusy)) return;
		if (!exportSheet.classList.contains("hidden") || !importSheet.classList.contains("hidden")) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	},
	true
);

onAppEvent("sync-setup-complete", () => {
	if (!importSheet.classList.contains("hidden")) void refreshImportDestinations();
});
onAppEvent("sync-state-changed", () => {
	if (!importSheet.classList.contains("hidden")) void refreshImportDestinations();
});

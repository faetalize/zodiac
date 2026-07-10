import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";
import { DEFAULT_IMAGE_EDIT_MODEL, DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "../../../src/constants/ImageModels";
import { bootstrapDom } from "../../helpers/dom";

vi.mock("../../../src/services/Supabase.service", () => ({
	isImageGenerationAvailable: vi.fn(async () => ({ enabled: true, type: "all" }))
}));

vi.mock("../../../src/services/Sync.service", () => ({
	queueSettingsPush: vi.fn()
}));

function bootstrapSettingsDom(): void {
	bootstrapDom(`
		<input id="apiKeyInput" value="">
		<input id="openRouterApiKeyInput" value="">
		<div id="gemini-api-key-error" class="hidden"></div>
		<div id="openrouter-api-key-error" class="hidden"></div>
		<div id="prefer-premium-endpoint-toggle"></div>
		<input id="preferPremiumEndpoint" type="checkbox">
		<input id="maxTokens" value="1000">
		<input id="temperature" value="60">
		<select id="selectedModel"><option value="gemini-3.5-flash" selected>Gemini Flash</option></select>
		<select id="selectedImageModel"></select>
		<select id="selectedImageEditingModel"></select>
		<select id="roleplaySuggestionModel"><option value="gemini-3.5-flash" selected>Gemini Flash</option></select>
		<input id="autoscroll" type="checkbox">
		<input id="streamResponses" type="checkbox">
		<select id="enableThinkingSelect"><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
		<input id="thinkingBudget" value="500">
		<input id="rpgGroupChatsProgressAutomatically" type="checkbox">
		<input id="allowPersonaPinging" type="checkbox">
		<input id="dynamicGroupChatPingOnly" type="checkbox">
		<input id="fullWidthChat" type="checkbox">
		<input id="uiScale" value="2">
		<select id="delimiterPreset"><option value="zodiac" selected>Zodiac</option><option value="novel">Novel</option><option value="custom">Custom</option></select>
		<div id="customDelimiterInstructions"></div>
		<div id="delimiterPreview"></div>
		<input id="customDialogueInstruction" value="">
		<input id="customActionInstruction" value="">
		<input id="customThoughtInstruction" value="">
		<p id="delimiterPreviewDialogue"></p>
		<p id="delimiterPreviewAction"></p>
		<p id="delimiterPreviewThought"></p>
	`);
}

function selectValues(selector: string): string[] {
	const select = document.querySelector<HTMLSelectElement>(selector);
	return Array.from(select?.options ?? []).map((option) => option.value);
}

describe("image model selectors", () => {
	// Each test re-imports the selector modules, which register window listeners on import.
	// Track and remove them per test so stale listeners (bound to detached selects from a
	// prior import) don't accumulate across cases.
	const trackedListeners: Array<[string, EventListener]> = [];
	let addEventListenerSpy: ReturnType<typeof vi.spyOn> | undefined;

	beforeEach(() => {
		vi.resetModules();
		localStorage.clear();
		bootstrapSettingsDom();

		trackedListeners.length = 0;
		const originalAddEventListener = window.addEventListener.bind(window);
		addEventListenerSpy = vi.spyOn(window, "addEventListener").mockImplementation(((
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | AddEventListenerOptions
		) => {
			trackedListeners.push([type, listener as EventListener]);
			originalAddEventListener(type, listener as EventListener, options);
		}) as typeof window.addEventListener);
	});

	afterEach(() => {
		addEventListenerSpy?.mockRestore();
		for (const [type, listener] of trackedListeners) {
			window.removeEventListener(type, listener);
		}
	});

	it("populates empty image model selects from TypeScript definitions", async () => {
		await import("../../../src/components/static/ImageModelSelector.component");
		await import("../../../src/components/static/ImageEditModelSelector.component");

		expect(selectValues("#selectedImageModel")).toEqual(
			IMAGE_MODELS.filter((model) => model.generation).map((model) => model.id)
		);
		expect(selectValues("#selectedImageEditingModel")).toEqual(
			IMAGE_MODELS.filter((model) => model.editing).map((model) => model.id)
		);
	});

	it("shows all image models regardless of premium endpoint preferences", async () => {
		// Visibility is no longer provider-gated: every model is shown and the send path
		// validates the route. Turning both premium toggles off must not hide any option.
		localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT, "false");
		localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_IMAGE_ENDPOINT, "false");

		await import("../../../src/components/static/ImageModelSelector.component");
		await import("../../../src/components/static/ImageEditModelSelector.component");

		expect(selectValues("#selectedImageModel")).toEqual(
			IMAGE_MODELS.filter((model) => model.generation).map((model) => model.id)
		);
		expect(selectValues("#selectedImageEditingModel")).toEqual(
			IMAGE_MODELS.filter((model) => model.editing).map((model) => model.id)
		);
	});

	it("normalizes stale saved image model settings to available options", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL, "missing-generation-model");
		localStorage.setItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL, "missing-editing-model");

		await import("../../../src/components/static/ImageModelSelector.component");
		await import("../../../src/components/static/ImageEditModelSelector.component");
		const settingsService = await import("../../../src/services/Settings.service");

		settingsService.loadSettings();

		expect(document.querySelector<HTMLSelectElement>("#selectedImageModel")?.value).toBe(DEFAULT_IMAGE_MODEL);
		expect(document.querySelector<HTMLSelectElement>("#selectedImageEditingModel")?.value).toBe(
			DEFAULT_IMAGE_EDIT_MODEL
		);
		expect(localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_MODEL)).toBe(DEFAULT_IMAGE_MODEL);
		expect(localStorage.getItem(SETTINGS_STORAGE_KEYS.IMAGE_EDIT_MODEL)).toBe(DEFAULT_IMAGE_EDIT_MODEL);
	});
});

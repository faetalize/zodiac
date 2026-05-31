import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";
import { bootstrapDom } from "../../helpers/dom";

vi.mock("../../../src/services/Supabase.service", () => ({
	getSubscriptionTier: vi.fn(() => "pro")
}));

vi.mock("../../../src/services/ApiKeyValidation.service", () => ({
	validateGeminiApiKey: vi.fn(),
	validateOpenRouterApiKey: vi.fn()
}));

vi.mock("../../../src/services/Sync.service", () => ({
	applySyncedSettingsToLocalStorage: vi.fn(async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT, "false");
		return true;
	}),
	pushCurrentSettings: vi.fn(async () => true)
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
		<select id="selectedModel"><option value="gemini-2.5-flash" selected>Gemini Flash</option></select>
		<select id="selectedImageModel"><option value="imagen-4.0-ultra-generate-001" selected>Imagen</option></select>
		<select id="selectedImageEditingModel"><option value="qwen" selected>Qwen</option></select>
		<select id="roleplaySuggestionModel"><option value="gemini-2.5-flash" selected>Gemini Flash</option></select>
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

describe("premium endpoint synced settings", () => {
	beforeEach(() => {
		vi.resetModules();
		bootstrapSettingsDom();
	});

	it("rehydrates the premium endpoint toggle after synced settings replace stale local state", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT, "true");

		const apiKeyInputComponent = await import("../../../src/components/static/ApiKeyInput.component");
		const settingsService = await import("../../../src/services/Settings.service");
		const syncService = await import("../../../src/services/Sync.service");
		const toggle = document.querySelector<HTMLInputElement>("#preferPremiumEndpoint");

		expect(toggle?.checked).toBe(true);
		expect(apiKeyInputComponent.shouldPreferPremiumEndpoint()).toBe(true);

		await syncService.applySyncedSettingsToLocalStorage();
		settingsService.loadSettings();

		expect(apiKeyInputComponent.shouldPreferPremiumEndpoint()).toBe(false);
		expect(toggle?.checked).toBe(false);
	});
});

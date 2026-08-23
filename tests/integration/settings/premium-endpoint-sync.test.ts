import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";
import { bootstrapDom } from "../../helpers/dom";

vi.mock("../../../src/services/Supabase.service", () => ({
	getSubscriptionTier: vi.fn(() => "pro"),
	isImageGenerationAvailable: vi.fn(async () => ({ enabled: true, type: "all" }))
}));

vi.mock("../../../src/services/ApiKeyValidation.service", () => ({
	validateGeminiApiKey: vi.fn(),
	validateOpenRouterApiKey: vi.fn()
}));

vi.mock("../../../src/services/Sync.service", () => ({
	isSyncActive: vi.fn(() => true),
	applySyncedSettingsToLocalStorage: vi.fn(async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT, "false");
		return true;
	}),
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
		<div id="prefer-premium-image-endpoint-toggle">
			<span class="settings-toggle-entry-title"></span>
			<span class="settings-toggle-entry-subtitle"></span>
		</div>
		<input id="preferPremiumImageEndpoint" type="checkbox">

		<input id="maxTokens" value="1000">
		<input id="temperature" value="60">
		<select id="selectedModel"><option value="gemini-3.5-flash" selected>Gemini Flash</option></select>
		<select id="selectedImageModel"><option value="illustrious" selected>Illustrious</option></select>
		<select id="selectedImageEditingModel"><option value="qwen" selected>Qwen</option></select>
		<select id="roleplaySuggestionModel"><option value="gemini-2.5-flash" selected>Gemini Flash</option></select>
		<input id="autoscroll" type="checkbox">
		<input id="streamResponses" type="checkbox">
		<select id="enableThinkingSelect"><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
		<div id="thinking-required-hint" style="display: none"></div>
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
		vi.clearAllMocks();
		localStorage.clear();
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

	it("pushes synced settings when the user changes the premium endpoint toggle", async () => {
		const apiKeyInputComponent = await import("../../../src/components/static/ApiKeyInput.component");
		const syncService = await import("../../../src/services/Sync.service");
		const toggle = document.querySelector<HTMLInputElement>("#preferPremiumEndpoint");

		expect(apiKeyInputComponent.shouldPreferPremiumEndpoint()).toBe(true);

		toggle!.checked = false;
		toggle!.dispatchEvent(new Event("change", { bubbles: true }));

		expect(apiKeyInputComponent.shouldPreferPremiumEndpoint()).toBe(false);
		expect(syncService.queueSettingsPush).toHaveBeenCalledTimes(1);
		expect(syncService.queueSettingsPush).toHaveBeenLastCalledWith({ label: "premium endpoint settings" });
	});

	it("waits for synced settings to pull before pushing a paid account premium endpoint default", async () => {
		const apiKeyInputComponent = await import("../../../src/components/static/ApiKeyInput.component");
		const syncService = await import("../../../src/services/Sync.service");

		window.dispatchEvent(new CustomEvent("auth-state-changed", { detail: { loggedIn: true, subscription: {} } }));

		expect(apiKeyInputComponent.shouldPreferPremiumEndpoint()).toBe(true);
		expect(localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT)).toBeNull();
		expect(syncService.queueSettingsPush).not.toHaveBeenCalled();

		window.dispatchEvent(new CustomEvent("sync-data-pulled", { detail: {} }));

		expect(apiKeyInputComponent.shouldPreferPremiumEndpoint()).toBe(true);
		expect(localStorage.getItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT)).toBe("true");
		expect(syncService.queueSettingsPush).toHaveBeenCalledTimes(1);
		expect(syncService.queueSettingsPush).toHaveBeenLastCalledWith({ label: "premium endpoint settings" });
	});

	it("does not overwrite a pulled premium endpoint preference with the paid account default", async () => {
		const apiKeyInputComponent = await import("../../../src/components/static/ApiKeyInput.component");
		const syncService = await import("../../../src/services/Sync.service");

		window.dispatchEvent(new CustomEvent("auth-state-changed", { detail: { loggedIn: true, subscription: {} } }));
		localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_ENDPOINT, "false");
		window.dispatchEvent(new CustomEvent("sync-data-pulled", { detail: {} }));

		expect(apiKeyInputComponent.shouldPreferPremiumEndpoint()).toBe(false);
		expect(syncService.queueSettingsPush).not.toHaveBeenCalled();
	});

	it("treats a hidden image endpoint toggle as off so image routing falls to BYOK", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.PREFER_PREMIUM_IMAGE_ENDPOINT, "true");

		const apiKeyInputComponent = await import("../../../src/components/static/ApiKeyInput.component");
		const imageToggle = document.querySelector<HTMLDivElement>("#prefer-premium-image-endpoint-toggle")!;

		// Toggle visible (account has image credits) -> honors the stored preference.
		imageToggle.classList.remove("hidden");
		expect(apiKeyInputComponent.shouldPreferPremiumImageEndpoint()).toBe(true);

		// Toggle hidden (no credits, edge route unusable) -> reads as off regardless of the stored "true".
		imageToggle.classList.add("hidden");
		expect(apiKeyInputComponent.shouldPreferPremiumImageEndpoint()).toBe(false);
	});

	it("reapplies model-driven thinking constraints after synced settings replace stale local state", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.API_KEY, "local-gemini-key");
		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, "gemini-3-flash-preview");
		localStorage.setItem(SETTINGS_STORAGE_KEYS.ENABLE_THINKING, "false");

		await import("../../../src/components/static/ModelSelector.component");
		await import("../../../src/components/static/ThinkingSelector.component");
		await import("../../../src/components/static/ThinkingBudgetInput.component");
		const settingsService = await import("../../../src/services/Settings.service");

		settingsService.loadSettings();

		const modelSelect = document.querySelector<HTMLSelectElement>("#selectedModel");
		const thinkingSelect = document.querySelector<HTMLSelectElement>("#enableThinkingSelect");
		const thinkingBudget = document.querySelector<HTMLInputElement>("#thinkingBudget");
		const thinkingHint = document.querySelector<HTMLDivElement>("#thinking-required-hint");

		expect(modelSelect?.value).toBe("gemini-3-flash-preview");
		expect(thinkingSelect?.value).toBe("disabled");
		expect(thinkingSelect?.disabled).toBe(false);
		expect(thinkingBudget?.disabled).toBe(true);

		localStorage.setItem(SETTINGS_STORAGE_KEYS.MODEL, "gemini-3.1-pro-preview");
		localStorage.setItem(SETTINGS_STORAGE_KEYS.ENABLE_THINKING, "false");

		settingsService.loadSettings();

		expect(modelSelect?.value).toBe("gemini-3.1-pro-preview");
		expect(thinkingSelect?.value).toBe("enabled");
		expect(thinkingSelect?.disabled).toBe(true);
		expect(thinkingBudget?.disabled).toBe(false);
		expect(thinkingHint?.style.display).toBe("");
		expect(thinkingHint?.textContent).toBe("Thinking is required for the selected model.");
	});
});

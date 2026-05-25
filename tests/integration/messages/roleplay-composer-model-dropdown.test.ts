import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";
import { bootstrapDom } from "../../helpers/dom";

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(() => ({
		models: {
			generateContent: vi.fn()
		}
	}))
}));

vi.mock("../../../src/services/Chats.service", () => ({
	getCurrentChat: vi.fn(async () => null)
}));

vi.mock("../../../src/services/Message.service", () => ({
	send: vi.fn()
}));

vi.mock("../../../src/services/Personality.service", () => ({
	getSelected: vi.fn(async () => null)
}));

vi.mock("../../../src/services/Settings.service", () => ({
	getSettings: vi.fn(() => ({
		roleplaySuggestionModel: "",
		model: "openai/gpt-5.4",
		openRouterApiKey: "test-openrouter-key",
		geminiApiKey: "test-gemini-key",
		maxTokens: "512",
		temperature: "60",
		streamResponses: false,
		enableThinking: false,
		thinkingBudget: 0,
		safetySettings: []
	})),
	formatRoleplayDialogue: vi.fn((text: string) => text),
	formatRoleplayAction: vi.fn((text: string) => text)
}));

vi.mock("../../../src/services/Supabase.service", () => ({
	SUPABASE_URL: "https://example.supabase.co",
	getUserSubscription: vi.fn(async () => null),
	getSubscriptionTier: vi.fn(() => "free"),
	getAuthHeaders: vi.fn(async () => ({}))
}));

vi.mock("../../../src/services/Sync.service", () => ({
	isSyncActive: vi.fn(() => false),
	pushCurrentSettings: vi.fn(async () => true)
}));

vi.mock("../../../src/services/Toast.service", () => ({
	warn: vi.fn(),
	danger: vi.fn()
}));

vi.mock("../../../src/components/static/ApiKeyInput.component", () => ({
	shouldPreferPremiumEndpoint: vi.fn(() => false)
}));

vi.mock("../../../src/services/OpenRouter.service", () => ({
	buildOpenRouterRequest: vi.fn((request: Record<string, any>) => request),
	requestOpenRouterCompletion: vi.fn(async () => ({ text: JSON.stringify({ options: [] }) }))
}));

vi.mock("../../../src/utils/chatHistoryBuilder", () => ({
	UNRESTRICTED_SAFETY_SETTINGS: []
}));

function bootstrapRoleplayDom(): void {
	bootstrapDom(`
		<div id="dialog" class="dialog hidden">
			<div id="dialog-message"></div>
			<div id="dialog-buttons" class="btn-array">
				<button class="btn-danger btn" id="btn-dialog-ok" type="button">OK</button>
				<button class="btn-neutral btn" id="btn-dialog-cancel" type="button">Cancel</button>
			</div>
		</div>
		<div id="message-box">
			<button id="btn-roleplay" type="button"></button>
			<button id="btn-send" type="button"></button>
			<div id="roleplay-composer" class="hidden">
				<div class="navbar roleplay-composer__tabs" role="tablist">
					<div class="navbar-tab navbar-tab-active" data-roleplay-tab="dialogue" aria-selected="true">Dialogue</div>
					<div class="navbar-tab" data-roleplay-tab="actions" aria-selected="false">Actions</div>
					<div class="navbar-tab-highlight"></div>
				</div>
			<button id="btn-roleplay-refresh" type="button">
				<span class="material-symbols-outlined">refresh</span>
				<span class="loading-spinner roleplay-refresh-spinner hidden"></span>
			</button>
				<div class="roleplay-composer__selection-bar">
					<div id="roleplay-selected-actions"></div>
					<button id="btn-roleplay-clear-actions" class="hidden" type="button">Clear</button>
				</div>
				<div data-roleplay-panel="dialogue"><div id="roleplay-suggestions"></div></div>
				<div data-roleplay-panel="actions" class="hidden"><div id="roleplay-actions-root"></div></div>
			</div>
		</div>
		<div id="surface-plane" class="surface-plane">
			<div id="modal-roleplay-add" class="adaptive-sheet hidden" role="dialog" aria-labelledby="roleplay-add-modal-title">
				<h1 id="roleplay-add-modal-title">Add</h1>
				<input id="roleplay-add-modal-label-input" type="text">
				<input id="roleplay-add-modal-input" type="text">
				<div id="roleplay-add-modal-error" class="hidden"><span id="roleplay-add-modal-error-message"></span></div>
				<button id="btn-roleplay-add-modal-submit" type="button">Add</button>
				<button id="btn-roleplay-add-modal-cancel" type="button">Cancel</button>
			</div>
		</div>
		<div id="personalitiesDiv"></div>
		<select id="roleplaySuggestionModel"></select>
	`);
}

describe("roleplay suggestion model dropdown", () => {
	beforeEach(() => {
		vi.resetModules();
		bootstrapRoleplayDom();
		window.localStorage.setItem(SETTINGS_STORAGE_KEYS.API_KEY, "test-gemini-key");
		window.localStorage.setItem(SETTINGS_STORAGE_KEYS.OPENROUTER_API_KEY, "test-openrouter-key");
	});

	afterEach(() => {
		document.body.innerHTML = "";
		window.localStorage.clear();
	});

	it("populates only models flagged for roleplay suggestions", async () => {
		await import("../../../src/components/static/RoleplayComposer.component");

		const options = Array.from(document.querySelectorAll<HTMLOptionElement>("#roleplaySuggestionModel option"));

		const expectedModels = [
			"Gemini 3.1 Flash Lite",
			"Gemini 3 Flash Preview",
			"Gemini 3.5 Flash",
			"Gemini 3.1 Pro Preview",
			"GPT-OSS 120B",
			"Claude Sonnet 4.6",
			"GLM 5",
			"Qwen3.5 397B",
			"Qwen3.5 Plus"
		];
		const receivedModels = options.map((option) => option.textContent);

		expect(receivedModels.sort()).toEqual(expectedModels.sort());
	});
});

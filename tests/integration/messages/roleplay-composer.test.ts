import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bootstrapDom } from "../../helpers/dom";
import { waitForCondition } from "../../helpers/async";
import { makeChat } from "../../fixtures/chats";
import { makeModelMessage, makeUserMessage } from "../../fixtures/messages";
import { makePersona } from "../../fixtures/personas";

const testState = vi.hoisted(() => ({
	chat: null as ReturnType<typeof makeChat> | null,
	persona: null as ReturnType<typeof makePersona> | null,
	queuedSuggestionResponses: [] as string[],
	builtRequests: [] as Array<Record<string, any>>,
	messagePayloads: [] as string[]
}));

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(() => ({
		models: {
			generateContent: vi.fn()
		}
	}))
}));

vi.mock("../../../src/services/Chats.service", () => ({
	getCurrentChat: vi.fn(async () => testState.chat)
}));

vi.mock("../../../src/services/Message.service", () => ({
	send: vi.fn(async (payload: string) => {
		testState.messagePayloads.push(payload);
	})
}));

vi.mock("../../../src/services/Personality.service", () => ({
	getSelected: vi.fn(async () => testState.persona)
}));

vi.mock("../../../src/services/Settings.service", () => ({
	getSettings: vi.fn(() => ({
		roleplaySuggestionModel:
			document.querySelector<HTMLSelectElement>("#roleplaySuggestionModel")?.value || "openrouter/roleplay-beta",
		model: "openrouter/default",
		openRouterApiKey: "test-openrouter-key",
		geminiApiKey: "",
		maxTokens: "512",
		temperature: "60",
		streamResponses: false,
		enableThinking: false,
		thinkingBudget: 0,
		safetySettings: [],
		rpgGroupChatsProgressAutomatically: false,
		disallowPersonaPinging: false,
		dynamicGroupChatPingOnly: false,
		autoscroll: true
	})),
	formatRoleplayDialogue: vi.fn((text: string) => `DIALOGUE::${text}`),
	formatRoleplayAction: vi.fn((text: string) => `ACTION::${text}`)
}));

vi.mock("../../../src/services/Supabase.service", () => ({
	SUPABASE_URL: "https://example.supabase.co",
	getUserSubscription: vi.fn(async () => null),
	getSubscriptionTier: vi.fn(() => "free"),
	getAuthHeaders: vi.fn(async () => ({}))
}));

vi.mock("../../../src/services/Toast.service", () => ({
	warn: vi.fn(),
	danger: vi.fn()
}));

vi.mock("../../../src/components/static/ApiKeyInput.component", () => ({
	shouldPreferPremiumEndpoint: vi.fn(() => false)
}));

vi.mock("../../../src/services/OpenRouter.service", () => ({
	buildOpenRouterRequest: vi.fn((request: Record<string, any>) => {
		testState.builtRequests.push(request);
		return request;
	}),
	requestOpenRouterCompletion: vi.fn(async ({ request }: { request: Record<string, any> }) => {
		const text = testState.queuedSuggestionResponses.shift();
		if (!text) {
			throw new Error(`No queued roleplay response for ${request.model}`);
		}

		return { text };
	})
}));

vi.mock("../../../src/types/Models", () => ({
	formatChatModelLabel: vi.fn((model: { id: string }) => model.id),
	getAccessibleChatModels: vi.fn(() => [{ id: "openrouter/roleplay-alpha" }, { id: "openrouter/roleplay-beta" }]),
	getValidChatModel: vi.fn((model: string) => {
		if (model === "openrouter/roleplay-alpha" || model === "openrouter/roleplay-beta") {
			return model;
		}

		return "openrouter/roleplay-alpha";
	}),
	isOpenRouterModel: vi.fn(() => true),
	modelRequiresThinking: vi.fn(() => false),
	modelSupportsTemperature: vi.fn(() => true)
}));

vi.mock("../../../src/utils/chatHistoryBuilder", () => ({
	UNRESTRICTED_SAFETY_SETTINGS: []
}));

function queueSuggestionOptions(options: string[]): void {
	testState.queuedSuggestionResponses.push(JSON.stringify({ options }));
}

function getSuggestionButtons(): HTMLButtonElement[] {
	return Array.from(document.querySelectorAll<HTMLButtonElement>(".roleplay-suggestion"));
}

function getRefreshButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>("#btn-roleplay-refresh");
	if (!button) {
		throw new Error("Missing #btn-roleplay-refresh");
	}
	return button;
}

function getSuggestionModelSelect(): HTMLSelectElement {
	const select = document.querySelector<HTMLSelectElement>("#roleplaySuggestionModel");
	if (!select) {
		throw new Error("Missing #roleplaySuggestionModel");
	}
	return select;
}

function getCustomCategoryInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>("#roleplay-add-modal-input");
	if (!input) {
		throw new Error("Missing category input");
	}
	return input;
}

function getCustomActionInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>("#roleplay-add-modal-input");
	if (!input) {
		throw new Error("Missing action input");
	}
	return input;
}

function getCreateCategoryButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>("#btn-roleplay-add-modal-submit");
	if (!button) {
		throw new Error("Missing add category button");
	}
	return button;
}

function getAddActionButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>("#btn-roleplay-add-modal-submit");
	if (!button) {
		throw new Error("Missing add action button");
	}
	return button;
}

function getRevealCategoryButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>("[data-roleplay-add-category-toggle]");
	if (!button) {
		throw new Error("Missing reveal category button");
	}
	return button;
}

function getRevealActionButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>("[data-roleplay-add-action-toggle]");
	if (!button) {
		throw new Error("Missing reveal action button");
	}
	return button;
}

function getActionButton(title: string): HTMLButtonElement {
	const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".roleplay-action-chip__select")).find(
		(element) => element.title === title
	);
	if (!button) {
		throw new Error(`Missing action button for ${title}`);
	}
	return button;
}

function bootstrapRoleplayDom(): void {
	bootstrapDom(`
		<div id="message-box">
			<button id="btn-roleplay" type="button"></button>
			<button id="btn-send" type="button"></button>
			<div id="roleplay-composer" class="hidden">
				<div class="roleplay-composer__header">
					<div class="navbar roleplay-composer__tabs" role="tablist">
						<div class="navbar-tab navbar-tab-active" data-roleplay-tab="dialogue" aria-selected="true">Dialogue</div>
						<div class="navbar-tab" data-roleplay-tab="actions" aria-selected="false">Actions</div>
						<div class="navbar-tab-highlight"></div>
					</div>
					<button id="btn-roleplay-refresh" type="button">Refresh</button>
				</div>
				<div class="roleplay-composer__selection-bar">
					<div id="roleplay-selected-actions"></div>
					<button id="btn-roleplay-clear-actions" class="hidden" type="button">Clear</button>
				</div>
				<div class="roleplay-panel" data-roleplay-panel="dialogue">
					<div id="roleplay-suggestions"></div>
				</div>
				<div class="roleplay-panel hidden" data-roleplay-panel="actions">
					<div id="roleplay-actions-root"></div>
				</div>
			</div>
		</div>
		<div class="overlay hidden" id="overlay">
			<button id="btn-hide-overlay" type="button">BACK</button>
			<div class="overlay-content">
				<div id="modal-roleplay-add" class="hidden">
					<h1 id="roleplay-add-modal-title">Add</h1>
					<input id="roleplay-add-modal-input" type="text">
					<div id="roleplay-add-modal-error" class="hidden">
						<span id="roleplay-add-modal-error-message"></span>
					</div>
					<button id="btn-roleplay-add-modal-submit" type="button">Add</button>
					<button id="btn-roleplay-add-modal-cancel" type="button">Cancel</button>
				</div>
			</div>
		</div>
		<div id="personalitiesDiv"></div>
		<select id="roleplaySuggestionModel"></select>
	`);
}

async function importRoleplayComposer(): Promise<void> {
	await import("../../../src/components/static/RoleplayComposer.component");
}

async function waitForSuggestions(expectedCount = 4): Promise<void> {
	await waitForCondition(
		() => getSuggestionButtons().length === expectedCount,
		`Expected ${expectedCount} roleplay suggestions to render`
	);
}

describe("Roleplay composer suggestion workflow", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		testState.chat = makeChat({
			content: [makeUserMessage("Hello there"), makeModelMessage("Hi. Come closer.")]
		});
		testState.persona = makePersona({
			name: "Velvet",
			prompt: "Be flirtatious and intense.",
			roleplayEnabled: true
		});
		testState.queuedSuggestionResponses = [];
		testState.builtRequests = [];
		testState.messagePayloads = [];
		bootstrapRoleplayDom();
		window.localStorage.setItem("roleplaySuggestionModel", "openrouter/roleplay-beta");
	});

	afterEach(() => {
		document.body.innerHTML = "";
		window.localStorage.clear();
	});

	it("uses the selected roleplay suggestion model and renders four suggestion buttons", async () => {
		queueSuggestionOptions(["Stay where you are.", "Tell me what you want.", "You are trouble.", "Come closer."]);

		await importRoleplayComposer();
		await waitForSuggestions();

		expect(testState.builtRequests).toHaveLength(1);
		expect(testState.builtRequests[0].model).toBe("openrouter/roleplay-beta");
		expect(testState.builtRequests[0].responseFormat.json_schema.schema.properties.options.minItems).toBe(4);
		expect(testState.builtRequests[0].responseFormat.json_schema.schema.properties.options.maxItems).toBe(4);
		expect(getSuggestionButtons().map((button) => button.textContent)).toEqual([
			"Stay where you are.",
			"Tell me what you want.",
			"You are trouble.",
			"Come closer."
		]);
	});

	it("refreshes with the newly selected suggestion model", async () => {
		queueSuggestionOptions(["First", "Second", "Third", "Fourth"]);
		queueSuggestionOptions(["Again one", "Again two", "Again three", "Again four"]);

		await importRoleplayComposer();
		await waitForSuggestions();

		const select = getSuggestionModelSelect();
		select.value = "openrouter/roleplay-alpha";
		select.dispatchEvent(new Event("change", { bubbles: true }));

		await waitForCondition(
			() => testState.builtRequests.length === 2,
			"Expected suggestion request after model change"
		);

		expect(testState.builtRequests[1].model).toBe("openrouter/roleplay-alpha");
		expect(getSuggestionButtons().map((button) => button.textContent)).toEqual([
			"Again one",
			"Again two",
			"Again three",
			"Again four"
		]);
	});

	it("sends the selected dialogue option through the final message request", async () => {
		queueSuggestionOptions(["Tell me more.", "Not yet.", "Try again.", "Maybe later."]);

		await importRoleplayComposer();
		await waitForSuggestions();

		getSuggestionButtons()[0].click();

		await waitForCondition(
			() => testState.messagePayloads.length === 1,
			"Expected suggestion click to send a message"
		);

		expect(testState.messagePayloads[0]).toBe("DIALOGUE::Tell me more.");
	});

	it("includes queued actions before the selected dialogue option in the final request", async () => {
		queueSuggestionOptions(["Tell me more.", "Not yet.", "Try again.", "Maybe later."]);

		await importRoleplayComposer();
		await waitForSuggestions();

		getActionButton("shakes their right hand").click();
		getSuggestionButtons()[0].click();

		await waitForCondition(
			() => testState.messagePayloads.length === 1,
			"Expected chained roleplay action and dialogue to send"
		);

		expect(testState.messagePayloads[0]).toBe("ACTION::shakes their right hand\nDIALOGUE::Tell me more.");
	});

	it("refresh button requests a fresh set of four suggestions again", async () => {
		queueSuggestionOptions(["One", "Two", "Three", "Four"]);
		queueSuggestionOptions(["Five", "Six", "Seven", "Eight"]);

		await importRoleplayComposer();
		await waitForSuggestions();

		getRefreshButton().click();

		await waitForCondition(
			() => testState.builtRequests.length === 2,
			"Expected refresh button to trigger another request"
		);

		expect(testState.builtRequests[1].responseFormat.json_schema.schema.properties.options.minItems).toBe(4);
		expect(testState.builtRequests[1].responseFormat.json_schema.schema.properties.options.maxItems).toBe(4);
		expect(getSuggestionButtons().map((button) => button.textContent)).toEqual(["Five", "Six", "Seven", "Eight"]);
	});

	it("creates a custom category and saves a reusable action into it", async () => {
		queueSuggestionOptions(["One", "Two", "Three", "Four"]);

		await importRoleplayComposer();
		await waitForSuggestions();

		getRevealCategoryButton().click();
		getCustomCategoryInput().value = "Affection";
		getCreateCategoryButton().click();

		await waitForCondition(
			() =>
				Array.from(document.querySelectorAll(".roleplay-action-category-pill")).some((button) =>
					button.textContent?.includes("Affection")
				),
			"Expected custom category to render"
		);

		const affectionCategory = Array.from(
			document.querySelectorAll<HTMLButtonElement>(".roleplay-action-category-pill")
		).find((button) => button.textContent === "Affection (0)");
		if (!affectionCategory) {
			throw new Error("Missing Affection category button");
		}
		affectionCategory.click();

		getRevealActionButton().click();
		getCustomActionInput().value = "pets her head";
		getAddActionButton().click();

		await waitForCondition(
			() =>
				Array.from(document.querySelectorAll<HTMLButtonElement>(".roleplay-action-chip__select")).some(
					(button) => button.title === "pets her head"
				),
			"Expected custom action to render inside the selected category"
		);

		expect(
			Array.from(document.querySelectorAll(".roleplay-action-category-pill")).map((button) => button.textContent)
		).toContain("Affection (1)");
	});
});

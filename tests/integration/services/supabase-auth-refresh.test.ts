import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const dispatchAppEvent = vi.fn();
let authStateCallback: ((event: string, session: Session | null) => void) | null = null;

const profileRecord = {
	preferredName: "Test User",
	systemPromptAddition: "Be helpful.",
	avatar: "https://example.test/avatar.png"
};

const subscriptionRecord = {
	user_id: "user-1",
	status: "active",
	price_id: "price_1SDdbKGiJrKwXclR7hn7fF4s",
	current_period_end: "2026-06-30T00:00:00Z",
	cancel_at_period_end: false,
	stripe_customer_id: "cus_test"
};

const imageGenerationRecord = {
	user_id: "user-1",
	remaining_image_generations: 3
};

function buildQuery(table: string) {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		order: vi.fn(() => query),
		limit: vi.fn(() => query),
		single: vi.fn(async () => {
			if (table === "profiles") {
				return { data: profileRecord, error: null };
			}
			return { data: null, error: null };
		}),
		maybeSingle: vi.fn(async () => {
			if (table === "user_subscriptions") {
				return { data: subscriptionRecord, error: null };
			}
			if (table === "image_generations") {
				return { data: imageGenerationRecord, error: null };
			}
			if (table === "image_sub_allowance") {
				return { data: { remaining_image_generations: 2 }, error: null };
			}
			return { data: null, error: null };
		})
	};
	return query;
}

const supabaseMock = {
	auth: {
		getSession: vi.fn(),
		getUser: vi.fn(),
		onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => {
			authStateCallback = callback;
			return { data: { subscription: { unsubscribe: vi.fn() } } };
		}),
		signOut: vi.fn()
	},
	from: vi.fn((table: string) => buildQuery(table)),
	functions: {
		invoke: vi.fn(async () => ({ data: null, error: null }))
	},
	storage: {
		from: vi.fn()
	}
};

vi.mock("@supabase/supabase-js", () => ({
	createClient: vi.fn(() => supabaseMock)
}));

vi.mock("../../../src/events", () => ({
	dispatchAppEvent,
	EventNames: {
		AUTH_STATE_CHANGED: "auth-state-changed",
		SUBSCRIPTION_UPDATED: "subscription-updated"
	}
}));

vi.mock("../../../src/services/Toast.service", () => ({
	danger: vi.fn(),
	warn: vi.fn()
}));

function appendElement<K extends keyof HTMLElementTagNameMap>(
	tagName: K,
	id: string,
	className = ""
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tagName);
	element.id = id;
	element.className = className;
	document.body.appendChild(element);
	return element;
}

function createAuthDom() {
	appendElement("button", "logged-in-action", "logged-in-component hidden");
	appendElement("button", "logged-out-action", "logged-out-component");
	appendElement("img", "profile-pfp");
	appendElement("img", "user-profile");
	appendElement("input", "profile-preferred-name");
	appendElement("textarea", "profile-system-prompt");
	appendElement("span", "subscription-badge");
	appendElement("button", "btn-manage-subscription", "hidden");
	appendElement("span", "subscription-tier-text");
	appendElement("span", "subscription-period-end");
	appendElement("span", "subscription-remaining-generations");
	appendElement("span", "subscription-renewal-date-label");
	appendElement("input", "apiKeyInput");
	appendElement("div", "apiKeyNoNeedMsg");
	appendElement("div", "or-divider");
	appendElement("button", "btn-show-subscription-options");
	const apiKeyError = document.createElement("span");
	apiKeyError.className = "api-key-error";
	document.body.appendChild(apiKeyError);
}

async function waitForAuthStateEvent() {
	for (let i = 0; i < 20; i++) {
		if (dispatchAppEvent.mock.calls.some(([eventName]) => eventName === "auth-state-changed")) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

describe("Supabase auth refresh handling", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		authStateCallback = null;
		createAuthDom();
	});

	it("hydrates logged-in app state when Supabase refreshes an existing session", async () => {
		await import("../../../src/services/Supabase.service");
		const session = {
			access_token: "access-token",
			refresh_token: "refresh-token",
			expires_in: 3600,
			expires_at: 1_800_000_000,
			token_type: "bearer",
			user: {
				id: "user-1",
				email: "user@example.test",
				app_metadata: {},
				user_metadata: {},
				aud: "authenticated",
				created_at: "2026-05-30T00:00:00Z"
			}
		} as Session;

		authStateCallback?.("TOKEN_REFRESHED", session);
		await waitForAuthStateEvent();

		expect(document.querySelector("#logged-in-action")?.classList.contains("hidden")).toBe(false);
		expect(document.querySelector("#logged-out-action")?.classList.contains("hidden")).toBe(true);
		expect(dispatchAppEvent).toHaveBeenCalledWith(
			"auth-state-changed",
			expect.objectContaining({
				loggedIn: true,
				session,
				subscription: subscriptionRecord,
				imageGenerationRecord: expect.objectContaining({
					remaining_image_generations: 5
				})
			})
		);
	});
});

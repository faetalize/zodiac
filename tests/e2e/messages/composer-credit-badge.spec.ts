import { expect, test, type Page, type Route } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

const SUPABASE_HOST = "hglcltvwunzynnzduauy.supabase.co";
const TEST_USER_ID = "00000000-0000-4000-8000-0000000005728";
const PRO_MONTHLY_PRICE_ID = "price_1SOU2lKcI9PDo3JBhsT8URS9";
const MAX_MONTHLY_PRICE_ID = "price_1T9DCYKcI9PDo3JBsFc4nlZa";

function jsonResponse(body: unknown) {
	return {
		status: 200,
		contentType: "application/json",
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
			"access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS"
		},
		body: JSON.stringify(body)
	};
}

async function stubAllowances(
	page: Page,
	options: { priceId?: string; imageCredits?: number; megaCredits?: number } = {}
): Promise<void> {
	const { priceId = PRO_MONTHLY_PRICE_ID, imageCredits = 7, megaCredits = 7 } = options;
	await page.route(`https://${SUPABASE_HOST}/**/*`, async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (request.method() === "OPTIONS") {
			await route.fulfill(jsonResponse({}));
			return;
		}

		if (url.pathname === "/auth/v1/user") {
			await route.fulfill(
				jsonResponse({
					id: TEST_USER_ID,
					email: "mega-layout-playwright@example.test",
					aud: "authenticated",
					role: "authenticated",
					app_metadata: {},
					user_metadata: {},
					created_at: "2026-01-01T00:00:00.000Z"
				})
			);
			return;
		}

		if (url.pathname === "/functions/v1/refresh-subscription-allowances") {
			await route.fulfill(jsonResponse({ ok: true }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/user_subscriptions")) {
			await route.fulfill(
				jsonResponse({
					user_id: TEST_USER_ID,
					status: "active",
					price_id: priceId,
					current_period_end: "2026-12-31T00:00:00.000Z",
					cancel_at_period_end: false,
					stripe_customer_id: "cus_mega_layout_playwright"
				})
			);
			return;
		}

		if (url.pathname.startsWith("/rest/v1/mega_credits")) {
			await route.fulfill(jsonResponse({ user_id: TEST_USER_ID, remaining_mega_credits: megaCredits }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/image_generations")) {
			await route.fulfill(jsonResponse({ user_id: TEST_USER_ID, remaining_image_generations: imageCredits }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/image_sub_allowance")) {
			await route.fulfill(jsonResponse({ remaining_image_generations: 0 }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/profiles")) {
			await route.fulfill(jsonResponse({ avatar: "", preferredName: "", systemPromptAddition: "" }));
			return;
		}

		await route.fulfill(jsonResponse({}));
	});
}

async function seedSupabaseSession(page: Page): Promise<void> {
	await page.addInitScript(
		({ supabaseHost, userId }) => {
			const testWindow = window as typeof window & { __zodiacAuthStateChanges?: number };
			testWindow.__zodiacAuthStateChanges = 0;
			window.addEventListener("auth-state-changed", () => {
				testWindow.__zodiacAuthStateChanges = (testWindow.__zodiacAuthStateChanges ?? 0) + 1;
			});
			const projectRef = supabaseHost.split(".")[0];
			localStorage.setItem("zodiac-sync-prompt-seen", "true");
			localStorage.setItem(
				`sb-${projectRef}-auth-token`,
				JSON.stringify({
					access_token: "playwright-access-token",
					refresh_token: "playwright-refresh-token",
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					expires_in: 3600,
					token_type: "bearer",
					user: {
						id: userId,
						email: "mega-layout-playwright@example.test",
						aud: "authenticated",
						role: "authenticated",
						app_metadata: {},
						user_metadata: {}
					}
				})
			);
		},
		{ supabaseHost: SUPABASE_HOST, userId: TEST_USER_ID }
	);
}

async function dispatchAuthenticatedState(
	page: Page,
	options: { priceId?: string; imageCredits?: number } = {}
): Promise<void> {
	const { priceId = PRO_MONTHLY_PRICE_ID, imageCredits = 7 } = options;
	await page.evaluate(
		async ({ userId, priceId, imageCredits }) => {
			const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
			const { dispatchAppEvent } = await importModule("/events/index.ts");
			dispatchAppEvent("auth-state-changed", {
				loggedIn: true,
				subscription: {
					user_id: userId,
					status: "active",
					price_id: priceId,
					current_period_end: "2026-12-31T00:00:00.000Z",
					cancel_at_period_end: false,
					stripe_customer_id: "cus_mega_layout_playwright"
				},
				imageGenerationRecord: { user_id: userId, remaining_image_generations: imageCredits }
			});
		},
		{ userId: TEST_USER_ID, priceId, imageCredits }
	);
}

async function openMegaComposer(page: Page, width: number): Promise<void> {
	await page.setViewportSize({ width, height: 800 });
	await stubExternalTraffic(page, []);
	await stubAllowances(page);
	await seedLocalSettings(page);
	await seedSupabaseSession(page);
	await page.goto("/");

	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { __zodiacAuthStateChanges?: number }).__zodiacAuthStateChanges ?? 0
			)
		)
		.toBeGreaterThan(0);
	await dispatchAuthenticatedState(page);

	await page.locator("#selectedModel").evaluate((element) => {
		const select = element as HTMLSelectElement;
		select.value = "openai/gpt-5.5";
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
	await expect(page.locator("#selectedModel")).toHaveValue("openai/gpt-5.5");
	const badge = page.locator("#image-credits-label");
	await expect(badge).toHaveText("7 Mega Credits");
	await dispatchAuthenticatedState(page);
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const { dispatchAppEvent } = await importModule("/events/index.ts");
		dispatchAppEvent("chat-model-changed", { model: "openai/gpt-5.5" });
	});
	await expect(badge).toBeVisible();
}

test("removes Max generation limits from the composer", async ({ page }) => {
	await page.setViewportSize({ width: 600, height: 800 });
	await stubExternalTraffic(page, []);
	await stubAllowances(page, { priceId: MAX_MONTHLY_PRICE_ID, imageCredits: 0, megaCredits: 0 });
	await seedLocalSettings(page);
	await seedSupabaseSession(page);
	await page.goto("/");

	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { __zodiacAuthStateChanges?: number }).__zodiacAuthStateChanges ?? 0
			)
		)
		.toBeGreaterThan(0);
	await dispatchAuthenticatedState(page, { priceId: MAX_MONTHLY_PRICE_ID, imageCredits: 0 });

	await expect(page.locator("#subscription-remaining-generations")).toHaveText("Unlimited");
	await expect(page.locator("#subscription-remaining-mega-credits")).toHaveText("Unlimited");
	await expect(page.locator("#btn-top-up-credits")).toHaveClass(/hidden/);
	await expect(page.locator("#prefer-premium-image-endpoint-toggle")).not.toHaveClass(/hidden/);

	await page.locator("#btn-image").click();
	await expect(page.locator("#btn-image")).toHaveClass(/btn-toggled/);
	await expect(page.locator("#image-credits-label")).toBeHidden();
	await expect(page.locator("#btn-send")).toBeEnabled();

	await page.locator("#btn-image").click();
	await page.locator("#messageInput").fill("x".repeat(15_001));
	await expect(page.locator("#message-limit-indicator")).toBeHidden();
	await expect(page.locator("#btn-send")).toBeEnabled();
});

function getComposerLayout() {
	const messageBox = document.querySelector<HTMLElement>("#message-box");
	const sendButton = document.querySelector<HTMLElement>("#btn-send");
	const toolbar = document.querySelector<HTMLElement>("#message-box-buttons");
	const actionGroup = document.querySelector<HTMLElement>("#message-box-actions");
	const rightGroup = document.querySelector<HTMLElement>(".message-box-right");
	const menu = document.querySelector<HTMLElement>("#composer-actions-menu");
	const allActions = Array.from(document.querySelectorAll<HTMLElement>("[data-composer-action]"));
	const actions = allActions.filter(
		(action) => action.parentElement === actionGroup && action.getClientRects().length > 0
	);

	if (!messageBox || !sendButton || !toolbar || !actionGroup || !rightGroup || !menu || actions.length === 0) {
		throw new Error("Missing composer layout elements");
	}

	const messageBoxBounds = messageBox.getBoundingClientRect();
	const sendButtonBounds = sendButton.getBoundingClientRect();
	const actionBounds = actions.map((action) => action.getBoundingClientRect());
	const actionGap = Number.parseFloat(getComputedStyle(actionGroup).columnGap) || 0;
	return {
		actionRowCount: actionBounds.reduce(
			(rows, bounds, index) => rows + (index > 0 && bounds.left <= actionBounds[index - 1].left ? 1 : 0),
			1
		),
		actionRequiredWidth:
			actions.reduce((width, action) => width + action.getBoundingClientRect().width, 0) +
			actionGap * (actions.length - 1),
		actionWidth: actionGroup.scrollWidth,
		rightWidth: rightGroup.offsetWidth,
		toolbarWidth: toolbar.clientWidth,
		toolbarActionIds: actions.map((action) => action.id),
		menuActionIds: allActions.filter((action) => action.parentElement === menu).map((action) => action.id),
		sendButtonFits:
			sendButtonBounds.left >= messageBoxBounds.left && sendButtonBounds.right <= messageBoxBounds.right
	};
}

test("collapses the Mega credit badge before overflowing optional controls", async ({ page }) => {
	await openMegaComposer(page, 300);
	const badge = page.locator("#image-credits-label");
	await expect(badge).toHaveClass(/image-credits-label-compact/);
	await expect(badge.locator(".image-credits-type")).toBeHidden();

	const layout = await page.evaluate(getComposerLayout);

	expect(layout.sendButtonFits, "The send button must remain inside the visible message box").toBe(true);
	expect(
		layout.actionRowCount,
		`Collapsing the badge should happen before actions overflow: ${JSON.stringify(layout)}`
	).toBe(1);
	expect(layout.menuActionIds).toEqual([]);
	await expect(page.locator("#composer-actions-overflow")).toBeHidden();

	await page.setViewportSize({ width: 600, height: 800 });
	await expect(badge).not.toHaveClass(/image-credits-label-compact/);
	await expect(badge.locator(".image-credits-type")).toBeVisible();
});

test("moves optional controls into a menu when image mode runs out of room at 255px", async ({ page }) => {
	await openMegaComposer(page, 255);
	const badge = page.locator("#image-credits-label");
	await expect(badge).toHaveClass(/image-credits-label-compact/);
	await expect(badge.locator(".image-credits-type")).toBeHidden();
	await page.locator("#btn-image").click();
	await expect(page.locator("#btn-image")).toHaveClass(/btn-toggled/);

	const overflowButton = page.locator("#btn-composer-actions-overflow");
	await expect(overflowButton).toBeVisible();
	await expect(overflowButton).toHaveClass(/btn-toggled/);

	const initialLayout = await page.evaluate(getComposerLayout);
	expect(initialLayout.menuActionIds.length).toBeGreaterThan(0);
	expect(initialLayout.menuActionIds).toContain("btn-image");
	expect(initialLayout.actionRowCount, JSON.stringify(initialLayout)).toBe(1);
	expect(initialLayout.sendButtonFits, "The send button must remain inside the visible message box").toBe(true);

	await overflowButton.click();
	const menu = page.locator("#composer-actions-menu.dropdown-menu--portal");
	await expect(menu).toBeVisible();
	const imageAction = menu.locator("#btn-image");
	await expect(imageAction).toBeVisible();
	await expect(imageAction).toHaveClass(/btn-toggled/);
	await expect(imageAction.locator(".composer-action-label")).toHaveText("Image Generation");
	await imageAction.click();
	await expect(page.locator("#btn-image")).not.toHaveClass(/btn-toggled/);
	await expect(menu).toBeHidden();
	await expect(overflowButton).toBeHidden();

	const layout = await page.evaluate(getComposerLayout);
	expect(layout.actionRowCount, JSON.stringify(layout)).toBe(1);
	expect(layout.menuActionIds).toEqual([]);
	expect(layout.sendButtonFits, "The send button must remain inside the visible message box").toBe(true);
});

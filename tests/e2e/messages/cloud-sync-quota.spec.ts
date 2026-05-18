import { expect, test, type Page, type Route } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

const SUPABASE_HOST = "hglcltvwunzynnzduauy.supabase.co";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000152";
const PRO_MONTHLY_PRICE_ID = "price_1SOU2lKcI9PDo3JBhsT8URS9";

function jsonResponse(body: unknown, status = 200) {
	return {
		status,
		contentType: "application/json",
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
			"access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS"
		},
		body: JSON.stringify(body)
	};
}

async function stubSupabaseQuotaFull(page: Page): Promise<void> {
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
					email: "quota-playwright@example.test",
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

		if (url.pathname.startsWith("/rest/v1/profiles")) {
			await route.fulfill(
				jsonResponse({
					avatar: "",
					preferredName: "Quota Tester",
					systemPromptAddition: ""
				})
			);
			return;
		}

		if (url.pathname.startsWith("/rest/v1/user_subscriptions")) {
			await route.fulfill(
				jsonResponse({
					user_id: TEST_USER_ID,
					status: "active",
					price_id: PRO_MONTHLY_PRICE_ID,
					current_period_end: "2026-12-31T00:00:00.000Z",
					cancel_at_period_end: false,
					stripe_customer_id: "cus_quota_playwright"
				})
			);
			return;
		}

		if (url.pathname.startsWith("/rest/v1/image_generations")) {
			await route.fulfill(jsonResponse({ user_id: TEST_USER_ID, remaining_image_generations: 0 }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/image_sub_allowance")) {
			await route.fulfill(jsonResponse({ remaining_image_generations: 0 }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/user_sync_preferences")) {
			await route.fulfill(jsonResponse({}));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/user_sync_quotas")) {
			await route.fulfill(
				jsonResponse({
					storage_used_bytes: 9.5 * 1024 * 1024,
					storage_quota_bytes: 10 * 1024 * 1024
				})
			);
			return;
		}

		if (url.pathname.startsWith("/rest/v1/user_synced_chats")) {
			await route.fulfill(
				jsonResponse(
					{
						code: "P0001",
						message: "Storage quota exceeded by trg_enforce_quota_synced_chats",
						details: "Cloud sync storage quota exceeded"
					},
					400
				)
			);
			return;
		}

		await route.fulfill(jsonResponse({}));
	});
}

async function seedSupabaseSession(page: Page): Promise<void> {
	await page.addInitScript(
		({ supabaseHost, userId }) => {
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
						email: "quota-playwright@example.test",
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

async function enableCloudSync(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const syncService = await importModule("/services/Sync.service.ts");
		const enabled = await syncService.setupSync("playwright-sync-password");
		if (!enabled) {
			throw new Error("Failed to enable cloud sync for quota regression test");
		}
	});
}

test("cloud sync quota failure after sending shows quota toast with upgrade action", async ({ page }) => {
	await stubExternalTraffic(page, [{ text: "Quota Regression Thread" }, { text: "Mocked quota reply." }]);
	await stubSupabaseQuotaFull(page);
	await seedLocalSettings(page);
	await seedSupabaseSession(page);
	await page.goto("/");
	await enableCloudSync(page);

	await page.locator("#messageInput").fill("Trigger cloud sync quota failure");
	await page.locator("#btn-send").click();

	const toast = page.locator(".toast", { hasText: "Cloud sync storage is full" });
	await expect(toast).toBeVisible({ timeout: 10_000 });
	await expect(toast).toContainText("not committed to cloud sync");
	await expect(toast).toContainText("9.5 MB of 10 MB used (95% filled)");
	await expect(toast.locator(".toast-action")).toHaveText("See upgrade options");
});

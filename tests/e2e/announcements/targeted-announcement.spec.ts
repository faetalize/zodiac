import { expect, test } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";
import { newOrigin, seed, serveApp } from "../helpers/migration";

test("a deferred announcement appears when an ordinary import sheet closes", async ({ page }) => {
	await serveApp(page, { syncEnabled: false });
	let releaseAnnouncement!: () => void;
	const announcementReady = new Promise<void>((resolve) => {
		releaseAnnouncement = resolve;
	});
	await page.route("**/rest/v1/announcements*", async (route) => {
		await announcementReady;
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([
				{
					id: "surface-deferred-announcement",
					key: "surface-deferred-announcement",
					title: "Ready after import",
					body: "This announcement waits for the import sheet to close.",
					hero_image_url: null,
					hero_image_alt: null,
					action: "dismiss",
					action_label: "Got it"
				}
			])
		});
	});
	await seed(page, { origin: newOrigin, signedIn: true, settings: { onboardingCompleted: "true" } });
	await page.goto(newOrigin);
	await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
	await page.locator(".navbar-tab").filter({ hasText: "Settings" }).first().click();
	await page.locator('[data-settings-target="data"]').click();
	await page.locator("#btn-import-data").click();
	await expect(page.locator("#takeout-import-sheet")).toBeVisible();
	const receiptsLoaded = page.waitForResponse((response) =>
		new URL(response.url()).pathname.endsWith("/announcement_receipts")
	);
	releaseAnnouncement();
	await (await receiptsLoaded).finished();
	// Allow the real fetch continuation and presentation attempt to finish while the sheet is open.
	await page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
	);
	const announcement = page.getByRole("dialog", { name: "Ready after import" });
	await expect(announcement).toBeHidden();
	await page.locator("#btn-takeout-import-close").click();
	await expect(
		announcement,
		"Closing the sheet must resume the pending announcement without a refresh"
	).toBeVisible();
	await expect(page.locator("#takeout-import-sheet")).toBeHidden();
	await announcement.getByRole("button", { name: "Got it" }).click();
	await expect(announcement).toBeHidden();
});

test("eligible announcements render optional hero media and advance through app actions", async ({ page }) => {
	const receiptWrites: Array<Record<string, string>> = [];

	await stubExternalTraffic(page, []);
	await page.route("https://hglcltvwunzynnzduauy.supabase.co/rest/v1/**", async (route) => {
		const url = new URL(route.request().url());
		const table = url.pathname.split("/").at(-1);

		if (table === "announcements" && route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: { "access-control-allow-origin": "*" },
				body: JSON.stringify([
					{
						id: "announcement-1",
						key: "max-unlimited-2026",
						title: "Max is now unlimited",
						body: "Your Max plan no longer has a monthly usage limit.",
						hero_image_url:
							"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='360'%3E%3Crect width='800' height='360' fill='%23614a3a'/%3E%3C/svg%3E",
						hero_image_alt: "A warm abstract illustration",
						action_label: "Next",
						action: "next"
					},
					{
						id: "announcement-2",
						key: "second-announcement",
						title: "Ready when you are",
						body: "There is nothing else you need to configure.",
						hero_image_url: null,
						hero_image_alt: null,
						action_label: "Got it",
						action: "dismiss"
					}
				])
			});
			return;
		}

		if (table === "announcement_receipts" && route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: { "access-control-allow-origin": "*" },
				body: "[]"
			});
			return;
		}

		if (table === "announcement_receipts" && route.request().method() === "POST") {
			receiptWrites.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, string>);
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				headers: { "access-control-allow-origin": "*" },
				body: "[]"
			});
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: "application/json",
			headers: { "access-control-allow-origin": "*" },
			body: "[]"
		});
	});
	await seedLocalSettings(page);
	await page.goto("/");

	await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
	await page.evaluate(() => {
		window.dispatchEvent(
			new CustomEvent("auth-state-changed", {
				detail: {
					loggedIn: true,
					session: { user: { id: "user-1" } }
				}
			})
		);
	});

	const modal = page.getByRole("dialog", { name: "Max is now unlimited" });
	await expect(modal).toBeVisible();
	await expect(modal.locator("#targeted-announcement-image")).toBeVisible();
	await expect(modal.getByRole("button", { name: "Next" })).toBeVisible();

	await modal.getByRole("button", { name: "Next" }).click();
	await expect(page.getByRole("dialog", { name: "Ready when you are" })).toBeVisible();
	await expect(page.locator("#targeted-announcement-hero")).toHaveClass(/hidden/);

	await page.getByRole("button", { name: "Got it" }).click();
	await expect(page.locator("#targeted-announcement")).toBeHidden();
	await expect
		.poll(() => receiptWrites)
		.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					announcement_id: "announcement-1",
					user_id: "user-1",
					seen_at: expect.any(String)
				}),
				expect.objectContaining({
					announcement_id: "announcement-1",
					user_id: "user-1",
					actioned_at: expect.any(String),
					dismissed_at: expect.any(String)
				}),
				expect.objectContaining({
					announcement_id: "announcement-2",
					user_id: "user-1",
					seen_at: expect.any(String)
				}),
				expect.objectContaining({
					announcement_id: "announcement-2",
					user_id: "user-1",
					actioned_at: expect.any(String),
					dismissed_at: expect.any(String)
				})
			])
		);
});

test("announcement waits for the cloud sync unlock flow to settle", async ({ page }) => {
	const userId = "00000000-0000-4000-8000-000000000199";
	const priceId = "price_1SOU2lKcI9PDo3JBhsT8URS9";
	const response = (body: unknown, status = 200) => ({
		status,
		contentType: "application/json",
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
			"access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS"
		},
		body: JSON.stringify(body)
	});

	await stubExternalTraffic(page, []);
	await page.route("https://hglcltvwunzynnzduauy.supabase.co/**/*", async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;

		if (request.method() === "OPTIONS") {
			await route.fulfill(response({}));
			return;
		}
		if (path === "/auth/v1/user") {
			await route.fulfill(
				response({
					id: userId,
					email: "announcements@example.test",
					aud: "authenticated",
					role: "authenticated",
					app_metadata: {},
					user_metadata: {},
					created_at: "2026-01-01T00:00:00.000Z"
				})
			);
			return;
		}
		if (path === "/functions/v1/refresh-subscription-allowances") {
			await route.fulfill(response({ ok: true }));
			return;
		}
		if (path.startsWith("/rest/v1/profiles")) {
			await route.fulfill(
				response({ avatar: "", preferredName: "Announcement Tester", systemPromptAddition: "" })
			);
			return;
		}
		if (path.startsWith("/rest/v1/user_subscriptions")) {
			await route.fulfill(
				response({
					user_id: userId,
					status: "active",
					price_id: priceId,
					current_period_end: "2026-12-31T00:00:00.000Z",
					cancel_at_period_end: false,
					stripe_customer_id: "cus_announcement_test"
				})
			);
			return;
		}
		if (path.startsWith("/rest/v1/image_generations")) {
			await route.fulfill(response({ user_id: userId, remaining_image_generations: 10 }));
			return;
		}
		if (path.startsWith("/rest/v1/image_sub_allowance")) {
			await route.fulfill(response({ remaining_image_generations: 0 }));
			return;
		}
		if (path.startsWith("/rest/v1/user_sync_preferences")) {
			await route.fulfill(
				response({
					sync_enabled: true,
					encryption_salt: "00",
					key_verification: "00",
					key_verification_iv: "00"
				})
			);
			return;
		}
		if (path.startsWith("/rest/v1/user_sync_quotas")) {
			await route.fulfill(response({ storage_used_bytes: 0, storage_quota_bytes: 10 * 1024 * 1024 }));
			return;
		}
		if (path.startsWith("/rest/v1/announcements")) {
			await route.fulfill(
				response([
					{
						id: "sync-gated-announcement",
						key: "sync-gated-announcement",
						title: "Shown after unlock",
						body: "This should wait for the sync decision.",
						hero_image_url: null,
						hero_image_alt: null,
						action_label: "Got it",
						action: "dismiss"
					}
				])
			);
			return;
		}
		if (path.startsWith("/rest/v1/announcement_receipts")) {
			await route.fulfill(response([], request.method() === "POST" ? 201 : 200));
			return;
		}

		await route.fulfill(response({}));
	});
	await seedLocalSettings(page);
	await page.addInitScript(
		({ id, subscriptionPriceId }) => {
			localStorage.setItem("zodiac-sync-prompt-seen", "true");
			localStorage.setItem(
				"sb-hglcltvwunzynnzduauy-auth-token",
				JSON.stringify({
					access_token: "playwright-access-token",
					refresh_token: "playwright-refresh-token",
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					expires_in: 3600,
					token_type: "bearer",
					user: {
						id,
						email: "announcements@example.test",
						aud: "authenticated",
						role: "authenticated",
						app_metadata: {},
						user_metadata: {},
						subscriptionPriceId
					}
				})
			);
		},
		{ id: userId, subscriptionPriceId: priceId }
	);
	await page.goto("/");

	await page.evaluate(
		({ id, subscriptionPriceId }) => {
			window.dispatchEvent(
				new CustomEvent("auth-state-changed", {
					detail: {
						loggedIn: true,
						session: { user: { id } },
						subscription: {
							user_id: id,
							status: "active",
							price_id: subscriptionPriceId
						}
					}
				})
			);
		},
		{ id: userId, subscriptionPriceId: priceId }
	);

	await expect(page.locator("#sync-modal")).toBeVisible();
	await expect(page.getByRole("dialog", { name: "Shown after unlock" })).toBeHidden();

	await page.locator("#btn-sync-skip").click();

	await expect(page.locator("#sync-modal")).toBeHidden();
	await expect(page.getByRole("dialog", { name: "Shown after unlock" })).toBeVisible();
});

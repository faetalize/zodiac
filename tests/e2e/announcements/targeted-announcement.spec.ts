import { expect, test } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

test("debug composer saves a one-time announcement for the next refresh", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await page.route("https://example.test/announcement.svg", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="360"><rect width="800" height="360" fill="#614a3a"/></svg>'
		});
	});
	await seedLocalSettings(page);
	await page.goto("/");

	await page.locator(".navbar-tab").nth(2).click();
	await page.locator("#btn-debug-announcement").click();

	const form = page.locator("#form-debug-announcement");
	await expect(form).toBeVisible();
	await form.locator("#debug-announcement-title").fill("A preview announcement");
	await form.locator("#debug-announcement-body").fill("This message should appear after refresh.");
	await form.locator("#debug-announcement-hero-url").fill("https://example.test/announcement.svg");
	await form.locator("#debug-announcement-hero-alt").fill("A brown preview image");
	await form.locator("#debug-announcement-action").selectOption("next");
	await form.locator("#debug-announcement-action-label").fill("Continue");
	await form.getByRole("button", { name: "Save for next refresh" }).click();

	await expect(form).toBeHidden();
	await expect
		.poll(() =>
			page.evaluate(() => {
				const stored = localStorage.getItem("debug-announcement-preview");
				return stored ? JSON.parse(stored) : null;
			})
		)
		.toEqual(
			expect.objectContaining({
				title: "A preview announcement",
				body: "This message should appear after refresh.",
				heroImageUrl: "https://example.test/announcement.svg",
				heroImageAlt: "A brown preview image",
				action: "next",
				actionLabel: "Continue"
			})
		);

	await page.reload();

	const announcement = page.getByRole("dialog", { name: "A preview announcement" });
	await expect(announcement).toBeVisible();
	await expect(announcement).toContainText("This message should appear after refresh.");
	await expect(announcement.locator("#targeted-announcement-image")).toHaveAttribute("alt", "A brown preview image");
	await expect(announcement.getByRole("button", { name: "Continue" })).toBeVisible();
	await expect.poll(() => page.evaluate(() => localStorage.getItem("debug-announcement-preview"))).not.toBeNull();

	await page.reload();
	await expect(page.getByRole("dialog", { name: "A preview announcement" })).toBeVisible();

	await page.getByRole("button", { name: "Continue" }).click();
	await expect(page.locator("#targeted-announcement")).toBeHidden();
	await expect.poll(() => page.evaluate(() => localStorage.getItem("debug-announcement-preview"))).toBeNull();
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
						body: "Your Max plan now includes unlimited text and image generation.",
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

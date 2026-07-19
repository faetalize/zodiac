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

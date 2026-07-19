import { expect, test } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

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

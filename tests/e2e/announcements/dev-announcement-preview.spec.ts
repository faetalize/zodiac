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
	await page.goto("/?migration=empty");

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

import { expect, test, type Page } from "@playwright/test";
import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

async function openSubscriptionOverlay(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const overlayService = await importModule("/services/Overlay.service.ts");
		overlayService.show("form-subscription");
	});
}

test("keeps subscription plan cards within the pricing panel on mobile", async ({ page }) => {
	await page.setViewportSize({ width: 496, height: 961 });
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");

	await openSubscriptionOverlay(page);

	const shell = page.locator("#form-subscription .subscription-shell");
	await expect(shell).toBeVisible();
	const firstCard = page.locator("#profile-free-card");
	await expect(firstCard).toHaveClass(/subscription-card-collapsed/);
	const collapsedPadding = await firstCard.evaluate((card) => getComputedStyle(card).padding);

	await firstCard.locator(".subscription-card-header").click();
	await expect(firstCard).toHaveClass(/subscription-card-expanded/);
	expect(await firstCard.evaluate((card) => getComputedStyle(card).padding)).toBe(collapsedPadding);

	await firstCard.hover();
	expect(await firstCard.evaluate((card) => getComputedStyle(card).transform)).toBe("none");

	const layout = await page.evaluate(() => {
		const content = document.querySelector<HTMLElement>("#overlay > .overlay-content");
		const shell = document.querySelector<HTMLElement>("#form-subscription .subscription-shell");
		const cards = Array.from(document.querySelectorAll<HTMLElement>("#form-subscription .subscription-plan"));

		if (!content || !shell) throw new Error("Missing subscription layout elements");

		const shellBounds = shell.getBoundingClientRect();
		return {
			hasHorizontalOverflow: content.scrollWidth > content.clientWidth || shell.scrollWidth > shell.clientWidth,
			cardsFit: cards.every((card) => {
				const bounds = card.getBoundingClientRect();
				return bounds.left >= shellBounds.left && bounds.right <= shellBounds.right;
			})
		};
	});

	expect(layout.cardsFit, "Subscription cards should not be clipped by the pricing panel").toBe(true);
	expect(layout.hasHorizontalOverflow, "Subscription pricing should not overflow horizontally").toBe(false);
});

test("keeps the best-value badge compact and credit cards side by side on mobile", async ({ page }) => {
	await page.setViewportSize({ width: 496, height: 961 });
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await openSubscriptionOverlay(page);

	const proPlusCard = page.locator("#profile-pro-plus-card");
	const badge = proPlusCard.locator(".popular-badge");
	const collapsedBadgeStyle = await badge.evaluate((element) => {
		const style = getComputedStyle(element);
		return { fontSize: style.fontSize, padding: style.padding };
	});

	await proPlusCard.locator(".subscription-card-header").click();
	await expect(proPlusCard).toHaveClass(/subscription-card-expanded/);
	expect(await badge.evaluate((element) => getComputedStyle(element).fontSize)).toBe(collapsedBadgeStyle.fontSize);
	expect(await badge.evaluate((element) => getComputedStyle(element).padding)).toBe(collapsedBadgeStyle.padding);

	const statColumns = await proPlusCard
		.locator(".subscription-stat-grid")
		.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
	expect(statColumns, "Credit cards should remain side by side on mobile").toBe(2);
});

test("renders FAQ questions in one column at desktop widths", async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 1000 });
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await openSubscriptionOverlay(page);

	const faqColumns = await page
		.locator("#form-subscription .subscription-faq-grid")
		.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
	expect(faqColumns, "FAQ questions should not be displayed side by side").toBe(1);
});

test("presents Max text and image generation as unlimited", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await openSubscriptionOverlay(page);

	const stats = page.locator("#profile-max-card .subscription-stat");
	await expect(stats.nth(0).locator(".subscription-stat-label")).toHaveText("Mega Credits");
	await expect(stats.nth(0).locator("strong")).toHaveText("Unlimited");
	await expect(stats.nth(1).locator(".subscription-stat-label")).toHaveText("Image Credits");
	await expect(stats.nth(1).locator("strong")).toHaveText("Unlimited");
	await expect(page.locator("#profile-max-card")).toContainText("Unlimited access to Claude Opus, GPT SOL, and more");
});

test("plans use their own close button instead of the overlay back bar", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await openSubscriptionOverlay(page);

	await expect(page.locator("#overlay > .header")).toBeHidden();
	const closeButton = page.getByRole("button", { name: "Close plans" });
	await expect(closeButton).toBeVisible();

	await closeButton.click();
	await expect(page.locator("#overlay")).toHaveClass(/hidden/);
});

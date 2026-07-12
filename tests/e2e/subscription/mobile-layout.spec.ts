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

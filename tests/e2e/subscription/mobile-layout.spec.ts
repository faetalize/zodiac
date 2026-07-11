import { expect, test } from "@playwright/test";
import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

test("keeps subscription plan cards within the pricing panel on mobile", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");

	await page.locator("#overlay, #form-subscription").evaluateAll((elements) => {
		for (const element of elements) {
			element.classList.remove("hidden");
			(element as HTMLElement).style.opacity = "1";
		}
	});

	const shell = page.locator("#form-subscription .subscription-shell");
	await expect(shell).toBeVisible();

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

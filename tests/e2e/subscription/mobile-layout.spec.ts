import { expect, test, type Page } from "@playwright/test";
import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

async function openSubscriptionOverlay(page: Page): Promise<void> {
	await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const overlayService = await importModule("/services/Overlay.service.ts");
		overlayService.show("form-subscription");
	});
	await expect(page.locator("#form-subscription")).toBeVisible();
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
	const freePriceFillsCard = await firstCard.locator(".subscription-price-stack").evaluate((price) => {
		const card = price.closest<HTMLElement>(".subscription-card");
		if (!card) throw new Error("Missing Free card");
		const cardStyle = getComputedStyle(card);
		const availableWidth =
			card.clientWidth - Number.parseFloat(cardStyle.paddingLeft) - Number.parseFloat(cardStyle.paddingRight);
		return price.getBoundingClientRect().width >= availableWidth - 1;
	});
	expect(freePriceFillsCard, "Free card price panel should fill the available width").toBe(true);

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

test("marks Max as limited edition and keeps paid-plan summaries compact on mobile", async ({ page }) => {
	await page.setViewportSize({ width: 496, height: 961 });
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await openSubscriptionOverlay(page);

	const maxCard = page.locator("#profile-max-card");
	const limitedBadge = maxCard.locator(".popular-badge-limited");
	await expect(limitedBadge).toHaveText("LIMITED EDITION");
	await expect(limitedBadge).toHaveClass(/popular-badge/);
	await expect(maxCard).toContainText("Available to new subscribers for a limited time");
	await expect(maxCard).toContainText("Keep Max and this price while continuously subscribed");
	await expect(maxCard).toContainText("Cancel or switch plans, and Max won't be available again");

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

	for (const cardId of ["profile-pro-card", "profile-pro-plus-card", "profile-max-card"]) {
		const card = page.locator(`#${cardId}`);
		if (cardId !== "profile-pro-plus-card") {
			await card.locator(".subscription-card-header").click();
		}
		await expect(card).toHaveClass(/subscription-card-expanded/);

		const summaryLayout = await card.locator(".subscription-plan-summary").evaluate((summary) => {
			const price = summary.querySelector<HTMLElement>(".subscription-price-stack");
			const stats = summary.querySelector<HTMLElement>(".subscription-stat-grid");
			if (!price || !stats) throw new Error("Missing paid-plan summary elements");

			const priceBounds = price.getBoundingClientRect();
			const statsBounds = stats.getBoundingClientRect();
			return {
				priceBeforeStats: priceBounds.right <= statsBounds.left,
				statColumns: getComputedStyle(stats).gridTemplateColumns.split(" ").length,
				statRows: getComputedStyle(stats).gridTemplateRows.split(" ").length
			};
		});

		expect(summaryLayout.priceBeforeStats, `${cardId} should place credits beside the price`).toBe(true);
		expect(summaryLayout.statColumns, `${cardId} credits should use one column`).toBe(1);
		expect(summaryLayout.statRows, `${cardId} credits should stack vertically`).toBe(2);
	}
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

test("rounds yearly-equivalent subscription prices", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await openSubscriptionOverlay(page);

	await expect(page.locator("#profile-pro-card .price-amount.billing-only-yearly")).toHaveText("$26");
	await expect(page.locator("#profile-pro-plus-card .price-amount.billing-only-yearly")).toHaveText("$92");
	await expect(page.locator("#profile-max-card .price-amount.billing-only-yearly")).toHaveText("$183");
});

test("stacks and centers subscription price periods", async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 1000 });
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");
	await openSubscriptionOverlay(page);

	const priceLayouts = await page.evaluate(() => {
		const visible = (element: Element): boolean => {
			const style = getComputedStyle(element);
			return style.display !== "none" && style.visibility !== "hidden";
		};

		return ["profile-free-card", "profile-pro-card", "profile-pro-plus-card", "profile-max-card"].map((cardId) => {
			const card = document.getElementById(cardId);
			const stack = card?.querySelector<HTMLElement>(".subscription-price-stack");
			const primary = card?.querySelector<HTMLElement>(".subscription-price-line-primary");
			const amount = primary
				? Array.from(primary.querySelectorAll<HTMLElement>(".price-amount")).find(visible)
				: undefined;
			const period = primary
				? Array.from(primary.querySelectorAll<HTMLElement>(".price-period")).find(visible)
				: undefined;

			if (!card || !stack || !primary || !amount || !period) {
				throw new Error(`Missing price layout elements for ${cardId}`);
			}

			const stackBounds = stack.getBoundingClientRect();
			const amountBounds = amount.getBoundingClientRect();
			const periodBounds = period.getBoundingClientRect();
			const groupLeft = Math.min(amountBounds.left, periodBounds.left);
			const groupRight = Math.max(amountBounds.right, periodBounds.right);
			const stackStyle = getComputedStyle(stack);
			const primaryStyle = getComputedStyle(primary);

			return {
				cardId,
				periodBelowAmount: periodBounds.top >= amountBounds.bottom - 1,
				groupCenteredHorizontally:
					Math.abs(groupLeft + (groupRight - groupLeft) / 2 - (stackBounds.left + stackBounds.width / 2)) <=
					1,
				stackAlignItems: stackStyle.alignItems,
				stackJustifyItems: stackStyle.justifyItems,
				stackTextAlign: stackStyle.textAlign,
				primaryFlexDirection: primaryStyle.flexDirection
			};
		});
	});

	for (const layout of priceLayouts) {
		expect(layout.periodBelowAmount, `${layout.cardId} should put /month below the price`).toBe(true);
		expect(layout.primaryFlexDirection, `${layout.cardId} price period should be on its own line`).toBe("column");

		if (layout.cardId === "profile-free-card") {
			expect(layout.stackAlignItems).toBe("flex-start");
			expect(layout.stackJustifyItems).toBe("start");
			expect(layout.groupCenteredHorizontally).toBe(false);
		} else {
			expect(
				layout.groupCenteredHorizontally,
				`${layout.cardId} price group should be horizontally centered`
			).toBe(true);
			expect(layout.stackAlignItems).toBe("center");
			expect(layout.stackJustifyItems).toBe("center");
			expect(layout.stackTextAlign).toBe("center");
		}
	}
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

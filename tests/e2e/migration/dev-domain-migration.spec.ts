import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { serveApp, seed } from "../helpers/migration";

const devServer = "https://127.0.0.1:4175";

for (const origin of ["https://localhost:4175", devServer]) {
	test(`dev migration returns to ${origin} and consumes Import once`, async ({ page }) => {
		await serveApp(page, { server: devServer });
		await seed(page, { origin, chat: true, settings: { onboardingCompleted: "true" } });
		const navigations: string[] = [];
		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) navigations.push(frame.url());
		});
		await page.goto(origin);
		await expect(page.locator("#domain-migration-sheet")).toBeVisible();
		await page.locator("#btn-migration-export").click();
		const downloading = page.waitForEvent("download");
		await page.locator("#btn-takeout-export").click();
		const download = await downloading;
		const bytes = await readFile((await download.path())!);
		await page.locator("#btn-takeout-export-close").click();
		await page.locator("#migration-confirmed").check();
		await page.locator("#btn-migration-continue").click();
		await expect(page.locator("#takeout-import-sheet")).toBeVisible();
		await expect(page).toHaveURL(`${origin}/`);
		expect(navigations).toContain(`${origin}/?migration=takeout-v1`);
		expect(navigations.every((url) => new URL(url).origin === origin)).toBe(true);
		await page
			.locator("#takeout-import-files")
			.setInputFiles({ name: "dev-takeout.json", mimeType: "application/json", buffer: bytes });
		await page.locator("#btn-takeout-import").click();
		await expect(page.locator("#takeout-import-status")).toContainText("Skipped 1 record already present");
		await page.reload();
		await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
		await expect(page.locator("#domain-migration-sheet")).toBeHidden();
		await expect(page.locator("#takeout-import-sheet")).toBeHidden();
		await expect(page).toHaveURL(`${origin}/`);
		await page.locator(".navbar-tab").filter({ hasText: "Settings" }).first().click();
		await page.locator("#debug-section").getByRole("button", { name: "Test migration", exact: true }).click();
		await expect(page.locator("#domain-migration-sheet")).toBeVisible();
		await expect(page.locator("#btn-migration-continue")).toBeDisabled();
		await page.locator("#migration-confirmed").check();
		await page.locator("#btn-migration-continue").click();
		await expect.poll(() => navigations).toContain(`${origin}/?migration=continue`);
		await expect(page).toHaveURL(`${origin}/`);
		await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
		await expect(page.locator("#takeout-import-sheet")).toBeHidden();
	});
}

test("an empty dev browser returns once to the same origin without a redirect loop", async ({ page }) => {
	await serveApp(page, { server: devServer });
	const arrivals: string[] = [];
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) arrivals.push(frame.url());
	});
	await page.goto(devServer);
	await expect.poll(() => arrivals).toContain(`${devServer}/?migration=empty`);
	await expect(page).toHaveURL(`${devServer}/`);
	await expect(page.locator("#migration-arrival-notice")).toHaveCount(0);
	await page.reload();
	await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
	await expect(page.locator("#domain-migration-sheet")).toBeHidden();
	expect(arrivals.filter((url) => new URL(url).searchParams.get("migration") === "empty")).toHaveLength(1);
	expect(arrivals.every((url) => new URL(url).origin === devServer)).toBe(true);
});

test("enabled Cloud Sync in dev returns to the same origin and retains its session", async ({ page }) => {
	await serveApp(page, { server: devServer, syncEnabled: true });
	await seed(page, { origin: devServer, signedIn: true, settings: { onboardingCompleted: "true" } });
	const arrivals: string[] = [];
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) arrivals.push(frame.url());
	});
	await page.goto(devServer);
	await expect.poll(() => arrivals).toContain(`${devServer}/?migration=cloud`);
	await expect(page).toHaveURL(`${devServer}/`);
	await expect(page.locator("#migration-arrival-notice")).toHaveCount(0);
	await expect(page.locator("#domain-migration-sheet")).toBeHidden();
	expect(arrivals).toContain(`${devServer}/?migration=cloud`);
	expect(arrivals.every((url) => new URL(url).origin === devServer)).toBe(true);
	expect(await page.evaluate(() => localStorage.getItem("sb-hglcltvwunzynnzduauy-auth-token"))).not.toBeNull();
});

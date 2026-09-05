import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { oldOrigin, newOrigin, observeMigrationBeforeRedirect, serveApp, seed } from "../helpers/migration";

test("confirmation can continue with an export to Import or without an export to the normal app", async ({ page }) => {
	await serveApp(page);
	await seed(page, { chat: true, settings: { API_KEY: "test-gemini-key", pinnedChatIds: '["migration-chat"]' } });
	await page.goto(oldOrigin);
	const gate = page.getByRole("dialog", { name: "Zodiac is now Zozo" });
	await expect(gate).toBeVisible();
	await expect(page.locator("#onboarding-overlay")).toBeHidden();
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	await expect(page.locator("#migration-confirmed")).toBeEnabled();
	await page.keyboard.press("Escape");
	await expect(gate).toBeVisible();
	await page.locator("#btn-migration-export").click();
	await expect(page.locator("#takeout-category-apiKeys")).not.toBeChecked();
	await expect(page.locator("#takeout-category-media")).toBeChecked();
	const downloading = page.waitForEvent("download");
	await page.locator("#btn-takeout-export").click();
	const download = await downloading;
	const bytes = await readFile((await download.path())!);
	const takeout = JSON.parse(bytes.toString());
	expect(takeout.source).toBe("local");
	expect(takeout.payload.chats[0].content[0].parts[0].attachments[0].base64).toBe(
		Buffer.from("attachment content").toString("base64")
	);
	expect(takeout.payload.settings.API_KEY).toBeUndefined();
	await page.locator("#btn-takeout-export-close").click();
	await expect(gate).toBeVisible();
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	await page.locator("#migration-confirmed").check();
	await expect(page.locator("#btn-migration-continue")).toBeEnabled();
	await page.locator("#btn-migration-continue").click();
	await expect(page).toHaveURL(`${newOrigin}/`);
	await expect(page.locator("#takeout-import-sheet")).toBeVisible();
	await expect(page.locator("#onboarding-overlay")).toBeHidden();
	await page
		.locator("#takeout-import-files")
		.setInputFiles({ name: "takeout.json", mimeType: "application/json", buffer: bytes });
	await page.locator("#btn-takeout-import").click();
	await expect(page.locator("#takeout-import-status")).toContainText("Imported 1 chat");
	await page.reload();
	await expect(page.locator("#takeout-import-sheet")).toBeHidden();
	// The old origin still holds the original, and a new visit rechecks it.
	await page.goto(oldOrigin);
	await expect(gate).toBeVisible();
	await expect(page.locator("#domain-migration-status")).toBeHidden();
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	expect(await page.evaluate(() => localStorage.getItem("API_KEY"))).toBe("test-gemini-key");
	await page.locator("#migration-confirmed").check();
	await expect(page.locator("#btn-migration-continue")).toBeEnabled();
	await page.locator("#migration-confirmed").uncheck();
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	await page.locator("#migration-confirmed").check();
	await page.locator("#btn-migration-continue").click();
	await expect(page).toHaveURL(`${newOrigin}/`);
	await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
	await expect(page.locator("#takeout-import-sheet")).toBeHidden();
});

test("enabled but locked Cloud Sync redirects without fetching data or showing unlock", async ({ page }) => {
	const requests = await serveApp(page, { syncEnabled: true });
	const migrationPresentations = await observeMigrationBeforeRedirect(page);
	await seed(page, { signedIn: true, chat: true });
	await page.goto(oldOrigin);
	await expect(page).toHaveURL(`${newOrigin}/`);
	await expect(page.locator("#migration-arrival-notice")).toHaveCount(0);
	await expect(page.locator("#takeout-import-sheet")).toBeHidden();
	await expect(page.locator("#sync-modal")).toBeHidden();
	expect(migrationPresentations, "The old-domain migration sheet must never flash before a cloud redirect").toEqual(
		[]
	);
	expect(requests.filter((path) => path.includes("user_synced_"))).toEqual([]);
	expect(requests.filter((path) => path.endsWith("user_sync_preferences"))).toHaveLength(1);
	expect(await page.evaluate(() => localStorage.getItem("sb-hglcltvwunzynnzduauy-auth-token"))).toBeNull();
});

test("migration import respects Cloud Sync already enabled on the destination account", async ({ page }) => {
	await serveApp(page, { syncEnabled: true });
	await page.route("**/rest/v1/user_subscriptions*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				user_id: "11111111-1111-4111-8111-111111111111",
				status: "active",
				price_id: "price_1SOU2lKcI9PDo3JBhsT8URS9",
				current_period_end: "2026-12-31T00:00:00.000Z",
				cancel_at_period_end: false
			})
		});
	});
	await seed(page, { origin: newOrigin, signedIn: true, settings: { onboardingCompleted: "true" } });
	await seed(page, { chat: true });
	await page.goto(oldOrigin);
	await page.locator("#btn-migration-export").click();
	const downloading = page.waitForEvent("download");
	await page.locator("#btn-takeout-export").click();
	const download = await downloading;
	const bytes = await readFile((await download.path())!);
	await page.locator("#btn-takeout-export-close").click();
	await page.locator("#migration-confirmed").check();
	await page.locator("#btn-migration-continue").click();
	await expect(page.locator("#takeout-import-sheet")).toBeVisible();
	await expect(
		page.locator("#takeout-destination-local"),
		"Migration must not offer local import for a synced account"
	).toBeDisabled();
	await expect(page.locator("#takeout-destination-cloud")).toBeChecked();
	await expect(page.locator("#sync-modal")).toBeHidden();
	await page
		.locator("#takeout-import-files")
		.setInputFiles({ name: "takeout.json", mimeType: "application/json", buffer: bytes });
	await page.locator("#btn-takeout-import").click();
	await expect(page.locator("#takeout-import-status")).toContainText("Set up or unlock Cloud Sync");
	const destination = await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path)");
		const { db } = await importModule("/services/Db.service.ts");
		const sync = await importModule("/services/Sync.service.ts");
		return { syncEnabled: sync.isOnlineSyncEnabled(), localChats: await db.chats.count() };
	});
	expect(destination).toEqual({ syncEnabled: true, localChats: 0 });
	await page.locator("#btn-takeout-prepare-cloud").click();
	await expect(page.locator("#sync-modal")).toBeVisible();
	await expect(page.locator("#sync-password-confirm")).toBeHidden();
});

test("disabled sync still protects local data even when old encrypted cloud data exists", async ({ page }) => {
	await serveApp(page, { syncEnabled: false });
	await seed(page, { signedIn: true, chat: true, settings: { onboardingCompleted: "true" } });
	await page.goto(oldOrigin);
	await expect(page.locator("#btn-migration-export")).toBeEnabled();
	await expect(page.locator("#sync-modal")).toBeHidden();
	await expect(page).toHaveURL(`${oldOrigin}/`);
	await page.locator("#btn-migration-export").click();
	await expect(page.locator("#takeout-export-source")).toContainText("this browser");
});

test("a failed preference check offers retry and cannot redirect as empty", async ({ page }) => {
	const source = { syncEnabled: false, failPreference: true };
	await serveApp(page, source);
	await seed(page, { signedIn: true, chat: true });
	await page.goto(oldOrigin);
	await expect(page.locator("#domain-migration-status")).toContainText(
		/Unable to check whether Cloud Sync|data check took too long/,
		{ timeout: 20_000 }
	);
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	await expect(page.locator("#btn-migration-export")).toBeDisabled();
	source.failPreference = false;
	await page.locator("#btn-migration-retry").click();
	await expect(page.locator("#btn-migration-export")).toBeEnabled();
});

test("the transition cannot be dismissed into the old app, including with a legacy Stay flag", async ({ page }) => {
	await serveApp(page);
	await seed(page, { chat: true, settings: { onboardingCompleted: "true" } });
	await page.evaluate(() => sessionStorage.setItem("zozo-migration-dismissed", "true"));
	await page.goto(oldOrigin);
	await expect(page.locator("#btn-migration-export")).toBeEnabled();
	await expect(page.locator("#btn-migration-stay")).toHaveCount(0);
	await page.keyboard.press("Escape");
	await page.locator("#surface-plane").click({ position: { x: 4, y: 4 } });
	await expect(page.locator("#domain-migration-sheet")).toBeVisible();
	await page.locator("#btn-migration-export").click();
	await page.locator("#btn-takeout-export-close").click();
	await expect(page.locator("#domain-migration-sheet")).toBeVisible();
	await expect(page.locator("#main-container")).toHaveAttribute("inert", "");
	await expect(page.locator("#debug-section")).toBeHidden();
	await expect(page.locator("#btn-debug-migration")).toBeHidden();
	await expect(page.locator("#btn-resume-migration")).toHaveCount(0);
	await page.reload();
	await expect(page.locator("#domain-migration-sheet")).toBeVisible();
});

test("a fresh browser and runtime-only storage redirect without a takeout", async ({ page }) => {
	await serveApp(page);
	const migrationPresentations = await observeMigrationBeforeRedirect(page);
	await seed(page, {
		settings: {
			onboardingCompleted: "true",
			syncPromptSeen: "true",
			pinnedChatIds: "[]",
			loras: "[]",
			roleplayCustomActions: "[]",
			"debug-announcement-preview": "{}"
		}
	});
	await page.goto(oldOrigin);
	await expect(page).toHaveURL(`${newOrigin}/`);
	await expect(page.locator("#migration-arrival-notice")).toHaveCount(0);
	await expect(page.locator("#takeout-import-sheet")).toBeHidden();
	expect(
		migrationPresentations,
		"The old-domain migration sheet must never flash before an empty-browser redirect"
	).toEqual([]);
});

for (const hostname of [
	"chat.zozo.sh",
	"preview.zodiac.faetalize.dev",
	"zodiac.faetalize.dev.example.test",
	"preview.example.test",
	"localhost",
	"127.0.0.1"
]) {
	test(`the old-domain gate does not run on ${hostname}`, async ({ page }) => {
		await serveApp(page);
		const origin = `https://${hostname}`;
		await seed(page, { origin, settings: { API_KEY: "local-test-key", onboardingCompleted: "true" } });
		await page.goto(origin);
		await expect(page.locator("#main-container")).toHaveAttribute("aria-busy", "false");
		await expect(page.locator("#domain-migration-sheet")).toBeHidden();
		await expect(page.locator("#takeout-import-sheet")).toBeHidden();
		await expect(page).toHaveURL(`${origin}/`);
	});
}

test("narrow-screen keyboard flow keeps focus inside and Escape does not continue", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await serveApp(page);
	await seed(page, { settings: { "theme-settings": '{"colorTheme":"purple","mode":"dark","preference":"manual"}' } });
	await page.goto(oldOrigin);
	await expect(page.locator("#btn-migration-export")).toBeEnabled();
	await page.screenshot({ path: "test-results/migration-mobile.png", fullPage: true });
	await page.locator("#migration-confirmed").focus();
	await page.keyboard.press("Tab");
	await expect(page.locator("#domain-migration-description a")).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(page.locator("#migration-confirmed")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(page.locator("#domain-migration-sheet")).toBeVisible();
	const bounds = await page.locator("#domain-migration-sheet").boundingBox();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test("unreadable local storage stays recoverable and is never classified as empty", async ({ page }) => {
	await serveApp(page);
	await seed(page);
	await page.addInitScript(() => {
		const read = Storage.prototype.getItem;
		Storage.prototype.getItem = function (key) {
			if (key === "loras" && !sessionStorage.getItem("test-storage-recovered"))
				throw new DOMException("Storage unavailable", "SecurityError");
			return read.call(this, key);
		};
	});
	await page.goto(oldOrigin);
	await expect(page.locator("#domain-migration-status")).toContainText("Storage unavailable");
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	await page.evaluate(() => {
		sessionStorage.setItem("test-storage-recovered", "true");
		localStorage.setItem("OPENROUTER_API_KEY", "recovered-key");
	});
	await page.locator("#btn-migration-retry").click();
	await expect(page.locator("#btn-migration-export")).toBeEnabled();
	await expect(page.locator("#domain-migration-status")).toBeHidden();
});

test("export failure and cancellation do not reset confirmation or change source records", async ({ page }) => {
	await serveApp(page);
	await seed(page, { chat: true });
	await page.addInitScript(() => {
		const click = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function () {
			if (this.download && !sessionStorage.getItem("test-allow-download"))
				throw new Error("Download was blocked");
			return click.call(this);
		};
	});
	await page.goto(oldOrigin);
	await expect(page.locator("#btn-migration-export")).toBeEnabled();
	await page.screenshot({ path: "test-results/migration-desktop.png", fullPage: true });
	await page.locator("#btn-migration-export").click();
	await page.locator("#btn-takeout-export").click();
	await expect(page.locator("#takeout-export-status")).toContainText("Download was blocked");
	await page.locator("#btn-takeout-export-close").click();
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	await expect(page.locator("#migration-confirmed")).toBeEnabled();
	await page.evaluate(() => sessionStorage.setItem("test-allow-download", "true"));
	await page.locator("#btn-migration-export").click();
	const downloading = page.waitForEvent("download");
	await page.locator("#btn-takeout-export").click();
	await downloading;
	await page.locator("#btn-takeout-export-close").click();
	await page.locator("#migration-confirmed").check();
	await expect(page.locator("#btn-migration-continue")).toBeEnabled();
	// Export actions do not revoke the user's independent confirmation.
	await page.locator("#btn-migration-export").click();
	await page.locator("#btn-takeout-export-close").click();
	await expect(page.locator("#btn-migration-continue")).toBeEnabled();
	const record = await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path)");
		const { db } = await importModule("/services/Db.service.ts");
		return await db.chats.get("migration-chat");
	});
	expect(record.content[0].parts[0].text).toBe("Keep this story");
});

test("an unresolved media item fails export but leaves confirmation available", async ({ page }) => {
	await serveApp(page);
	await seed(page, { chat: true });
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path)");
		const { db } = await importModule("/services/Db.service.ts");
		const chat = await db.chats.get("migration-chat");
		chat.content[0].generatedImages = [
			{ base64: "", mimeType: "image/png", _blobRef: { blobId: "unavailable-media" } }
		];
		await db.chats.put(chat);
	});
	await page.goto(oldOrigin);
	await page.locator("#btn-migration-export").click();
	await page.locator("#btn-takeout-export").click();
	await expect(page.locator("#takeout-export-status")).toContainText("unresolved cloud blob reference");
	await page.locator("#btn-takeout-export-close").click();
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	await page.locator("#migration-confirmed").check();
	await expect(page.locator("#btn-migration-continue")).toBeEnabled();
	await page.locator("#migration-confirmed").uncheck();
	await page.locator("#btn-migration-export").click();
	await page.locator("#takeout-category-media").uncheck();
	const downloading = page.waitForEvent("download");
	await page.locator("#btn-takeout-export").click();
	const download = await downloading;
	const takeout = JSON.parse(await readFile((await download.path())!, "utf8"));
	expect(takeout.manifest.omittedCategories).toContain("media");
	await page.locator("#btn-takeout-export-close").click();
	await expect(page.locator("#domain-migration-status")).toBeHidden();
	await page.locator("#migration-confirmed").check();
	await expect(page.locator("#btn-migration-continue")).toBeEnabled();
});

test("cancelling during attachment reading starts no download and confirmation still allows continuing", async ({
	page
}) => {
	await serveApp(page);
	await seed(page, { chat: true });
	await page.addInitScript(() => {
		const read = FileReader.prototype.readAsDataURL;
		FileReader.prototype.readAsDataURL = function (file) {
			const resume = () => read.call(this, file);
			window.addEventListener("test-finish-attachment-read", resume, { once: true });
		};
	});
	let downloads = 0;
	page.on("download", () => downloads++);
	await page.goto(oldOrigin);
	await page.locator("#btn-migration-export").click();
	await page.locator("#btn-takeout-export").click();
	await expect(page.locator("#takeout-export-status")).toContainText("Building takeout");
	await page.locator("#btn-takeout-export-cancel").click();
	await page.evaluate(() => window.dispatchEvent(new Event("test-finish-attachment-read")));
	await expect(page.locator("#takeout-export-status")).toContainText("Export canceled");
	await page.locator("#btn-takeout-export-close").click();
	await expect(page.locator("#btn-migration-continue")).toBeDisabled();
	expect(downloads).toBe(0);
	await page.locator("#migration-confirmed").check();
	await expect(page.locator("#btn-migration-continue")).toBeEnabled();
});

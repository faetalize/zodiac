import { expect, test, type Page } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

async function addRoleplayPersona(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const personalityService = await importModule("/services/Personality.service.ts");

		await personalityService.add(
			{
				name: "Playwright Roleplay",
				image: "https://example.com/roleplay.png",
				description: "A persona used for roleplay composer testing.",
				prompt: "Keep responses flirtatious and concise.",
				aggressiveness: 50,
				sensuality: 50,
				independence: 50,
				nsfw: false,
				internetEnabled: false,
				roleplayEnabled: true,
				toneExamples: [],
				tags: [],
				category: "character"
			},
			"roleplay-test"
		);
	});
}

async function readRoleplayComposerState(page: Page): Promise<{
	composerHidden: boolean;
	messageBoxActive: boolean;
	buttonToggled: boolean;
	buttonHidden: boolean;
	sendTitle: string;
}> {
	return await page.evaluate(() => {
		const composer = document.querySelector<HTMLElement>("#roleplay-composer");
		const messageBox = document.querySelector<HTMLElement>("#message-box");
		const button = document.querySelector<HTMLElement>("#btn-roleplay");
		const sendButton = document.querySelector<HTMLButtonElement>("#btn-send");

		return {
			composerHidden: composer?.classList.contains("hidden") ?? true,
			messageBoxActive: messageBox?.classList.contains("roleplay-composer-active") ?? false,
			buttonToggled: button?.classList.contains("btn-toggled") ?? false,
			buttonHidden: button?.classList.contains("hidden") ?? true,
			sendTitle: sendButton?.title ?? ""
		};
	});
}

test("roleplay button toggles the composer UI off and on for a roleplay persona", async ({ page }) => {
	await stubExternalTraffic(page, [
		{
			text: '{"options":["Stay close.","Tell me more.","Not so fast.","Prove it."]}'
		},
		{
			text: '{"options":["Stay close.","Tell me more.","Not so fast.","Prove it."]}'
		}
	]);
	await seedLocalSettings(page);
	await page.goto("/");
	await page.locator(".navbar-tab").nth(1).click();

	await addRoleplayPersona(page);
	await expect(page.locator("#personality-roleplay-test")).toContainText("Playwright Roleplay");
	await page.locator("#personality-roleplay-test").click();

	await expect
		.poll(async () => await readRoleplayComposerState(page))
		.toEqual({
			composerHidden: false,
			messageBoxActive: true,
			buttonToggled: true,
			buttonHidden: false,
			sendTitle: "Send current roleplay composition"
		});

	await page.locator("#btn-roleplay").click();

	await expect
		.poll(async () => await readRoleplayComposerState(page))
		.toEqual({
			composerHidden: true,
			messageBoxActive: false,
			buttonToggled: false,
			buttonHidden: false,
			sendTitle: ""
		});

	await page.locator("#btn-roleplay").click();

	await expect
		.poll(async () => await readRoleplayComposerState(page))
		.toEqual({
			composerHidden: false,
			messageBoxActive: true,
			buttonToggled: true,
			buttonHidden: false,
			sendTitle: "Send current roleplay composition"
		});

	await expect(page.locator(".roleplay-suggestion")).toHaveCount(4);
});

test("mobile adaptive sheet handle drags the roleplay action editor closed", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await stubExternalTraffic(page, [
		{
			text: '{"options":["Stay close.","Tell me more.","Not so fast.","Prove it."]}'
		}
	]);
	await seedLocalSettings(page);
	await page.goto("/");

	await addRoleplayPersona(page);
	await page.evaluate(() => {
		document.querySelector<HTMLInputElement>("#personality-roleplay-test input[name='personality']")?.click();
	});
	await page.locator('[data-roleplay-tab="actions"]').click();
	await page.locator('[data-roleplay-add-action-toggle="true"]').click();

	const sheet = page.locator("#modal-roleplay-add");
	const handle = page.locator(".adaptive-sheet__handle");
	await expect(sheet).toBeVisible();
	await expect(handle).toBeVisible();
	const viewportHeight = page.viewportSize()?.height ?? 844;
	await expect
		.poll(async () => (await handle.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
		.toBeLessThan(viewportHeight);

	const handleBox = await handle.boundingBox();
	expect(handleBox).not.toBeNull();
	if (!handleBox) return;

	await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 140, { steps: 6 });
	await page.mouse.up();

	await expect(sheet).toBeHidden();
});

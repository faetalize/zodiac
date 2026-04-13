import { expect, test, type Page } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

async function countPersonasByName(page: Page, name: string): Promise<number> {
	return await page.evaluate(async (personaName) => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const dbService = await importModule("/services/Db.service.ts");
		const personas = await dbService.db.personalities.toArray();
		return personas.filter((persona: { name?: string }) => persona.name === personaName).length;
	}, name);
}

async function readAttachmentInputState(page: Page): Promise<{ names: string[]; previewNames: string[] }> {
	return await page.evaluate(() => {
		const input = document.querySelector<HTMLInputElement>("#attachments");
		const previewNames = Array.from(
			document.querySelectorAll<HTMLElement>("#attachment-preview .attachment-container")
		)
			.map((element) => {
				return (
					element.querySelector<HTMLElement>(".attachment-name")?.textContent ??
					element.querySelector<HTMLImageElement>("img")?.alt ??
					""
				);
			})
			.filter(Boolean);

		return {
			names: Array.from(input?.files || []).map((file) => file.name),
			previewNames
		};
	});
}

async function dispatchAttachmentDrop(
	page: Page,
	files: Array<{ name: string; mimeType: string; contents: string }>
): Promise<void> {
	const dataTransfer = await page.evaluateHandle((filesForDrop) => {
		const transfer = new DataTransfer();
		for (const file of filesForDrop) {
			transfer.items.add(new File([file.contents], file.name, { type: file.mimeType }));
		}
		return transfer;
	}, files);

	await page.locator("#message-box").dispatchEvent("drop", { dataTransfer });
}

test("app boots successfully", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");

	await expect(page.locator("#btn-new-chat")).toBeVisible();
	await expect(page.locator("#messageInput")).toBeVisible();
	await expect(page.locator("#btn-send")).toBeVisible();
	await expect(page.locator(".navbar-tab").first()).toContainText("Chats");
});

test("user creates a persona", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");

	await page.locator(".navbar-tab").nth(1).click();
	await expect(page.locator("#btn-add-personality")).toBeVisible();

	await page.locator("#btn-add-personality").click();
	await expect(page.locator("#modal-add-persona")).toBeVisible();
	await page.locator(".add-persona-local-btn").click();

	const form = page.locator("#form-add-personality");
	await expect(form).toBeVisible();
	await form.locator('input[name="name"]').fill("Playwright Persona");
	await form.locator('input[name="description"]').fill("Created from the browser smoke suite.");
	await form.locator('textarea[name="prompt"]').fill("Stay concise.");
	await form.locator(".btn-stepper-next").click();
	await form.locator(".btn-stepper-next").click();
	await form.locator(".btn-stepper-submit").click();

	await expect(page.locator("#overlay")).toHaveClass(/hidden/);
	await expect(page.locator("#personalitiesDiv")).toContainText("Playwright Persona");
	await expect.poll(async () => countPersonasByName(page, "Playwright Persona")).toBe(1);
});

test("user sends a message and sees a mocked reply", async ({ page }) => {
	await stubExternalTraffic(page, [{ text: "Smoke Test Thread" }, { text: "Mocked smoke reply." }]);
	await seedLocalSettings(page);
	await page.goto("/");

	await page.locator("#messageInput").fill("Smoke test prompt");
	await page.locator("#btn-send").click();

	await expect(page.locator(".message")).toContainText(["Smoke test prompt", "Mocked smoke reply."]);
	await expect(page.locator("#chat-title")).toHaveText("Smoke Test Thread");
	await expect(page.locator("input[name='currentChat']:checked")).toHaveCount(1);
});

test("user attaches a file by drag and drop", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await seedLocalSettings(page);
	await page.goto("/");

	await dispatchAttachmentDrop(page, [
		{
			name: "notes.txt",
			mimeType: "text/plain",
			contents: "hello from playwright"
		}
	]);

	await expect(page.locator("#attachment-preview")).toContainText("notes.txt");
	await expect
		.poll(async () => readAttachmentInputState(page))
		.toEqual({
			names: ["notes.txt"],
			previewNames: ["notes.txt"]
		});
});

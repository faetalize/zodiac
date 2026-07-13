import { expect, test, type Page, type Route } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

const SUPABASE_HOST = "hglcltvwunzynnzduauy.supabase.co";
const LORA_URL = "https://civitai.com/models/example?modelVersionId=123";
const EQUIVALENT_LORA_URL = "https://civitai.com/models/other-link?modelVersionId=123";

const loraMetadata = {
	baseModel: "Illustrious",
	name: "Playwright LoRA",
	trainedWords: ["playwright"],
	modelVersionId: "123",
	url: LORA_URL,
	downloadUrl: "https://example.com/lora.safetensors",
	fileName: "lora.safetensors"
};

function jsonResponse(body: unknown) {
	return {
		status: 200,
		contentType: "application/json",
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
			"access-control-allow-methods": "POST, OPTIONS"
		},
		body: JSON.stringify(body)
	};
}

async function stubLoraMetadata(page: Page): Promise<void> {
	await page.route(`https://${SUPABASE_HOST}/functions/v1/get-lora-metadata-x`, async (route: Route) => {
		if (route.request().method() === "OPTIONS") {
			await route.fulfill(jsonResponse({}));
			return;
		}

		const urls = (route.request().postDataJSON() as { urls?: string[] } | null)?.urls ?? [];
		await route.fulfill(jsonResponse(urls.map(() => loraMetadata)));
	});
}

async function openImageSettings(page: Page): Promise<void> {
	await page.locator(".navbar-tab").filter({ hasText: "Settings" }).first().click();
	await page.locator('[data-settings-target="image"]').click();
	await expect(page.locator("#lora-url-input")).toBeVisible();
}

async function storedLoras(page: Page): Promise<string[]> {
	return await page.evaluate(() => JSON.parse(localStorage.getItem("loras") ?? "[]") as string[]);
}

test("adds a LoRA once and warns when another URL resolves to the same version", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await stubLoraMetadata(page);
	await seedLocalSettings(page);
	await page.goto("/");
	await openImageSettings(page);

	await page.locator("#lora-url-input").fill(LORA_URL);
	await page.locator("#btn-add-lora").click();

	await expect(page.locator(".card-lora")).toHaveCount(1);
	await expect(page.locator(".toast", { hasText: "LoRA added" })).toBeVisible();

	await page.locator("#lora-url-input").fill(EQUIVALENT_LORA_URL);
	await page.locator("#btn-add-lora").click();

	await expect(page.locator(".card-lora")).toHaveCount(1);
	await expect(page.locator(".toast", { hasText: "LoRA already added" })).toBeVisible();
	expect(await storedLoras(page)).toEqual([LORA_URL]);
});

test("repairs locally stored duplicate LoRAs on startup and reports one cleanup", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await stubLoraMetadata(page);
	await seedLocalSettings(page);
	await page.addInitScript(
		(urls) => {
			localStorage.setItem("loras", JSON.stringify(urls));
		},
		[LORA_URL, LORA_URL]
	);
	await page.goto("/");
	await openImageSettings(page);

	await expect(page.locator(".card-lora")).toHaveCount(1);
	await expect(page.locator(".toast", { hasText: "Cleaned up 1 duplicate LoRA." })).toHaveCount(1);
	expect(await storedLoras(page)).toEqual([LORA_URL]);
});

test("does not repeat the cleanup toast when cloud settings contain the same duplicates", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await stubLoraMetadata(page);
	await seedLocalSettings(page);
	await page.addInitScript(
		(urls) => {
			localStorage.setItem("loras", JSON.stringify(urls));
		},
		[LORA_URL, LORA_URL]
	);
	await page.goto("/");
	await openImageSettings(page);
	await expect(page.locator(".toast", { hasText: "Cleaned up 1 duplicate LoRA." })).toHaveCount(1);

	await page.evaluate(
		(urls) => {
			localStorage.setItem("loras", JSON.stringify(urls));
			window.dispatchEvent(new CustomEvent("sync-data-pulled", { detail: {} }));
		},
		[LORA_URL, EQUIVALENT_LORA_URL]
	);

	await expect(page.locator(".card-lora")).toHaveCount(1);
	await expect(page.locator(".toast", { hasText: "Cleaned up 1 duplicate LoRA." })).toHaveCount(1);
	expect(await storedLoras(page)).toEqual([LORA_URL]);
});

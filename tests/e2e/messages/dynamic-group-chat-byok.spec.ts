import { expect, test, type Page } from "@playwright/test";
import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

// async function createDynamicGroupChat(page: Page): Promise<string> {
// 	return await page.evaluate(async () => {
// 		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
// 		const groupChatService = await importModule("/services/GroupChat.service.ts");

// 		const chatId = await groupChatService.createDynamicGroupChat({
// 			participantIds: [],
// 			allowPings: true,
// 			maxMessageGuardById: {}
// 		});
// 		return chatId;
// 	});
// }

test("dynamic group chat does not crash when there is no user session (BYOK mode)", async ({ page }) => {
	// The crash was happening because dynamic group chat tries to fetch the user profile.
	// In BYOK mode, there's no Supabase session, so this throws.

	// We'll queue a response for the persona reply.
	const openRouterResponses = [{ text: "Hello team, I am responding dynamically." }];

	await stubExternalTraffic(page, openRouterResponses);
	await seedLocalSettings(page);

	// Add an AI persona to the DB so the group chat can use it
	await page.addInitScript(() => {
		localStorage.setItem("model", "openai/gpt-5.4");
	});

	await page.goto("/");

	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const personalityService = await importModule("/services/Personality.service.ts");
		await personalityService.add({
			name: "Test Persona 1",
			independence: 3 // Make sure it responds
		});
		await personalityService.add({
			name: "Test Persona 2",
			independence: 3 // Make sure it responds
		});
	});

	// Wait for the app to be fully initialized and ready
	await expect(page.locator("#btn-new-chat")).toBeVisible();

	// Create a dynamic group chat programmatically to avoid complex UI interactions
	const chatId = await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const groupChatService = await importModule("/services/GroupChat.service.ts");
		const personalityService = await importModule("/services/Personality.service.ts");

		const personas = await personalityService.getAll();
		// We need at least two participants
		const p1 = personas[0].id;
		const p2 = personas[1].id;

		return await groupChatService.createDynamicGroupChat({
			participantIds: [p1, p2],
			allowPings: true,
			maxMessageGuardById: { [p1]: 5, [p2]: 5 }
		});
	});

	// Click the newly created chat in the sidebar to load it
	const chatLabel = page.locator(`label[for='chat${chatId}']`);
	await chatLabel.click();

	// Send a message
	await page.locator("#messageInput").fill("Hello everyone");
	await page.locator("#btn-send").click();

	// If the crash happens, the message won't even appear, or the persona won't respond.
	// We expect both the user message and the mocked persona response to appear.
	await expect(page.locator(".message").nth(0)).toContainText("Hello everyone");
	await expect(page.locator(".message").nth(1)).toContainText("Hello team, I am responding dynamically.");
});

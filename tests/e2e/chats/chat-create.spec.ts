import { expect, test, type Page } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

type BrowserChatState = {
	checkedChatId: string | null;
	currentChat: {
		id: string | null;
		title: string | null;
		visibleMessages: string[];
	};
	existingChat: {
		id: string;
		title: string;
		visibleMessages: string[];
	} | null;
	allChatIds: string[];
	domVisibleMessages: string[];
};

async function createExistingChat(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const chatsService = await importModule("/services/Chats.service.ts");

		await chatsService.addChatRecord({
			id: "existing-chat",
			title: "Existing Chat",
			timestamp: Date.now(),
			content: [
				{
					role: "user",
					parts: [{ text: "Old message" }]
				}
			]
		});
	});
}

async function readBrowserChatState(page: Page): Promise<BrowserChatState> {
	return await page.evaluate(async () => {
		const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
		const chatsService = await importModule("/services/Chats.service.ts");
		const dbService = await importModule("/services/Db.service.ts");

		const currentChat = await chatsService.getCurrentChat();
		const existingChat = await dbService.db.chats.get("existing-chat");
		const allChats = await dbService.db.chats.toArray();
		const readVisibleMessages = (messages: Array<{ hidden?: boolean; parts?: Array<{ text?: string }> }> = []) => {
			return messages
				.filter((message) => !message.hidden)
				.map((message) => message.parts?.[0]?.text ?? "")
				.filter(Boolean);
		};

		return {
			checkedChatId: document.querySelector<HTMLInputElement>("input[name='currentChat']:checked")?.id ?? null,
			currentChat: {
				id: currentChat?.id ?? null,
				title: currentChat?.title ?? null,
				visibleMessages: readVisibleMessages(currentChat?.content)
			},
			existingChat: existingChat
				? {
						id: existingChat.id,
						title: existingChat.title,
						visibleMessages: readVisibleMessages(existingChat.content)
					}
				: null,
			allChatIds: allChats.map((chat: { id: string }) => chat.id),
			domVisibleMessages: Array.from(document.querySelectorAll<HTMLElement>(".message"))
				.map((element) => {
					return (
						element.querySelector<HTMLElement>(".message-text-content")?.textContent ??
						element.querySelector<HTMLElement>(".message-text")?.textContent ??
						""
					).trim();
				})
				.filter(Boolean)
		};
	});
}

test("creates a new chat from the cleared composer state and switches selection to it", async ({ page }) => {
	const openRouterResponses = [{ text: "Fresh Thread" }, { text: "Assistant reply for the fresh thread." }];

	await stubExternalTraffic(page, openRouterResponses);
	await seedLocalSettings(page);
	await page.goto("/");

	await expect(page.locator("#btn-new-chat")).toBeVisible();
	await createExistingChat(page);

	const existingChatLabel = page.locator("label[for='chatexisting-chat']");
	await expect(existingChatLabel).toContainText("Existing Chat");
	await existingChatLabel.click();

	await expect(page.locator("#chat-title")).toHaveText("Existing Chat");
	await expect(page.locator(".message")).toContainText(["Old message"]);

	await page.locator("#btn-new-chat").click();

	await expect(page.locator("input[name='currentChat']:checked")).toHaveCount(0);
	await expect(page.locator("#chat-title")).toHaveText("");
	await expect(page.locator(".message")).toHaveCount(0);

	await page.locator("#messageInput").fill("Start a fresh thread");
	await page.locator("#btn-send").click();

	await expect
		.poll(async () => {
			const state = await readBrowserChatState(page);
			return {
				checkedChatId: state.checkedChatId,
				currentTitle: state.currentChat.title,
				currentVisibleMessages: state.currentChat.visibleMessages,
				allChatCount: state.allChatIds.length
			};
		})
		.toEqual({
			checkedChatId: expect.stringMatching(/^chat(?!existing-chat$).+/),
			currentTitle: "Fresh Thread",
			currentVisibleMessages: ["Start a fresh thread", "Assistant reply for the fresh thread."],
			allChatCount: 2
		});

	const state = await readBrowserChatState(page);

	expect(state.currentChat.id).not.toBe("existing-chat");
	expect(state.currentChat.title).toBe("Fresh Thread");
	expect(state.currentChat.visibleMessages).toEqual([
		"Start a fresh thread",
		"Assistant reply for the fresh thread."
	]);
	expect(state.existingChat).toEqual({
		id: "existing-chat",
		title: "Existing Chat",
		visibleMessages: ["Old message"]
	});
	expect(state.allChatIds).toEqual(expect.arrayContaining(["existing-chat", state.currentChat.id as string]));
	expect(state.domVisibleMessages).toEqual(["Start a fresh thread", "Assistant reply for the fresh thread."]);

	await expect(page.locator("#chat-title")).toHaveText("Fresh Thread");
	await expect(page.locator("label[for='chatexisting-chat']")).toContainText("Existing Chat");
});

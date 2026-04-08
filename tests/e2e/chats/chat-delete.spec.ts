import { expect, test, type Page } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

type SeedChat = {
    id: string;
    title: string;
    messages: string[];
};

type BrowserDeleteState = {
    checkedChatId: string | null;
    currentChatId: string | null;
    currentTitle: string | null;
    currentVisibleMessages: string[];
    persistedChatIds: string[];
};

async function seedChats(page: Page, chats: SeedChat[]): Promise<void> {
    await page.evaluate(async (chatsToSeed) => {
        const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
        const chatsService = await importModule("/services/Chats.service.ts");

        for (const chat of chatsToSeed) {
            await chatsService.addChatRecord({
                id: chat.id,
                title: chat.title,
                timestamp: Date.now(),
                content: chat.messages.map((text) => ({
                    role: "user",
                    parts: [{ text }],
                })),
            });
        }
    }, chats);
}

async function readDeleteState(page: Page): Promise<BrowserDeleteState> {
    return await page.evaluate(async () => {
        const importModule = new Function("path", "return import(path);") as (path: string) => Promise<any>;
        const chatsService = await importModule("/services/Chats.service.ts");
        const dbService = await importModule("/services/Db.service.ts");

        const currentChat = await chatsService.getCurrentChat();
        const persistedChats = await dbService.db.chats.toArray();
        const readVisibleMessages = (messages: Array<{ hidden?: boolean; parts?: Array<{ text?: string }> }> = []) => {
            return messages
                .filter((message) => !message.hidden)
                .map((message) => message.parts?.[0]?.text ?? "")
                .filter(Boolean);
        };

        return {
            checkedChatId: document.querySelector<HTMLInputElement>("input[name='currentChat']:checked")?.id ?? null,
            currentChatId: currentChat?.id ?? null,
            currentTitle: currentChat?.title ?? null,
            currentVisibleMessages: readVisibleMessages(currentChat?.content),
            persistedChatIds: persistedChats.map((chat: { id: string }) => chat.id).sort(),
        };
    });
}

async function openChatActions(page: Page, chatId: string): Promise<void> {
    const row = page.locator(`label[for='chat${chatId}']`);
    await row.locator(".chat-actions-button").click();
    await expect(row.locator(".chat-actions-wrapper")).toHaveClass(/open/);
}

async function deleteChatFromSidebar(page: Page, chatId: string): Promise<void> {
    const row = page.locator(`label[for='chat${chatId}']`);
    await openChatActions(page, chatId);
    await row.locator(".chat-actions-item").filter({ hasText: "Delete" }).click();
}

test("deleting the selected chat from the sidebar returns the app to cleared new-chat state", async ({ page }) => {
    await stubExternalTraffic(page, []);
    await seedLocalSettings(page);
    await page.goto("/");

    await seedChats(page, [
        {
            id: "selected-chat-delete",
            title: "Selected Chat",
            messages: ["Selected message"],
        },
    ]);

    const selectedRow = page.locator("label[for='chatselected-chat-delete']");
    await expect(selectedRow).toContainText("Selected Chat");
    await selectedRow.click();

    await expect(page.locator("#chat-title")).toHaveText("Selected Chat");
    await expect(page.locator(".message")).toContainText(["Selected message"]);

    await deleteChatFromSidebar(page, "selected-chat-delete");

    await expect(selectedRow).toHaveCount(0);
    await expect(page.locator("input[name='currentChat']:checked")).toHaveCount(0);
    await expect(page.locator("#chat-title")).toHaveText("");
    await expect(page.locator(".message")).toHaveCount(0);

    await expect.poll(async () => await readDeleteState(page)).toEqual({
        checkedChatId: null,
        currentChatId: null,
        currentTitle: null,
        currentVisibleMessages: [],
        persistedChatIds: [],
    });
});

test("deleting an unselected chat from the sidebar keeps the selected chat untouched", async ({ page }) => {
    await stubExternalTraffic(page, []);
    await seedLocalSettings(page);
    await page.goto("/");

    await seedChats(page, [
        {
            id: "selected-chat-keep",
            title: "Current Chat",
            messages: ["Current message"],
        },
        {
            id: "other-chat-delete",
            title: "Delete Me",
            messages: ["Delete me message"],
        },
    ]);

    const currentRow = page.locator("label[for='chatselected-chat-keep']");
    const otherRow = page.locator("label[for='chatother-chat-delete']");

    await expect(currentRow).toContainText("Current Chat");
    await expect(otherRow).toContainText("Delete Me");
    await currentRow.click();

    await expect(page.locator("#chat-title")).toHaveText("Current Chat");
    await expect(page.locator(".message")).toContainText(["Current message"]);

    await deleteChatFromSidebar(page, "other-chat-delete");

    await expect(otherRow).toHaveCount(0);
    await expect(page.locator("input[name='currentChat']:checked")).toHaveAttribute(
        "id",
        "chatselected-chat-keep",
    );
    await expect(page.locator("#chat-title")).toHaveText("Current Chat");
    await expect(page.locator(".message")).toContainText(["Current message"]);

    await expect.poll(async () => await readDeleteState(page)).toEqual({
        checkedChatId: "chatselected-chat-keep",
        currentChatId: "selected-chat-keep",
        currentTitle: "Current Chat",
        currentVisibleMessages: ["Current message"],
        persistedChatIds: ["selected-chat-keep"],
    });
});

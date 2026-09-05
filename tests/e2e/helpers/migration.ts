import type { Page } from "@playwright/test";

export const oldOrigin = "https://zodiac.faetalize.dev";
export const newOrigin = "https://chat.zozo.sh";
const localServer = "https://127.0.0.1:4173";
const user = {
	id: "11111111-1111-4111-8111-111111111111",
	email: "migration@example.test",
	aud: "authenticated",
	role: "authenticated",
	app_metadata: {},
	user_metadata: {},
	created_at: "2026-01-01T00:00:00Z"
};

export async function observeMigrationBeforeRedirect(page: Page): Promise<string[]> {
	const shown: string[] = [];
	await page.exposeFunction("recordMigrationPresentation", (id: string) => shown.push(id));
	await page.addInitScript(() => {
		if (window.location.hostname !== "zodiac.faetalize.dev") return;
		new MutationObserver(() => {
			const sheet = document.getElementById("domain-migration-sheet");
			if (sheet && !sheet.classList.contains("hidden")) {
				void (window as any).recordMigrationPresentation(sheet.id);
			}
		}).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
	});
	return shown;
}

// Type 3: serve the real app on distinct browser origins. Only network sources
// are stubbed; the entrypoint, components, storage, download, and navigation run.
export async function serveApp(
	page: Page,
	options: { syncEnabled?: boolean; failPreference?: boolean; server?: string } = {}
) {
	const requests: string[] = [];
	await page.route("https://**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.hostname.endsWith(".supabase.co")) {
			requests.push(url.pathname);
			let body: unknown = [];
			let status = 200;
			if (url.pathname === "/auth/v1/user") body = user;
			if (url.pathname.endsWith("/user_sync_preferences")) {
				body =
					options.syncEnabled === undefined
						? null
						: {
								sync_enabled: options.syncEnabled,
								encryption_salt: "ab".repeat(16),
								key_verification: "cd".repeat(16),
								key_verification_iv: "ef".repeat(12)
							};
				if (options.failPreference) {
					status = 503;
					body = { message: "Test connection failure" };
				}
			}
			if (url.pathname.endsWith("/profiles"))
				body = { id: user.id, preferred_name: "", avatar: "", system_prompt_addition: "" };
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify(body),
				headers: { "access-control-allow-origin": "*" }
			});
			return;
		}
		if (
			[
				"zodiac.faetalize.dev",
				"chat.zozo.sh",
				"preview.zodiac.faetalize.dev",
				"zodiac.faetalize.dev.example.test",
				"preview.example.test",
				"localhost",
				"127.0.0.1"
			].includes(url.hostname)
		) {
			if (url.pathname === "/seed") {
				await route.fulfill({
					contentType: "text/html",
					body: "<!doctype html><html><body>Seed browser data</body></html>"
				});
				return;
			}
			const response = await route.fetch({ url: (options.server ?? localServer) + url.pathname + url.search });
			await route.fulfill({ response });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: route.request().resourceType() === "stylesheet" ? "text/css" : "application/javascript",
			body: ""
		});
	});
	return requests;
}

export async function seed(
	page: Page,
	options: { origin?: string; chat?: boolean; settings?: Record<string, string>; signedIn?: boolean } = {}
) {
	await page.goto(`${options.origin ?? oldOrigin}/seed`);
	await page.evaluate(
		async ({ chat, settings, signedIn, account }) => {
			for (const [key, value] of Object.entries(settings ?? {})) localStorage.setItem(key, value);
			if (signedIn)
				localStorage.setItem(
					"sb-hglcltvwunzynnzduauy-auth-token",
					JSON.stringify({
						access_token: "test-access-token",
						refresh_token: "test-refresh-token",
						token_type: "bearer",
						expires_in: 3600,
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						user: account
					})
				);
			if (chat) {
				const importModule = new Function("path", "return import(path)");
				const { db } = await importModule("/services/Db.service.ts");
				await db.chats.put({
					id: "migration-chat",
					title: "My local story",
					timestamp: 1000,
					content: [
						{
							role: "user",
							parts: [
								{
									text: "Keep this story",
									attachments: [new File(["attachment content"], "story.txt", { type: "text/plain" })]
								}
							]
						}
					]
				});
			}
		},
		{ ...options, account: user }
	);
}

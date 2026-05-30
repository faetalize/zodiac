import { expect, test, type Page, type Route } from "@playwright/test";

import { seedLocalSettings, stubExternalTraffic } from "../helpers/app";

const SUPABASE_HOST = "hglcltvwunzynnzduauy.supabase.co";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000162";

function jsonResponse(body: unknown, status = 200) {
	return {
		status,
		contentType: "application/json",
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
			"access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS"
		},
		body: JSON.stringify(body)
	};
}

function emptyResponse(status = 204) {
	return {
		status,
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
			"access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS"
		},
		body: ""
	};
}

async function seedSupabaseSession(page: Page): Promise<void> {
	await page.addInitScript(
		({ supabaseHost, userId }) => {
			const projectRef = supabaseHost.split(".")[0];
			localStorage.setItem(
				`sb-${projectRef}-auth-token`,
				JSON.stringify({
					access_token: "playwright-access-token",
					refresh_token: "playwright-refresh-token",
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					expires_in: 3600,
					token_type: "bearer",
					user: {
						id: userId,
						email: "profile-playwright@example.test",
						aud: "authenticated",
						role: "authenticated",
						app_metadata: {},
						user_metadata: {}
					}
				})
			);
		},
		{ supabaseHost: SUPABASE_HOST, userId: TEST_USER_ID }
	);
}

async function stubSupabaseProfileSave(
	page: Page,
	options: {
		profilePatchStatus?: number;
		profilePatchBody?: unknown;
		releaseProfilePatch?: Promise<void>;
	} = {}
): Promise<void> {
	await page.route(`https://${SUPABASE_HOST}/**/*`, async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (request.method() === "OPTIONS") {
			await route.fulfill(jsonResponse({}));
			return;
		}

		if (url.pathname === "/auth/v1/user") {
			await route.fulfill(
				jsonResponse({
					id: TEST_USER_ID,
					email: "profile-playwright@example.test",
					aud: "authenticated",
					role: "authenticated",
					app_metadata: {},
					user_metadata: {},
					created_at: "2026-01-01T00:00:00.000Z"
				})
			);
			return;
		}

		if (url.pathname === "/functions/v1/refresh-subscription-allowances") {
			await route.fulfill(jsonResponse({ ok: true }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/profiles")) {
			if (request.method() === "PATCH") {
				await options.releaseProfilePatch;
				const status = options.profilePatchStatus ?? 204;
				const body = options.profilePatchBody ?? {
					avatar: "",
					preferredName: "Saved Profile Name",
					systemPromptAddition: "Saved profile prompt."
				};
				await route.fulfill(status === 204 ? emptyResponse(status) : jsonResponse(body, status));
				return;
			}

			await route.fulfill(
				jsonResponse({
					avatar: "",
					preferredName: "Existing Profile Name",
					systemPromptAddition: "Existing profile prompt."
				})
			);
			return;
		}

		if (url.pathname.startsWith("/storage/v1/object/profile_pictures")) {
			await route.fulfill(
				jsonResponse({
					Key: `${TEST_USER_ID}/profile_picture.jpeg`
				})
			);
			return;
		}

		if (url.pathname.startsWith("/rest/v1/user_subscriptions")) {
			await route.fulfill(jsonResponse(null));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/image_generations")) {
			await route.fulfill(jsonResponse({ user_id: TEST_USER_ID, remaining_image_generations: 0 }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/image_sub_allowance")) {
			await route.fulfill(jsonResponse({ remaining_image_generations: 0 }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/mega_credits")) {
			await route.fulfill(jsonResponse({ user_id: TEST_USER_ID, remaining_mega_credits: 0 }));
			return;
		}

		if (url.pathname.startsWith("/rest/v1/nano_banana_daily_usage")) {
			await route.fulfill(jsonResponse(null));
			return;
		}

		await route.fulfill(jsonResponse({}));
	});
}

async function openProfile(page: Page): Promise<void> {
	await page.goto("/");
	await page.locator("#user-profile").click();
	await expect(page.locator("#profile")).toBeVisible();
}

test("profile save shows pending feedback and a success toast", async ({ page }) => {
	let releasePatch!: () => void;
	const patchCanFinish = new Promise<void>((resolve) => {
		releasePatch = resolve;
	});

	await stubExternalTraffic(page, []);
	await stubSupabaseProfileSave(page, { releaseProfilePatch: patchCanFinish });
	await seedLocalSettings(page);
	await seedSupabaseSession(page);
	await openProfile(page);

	await page.locator("#profile-preferred-name").fill("Saved Profile Name");
	await page.locator("#profile-system-prompt").fill("Saved profile prompt.");
	await page.locator("#btn-profile-save").click();

	const saveButton = page.locator("#btn-profile-save");
	await expect(saveButton).toBeDisabled();
	await expect(saveButton).toHaveAttribute("aria-busy", "true");
	await expect(saveButton).toContainText("Saving...");
	await expect(saveButton.locator(".profile-save-spinner")).toBeVisible();

	releasePatch();

	await expect(saveButton).toBeEnabled();
	await expect(saveButton).toHaveAttribute("aria-busy", "false");
	await expect(saveButton).toContainText("Save");
	await expect(page.locator(".toast", { hasText: "Profile Saved" })).toBeVisible();
	await expect(page.locator(".toast", { hasText: "Your profile changes are up to date." })).toBeVisible();
});

test("profile save failure restores the button and shows an error toast", async ({ page }) => {
	await stubExternalTraffic(page, []);
	await stubSupabaseProfileSave(page, {
		profilePatchStatus: 400,
		profilePatchBody: {
			code: "PGRST_PROFILE_TEST",
			message: "Profile update rejected"
		}
	});
	await seedLocalSettings(page);
	await seedSupabaseSession(page);
	await openProfile(page);

	await page.locator("#profile-preferred-name").fill("Rejected Profile Name");
	await page.locator("#btn-profile-save").click();

	const saveButton = page.locator("#btn-profile-save");
	await expect(saveButton).toBeEnabled();
	await expect(saveButton).toHaveAttribute("aria-busy", "false");
	await expect(saveButton).toContainText("Save");

	const toast = page.locator(".toast", { hasText: "Profile Save Failed" });
	await expect(toast).toBeVisible();
	await expect(toast).toContainText("Profile update rejected");
});

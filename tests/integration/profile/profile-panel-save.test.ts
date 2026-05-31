import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootstrapDom } from "../../helpers/dom";

const serviceState = vi.hoisted(() => ({
	updateUser: vi.fn(),
	uploadPfpToSupabase: vi.fn(),
	infoToast: vi.fn(),
	dangerToast: vi.fn()
}));

vi.mock("../../../src/services/Supabase.service", () => ({
	updateUser: serviceState.updateUser,
	uploadPfpToSupabase: serviceState.uploadPfpToSupabase,
	getUserSubscription: vi.fn(async () => null),
	getSubscriptionTier: vi.fn(() => "free"),
	getImageGenerationRecord: vi.fn(async () => null),
	getMegaCreditsRecord: vi.fn(async () => null),
	getNanoBananaDailyUsageRecord: vi.fn(async () => null),
	getCurrentUserEmail: vi.fn(async () => "test@example.com"),
	sendPasswordResetEmail: vi.fn(async () => undefined)
}));

vi.mock("../../../src/services/Toast.service", () => ({
	info: serviceState.infoToast,
	warn: vi.fn(),
	danger: serviceState.dangerToast
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function mountProfileDom(): void {
	bootstrapDom(`
		<button id="btn-change-pfp"></button>
		<img id="profile-pfp" />
		<input id="profile-preferred-name" />
		<textarea id="profile-system-prompt"></textarea>
		<button id="btn-profile-save">
			<span id="profile-save-spinner" class="loading-spinner hidden" aria-hidden="true"></span>
			<span id="profile-save-label">Save</span>
		</button>
		<div id="subscription-status-row" class="collapsed"><div class="collapsible-card-header"></div></div>
		<div id="subscription-card-content"></div>
		<span id="subscription-badge"></span>
		<button id="btn-manage-subscription"></button>
		<span id="subscription-remaining-generations"></span>
		<span id="subscription-remaining-mega-credits"></span>
		<span id="subscription-remaining-nano-banana"></span>
		<div id="profile-info-card" class="collapsed"><div class="collapsible-card-header"></div></div>
		<div id="profile-info-content"></div>
		<div id="account-info-card" class="collapsed"><div class="collapsible-card-header"></div></div>
		<div id="account-info-content"></div>
		<span id="account-email"></span>
		<button id="btn-reset-password"></button>
		<button id="btn-change-email"></button>
	`);
}

async function loadProfilePanel(): Promise<void> {
	vi.resetModules();
	mountProfileDom();
	await import("../../../src/components/static/ProfilePanel.component");
}

function getSaveButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>("#btn-profile-save");
	if (!button) throw new Error("Missing save button");
	return button;
}

function getSaveSpinner(): HTMLElement {
	const spinner = document.querySelector<HTMLElement>("#profile-save-spinner");
	if (!spinner) throw new Error("Missing save spinner");
	return spinner;
}

function getSaveLabel(): HTMLElement {
	const label = document.querySelector<HTMLElement>("#profile-save-label");
	if (!label) throw new Error("Missing save label");
	return label;
}

beforeEach(() => {
	serviceState.updateUser.mockReset();
	serviceState.uploadPfpToSupabase.mockReset();
	serviceState.infoToast.mockReset();
	serviceState.dangerToast.mockReset();
	serviceState.updateUser.mockResolvedValue({ error: null });
	serviceState.uploadPfpToSupabase.mockResolvedValue("profile_pictures/user/profile_picture.jpeg");
});

describe("ProfilePanel save", () => {
	it("shows a pending spinner and success toast while profile changes save", async () => {
		const save = deferred<{ error: null }>();
		serviceState.updateUser.mockReturnValue(save.promise);
		await loadProfilePanel();

		document.querySelector<HTMLInputElement>("#profile-preferred-name")!.value = "Ada";
		document.querySelector<HTMLTextAreaElement>("#profile-system-prompt")!.value = "Use a warm tone.";

		getSaveButton().click();

		expect(getSaveButton().disabled).toBe(true);
		expect(getSaveButton().getAttribute("aria-busy")).toBe("true");
		expect(getSaveSpinner().classList.contains("hidden")).toBe(false);
		expect(getSaveLabel().textContent).toBe("Saving...");
		expect(serviceState.updateUser).toHaveBeenCalledWith({
			preferredName: "Ada",
			systemPromptAddition: "Use a warm tone."
		});

		save.resolve({ error: null });
		await flushPromises();

		expect(getSaveButton().disabled).toBe(false);
		expect(getSaveButton().getAttribute("aria-busy")).toBe("false");
		expect(getSaveSpinner().classList.contains("hidden")).toBe(true);
		expect(getSaveLabel().textContent).toBe("Save");
		expect(serviceState.infoToast).toHaveBeenCalledWith({
			title: "Profile Saved",
			text: "Your profile changes are up to date."
		});
	});

	it("ignores duplicate clicks while a profile save is pending", async () => {
		const save = deferred<{ error: null }>();
		serviceState.updateUser.mockReturnValue(save.promise);
		await loadProfilePanel();

		getSaveButton().click();
		getSaveButton().click();

		expect(serviceState.updateUser).toHaveBeenCalledTimes(1);

		save.resolve({ error: null });
		await flushPromises();
	});

	it("waits for avatar upload before showing the success toast", async () => {
		const fileInputs: HTMLInputElement[] = [];
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, "createElement").mockImplementation((tagName: string, options?: ElementCreationOptions) => {
			const element = createElement(tagName, options);
			if (tagName.toLowerCase() === "input") {
				const fileInput = element as HTMLInputElement;
				fileInputs.push(fileInput);
				vi.spyOn(fileInput, "click").mockImplementation(() => undefined);
			}
			if (tagName.toLowerCase() === "img") {
				Object.defineProperties(element, {
					decode: { value: vi.fn(async () => undefined) },
					width: { value: 400 },
					height: { value: 300 }
				});
			}
			if (tagName.toLowerCase() === "canvas") {
				Object.defineProperty(element, "getContext", {
					value: vi.fn(() => ({ drawImage: vi.fn() }))
				});
				Object.defineProperty(element, "toBlob", {
					value: vi.fn((callback: BlobCallback) => callback(new Blob(["avatar"], { type: "image/jpeg" })))
				});
			}
			return element;
		});
		const upload = deferred<string>();
		serviceState.uploadPfpToSupabase.mockReturnValue(upload.promise);
		await loadProfilePanel();

		document.querySelector<HTMLButtonElement>("#btn-change-pfp")!.click();
		const fileInput = fileInputs[0];
		if (!fileInput) throw new Error("Expected profile file input to be created");
		Object.defineProperty(fileInput, "files", {
			value: [new File(["avatar"], "avatar.png", { type: "image/png" })],
			configurable: true
		});
		fileInput.dispatchEvent(new Event("change"));
		await flushPromises();

		getSaveButton().click();
		await flushPromises();

		expect(serviceState.uploadPfpToSupabase).toHaveBeenCalledTimes(1);
		expect(serviceState.infoToast).not.toHaveBeenCalled();

		upload.resolve("profile_pictures/user/profile_picture.jpeg");
		await flushPromises();

		expect(serviceState.updateUser).toHaveBeenCalledWith({
			preferredName: "",
			systemPromptAddition: "",
			avatar: "https://hglcltvwunzynnzduauy.supabase.co/storage/v1/object/public/profile_pictures/user/profile_picture.jpeg"
		});
		expect(serviceState.infoToast).toHaveBeenCalledWith({
			title: "Profile Saved",
			text: "Your profile changes are up to date."
		});
	});

	it("shows a danger toast and restores the button when saving fails", async () => {
		serviceState.updateUser.mockResolvedValue({ error: { message: "Profile update failed" } });
		await loadProfilePanel();

		getSaveButton().click();
		await flushPromises();

		expect(getSaveButton().disabled).toBe(false);
		expect(getSaveSpinner().classList.contains("hidden")).toBe(true);
		expect(serviceState.dangerToast).toHaveBeenCalledWith({
			title: "Save Failed",
			text: "Profile update failed"
		});
		expect(serviceState.infoToast).not.toHaveBeenCalled();
	});
});

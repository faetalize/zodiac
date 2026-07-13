import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";
import type { LoRAInfo } from "../../../src/types/Lora";

const syncServiceMock = vi.hoisted(() => ({
	isSyncActive: vi.fn(() => true),
	queueSettingsPush: vi.fn()
}));

const supabaseMock = vi.hoisted(() => ({
	functions: {
		invoke: vi.fn()
	}
}));

vi.mock("../../../src/services/Sync.service", () => syncServiceMock);

vi.mock("../../../src/services/Supabase.service", () => ({
	supabase: supabaseMock
}));

const loraFixture: LoRAInfo = {
	baseModel: "Illustrious",
	name: "Test LoRA",
	trainedWords: ["test"],
	modelVersionId: "123",
	url: "https://civitai.com/models/example?modelVersionId=123",
	downloadUrl: "https://example.com/lora.safetensors",
	fileName: "lora.safetensors"
};

const equivalentLoraUrl = "https://civitai.com/models/other-link?modelVersionId=123";
const unresolvedLoraUrl = "https://civitai.com/models/temporarily-unavailable";

describe("LoRA synced settings", () => {
	beforeEach(() => {
		vi.resetModules();
		localStorage.clear();
		syncServiceMock.isSyncActive.mockReturnValue(true);
		syncServiceMock.queueSettingsPush.mockClear();
		supabaseMock.functions.invoke.mockReset();
		supabaseMock.functions.invoke.mockResolvedValue({ data: [loraFixture], error: null });
	});

	it("pushes current settings when a LoRA URL is added", async () => {
		const loraService = await import("../../../src/services/Lora.service");

		await loraService.add(loraFixture.url);

		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([loraFixture.url]);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenCalledTimes(1);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenLastCalledWith({ label: "LoRA settings" });
	});

	it("does not persist or push a LoRA with an unsupported base model", async () => {
		supabaseMock.functions.invoke.mockResolvedValue({
			data: [{ ...loraFixture, baseModel: "Pony" }],
			error: null
		});
		const loraService = await import("../../../src/services/Lora.service");

		const result = await loraService.add(loraFixture.url);

		expect(result.status).toBe("unsupported");
		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([]);
		expect(syncServiceMock.queueSettingsPush).not.toHaveBeenCalled();
	});

	it("rejects a second URL that resolves to an already-added LoRA model version", async () => {
		const loraService = await import("../../../src/services/Lora.service");

		await expect(loraService.add(loraFixture.url)).resolves.toMatchObject({ status: "added" });
		await expect(loraService.add(equivalentLoraUrl)).resolves.toEqual({ status: "duplicate" });

		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([loraFixture.url]);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenCalledTimes(1);
	});

	it("normalizes existing duplicate LoRAs and queues one cloud settings update", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.LORAS, JSON.stringify([loraFixture.url, equivalentLoraUrl]));
		supabaseMock.functions.invoke.mockImplementation(
			async (_slug: string, { body }: { body: { urls: string[] } }) => ({
				data: body.urls.map(() => loraFixture),
				error: null
			})
		);
		const loraService = await import("../../../src/services/Lora.service");
		const refreshed = vi.fn();
		window.addEventListener("lora-list-refreshed", refreshed);

		await loraService.initialize();

		expect(loraService.getAll()).toEqual([loraFixture]);
		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([loraFixture.url]);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenCalledTimes(1);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenLastCalledWith({ label: "LoRA settings" });
		expect(refreshed).toHaveBeenCalledTimes(1);
		expect(refreshed.mock.calls[0][0].detail).toEqual({ removedDuplicateCount: 1 });
		window.removeEventListener("lora-list-refreshed", refreshed);
	});

	it("preserves an unresolved unique LoRA URL while removing an exact duplicate", async () => {
		localStorage.setItem(
			SETTINGS_STORAGE_KEYS.LORAS,
			JSON.stringify([loraFixture.url, loraFixture.url, unresolvedLoraUrl])
		);
		supabaseMock.functions.invoke.mockResolvedValue({ data: [loraFixture], error: null });
		const loraService = await import("../../../src/services/Lora.service");

		await loraService.initialize();

		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([
			loraFixture.url,
			unresolvedLoraUrl
		]);
		expect(loraService.getAll()).toEqual([loraFixture]);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenCalledTimes(1);
	});

	it("removes equivalent stored URLs when metadata coalesces them into one model version", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.LORAS, JSON.stringify([loraFixture.url, equivalentLoraUrl]));
		supabaseMock.functions.invoke.mockResolvedValue({ data: [loraFixture], error: null });
		const loraService = await import("../../../src/services/Lora.service");

		await loraService.initialize();

		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([loraFixture.url]);
		expect(loraService.getAll()).toEqual([loraFixture]);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenCalledTimes(1);
	});

	it("pushes current settings when a LoRA URL is deleted", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.LORAS, JSON.stringify([loraFixture.url]));
		const loraService = await import("../../../src/services/Lora.service");

		loraService.deleteLora(loraFixture.modelVersionId);

		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([]);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenCalledTimes(1);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenLastCalledWith({ label: "LoRA settings" });
	});
});

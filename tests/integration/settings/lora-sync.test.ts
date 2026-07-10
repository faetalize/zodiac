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

	it("pushes current settings when a LoRA URL is deleted", async () => {
		localStorage.setItem(SETTINGS_STORAGE_KEYS.LORAS, JSON.stringify([loraFixture.url]));
		const loraService = await import("../../../src/services/Lora.service");

		loraService.deleteLora(loraFixture.modelVersionId);

		expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.LORAS) ?? "[]")).toEqual([]);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenCalledTimes(1);
		expect(syncServiceMock.queueSettingsPush).toHaveBeenLastCalledWith({ label: "LoRA settings" });
	});
});

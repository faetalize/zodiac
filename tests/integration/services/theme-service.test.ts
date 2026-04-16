import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEYS } from "../../../src/constants/SettingsStorageKeys";
import { addHighlightThemeLink } from "../../helpers/dom";

describe("Theme.service", () => {
	beforeEach(() => {
		vi.resetModules();
		addHighlightThemeLink();
	});

	it("loads saved settings from localStorage and applies them to the document", async () => {
		localStorage.setItem(
			SETTINGS_STORAGE_KEYS.THEME_SETTINGS,
			JSON.stringify({
				colorTheme: "red",
				mode: "light",
				preference: "manual"
			})
		);

		const { themeService } = await import("../../../src/services/Theme.service");
		themeService.initialize();

		expect(document.documentElement.getAttribute("data-theme")).toBe("red");
		expect(document.documentElement.getAttribute("data-mode")).toBe("light");
		expect(document.querySelector("link[data-highlight-theme]")?.getAttribute("href")).toContain("atom-one-light");
	});
});

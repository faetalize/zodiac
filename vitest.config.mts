import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		setupFiles: ["./tests/setup/vitest.setup.ts"],
		include: ["tests/**/*.test.ts"],
		clearMocks: true,
		restoreMocks: true,
		mockReset: true
	}
});

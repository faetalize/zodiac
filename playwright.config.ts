import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 30_000,
	expect: {
		timeout: 5_000
	},
	fullyParallel: true,
	use: {
		baseURL: "https://127.0.0.1:4173",
		ignoreHTTPSErrors: true,
		trace: "on-first-retry"
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] }
		}
	],
	webServer: {
		command: "npm run dev -- --host 127.0.0.1 --port 4173",
		url: "https://127.0.0.1:4173",
		ignoreHTTPSErrors: true,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});

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
		trace: "retain-on-failure"
	},
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : undefined,
	projects: [
		{
			name: "chromium",
			testIgnore: "**/dev-*.spec.ts",
			use: { ...devices["Desktop Chrome"] }
		},
		{
			name: "development",
			testMatch: "**/dev-*.spec.ts",
			use: { ...devices["Desktop Chrome"], baseURL: "https://127.0.0.1:4175" }
		}
	],
	webServer: [
		{
			command: "npm run dev -- --config vite.e2e.config.mts --host 127.0.0.1 --port 4173",
			// Exercise production flags while retaining Vite's module endpoints for fixtures.
			env: { NODE_ENV: "production" },
			url: "https://127.0.0.1:4173",
			ignoreHTTPSErrors: true,
			reuseExistingServer: false,
			timeout: 120_000
		},
		{
			command: "npm run dev -- --config vite.e2e.config.mts --host 127.0.0.1 --port 4175",
			env: { NODE_ENV: "development" },
			url: "https://127.0.0.1:4175",
			ignoreHTTPSErrors: true,
			reuseExistingServer: false,
			timeout: 120_000
		}
	]
});

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import config from "./vite.config.mjs";

// Production-flag and dev-flag test servers must not overwrite each other's
// optimized dependencies, or those of a developer's running app.
export default defineConfig({
	...config,
	cacheDir: fileURLToPath(new URL(`./.vite/e2e-${process.env.NODE_ENV ?? "development"}`, import.meta.url))
});

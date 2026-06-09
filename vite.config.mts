import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
	root: "src",
	plugins: [basicSsl(), tailwindcss()],
	build: {
		target: "esnext",
		outDir: "../dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: fromRoot("./src/index.html"),
				privacy: fromRoot("./src/privacy-policy.html"),
				terms: fromRoot("./src/terms-of-service.html")
			}
		}
	}
});

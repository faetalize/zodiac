import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";
import { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const DEBUG_REPLAY_MAX_BODY_BYTES = 80 * 1024 * 1024;
const DEBUG_REPLAY_ALLOWED_HOSTS = [
	"generativelanguage.googleapis.com",
	"aiplatform.googleapis.com",
	"openrouter.ai"
];

function isAllowedDebugReplayHost(hostname: string): boolean {
	return (
		DEBUG_REPLAY_ALLOWED_HOSTS.includes(hostname) ||
		hostname.endsWith(".supabase.co") ||
		hostname.endsWith(".googleapis.com")
	);
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
	const chunks: Buffer[] = [];
	let totalBytes = 0;

	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		totalBytes += buffer.byteLength;
		if (totalBytes > DEBUG_REPLAY_MAX_BODY_BYTES) {
			throw new Error("Replay payload is too large.");
		}
		chunks.push(buffer);
	}

	return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeReplayBody(body: unknown): BodyInit | undefined {
	if (body === undefined || body === null) return undefined;
	return typeof body === "string" ? body : JSON.stringify(body);
}

function debugReplayProxy(): Plugin {
	return {
		name: "zodiac-debug-replay-proxy",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use("/__debug/replay", (req, res) => {
				void (async () => {
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify({ error: "Use POST" }));
					return;
				}

				try {
					const replay = await readJsonBody(req);
					const url = new URL(String(replay.url || ""));
					if (url.protocol !== "https:" || !isAllowedDebugReplayHost(url.hostname)) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify({ error: `Replay host is not allowed: ${url.hostname}` }));
						return;
					}

					const headers = new Headers(replay.headers || {});
					headers.delete("origin");
					headers.delete("referer");
					headers.delete("user-agent");
					headers.delete("content-length");

					const upstream = await fetch(url, {
						method: replay.method || "POST",
						headers,
						body: normalizeReplayBody(replay.body),
						redirect: "manual"
					});
					const text = await upstream.text();

					res.statusCode = 200;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							status: upstream.status,
							statusText: upstream.statusText,
							headers: Object.fromEntries(upstream.headers.entries()),
							body: text
						})
					);
				} catch (error) {
					res.statusCode = 500;
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
				}
				})();
			});
		}
	};
}

export default defineConfig({
	root: "src",
	plugins: [basicSsl(), tailwindcss(), debugReplayProxy()],
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

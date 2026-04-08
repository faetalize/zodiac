import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
    ["run", "type-check"],
    ["run", "test"],
    ["run", "test:e2e"],
];

let hasFailure = false;

for (const args of steps) {
    const result = spawnSync(npmCommand, args, {
        stdio: "inherit",
        env: process.env,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        hasFailure = true;
    }
}

process.exit(hasFailure ? 1 : 0);

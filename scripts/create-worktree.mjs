import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options,
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`, "utf8");
}

async function askNonEmpty(rl, prompt) {
  while (true) {
    const answer = (await rl.question(prompt)).trim();
    if (answer.length > 0) return answer;
    console.log("Value is required.");
  }
}

function applyBearerToken(existingValue, userInput) {
  const token = userInput.trim();
  if (!token) return existingValue;
  if (token.toLowerCase().startsWith("bearer ")) return token;
  return `Bearer ${token}`;
}

const rl = readline.createInterface({ input, output });

try {
  const branchName = await askNonEmpty(rl, "Branch name: ");

  const defaultWorktreePath = path.join("..", branchName);
  const worktreePathInput =
    (await rl.question(`Worktree path (default: ${defaultWorktreePath}): `)).trim() ||
    defaultWorktreePath;

  const remote = (await rl.question("Remote to track (optional, empty for none): ")).trim();

  const templateCandidates = [
    path.join(process.cwd(), "opencode.json.example"),
    path.join(process.cwd(), "opencode_example.json"),
  ];

  const templatePath = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) {
    console.error("Error: No opencode template found.");
    console.error("Expected either 'opencode.json.example' or 'opencode_example.json' in repo root.");
    process.exit(1);
  }

  const opencodeConfig = readJson(templatePath);

  if (opencodeConfig?.mcp && typeof opencodeConfig.mcp === "object") {
    for (const [serverName, serverConfig] of Object.entries(opencodeConfig.mcp)) {
      if (!serverConfig || typeof serverConfig !== "object") continue;

      if (serverConfig.headers && typeof serverConfig.headers === "object") {
        const currentAuth = serverConfig.headers.Authorization;
        if (typeof currentAuth === "string") {
          const tokenInput = await rl.question(
            `Token for MCP '${serverName}' (paste token only; empty to leave as-is): `,
          );
          serverConfig.headers.Authorization = applyBearerToken(currentAuth, tokenInput);
        }
      }
    }
  }

  console.log(`Creating worktree for branch '${branchName}' at '${worktreePathInput}'...`);
  run("git", ["worktree", "add", "-b", branchName, worktreePathInput]);

  const resolvedWorktreePath = path.resolve(process.cwd(), worktreePathInput);

  console.log("Writing opencode.json into worktree...");
  writeJson(path.join(resolvedWorktreePath, "opencode.json"), opencodeConfig);

  console.log("Running npm install on worktree...");
  run("npm", ["install"], { cwd: resolvedWorktreePath });

  if (remote) {
    console.log(`Publishing branch to remote '${remote}'...`);
    run("git", ["push", "-u", remote, branchName], { cwd: resolvedWorktreePath });
    console.log("Worktree created successfully and branch pushed.");
  } else {
    console.log("Worktree created successfully (no remote tracking configured).");
  }
} finally {
  rl.close();
}

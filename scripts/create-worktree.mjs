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

function runOutput(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function listLocalBranches() {
  return runOutput("git", ["for-each-ref", "refs/heads", "--format=%(refname:short)"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listRemotes() {
  return runOutput("git", ["remote"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listRemoteBranches(remote) {
  return runOutput("git", [
    "for-each-ref",
    `refs/remotes/${remote}`,
    "--format=%(refname:short)",
  ])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listWorktrees() {
  // Example lines (porcelain):
  // worktree /path
  // branch refs/heads/main
  // detached
  const outputText = runOutput("git", ["worktree", "list", "--porcelain"]);
  const entries = [];
  let current = {};

  for (const rawLine of outputText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");

    if (key === "worktree") {
      if (Object.keys(current).length > 0) entries.push(current);
      current = { worktree: value };
      continue;
    }

    if (key === "branch") {
      current.branch = value;
      continue;
    }

    if (key === "detached") {
      current.detached = true;
    }
  }

  if (Object.keys(current).length > 0) entries.push(current);
  return entries;
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
  const localBranches = listLocalBranches();
  if (localBranches.length > 0) {
    console.log("Local branches:");
    for (const name of localBranches) console.log(`- ${name}`);
    console.log("");
  }

  const branchName = await askNonEmpty(rl, "Local branch name (create or reuse): ");
  const branchExists = localBranches.includes(branchName);

  if (branchExists) {
    const worktrees = listWorktrees();
    const branchRef = `refs/heads/${branchName}`;
    const existingWorktree = worktrees.find((entry) => entry.branch === branchRef);

    if (existingWorktree) {
      console.error(
        `Error: Branch '${branchName}' is already checked out in worktree: ${existingWorktree.worktree}`,
      );
      console.error("Choose a different branch name or remove that worktree first.");
      process.exit(1);
    }
  }

  const defaultWorktreePath = path.join("..", branchName);
  const worktreePathInput =
    (await rl.question(`Worktree path (default: ${defaultWorktreePath}): `)).trim() ||
    defaultWorktreePath;

  const remotes = listRemotes();
  if (remotes.length > 0) {
    console.log("Git remotes:");
    for (const name of remotes) console.log(`- ${name}`);
    console.log("");
  }

  const remote = (
    await rl.question(
      "Remote name to publish/track (optional; e.g. origin; empty for none): ",
    )
  ).trim();

  let remoteBranch = "";
  let remoteBranchExists = false;

  if (remote) {
    if (!remotes.includes(remote)) {
      console.error(`Error: Remote '${remote}' not found.`);
      if (remotes.length > 0) console.error(`Known remotes: ${remotes.join(", ")}`);
      process.exit(1);
    }

    try {
      console.log(`Fetching latest refs from '${remote}'...`);
      run("git", ["fetch", "--prune", remote]);
    } catch {
      console.warn(`Warning: Failed to fetch from '${remote}'. Using existing refs.`);
    }

    const remoteBranches = listRemoteBranches(remote)
      .map((ref) => ref.replace(`${remote}/`, ""))
      .filter((name) => name !== "HEAD");

    if (remoteBranches.length > 0) {
      console.log(`Remote branches on '${remote}':`);
      for (const name of remoteBranches) console.log(`- ${name}`);
      console.log("");
    }

    remoteBranch =
      (
        await rl.question(
          `Remote branch to track/publish (default: ${branchName}): `,
        )
      ).trim() || branchName;

    remoteBranchExists = remoteBranches.includes(remoteBranch);
  }

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

      if (serverName === "supabase" && serverConfig.url && typeof serverConfig.url === "string") {
        const currentUrl = serverConfig.url;
        const projectRefMatch = currentUrl.match(/[?&]project_ref=([^&]+)/);
        const currentProjectRef = projectRefMatch ? projectRefMatch[1] : null;

        if (!currentProjectRef || currentProjectRef.startsWith("<")) {
          const projectRefInput = await rl.question(
            `Supabase project ref for MCP (empty to leave placeholder): `,
          );
          if (projectRefInput.trim()) {
            const newProjectRef = projectRefInput.trim();
            serverConfig.url = currentUrl.replace(
              /([?&]project_ref=)[^&]+/,
              `$1${newProjectRef}`
            );
          }
        }
      }

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

  if (branchExists) {
    run("git", ["worktree", "add", worktreePathInput, branchName]);
  } else if (remote && remoteBranchExists) {
    run("git", [
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePathInput,
      `${remote}/${remoteBranch}`,
    ]);
  } else {
    run("git", ["worktree", "add", "-b", branchName, worktreePathInput]);
  }

  const resolvedWorktreePath = path.resolve(process.cwd(), worktreePathInput);

  console.log("Writing opencode.json into worktree...");
  writeJson(path.join(resolvedWorktreePath, "opencode.json"), opencodeConfig);

  console.log("Running npm install on worktree...");
  run("npm", ["install"], { cwd: resolvedWorktreePath });

  if (remote) {
    console.log(`Publishing '${branchName}' to '${remote}/${remoteBranch}'...`);
    run("git", ["push", "-u", remote, `${branchName}:${remoteBranch}`], {
      cwd: resolvedWorktreePath,
    });
    console.log("Worktree created successfully and remote tracking configured.");
  } else {
    console.log("Worktree created successfully (no remote tracking configured). ");
  }
} finally {
  rl.close();
}

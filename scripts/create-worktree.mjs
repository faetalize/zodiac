import { execFileSync, spawn } from "child_process";
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

async function askNonEmpty(rl, prompt) {
  while (true) {
    const answer = (await rl.question(prompt)).trim();
    if (answer.length > 0) return answer;
    console.log("Value is required.");
  }
}

async function askYesNo(rl, prompt, defaultValue = true) {
  while (true) {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    if (!answer) return defaultValue;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Please answer yes or no.");
  }
}

function defaultWorktreePathFromBranch(branchName) {
  return path.join("..", branchName.replaceAll("/", "-"));
}

function remoteTrackingPrompt(defaultRemote) {
  if (defaultRemote) {
    return `Configure remote tracking/publish? (Y/n, default remote: ${defaultRemote}): `;
  }

  return "Configure remote tracking/publish? (y/N): ";
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

  const defaultWorktreePath = defaultWorktreePathFromBranch(branchName);
  const worktreePathInput =
    (await rl.question(`Worktree path (default: ${defaultWorktreePath}): `)).trim() ||
    defaultWorktreePath;

  const remotes = listRemotes();
  if (remotes.length > 0) {
    console.log("Git remotes:");
    for (const name of remotes) console.log(`- ${name}`);
    console.log("");
  }

  const defaultRemote = remotes.includes("origin") ? "origin" : "";
  const shouldUseRemote = remotes.length > 0
    ? await askYesNo(rl, remoteTrackingPrompt(defaultRemote), defaultRemote === "origin")
    : false;

  let remote = "";
  if (shouldUseRemote) {
    remote = defaultRemote
      ? (
          (await rl.question(`Remote name to publish/track (default: ${defaultRemote}): `)).trim() ||
          defaultRemote
        )
      : await askNonEmpty(rl, "Remote name to publish/track: ");
  }

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

  console.log(`Creating worktree for branch '${branchName}' at '${worktreePathInput}'...`);
  const resolvedWorktreePath = path.resolve(process.cwd(), worktreePathInput);

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
  console.log("Running npm install on worktree...");
  try {
    run("npm", ["install"], { cwd: resolvedWorktreePath });
  } catch (err) {
    console.warn("Warning: npm install failed. Continuing with git setup...");
  }

  if (remote) {
    console.log(`Publishing '${branchName}' to '${remote}/${remoteBranch}'...`);
    run("git", ["push", "-u", remote, `${branchName}:${remoteBranch}`], {
      cwd: resolvedWorktreePath,
    });
    console.log("Worktree created successfully and remote tracking configured.");
  } else {
    console.log("Worktree created successfully (no remote tracking configured). ");
  }

  const shouldOpenOpencode = await askYesNo(
    rl,
    "Open opencode in a new Alacritty window? (Y/n): ",
  );

  if (shouldOpenOpencode) {
    console.log(`Opening opencode in ${resolvedWorktreePath}...`);
    const child = spawn(
      "alacritty",
      ["--working-directory", resolvedWorktreePath, "-e", "opencode"],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();
  }
} finally {
  rl.close();
}

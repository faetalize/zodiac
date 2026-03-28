import { execFileSync, spawn } from "child_process";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const HELP_TEXT = `Create a git worktree in a sibling folder and optionally publish it.

Usage:
  npm run create-worktree -- <branch> [worktree-path] [options]
  npm run create-worktree -- --issue <number> [worktree-path] [options]
  node scripts/create-worktree.mjs <branch> [worktree-path] [options]

Positional arguments:
  branch         Local branch name to create or reuse.
  worktree-path  Optional destination path. Defaults to ../<branch> with / replaced by -.

Options:
  -h, --help                 Show this help text.
  --issue <number>          Use issue-<number> as the branch name.
  --remote <name>           Remote to publish/track. Defaults to origin when available.
  --remote-branch <name>    Remote branch name. Defaults to the local branch name.
  --publish                 Push the branch and configure upstream tracking.
  --no-publish              Skip remote publishing and tracking.
  --open                    Launch opencode in a new Alacritty window.
  --no-open                 Do not launch Alacritty.
  --install                 Run npm install in the new worktree.
  --no-install              Skip npm install.
  --interactive             Ask for any values not passed on the CLI.

Examples:
  npm run create-worktree -- feature/chat-cleanup
  npm run create-worktree -- feature/chat-cleanup ../zodiac-chat-cleanup --open
  npm run create-worktree -- --issue 123 --publish --open
  node scripts/create-worktree.mjs fix/sidebar ../zodiac-sidebar --remote origin --publish
`;

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

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    branchName: "",
    worktreePath: "",
    remote: "",
    remoteBranch: "",
    publish: undefined,
    open: undefined,
    install: undefined,
    interactive: false,
    showHelp: false,
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "-h" || arg === "--help" || arg === "help") {
      options.showHelp = true;
      continue;
    }

    if (arg === "--interactive") {
      options.interactive = true;
      continue;
    }

    if (arg === "--publish") {
      options.publish = true;
      continue;
    }

    if (arg === "--no-publish") {
      options.publish = false;
      continue;
    }

    if (arg === "--open") {
      options.open = true;
      continue;
    }

    if (arg === "--no-open") {
      options.open = false;
      continue;
    }

    if (arg === "--install") {
      options.install = true;
      continue;
    }

    if (arg === "--no-install") {
      options.install = false;
      continue;
    }

    if (arg === "--issue") {
      const issueNumber = args.shift();
      if (!issueNumber) throw new Error("Missing value for --issue.");
      if (!/^\d+$/.test(issueNumber)) {
        throw new Error("--issue expects a numeric issue number.");
      }
      if (options.branchName) {
        throw new Error("Pass either a branch positional argument or --issue, not both.");
      }
      options.branchName = `issue-${issueNumber}`;
      continue;
    }

    if (arg === "--remote") {
      const remote = args.shift();
      if (!remote) throw new Error("Missing value for --remote.");
      options.remote = remote;
      continue;
    }

    if (arg === "--remote-branch") {
      const remoteBranch = args.shift();
      if (!remoteBranch) throw new Error("Missing value for --remote-branch.");
      options.remoteBranch = remoteBranch;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!options.branchName) {
      options.branchName = arg;
      continue;
    }

    if (!options.worktreePath) {
      options.worktreePath = arg;
      continue;
    }

    throw new Error(`Unexpected extra argument: ${arg}`);
  }

  return options;
}

function shouldUseInteractivePrompt(options) {
  return options.interactive || (!options.showHelp && !options.branchName);
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));

  if (cliOptions.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  const shouldPrompt = shouldUseInteractivePrompt(cliOptions);
  const rl = shouldPrompt ? readline.createInterface({ input, output }) : null;

  try {
    const localBranches = listLocalBranches();
    if (shouldPrompt && localBranches.length > 0) {
      console.log("Local branches:");
      for (const name of localBranches) console.log(`- ${name}`);
      console.log("");
    }

    const branchName = cliOptions.branchName || await askNonEmpty(rl, "Local branch name (create or reuse): ");
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
    const worktreePathInput = cliOptions.worktreePath || (
      shouldPrompt
        ? ((await rl.question(`Worktree path (default: ${defaultWorktreePath}): `)).trim() || defaultWorktreePath)
        : defaultWorktreePath
    );

    const remotes = listRemotes();
    if (shouldPrompt && remotes.length > 0) {
      console.log("Git remotes:");
      for (const name of remotes) console.log(`- ${name}`);
      console.log("");
    }

    const defaultRemote = remotes.includes("origin") ? "origin" : "";
    const publish = cliOptions.publish ?? (
      shouldPrompt && remotes.length > 0
        ? await askYesNo(rl, remoteTrackingPrompt(defaultRemote), defaultRemote === "origin")
        : defaultRemote === "origin"
    );

    let remote = "";
    if (publish) {
      if (cliOptions.remote) {
        remote = cliOptions.remote;
      } else if (shouldPrompt) {
        remote = defaultRemote
          ? ((await rl.question(`Remote name to publish/track (default: ${defaultRemote}): `)).trim() || defaultRemote)
          : await askNonEmpty(rl, "Remote name to publish/track: ");
      } else {
        remote = defaultRemote;
      }

      if (!remote) {
        console.error("Error: Publishing was requested but no git remote is available.");
        process.exit(1);
      }
    }

    let remoteBranch = cliOptions.remoteBranch || branchName;
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

      if (shouldPrompt && remoteBranches.length > 0) {
        console.log(`Remote branches on '${remote}':`);
        for (const name of remoteBranches) console.log(`- ${name}`);
        console.log("");
      }

      if (!cliOptions.remoteBranch && shouldPrompt) {
        remoteBranch = (
          await rl.question(`Remote branch to track/publish (default: ${branchName}): `)
        ).trim() || branchName;
      }

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

    const shouldInstall = cliOptions.install ?? true;
    if (shouldInstall) {
      console.log("Running npm install on worktree...");
      try {
        run("npm", ["install"], { cwd: resolvedWorktreePath });
      } catch {
        console.warn("Warning: npm install failed. Continuing with git setup...");
      }
    } else {
      console.log("Skipping npm install.");
    }

    if (remote) {
      console.log(`Publishing '${branchName}' to '${remote}/${remoteBranch}'...`);
      run("git", ["push", "-u", remote, `${branchName}:${remoteBranch}`], {
        cwd: resolvedWorktreePath,
      });
      console.log("Worktree created successfully and remote tracking configured.");
    } else {
      console.log("Worktree created successfully (no remote tracking configured).");
    }

    const shouldOpenOpencode = cliOptions.open ?? (
      shouldPrompt
        ? await askYesNo(rl, "Open opencode in a new Alacritty window? (Y/n): ")
        : false
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

    console.log(`Worktree path: ${resolvedWorktreePath}`);
  } finally {
    rl?.close();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  console.error("Run with --help to see supported arguments.");
  process.exit(1);
}

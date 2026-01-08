import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const branchName = process.argv[2];

if (!branchName) {
  console.error("Error: Branch name argument is required");
  console.error("Usage: npm run create-worktree <branch-name>");
  process.exit(1);
}

const worktreePath = path.join("..", branchName);

// 1. Create git worktree
console.log(`Creating worktree for branch '${branchName}' at '${worktreePath}'...`);
execSync(`git worktree add -b ${branchName} ${worktreePath}`, { stdio: "inherit" });

// 2. Copy opencode.json to worktree
console.log("Copying opencode.json to worktree...");
const opencodeJsonPath = path.join(process.cwd(), "opencode.json");
const destinationPath = path.join(process.cwd(), worktreePath, "opencode.json");
fs.copyFileSync(opencodeJsonPath, destinationPath);

// 3. Run npm install on worktree
console.log("Running npm install on worktree...");
process.chdir(worktreePath);
execSync("npm install", { stdio: "inherit" });

// 4. Publish branch to remote
console.log("Publishing branch to remote...");
execSync(`git push -u origin ${branchName}`, { stdio: "inherit" });

console.log("Worktree created successfully!");
console.log(`Branch '${branchName}' has been pushed to remote`);

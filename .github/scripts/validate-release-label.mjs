import { readFileSync } from "node:fs";
import process from "node:process";

const classificationLabels = new Set([
	"feature",
	"enhancement",
	"bug",
	"code improvement",
	"documentation",
	"skip-changelog"
]);

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
	throw new Error("GITHUB_EVENT_PATH is required to validate pull request labels.");
}

const event = JSON.parse(readFileSync(eventPath, "utf8"));
const pullRequestLabels = event.pull_request?.labels?.map((label) => label.name) ?? [];
const classifications = pullRequestLabels.filter((label) => classificationLabels.has(label));

if (classifications.length !== 1) {
	process.stderr.write(
		`Pull requests must have exactly one release classification label. Found ${classifications.length}: ${
			classifications.join(", ") || "none"
		}. Choose one of: ${[...classificationLabels].join(", ")}.\n`
	);
	process.exit(1);
}

process.stdout.write(`Release classification: ${classifications[0]}\n`);

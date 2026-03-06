/**
 * Stamps CHANGELOG.md during `npm version`.
 *
 * Replaces `## [Unreleased]` with:
 *   ## [Unreleased]
 *   ## [x.y.z] - YYYY-MM-DD
 *
 * Runs as the `version` lifecycle script — after version bump, before commit.
 * Exits with error if [Unreleased] section is empty (no entries to release).
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = join(root, "CHANGELOG.md");
const pkgPath = join(root, "package.json");

const version = JSON.parse(readFileSync(pkgPath, "utf8")).version;
const today = new Date().toISOString().slice(0, 10);

let changelog = readFileSync(changelogPath, "utf8");

// Check that [Unreleased] exists
if (!changelog.includes("## [Unreleased]")) {
  console.error("CHANGELOG.md is missing an [Unreleased] section.");
  process.exit(1);
}

// Check that [Unreleased] has content (not just whitespace before the next ## or EOF)
const unreleasedMatch = changelog.match(
  /## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/
);
const unreleasedContent = unreleasedMatch?.[1]?.trim() || "";
if (!unreleasedContent) {
  console.error(
    "CHANGELOG.md [Unreleased] section is empty. Add entries before releasing."
  );
  process.exit(1);
}

// Replace [Unreleased] with versioned header, add fresh [Unreleased] above
changelog = changelog.replace(
  "## [Unreleased]",
  `## [Unreleased]\n\n## [${version}] - ${today}`
);

writeFileSync(changelogPath, changelog);

// Stage the updated changelog so it's included in the version commit
execSync("git add CHANGELOG.md", { cwd: root });

console.log(`Stamped CHANGELOG.md: [${version}] - ${today}`);

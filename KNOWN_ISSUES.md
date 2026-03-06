# Known Issues

## `npx skills update` does not update the lock file hash

The skills.sh CLI's `update` command fails to write the updated `skillFolderHash` back to `~/.agents/.skill-lock.json`, causing subsequent checks to always flag the same skills as outdated.

**Workaround:** This extension uses a remove + add approach instead (`npx skills remove` followed by `npx skills add`), which creates a fresh lock entry with the correct hash.

**Upstream:** [vercel-labs/skills#371](https://github.com/vercel-labs/skills/issues/371)

## Vercel check-updates API branch mismatch (resolved)

The skills.sh API endpoint checks a repo's default branch for the latest hash, but the CLI stores the hash from the `main` branch (falling back to `master`). This creates false positives for repos where the default branch differs.

**Resolution:** This extension bypasses the Vercel API entirely and uses the GitHub Trees API directly, matching the CLI's own branch priority.

**Upstream:** [vercel-labs/skills#373](https://github.com/vercel-labs/skills/issues/373)

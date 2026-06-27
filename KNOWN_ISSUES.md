# Known Issues

## "PromptScript: does not support global skill installation" on install

Installing a skill globally may print, near the end of the CLI output:

```
✗ <skill> → PromptScript: PromptScript does not support global skill installation
■  Failed to install 1
```

This is **cosmetic**. PromptScript (and "Eve") are agents in the upstream
`vercel-labs/skills` registry whose `globalSkillsDir` is `undefined` — they only
support project-level skills. When you do a global install, the CLI can't target
them and reports a per-agent `✗` plus a non-zero exit code, **even though the
skill installed successfully to every other agent** (Claude Code, Cursor, etc.).

PromptScript only gets involved when the current directory contains a
`.promptscript` folder or a `promptscript.yaml` file (that's how the CLI detects
it). Run the install from a different directory to avoid the line entirely.

**In this extension:** we no longer surface a false "Install failed" notification
for this case — a non-zero CLI exit is only reported as a failure when the skill
is genuinely missing from `~/.agents/skills/` afterward.

## `npx skills update` does not update the lock file hash

The skills.sh CLI's `update` command fails to write the updated `skillFolderHash` back to `~/.agents/.skill-lock.json`, causing subsequent checks to always flag the same skills as outdated.

**Workaround:** This extension uses a remove + add approach instead (`npx skills remove` followed by `npx skills add`), which creates a fresh lock entry with the correct hash.

**Upstream:** [vercel-labs/skills#371](https://github.com/vercel-labs/skills/issues/371)

## Vercel check-updates API branch mismatch (resolved)

The skills.sh API endpoint checks a repo's default branch for the latest hash, but the CLI stores the hash from the `main` branch (falling back to `master`). This creates false positives for repos where the default branch differs.

**Resolution:** This extension bypasses the Vercel API entirely and uses the GitHub Trees API directly, matching the CLI's own branch priority.

**Upstream:** [vercel-labs/skills#373](https://github.com/vercel-labs/skills/issues/373)

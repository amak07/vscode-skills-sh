# Skills.sh — Agent Skills Manager

A VS Code extension to browse, install, and manage [Agent Skills](https://skills.sh) for Claude Code, Cursor, Copilot, and more.

## Features

- **Installed Skills** — TreeView showing all globally and project-level installed skills, grouped by source repository
- **Marketplace** — Search and browse skills from skills.sh, with one-click install
- **Update Checking** — Detect outdated skills via the GitHub Trees API and update them in-place
- **Custom Skills** — "My Skills" group for locally-authored skills not from a marketplace source

## Requirements

- VS Code 1.93+
- [skills.sh CLI](https://skills.sh) (`npx skills`) for installing and managing skills
- Node.js 18+

## Getting Started

1. Install the extension
2. Open the **Skills.sh** sidebar (circuit-S icon in the Activity Bar)
3. Browse installed skills or search the marketplace
4. Click install — the extension delegates to `npx skills add` in an integrated terminal

## Known Issues

### `npx skills update` does not update the lock file hash

The skills.sh CLI has an `update` command (`npx skills update`) that detects available updates but fails to write the updated `skillFolderHash` back to `~/.agents/.skill-lock.json`. This means subsequent update checks always flag the same skills as outdated.

**Workaround:** This extension uses a remove + add approach instead (`npx skills remove` followed by `npx skills add`), which creates a fresh lock entry with the correct hash.

**Upstream issues:**
- [vercel-labs/skills#371](https://github.com/vercel-labs/skills/issues/371) — `npx skills update` fails silently for all skills
- [vercel-labs/skills#373](https://github.com/vercel-labs/skills/issues/373) — `skills update` hardcodes `tree/main`, breaks repos using other default branches

### Vercel check-updates API branch mismatch (resolved)

The skills.sh Vercel API endpoint (`add-skill.vercel.sh/check-updates`) checks a repo's **default branch** for the latest hash, but the CLI stores the hash from the `main` branch (falling back to `master`). For repos where the default branch is something else (e.g. `canary` for `resend/react-email`), this creates permanent false positives — the API always reports an update available, but reinstalling writes back the same hash.

**Resolution:** This extension bypasses the Vercel API entirely and uses the GitHub Trees API directly, matching the CLI's own `main` → `master` branch priority. This eliminates false positives from branch mismatches.

**Upstream issue:**
- [vercel-labs/skills#373](https://github.com/vercel-labs/skills/issues/373) — `skills update` hardcodes `tree/main`, breaks repos using master

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `skills-sh.defaultAgent` | `claude-code` | Default agent for install/uninstall commands |
| `skills-sh.installScope` | `project` | Default install scope (`global` or `project`) |
| `skills-sh.checkUpdatesOnStartup` | `true` | Silently check for updates when VS Code starts |
| `skills-sh.customSources` | `[]` | Additional GitHub repos to browse in the marketplace |

## License

MIT

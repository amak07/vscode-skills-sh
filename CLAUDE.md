# Skills.sh Agent Skills Manager

## Skills System Layout (Windows)

Skills are installed as **symlinks**:
- `~/.claude/skills/<name>/` → `~/.agents/skills/<name>/`
- Lock file: `~/.agents/.skill-lock.json` — tracks source, hash, timestamps per skill
- `npx skills add` (from skills.sh/Vercel) manages both the symlink and the lock file

### Scanning gotcha
Node.js `Dirent.isDirectory()` returns `false` for symlinks. Use `isSymbolicLink()` + `fs.statSync()` to follow them. See `isDirectoryEntry()` in `src/local/scanner.ts`.

### File watching gotcha
VS Code's `FileSystemWatcher` may not detect content changes through symlinks on Windows. The watcher also monitors `~/.agents/.skill-lock.json` (a regular file) as a reliable fallback for detecting installs and updates.

## Local VSIX Install (Testing)

To build and install the extension locally for testing:

```bash
npm.cmd run build && npx.cmd vsce package --no-dependencies
"/c/Users/abelm/AppData/Local/Programs/Microsoft VS Code/bin/code" --install-extension skills-sh-0.1.0.vsix --force
```

Then reload the target VS Code window: **Ctrl+Shift+P → "Developer: Reload Window"**.

## Publishing

### Accounts & Credentials

| Service | Account | Purpose |
|---------|---------|---------|
| [VS Code Marketplace](https://marketplace.visualstudio.com/manage) | Publisher: `AbelMak` | Primary marketplace |
| [Azure DevOps](https://dev.azure.com/abelmak07/_usersSettings/tokens) | Org: `abelmak07` | PAT for `vsce` CLI |
| [Open VSX](https://open-vsx.org) | Namespace: `AbelMak` | Cursor/Windsurf/VSCodium |
| [GitHub](https://github.com/amak07/vscode-skills-sh) | Repo owner | Source, CI/CD, releases |

### Manual Publish (from local machine)

```bash
# VS Code Marketplace (vsce login is cached locally)
npx.cmd vsce publish patch --no-dependencies   # bumps version, commits, tags, publishes

# Open VSX (token required each time, or set OVSX_PAT env var)
npx.cmd ovsx publish --pat $OVSX_PAT --no-dependencies

# Push commits + tags to GitHub
git push origin master --tags
```

`vsce publish patch|minor|major` auto-bumps `package.json`, creates a git commit + tag, builds, and uploads. Working tree must be clean (stash `.claude/settings.local.json` first).

### Automated Publish (CI/CD)

`.github/workflows/publish.yml` triggers on `v*` tag push and publishes to both marketplaces. Requires GitHub Actions secrets:

- `VSCE_PAT` — Azure DevOps PAT (Marketplace > Manage scope, All accessible orgs)
- `OVSX_PAT` — Open VSX access token

Add secrets at: https://github.com/amak07/vscode-skills-sh/settings/secrets/actions

### CI

`.github/workflows/ci.yml` runs on every push/PR to master: Node 18+20 matrix, `npm ci && npm test && npm run build`, then packages VSIX artifact.

## Windows MINGW64

Use `npm.cmd` not `npm`, `npx.cmd` not `npx` when running commands via Claude Code's Bash tool (MINGW64 shell wrapper issue). The VS Code integrated terminal resolves these correctly on its own — this only applies to Claude's Bash tool.

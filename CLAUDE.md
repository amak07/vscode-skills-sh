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

### Publishing a New Version (Recommended: CI/CD)

1. Commit your changes
2. Bump version and create tag:
   ```bash
   npm.cmd version patch   # or minor/major — bumps package.json, creates git commit + tag
   ```
3. Push to GitHub:
   ```bash
   git push origin master --tags
   ```
4. CI builds, tests, and publishes to **both** marketplaces automatically

The `v*` tag push triggers `.github/workflows/publish.yml`, which:
- Builds and packages the VSIX once
- Publishes to VS Code Marketplace and Open VSX **in parallel** (independent jobs — if one fails, the other still completes)

### Manual Publish (fallback)

Only if CI is broken or secrets are missing:

```bash
# VS Code Marketplace (vsce login is cached locally)
npx.cmd @vscode/vsce publish --no-dependencies --packagePath *.vsix

# Open VSX (token required each time, or set OVSX_PAT env var)
npx.cmd ovsx publish --pat $OVSX_PAT --no-dependencies
```

Working tree must be clean for `npm version` / `vsce publish` — `.claude/settings.local.json` is gitignored so this shouldn't be an issue.

### CI/CD Secrets

Both secrets are configured at: https://github.com/amak07/vscode-skills-sh/settings/secrets/actions

- `VSCE_PAT` — Azure DevOps PAT (Org: All accessible orgs, Scope: Marketplace > Manage)
- `OVSX_PAT` — Open VSX access token

### CI

`.github/workflows/ci.yml` runs on every push/PR to master: Node 18+20 matrix, `npm ci && npm test && npm run build`, then packages VSIX artifact.

## Windows MINGW64

Use `npm.cmd` not `npm`, `npx.cmd` not `npx` when running commands via Claude Code's Bash tool (MINGW64 shell wrapper issue). The VS Code integrated terminal resolves these correctly on its own — this only applies to Claude's Bash tool.

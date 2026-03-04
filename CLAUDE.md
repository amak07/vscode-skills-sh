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

## Commands

- `npm.cmd run build` — Production build (esbuild)
- `npm.cmd test` — Vitest (single run)
- `npm.cmd run lint` — ESLint
- `npx.cmd vsce package --no-dependencies` — Package VSIX

## Architecture

- **src/ directory:** All source code under `src/`
- **Entry point:** `src/extension.ts` — activation, command registration, provider wiring
- **Local scanning:** `src/local/scanner.ts` — multi-agent skill directory scanner
- **Known agents:** `src/local/known-agents.ts` — static registry of 11 AI agent skill paths
- **Install/uninstall:** `src/install/installer.ts` — delegates to `npx skills add/remove`
- **TreeView:** `src/views/installed-tree.ts` — sidebar tree with source grouping + agent badges
- **Webview:** `src/views/marketplace/` — search, detail pages, installed tab (provider.ts, webview-script.ts, styles.ts, templates.ts)
- **API clients:** `src/api/` — skills.sh search, GitHub Trees, update checker, security audits, docs scraper
- **Types:** `src/types.ts` — shared interfaces (InstalledSkill, InstalledSkillCard, etc.)
- **Constants:** `src/utils/constants.ts` — URLs, cache TTLs, path helpers
- **Tests:** `src/test/unit/` — mirrors src/ structure, uses `src/test/helpers/fs-sandbox.ts` for temp dirs

## Architecture Diagrams

Excalidraw source files live in `docs/architecture/`. The rendered documentation is in [`docs/architecture/architecture.md`](docs/architecture/architecture.md). CI auto-exports `.excalidraw` → `.svg` on push to master.

### Best Practices (Interview-Ready Diagrams)
- **One concept per diagram** — don't cram everything into a god diagram
- **Annotate decisions, not just boxes** — interviewers care about WHY, not just WHAT
- **Color-code by concern** (consistent across all diagrams):
  - Blue: Extension internals
  - Green: External APIs/services
  - Orange: Filesystem/local
  - Purple: Terminal/CLI
  - Red: Error paths/fallbacks
- **Layered detail** — scannable for PMs ("what it does"), deep enough for engineers ("how and why")
- **Keep text minimal** — labels and short annotations, not paragraphs
- **Number diagrams** for presentation order (01-, 02-, etc.)
- **Font**: Helvetica (fontFamily 2) — not Virgil (hand-drawn). Diagrams are ~1700px wide but render at ~800px in GitHub README. Hand-drawn font becomes illegible at that scale.
- **Min font size**: 16px for annotations, 20px for labels, 24-32px for titles/section headers

### Editing with Excalidraw MCP

We use the [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) MCP server for visual diagram editing. This provides a closed feedback loop: import → screenshot → adjust → screenshot → export.

**Why not the official Excalidraw MCP?** The [official one](https://github.com/excalidraw/excalidraw-mcp) is generation-only (streams new diagrams from prompts). It has no `import_scene`, `get_canvas_screenshot`, or `update_element` — useless for editing existing diagrams.

**Setup (already done, persisted at user scope):**
```bash
# Canvas server lives at ~/Projects/mcp_excalidraw (cloned + built)
# MCP registered with Claude Code:
claude mcp add excalidraw --scope user \
  -e EXPRESS_SERVER_URL=http://localhost:3777 \
  -e ENABLE_CANVAS_SYNC=true \
  -- node /c/Users/abelm/Projects/mcp_excalidraw/dist/index.js
```

**Before editing diagrams, start the canvas server:**
```bash
cd ~/Projects/mcp_excalidraw
HOST=0.0.0.0 PORT=3777 node dist/server.js
# Then open http://localhost:3777 in a browser (required for screenshots)
```

**Workflow for editing a diagram:**
1. `clear_canvas` → `import_scene` (load the `.excalidraw` file)
2. `get_canvas_screenshot` → assess current state
3. `describe_scene` → get structured element IDs and positions
4. `update_element` / `align_elements` / `distribute_elements` → make changes
5. `get_canvas_screenshot` → verify fixes visually
6. `export_scene` → save back to `.excalidraw` file
7. `export_to_image(format: svg)` → export `.svg` for docs

**Key MCP tools:**
- `import_scene` / `export_scene` — load/save `.excalidraw` files
- `get_canvas_screenshot` — visual verification (requires browser open)
- `describe_scene` — structured list of all elements with IDs, positions, text
- `update_element` — modify individual element properties (position, font, color)
- `align_elements` / `distribute_elements` — layout helpers
- `export_to_image` — export to SVG or PNG

### SVG Export Pipeline

**CI (automatic):** `.github/workflows/export-diagrams.yml` runs on push to master when `.excalidraw` files change. Uses `excalidraw_export --embed-fonts`.

**Local (manual):** `npm.cmd run export-diagrams` or use the MCP's `export_to_image` tool.

**Important:** The SVGs must be committed alongside the `.excalidraw` source files. `architecture.md` references SVGs with relative paths (`01-system-context.svg`). The README links to `architecture.md`.

### Adding a New Diagram
1. Create `docs/architecture/NN-name.excalidraw`
2. Follow the color coding and font conventions above
3. Add 2-3 decision annotations (italic callouts explaining trade-offs)
4. Export SVG via MCP (`export_to_image`) or push and let CI handle it
5. Add a section to `docs/architecture/architecture.md` with `![Name](NN-name.svg)`

## Beads Task Management

Tasks persist across sessions in `.beads/`. Run at session start:

```bash
bd ready                                  # See pending tasks
bd create --title="..." --type=task       # Create task
bd update <id> --status=in_progress       # Start working
bd close <id> --reason="done"             # Complete task
```

**Issue Quality:** Every beads issue MUST have a meaningful description at creation time. Include what needs to be done, why it matters, and technical notes if relevant.

## Testing Rules

- **No sneaky implementation changes**: When writing tests, do NOT modify production code to make tests easier to write or pass. Tests must work against the current codebase as-is.
- **HARD STOP on production code changes**: If a test failure reveals a bug in production code, STOP — show the user what broke and wait for explicit approval before touching any production file.
- **Do not modify existing test files** unless the user has approved the change.

## Landing the Plane (Session Completion)

Work is NOT complete until changes are committed, pushed, and CI passes.

### 0. Code review (before committing)

Use `superpowers:requesting-code-review` to launch a review subagent. Fix all Critical and Important issues before proceeding.

### 1. Run quality gates

```bash
npm.cmd test          # Unit tests
npm.cmd run build     # Build
```

### 2. Commit, push, and open PR

```bash
git add <files>
git commit -m "..."
git push -u origin <branch>
gh pr create --title "..." --body "..."
```

### 3. Monitor PR until merged

1. Wait for CI, then check: `gh pr checks <pr-number>`
2. If CI fails: investigate, fix, push again, repeat
3. Report status to the user — never leave a PR in limbo

### 4. Release (if publishing a new version)

1. Update `CHANGELOG.md`: rename `[Unreleased]` → `[x.y.z] - YYYY-MM-DD`
2. Bump version and create tag:
   ```bash
   npm.cmd version patch   # or minor/major — bumps package.json, creates git commit + tag
   ```
3. Push to GitHub:
   ```bash
   git push origin master --tags
   ```
4. CI builds, tests, and publishes to **both** marketplaces automatically

The `[Unreleased]` section in CHANGELOG.md is where new features/fixes accumulate between releases. Always add entries there as work is completed, then rename to the version number at publish time.

**Critical rules:**
- NEVER stop before the PR is merged
- NEVER say "ready to push when you are" — YOU must push and open the PR
- If CI fails, resolve and retry until it passes

## Windows MINGW64

Use `npm.cmd` not `npm`, `npx.cmd` not `npx` when running commands via Claude Code's Bash tool (MINGW64 shell wrapper issue). The VS Code integrated terminal resolves these correctly on its own — this only applies to Claude's Bash tool.

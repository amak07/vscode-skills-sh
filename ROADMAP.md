# Roadmap

> Last updated: March 2026

## P1 — Next Up

These are the highest-impact features we're building next. No fixed sequence — we pick from this pool based on momentum and opportunity.

### Skill Creation Wizard
Scaffold a new skill from the extension: quick-pick flow for name, description, agent targets, and scope. Generates a SKILL.md with frontmatter and opens it for editing. Closes the biggest UX gap — the extension helps consume skills but not create them.

### Welcome / Onboarding Experience
First-run walkthrough using VS Code's native Walkthroughs API. Introduces the extension, guides agent selection, suggests a starter skill set. Currently we show a basic prompt when no skills are found — this replaces it with a proper guided experience.

### Skill Usage Analytics
Track which installed skills are actually being used by agents (file access monitoring on SKILL.md). Show "last used" timestamps, flag never-used skills for cleanup. All local — no telemetry sent anywhere.

### Update Diff Preview
Show a VS Code diff editor (local SKILL.md vs remote) before applying a skill update. Uses existing infrastructure (`fetchSkillMd()` and VS Code's built-in diff API). Low effort, high trust — users see exactly what changed.

### Quick Skill Enable/Disable
Disable a skill without uninstalling it by renaming `SKILL.md` to `SKILL.md.disabled`. The scanner ignores directories without a valid SKILL.md. Useful for multi-project developers who need different skill sets per project. Tree view shows disabled skills in a dimmed group.

---

## P2 — Up Next

### Skill Pinning / Favorites
Pin frequently-used skills to the top of the tree view for quick access.

### Keyboard Shortcuts
Keybindings for common operations: search marketplace, refresh, check updates, quick skill toggler. Scoped with `when` clauses so they only fire when the skills view is focused.

### Skill Recommendations
Detect project type from `package.json`, `Cargo.toml`, `go.mod`, etc. and suggest matching skills. Gap analysis: "You have frontend skills but no testing skill." Project-type detection works standalone; co-install patterns require usage analytics data.

### Marketplace New Skill Notifications
On startup, query the skills.sh API for skills published since last check, filtered by the user's configured categories. Show a summary notification like "3 new skills this week in your categories" — not per-skill spam. Gated by the existing `showNotifications` setting.

---

## P3 — Later

### Skill Preview Panel
Rich preview of a skill before installing: rendered SKILL.md, metadata, compatibility matrix. Especially useful for custom source skills not listed on skills.sh.

### Tree View Sorting Options
Sort installed skills by name, last used, install date, source, etc.

### Custom GitHub Repo Sources
Browse and install skills from any GitHub repository, not just the skills.sh marketplace.

---

## P4 — Backlog

These are tracked but not actively planned. We'll revisit as the project evolves.

- **Search History / Recent Searches** — Show recent search queries in the marketplace for quick re-access.
- **Promote/Demote Skill Scope** — Move a skill between global (`~/.agents/skills/`) and project (`.claude/skills/`) scope.
- **Auto-Update Mode** — Automatically apply skill updates in the background. Depends on update diff preview being established first.
- **Skill Compatibility Warnings** — Validate SKILL.md `compatibility` and `allowed-tools` fields against the user's agent. Show a non-blocking warning on install.
- **Multi-Agent Launch** — Detect which AI agents are installed and support launching skills in Cursor, Windsurf, etc. (not just Claude Code).

---

## Known Bugs

- **Project-scoped uninstall doesn't remove `~/.agents/skills/` content** (P4) — Edge case where uninstalling a project-scoped skill leaves behind content in the global agents directory.

---

## Recently Completed

- **Cross-agent scanning** — The scanner now covers 11 AI agents (Claude Code, Cursor, Windsurf, Codex, Roo, Gemini CLI, Trae, Kiro, Continue, GitHub Copilot). Skills found in multiple agent directories are deduplicated with agent badges.
- **Team skill sync** — Achieved via `skills.json` manifest. Add/remove skills from the manifest via context menus, auto-detect missing skills on project open, and "Install from skills.json" for team-wide sync.
- **Skill export/import** — Covered by `skills.json` manifest committed to version control.

## Dropped

- **Infinite scroll / server-side pagination** — Breaks away from skills.sh UX patterns.
- **Server-side category filtering** — We don't control the skills.sh API; current chip-to-search approach works.
- **Batch operations** — Added complexity without sufficient ROI.
- **Skill collections / bundles** — No skills.sh collections API exists yet. Revisit if Vercel adds one.
- **Skill health dashboard** — `getDiagnostics()` is a developer-only startup check; low user-facing value as a full dashboard.
- **Install count in tree view** — Requires expensive per-skill API calls with no bulk endpoint available.

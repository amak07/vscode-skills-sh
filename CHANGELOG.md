# Changelog

All notable changes to the Skills.sh Agent Skills Manager extension will be documented in this file.

## [Unreleased]

## [0.1.10] - 2026-03-06

### Added

- Open VSX downloads badge in README

## [0.1.9] - 2026-03-06

### Fixed

- Demo images now render on VS Code Marketplace and Open VSX (switched to absolute GitHub URLs)

## [0.1.8] - 2026-03-06

### Added

- README demos — hero install flow, marketplace exploration, and skills.json sharing (animated webp)
- Installs badge and updated tagline in README
- "Edit skills.json" command in installed skills view menu
- Known issues moved to dedicated `KNOWN_ISSUES.md`

### Changed

- Marketplace UX improvements — preserve scroll position on back navigation with detail overlay
- Updated README settings table to include `activeAgents`
- Team Sharing section rewritten for clarity
- Quick Start step 5 is now agent-agnostic

## [0.1.7] - 2026-03-04

### Added

- Architecture diagrams (Excalidraw) with plain-language annotations for system context, install flow, multi-agent scanning, and webview communication
- Dedicated architecture documentation page (`docs/architecture/architecture.md`)

### Changed

- Clean up TreeView — removed agent badges and preview button for a simpler sidebar
- Rebuilt all architecture diagrams from scratch with new design spec and improved readability

## [0.1.6] - 2026-03-01

### Added

- **Multi-agent awareness** — scan skill directories for 11 AI coding agents (Claude Code, Cursor, Windsurf, GitHub Copilot, Codex, Roo Code, Gemini CLI, Trae, Kiro, Continue, and the canonical skills.sh directory). Skills found in multiple agent directories are deduplicated and show agent badges in the TreeView, webview installed tab, and skill detail page.
- Agent logo carousel in marketplace hero section
- ROADMAP.md with planned features and priorities

### Changed

- Replaced extension logo with skill tree design
- Switched CI to `@vscode/vsce` (replacing deprecated `vsce` package)

## [0.1.5] - 2026-02-28

### Changed

- Split publish workflow into parallel independent jobs (VS Code Marketplace and Open VSX publish independently)

## [0.1.4] - 2026-02-27

### Added

- Antigravity added to supported editor list

### Changed

- Switched sidebar icon to line/stroke style
- Optimized marketplace keywords for discoverability

## [0.1.3] - 2026-02-26

### Changed

- Exclude source maps and CI configs from VSIX package
- Added publishing documentation to CLAUDE.md

## [0.1.0] - 2026-02-25

### Added

- **Installed Skills TreeView** — scans `~/.claude/skills/`, `~/.cursor/skills/`, `~/.codeium/windsurf/skills/`, and `~/.codex/skills/` for installed agent skills, grouped by source repository
- **Marketplace panel** — search and browse skills from skills.sh with one-click install via `npx skills add`
- **Update checking** — detect outdated skills using the GitHub Trees API and update them in-place (remove + add to work around upstream CLI bugs)
- **Launch Claude with Skill** — start a Claude Code session with a specific skill pre-loaded
- **SKILL.md preview** — preview skill documentation in a VS Code editor tab
- **Multi-directory scanning** — scans canonical skill directories (`~/.agents/skills/`, `~/.claude/skills/`) and project-level directories
- **Project and global scopes** — install skills at project level (`.claude/skills/`) or globally (`~/.claude/skills/`)
- **Team sharing** — `skills.json` manifest to share recommended skills with teammates, with auto-detect for missing skills
- **Security audits browser** — view audit results from Gen Agent Trust Hub, Socket, and Snyk
- **Documentation browser** — read skills.sh docs (Overview, CLI, FAQ) in-editor
- **Skill detail pages** — view install counts, repository info, security audits, and rendered SKILL.md
- **File system watcher** — auto-refresh when skills are added or removed outside the extension
- **Lock file monitoring** — watches `~/.agents/.skill-lock.json` for reliable install/update detection

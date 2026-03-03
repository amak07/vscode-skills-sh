# Changelog

All notable changes to the Skills.sh Agent Skills Manager extension will be documented in this file.

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

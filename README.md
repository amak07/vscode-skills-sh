<p align="center">
  <img src="media/icon.png" alt="Skills.sh logo" width="128" />
</p>

<h1 align="center">Skills.sh — Agent Skills Manager</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AbelMak.skills-sh"><img src="https://img.shields.io/visual-studio-marketplace/v/AbelMak.skills-sh?label=VS%20Code%20Marketplace" alt="VS Code Marketplace" /></a>
  <a href="https://open-vsx.org/extension/AbelMak/skills-sh"><img src="https://img.shields.io/open-vsx/v/AbelMak/skills-sh?label=Open%20VSX" alt="Open VSX" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=AbelMak.skills-sh"><img src="https://img.shields.io/visual-studio-marketplace/i/AbelMak.skills-sh?label=VS%20Code%20installs&color=brightgreen" alt="VS Code Installs" /></a>
  <a href="https://open-vsx.org/extension/AbelMak/skills-sh"><img src="https://img.shields.io/open-vsx/dt/AbelMak/skills-sh?label=Open%20VSX%20downloads&color=brightgreen" alt="Open VSX Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

<p align="center"><strong>The package manager for AI agent skills — powered by the <a href="https://skills.sh">skills.sh</a> open standard.</strong></p>

<p align="center">
  Discover, install, and manage agent skills without leaving your IDE.<br />
  Browse the skills.sh marketplace, keep skills up to date, and share curated skill sets with your team — all from the sidebar.<br />
  Works across <strong>11 AI coding agents</strong> including Claude Code, Cursor, Windsurf, Copilot, Codex, and more.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AbelMak.skills-sh"><img src="https://img.shields.io/badge/Install-VS%20Code%20Marketplace-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="Install from VS Code Marketplace" /></a>
  <a href="https://open-vsx.org/extension/AbelMak/skills-sh"><img src="https://img.shields.io/badge/Install-Open%20VSX-a60ee5?style=for-the-badge&logo=eclipse-ide&logoColor=white" alt="Install from Open VSX" /></a>
</p>

<p align="center">
  Works with <strong>VS Code</strong> · <strong>Cursor</strong> · <strong>Windsurf</strong> · <strong>Antigravity</strong> · <strong>VSCodium</strong> · any VSIX-compatible editor
</p>

<h3 align="center">Find and install a skill in seconds</h3>

<p align="center">
  <img src="https://raw.githubusercontent.com/amak07/vscode-skills-sh/master/docs/demo.webp" alt="Find and install a skill in seconds" width="100%" />
</p>

<h3 align="center">Explore the marketplace — leaderboards, search, and skill details</h3>

<p align="center">
  <img src="https://raw.githubusercontent.com/amak07/vscode-skills-sh/master/docs/demo-marketplace.webp" alt="Explore the marketplace — leaderboards, search, and skill details" width="100%" />
</p>

<h3 align="center">Share skills with your team via skills.json</h3>

<p align="center">
  <img src="https://raw.githubusercontent.com/amak07/vscode-skills-sh/master/docs/demo-skills-json.webp" alt="Share skills with your team via skills.json" width="100%" />
</p>

---

## Features

### Marketplace

- Search and browse skills from [skills.sh](https://skills.sh) with trending, all-time, and hot leaderboards
- One-click install via `npx skills add` in an integrated terminal
- Skill detail pages with install counts, security audits, and rendered SKILL.md documentation
- Open the marketplace in a full editor tab for more space

### Installed Skills

- TreeView showing all installed skills grouped by source repository
- **Multi-agent awareness** — see which AI tools have each skill (Claude Code, Cursor, Windsurf, etc.)
- Global (`~/.agents/skills/`) and project-level (`.claude/skills/`) scopes
- "My Skills" group for locally-authored custom skills
- SKILL.md preview (rendered Markdown) and raw file viewing
- Copy skill path to clipboard

### Skill Updates

- Detect outdated skills using the GitHub Trees API
- Badge count in the TreeView title showing available updates
- Update individual skills or all at once
- Silent background update check on startup (configurable)

### Launch Claude with Skill

- Start a Claude Code session with a specific skill pre-loaded
- Configurable target: terminal CLI or Claude Code extension panel

### Team Sharing

Commit a `skills.json` manifest to your repo so every team member gets the same skills. When a collaborator opens the project, the extension detects any skills listed in the manifest that are missing locally and prompts to install them — no manual setup needed.

- Add or remove skills from the manifest via context menus
- Automatically detects missing skills on project open and prompts to install
- "Install from skills.json" to sync all listed skills in one click
- Commit `skills.json` to version control and share via git

```json
{
  "skills": [
    {
      "source": "remotion-dev/skills",
      "skills": ["remotion-best-practices"]
    },
    {
      "source": "vercel-labs/skills",
      "skills": ["find-skills"]
    },
    {
      "source": "wshobson/agents",
      "skills": ["design-system-patterns"]
    }
  ]
}
```

### Security & Documentation

- Browse security audit results from Gen Agent Trust Hub, Socket, and Snyk
- Read skills.sh documentation (Overview, CLI, FAQ) directly in the editor

### Auto-refresh

- File system watcher detects external installs and removals
- Lock file monitoring (`~/.agents/.skill-lock.json`) for reliable detection on all platforms
- Re-scan on window focus (configurable)

## Works Everywhere

This extension is VSIX-based and works with any compatible editor:

- **VS Code**
- **Cursor**
- **Windsurf**
- **VSCodium** (via Open VSX)
- **Theia**

The extension scans skill directories for 11 AI coding agents (paths verified against the [skills.sh CLI source](https://github.com/vercel-labs/skills)):

| Directory | Agent |
|-----------|-------|
| `~/.agents/skills/` | skills.sh (canonical) |
| `~/.claude/skills/` | Claude Code |
| `~/.cursor/skills/` | Cursor |
| `~/.codeium/windsurf/skills/` | Windsurf |
| `~/.copilot/skills/` | GitHub Copilot |
| `~/.codex/skills/` | Codex |
| `~/.roo/skills/` | Roo Code |
| `~/.gemini/skills/` | Gemini CLI |
| `~/.trae/skills/` | Trae |
| `~/.kiro/skills/` | Kiro |
| `~/.continue/skills/` | Continue |
| `.claude/skills/` | Project-level (team-shared via git) |

Skills found in multiple agent directories are deduplicated and show agent badges in the sidebar.

## Installation

### From VS Code Marketplace

1. Open Extensions (`Ctrl+Shift+X`)
2. Search **"Skills.sh"**
3. Click **Install**

### From Open VSX (Cursor, Windsurf, VSCodium)

Install from [open-vsx.org/extension/AbelMak/skills-sh](https://open-vsx.org/extension/AbelMak/skills-sh), or search "Skills.sh" in your editor's extension panel.

### Manual VSIX Install

Download the `.vsix` file from [GitHub Releases](https://github.com/amak07/vscode-skills-sh/releases), then:

```bash
code --install-extension skills-sh-0.1.0.vsix
# Cursor:
cursor --install-extension skills-sh-0.1.0.vsix
```

## Quick Start

1. Install the extension
2. Open the **Skills.sh** sidebar (circuit-S icon in the Activity Bar)
3. Browse the **Marketplace** panel or check your **Installed Skills**
4. Click a skill to view details, then click **Install**
5. Right-click an installed skill to launch it with your preferred agent, preview SKILL.md, or share it with your team

## Settings

All settings are under `skills-sh.*` in VS Code Settings.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `installScope` | `global` / `project` / `ask` | `global` | Where skills are installed by default |
| `claudeLaunchTarget` | `terminal` / `extension` | `terminal` | How to open Claude when launching with a skill |
| `confirmBeforeInstall` | boolean | `true` | Show confirmation dialog before install/uninstall |
| `activeAgents` | string[] | all 11 agents | Which AI agents to scan for installed skills |
| `categories` | string[] | `["react","next",...]` | Marketplace filter chips for quick searching |
| `autoRefreshOnFocus` | boolean | `true` | Re-scan skills when the editor window regains focus |
| `checkUpdatesOnStartup` | boolean | `true` | Check for skill updates on activation |
| `promptSkillsJson` | boolean | `true` | Prompt to create `skills.json` when skills exist but no manifest |
| `showNotifications` | `all` / `errors` / `none` | `all` | Control toast notification verbosity |

## Commands

Available from the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| **Skills.sh: Browse & Install Skills** | Open the marketplace to search and install |
| **Skills.sh: Refresh Installed Skills** | Re-scan skill directories |
| **Skills.sh: Check for Updates** | Check all installed skills for available updates |
| **Skills.sh: Open Marketplace** | Focus the marketplace sidebar panel |
| **Skills.sh: Open Settings** | Jump to Skills.sh settings |
| **Skills.sh: Edit skills.json** | Open the project's skill manifest |
| **Skills.sh: Install from skills.json** | Install all skills listed in the manifest |

Additional commands are available from the TreeView context menu (right-click an installed skill): Open SKILL.md, Preview SKILL.md, Launch Claude with Skill, Uninstall, Update, Copy Path, Add/Remove from skills.json.

## Architecture

See [Architecture Documentation](docs/architecture/architecture.md) for detailed diagrams covering the system context, install flow, multi-agent scanning, and webview communication.

## Known Issues

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for details on upstream CLI quirks and workarounds.

## Requirements

- VS Code 1.93+ (or any compatible VSIX editor)
- [Node.js](https://nodejs.org/) 18+
- [skills.sh CLI](https://skills.sh) (`npx skills`) for install and uninstall operations

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features, priorities, and what's been recently completed or dropped.

## Contributing

Found a bug or have a feature request? [Open an issue](https://github.com/amak07/vscode-skills-sh/issues) on GitHub.

## Links

- [skills.sh](https://skills.sh) — Agent Skills marketplace
- [GitHub Repository](https://github.com/amak07/vscode-skills-sh)
- [Issue Tracker](https://github.com/amak07/vscode-skills-sh/issues)
- [Roadmap](ROADMAP.md)

## License

[MIT](LICENSE)

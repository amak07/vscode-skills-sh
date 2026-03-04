# Architecture

> Diagrams use the [Excalidraw](https://excalidraw.com) style. Source files are in this directory — editable with the [VS Code Excalidraw extension](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor). SVGs are exported locally and committed alongside the source files.

## How to Read These Diagrams

Each diagram answers **one question** and highlights 2-3 non-obvious design decisions in yellow callout boxes. Color coding is consistent across all diagrams:

| Color | Meaning |
|-------|---------|
| Blue | Extension internals |
| Green | External APIs/services |
| Orange | Filesystem/local |
| Purple | Terminal/CLI |
| Red | Error paths / security |
| Yellow | Decision annotations |
| Gray | Person / Actor |

Walk through each diagram in 2-3 minutes by starting at the title question, following the arrows, and reading the yellow callouts for the "why" behind each design choice.

---

## 01 — System Context

**What does this extension talk to?**

The extension lives in VS Code and communicates with three groups of external services: the skills.sh platform (REST API for search, HTML scraping for details), GitHub (Trees API for updates, raw content for SKILL.md), and the local filesystem (22 skill directories across 11 agents at 2 scopes). Installation is fire-and-forget via the VS Code terminal.

![System Context](01-system-context.svg)

## 02 — Install Flow

**How does the extension know when a terminal install finishes?**

VS Code terminals are fire-and-forget — you can't read their output or get a return code. The installer starts three concurrent detection mechanisms in a `Promise.race`: Shell Integration (reliable on macOS/Linux), FileSystemWatcher on the lock file (reliable on Windows), and a 30-second timeout safety net. Whichever fires first wins, cleans up the other two, and triggers a full rescan.

![Install Flow](02-install-flow.svg)

## 03 — Multi-Agent Scanning

**How does scanning work across 11 agents with symlinks?**

The scanner iterates 11 known agent directories at both global and project scope (22 directories total). The critical Windows gotcha: Node.js `isDirectory()` returns `false` for symlinks, so we check `isSymbolicLink()` first. After scanning, skills are deduplicated by folder name (the same skill appears in up to 11 agent dirs via symlinks). The lock file enriches each entry with its GitHub source and content hash for update checking.

![Multi-Agent Scanning](03-multi-agent-scanning.svg)

## 04 — Webview Communication

**How do two isolated JS contexts coordinate securely?**

The extension host (Node.js) and marketplace webview (browser iframe) communicate through a typed postMessage protocol — 16 command types from webview to host, 10 response types back. The webview's Content Security Policy is `default-src 'none'`, giving it zero network access. All API calls route through the extension host as a proxy. Scripts load via a random nonce to prevent XSS, and a request ID counter deduplicates stale responses.

![Webview Communication](04-webview-communication.svg)

import { AGENT_LOGOS, HERO_AGENT_SLUGS } from '../marketplace/agent-logos';
import { SKILLS_ASCII } from '../marketplace/templates';

// Lucide-style SVG icons (24x24, stroke-based)
const downloadIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const layersIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
const usersIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const refreshIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
const shieldIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const terminalIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;
const toggleIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/></svg>`;
const bookIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

function renderAgentShowcase(): string {
  const items = HERO_AGENT_SLUGS
    .filter(slug => AGENT_LOGOS[slug])
    .map(slug => {
      const { displayName, svg } = AGENT_LOGOS[slug];
      const uniqueSvg = svg
        .replace(/id="([^"]+)"/g, `id="$1-w"`)
        .replace(/url\(#([^)]+)\)/g, `url(#$1-w)`);
      return `<div class="agent-logo" title="${displayName}">${uniqueSvg}</div>`;
    })
    .join('');

  return `
    <div class="agent-showcase">
      <div class="agent-showcase-label">Works with your favorite agents</div>
      <div class="agent-logo-strip">${items}</div>
    </div>
  `;
}

export function renderWelcomePage(): string {
  return `
    <div class="welcome-page">
      <div class="welcome-hero">
        <pre class="welcome-ascii">${SKILLS_ASCII}</pre>
        <div class="welcome-tagline">The Open Agent Skills Ecosystem</div>
        <p class="welcome-description">
          <a href="https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills">Agent Skills</a>
          are the open standard for extending AI coding assistants — adopted by Claude Code,
          Cursor, Windsurf, GitHub Copilot, and more. Skills.sh is a visual manager for the
          <a href="https://skills.sh">skills.sh</a> ecosystem by Vercel.
        </p>
      </div>

      ${renderAgentShowcase()}

      <div class="welcome-section-label">Features</div>
      <div class="welcome-features">
        <div class="feature-card">
          <div class="feature-icon">${searchIcon}</div>
          <div class="feature-title">Browse &amp; Search</div>
          <div class="feature-description">
            Search the skills.sh marketplace by framework, tool, or workflow.
            View leaderboards, weekly installs, and trending skills.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${downloadIcon}</div>
          <div class="feature-title">One-Click Install</div>
          <div class="feature-description">
            Install any skill directly from the marketplace with a single click.
            Skills are added to your agent's skill directory automatically.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${layersIcon}</div>
          <div class="feature-title">Multi-Agent Support</div>
          <div class="feature-description">
            Skills work across Claude Code, Cursor, Copilot, Windsurf, Codex,
            Cline, and more. Install once, use everywhere.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${refreshIcon}</div>
          <div class="feature-title">Update Checker</div>
          <div class="feature-description">
            Automatically checks for skill updates and shows a badge in the
            sidebar. Update individual skills or all at once.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${usersIcon}</div>
          <div class="feature-title">Team Sharing</div>
          <div class="feature-description">
            Share recommended skills with your team via <code>skills.json</code>.
            Teammates can install missing skills with a single command.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${toggleIcon}</div>
          <div class="feature-title">Auto-Invoke Control</div>
          <div class="feature-description">
            Toggle auto-invocation per skill. Control which skills are
            automatically available to your agents and which stay manual.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${shieldIcon}</div>
          <div class="feature-title">Security Audits</div>
          <div class="feature-description">
            Browse community security audits for published skills.
            Make informed decisions about which skills to trust and install.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${terminalIcon}</div>
          <div class="feature-title">Launch with Skill</div>
          <div class="feature-description">
            Launch Claude Code directly with a specific skill loaded.
            Right-click any installed skill to start a focused session.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${bookIcon}</div>
          <div class="feature-title">Built-in Documentation</div>
          <div class="feature-description">
            Access the full Agent Skills documentation without leaving
            your editor. Guides for authoring, publishing, and best practices.
          </div>
        </div>
      </div>

      <div class="quick-actions">
        <button class="welcome-cta welcome-cta-primary" data-command="openMarketplace">Browse Marketplace</button>
        <button class="welcome-cta" data-command="openSettings">Open Settings</button>
        <button class="welcome-cta" data-command="openDocs">Read Documentation</button>
      </div>

      <div class="welcome-footer">
        <span>Built on the <a href="https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills">Agent Skills</a> open standard</span>
        <span class="footer-sep">&middot;</span>
        <span>Powered by <a href="https://skills.sh">skills.sh</a> by Vercel</span>
      </div>
    </div>
  `;
}
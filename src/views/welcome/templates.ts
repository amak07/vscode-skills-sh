import { AGENT_LOGOS, HERO_AGENT_SLUGS } from '../marketplace/agent-logos';
import { SKILLS_ASCII } from '../marketplace/templates';

const downloadIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const layersIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
const usersIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

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

      <div class="welcome-features">
        <div class="feature-card">
          <div class="feature-icon">${downloadIcon}</div>
          <div class="feature-title">Browse &amp; Install</div>
          <div class="feature-description">
            One-click install from the marketplace. Search by framework, tool, or workflow
            and enhance your agents instantly.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${layersIcon}</div>
          <div class="feature-title">Multi-Agent</div>
          <div class="feature-description">
            Skills work across Claude Code, Cursor, Copilot, Windsurf, Codex, and more.
            Install once, use everywhere.
          </div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${usersIcon}</div>
          <div class="feature-title">Team Sharing</div>
          <div class="feature-description">
            Share recommended skills with your team via <code>skills.json</code>.
            Teammates can sync with a single command.
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

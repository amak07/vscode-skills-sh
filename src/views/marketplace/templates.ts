import { LeaderboardSkill, SearchSkill, SkillDetail } from '../../types';

const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const clearIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
export const backIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>`;
export const fileIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
export const copyIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const SKILLS_ASCII = `███████╗██╗  ██╗██╗██╗     ██╗     ███████╗
██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝
███████╗█████╔╝ ██║██║     ██║     ███████╗
╚════██║██╔═██╗ ██║██║     ██║     ╚════██║
███████║██║  ██╗██║███████╗███████╗███████║
╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝`;

const HERO_AGENTS = [
  'claude-code', 'cursor', 'copilot', 'codex', 'windsurf',
  'gemini-cli', 'opencode', 'roo', 'cline', 'amp',
  'goose', 'kiro-cli', 'trae', 'vscode',
];

export function renderHero(): string {
  const agentBadges = HERO_AGENTS
    .map(a => `<span class="hero-agent-badge">${a}</span>`)
    .join('');

  return `
    <div class="hero">
      <div class="hero-grid">
        <div>
          <pre class="hero-ascii">${SKILLS_ASCII}</pre>
          <div class="hero-subtitle">The Open Agent Skills Ecosystem</div>
        </div>
        <div class="hero-tagline">
          Skills are reusable capabilities for AI agents. Install them with a single command to enhance your agents with access to procedural knowledge.
        </div>
      </div>
      <div class="hero-try">
        <div class="hero-try-label">Try It Now</div>
        <div class="hero-cmd" id="heroCopyCmd">
          <span class="dollar">$</span>
          <span class="hero-cmd-static">npx skills</span>
          <span class="hero-cmd-carousel" id="heroCmdCarousel">
            <span class="hero-cmd-item active">add &lt;owner/repo&gt;</span>
          </span>
          <span class="copy-icon" id="heroCopyIcon" title="Copy to clipboard">${copyIcon}</span>
        </div>
      </div>
      <div class="hero-agents-section">
        <div class="hero-agents-label">Available For These Agents</div>
        <div class="hero-agents">${agentBadges}</div>
      </div>
    </div>
    <div class="hero-leaderboard-heading">Skills Leaderboard</div>`;
}

function formatInstalls(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return n.toLocaleString();
}

export function renderSearchInput(): string {
  return `
    <div class="search-container">
      <div class="search-icon">${searchIcon}</div>
      <input class="search-input" id="searchInput" type="text"
             placeholder="Search skills..." autocomplete="off" />
      <kbd class="search-kbd" id="searchKbd">/</kbd>
      <button class="search-clear" id="searchClear">${clearIcon}</button>
    </div>
  `;
}

export function renderTabs(activeTab: string, total?: number): string {
  const tabs = [
    { id: 'all-time', label: total ? `All Time (${total.toLocaleString()})` : 'All Time' },
    { id: 'trending', label: 'Trending (24h)' },
    { id: 'hot', label: 'Hot' },
  ];

  return `
    <nav class="tabs">
      ${tabs.map(t => `
        <button class="tab ${t.id === activeTab ? 'active' : ''}"
                data-tab="${t.id}">${t.label}</button>
      `).join('')}
    </nav>
  `;
}

export function renderChips(categories: string[], activeChip?: string): string {
  return `
    <div class="chips">
      <span class="chips-label">Filter</span>
      ${categories.map(c => `
        <button class="chip ${c === activeChip ? 'active' : ''}"
                data-category="${c}">${c}</button>
      `).join('')}
      <button class="chip chip-add" data-action="addFilter" title="Customize filters">+</button>
    </div>
  `;
}

export function renderGridHeader(): string {
  return `
    <div class="grid-header">
      <span>#</span>
      <span>Skill</span>
      <span style="text-align: right">Installs</span>
    </div>
  `;
}

export function renderLeaderboardRow(
  skill: LeaderboardSkill,
  rank: number,
  isInstalled: boolean,
): string {
  const id = `${skill.source}/${skill.skillId}`;
  const changeHtml = skill.change !== undefined && skill.change !== 0
    ? `<span class="${skill.change > 0 ? 'change-positive' : 'change-negative'}" style="font-size: 0.75rem">
         ${skill.change > 0 ? '+' : ''}${skill.change}
       </span>`
    : '';

  return `
    <div class="grid-row" data-detail="${id}" data-source="${skill.source}" data-skill="${skill.skillId}">
      <span class="row-rank">${rank}</span>
      <div class="row-info">
        <div class="row-name">${skill.name}</div>
        <div class="row-source">${skill.source}</div>
      </div>
      <div class="row-right">
        <span class="row-installs">${formatInstalls(skill.installs)}</span>
        ${changeHtml}
        <button class="btn-install ${isInstalled ? 'btn-installed' : ''}"
                data-install="${skill.source}" data-skill-name="${skill.skillId}"
                onclick="event.stopPropagation()">
          ${isInstalled ? '✓ Installed' : 'Install'}
        </button>
      </div>
    </div>
  `;
}

export function renderSearchRow(
  skill: SearchSkill,
  rank: number,
  isInstalled: boolean,
): string {
  return renderLeaderboardRow(
    { source: skill.source, skillId: skill.skillId, name: skill.name, installs: skill.installs },
    rank,
    isInstalled,
  );
}

export function renderSkeletonRows(count: number): string {
  return Array.from({ length: count }, () => `
    <div class="skeleton">
      <div><div class="skeleton-bar" style="width: 1.5rem"></div></div>
      <div>
        <div class="skeleton-bar" style="width: 70%"></div>
        <div class="skeleton-bar skeleton-bar-sm"></div>
      </div>
      <div><div class="skeleton-bar" style="width: 3rem; margin-left: auto"></div></div>
    </div>
  `).join('');
}

export function renderEmptyState(message: string): string {
  return `<div class="empty-state">${message}</div>`;
}

export function renderDetailView(detail: SkillDetail): string {
  const parts = detail.source.split('/');
  const owner = parts[0] || '';
  const repo = parts[1] || '';

  return `
    <div class="detail-view">
      <button class="back-btn" id="backBtn">${backIcon} Back to results</button>

      <div class="detail-breadcrumb">
        <a data-nav="home">skills</a> <span>/</span>
        <span>${owner}</span> <span>/</span>
        <span>${repo}</span> <span>/</span>
        <span>${detail.name}</span>
      </div>

      <h1 class="detail-title">${detail.name}</h1>

      <div class="detail-cmd" id="copyCmd" title="Click to copy">
        <code><span class="dollar">$</span> ${escapeHtml(detail.installCommand)}</code>
        <span class="copy-icon">${copyIcon}</span>
      </div>

      <div class="detail-grid">
        <div class="detail-content">
          <div class="detail-skillmd-header">
            ${fileIcon}
            <span>SKILL.md</span>
          </div>
          <div class="prose" id="skillMdContent">
            ${detail.skillMdHtml}
          </div>
        </div>

        <aside>
          <div class="sidebar-section">
            <div class="sidebar-label">Weekly Installs</div>
            <div class="sidebar-value-large">${detail.weeklyInstalls}</div>
          </div>

          <div class="sidebar-section">
            <div class="sidebar-label">Repository</div>
            <a class="sidebar-link sidebar-value" href="#"
               data-external="https://github.com/${detail.repository}">
              ${detail.repository}
            </a>
          </div>

          <div class="sidebar-section">
            <div class="sidebar-label">First Seen</div>
            <div class="sidebar-value">${detail.firstSeen}</div>
          </div>

          ${detail.perAgent.length > 0 ? `
            <div class="sidebar-section">
              <div class="sidebar-label">Installed On</div>
              <div class="agent-table">
                ${detail.perAgent.map(a => `
                  <div class="agent-row">
                    <span class="agent-name">${a.agent}</span>
                    <span class="agent-installs">${a.installs}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </aside>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

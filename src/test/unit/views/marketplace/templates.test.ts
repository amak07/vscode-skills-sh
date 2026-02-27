import { describe, it, expect } from 'vitest';
import {
  LeaderboardSkill,
  SearchSkill,
  SkillDetail,
} from '../../../../types';

// Import the module under test
import {
  backIcon,
  fileIcon,
  copyIcon,
  renderSearchInput,
  renderTabs,
  renderChips,
  renderGridHeader,
  renderSkeletonRows,
  renderLeaderboardRow,
  renderSearchRow,
  renderEmptyState,
  renderDetailView,
  renderNavBar,
  renderHero,
} from '../../../../views/marketplace/templates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLeaderboardSkill(overrides: Partial<LeaderboardSkill> = {}): LeaderboardSkill {
  return {
    source: 'vercel-labs/agent-skills',
    skillId: 'react-best-practices',
    name: 'React Best Practices',
    installs: 74800,
    ...overrides,
  };
}

function makeSearchSkill(overrides: Partial<SearchSkill> = {}): SearchSkill {
  return {
    id: '1',
    skillId: 'react-best-practices',
    name: 'React Best Practices',
    installs: 74800,
    source: 'vercel-labs/agent-skills',
    ...overrides,
  };
}

function makeSkillDetail(overrides: Partial<SkillDetail> = {}): SkillDetail {
  return {
    name: 'react-best-practices',
    source: 'vercel-labs/agent-skills',
    weeklyInstalls: '74.8K',
    firstSeen: 'Jan 16, 2026',
    repository: 'vercel-labs/agent-skills',
    installCommand: 'npx skills add https://github.com/vercel-labs/agent-skills --skill react-best-practices',
    perAgent: [
      { agent: 'claude-code', installs: '50K' },
      { agent: 'cursor', installs: '24.8K' },
    ],
    skillMdHtml: '<h1>React Best Practices</h1><p>Guidelines for React.</p>',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Icon exports
// ---------------------------------------------------------------------------

describe('icon exports', () => {
  it('backIcon is an SVG string', () => {
    expect(backIcon).toContain('<svg');
    expect(backIcon).toContain('</svg>');
  });

  it('fileIcon is an SVG string', () => {
    expect(fileIcon).toContain('<svg');
    expect(fileIcon).toContain('</svg>');
  });

  it('copyIcon is an SVG string', () => {
    expect(copyIcon).toContain('<svg');
    expect(copyIcon).toContain('</svg>');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderNavBar
// ---------------------------------------------------------------------------

describe('renderNavBar', () => {
  it('renders a nav element with brand name', () => {
    const html = renderNavBar();
    expect(html).toContain('nav-bar');
    expect(html).toContain('skills.sh');
  });

  it('includes Audits nav link', () => {
    const html = renderNavBar();
    expect(html).toContain('data-nav-page="audits"');
    expect(html).toContain('Audits');
  });

  it('includes Docs nav link', () => {
    const html = renderNavBar();
    expect(html).toContain('data-nav-page="docs"');
    expect(html).toContain('Docs');
  });

  it('contains nav-brand and nav-links classes', () => {
    const html = renderNavBar();
    expect(html).toContain('nav-brand');
    expect(html).toContain('nav-links');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderHero
// ---------------------------------------------------------------------------

describe('renderHero', () => {
  it('renders the hero section with ASCII art', () => {
    const html = renderHero();
    expect(html).toContain('hero');
    // The ASCII art is rendered inside a pre.hero-ascii element
    expect(html).toContain('hero-ascii');
  });

  it('includes the agent badges', () => {
    const html = renderHero();
    expect(html).toContain('claude-code');
    expect(html).toContain('cursor');
    expect(html).toContain('copilot');
    expect(html).toContain('windsurf');
    expect(html).toContain('gemini-cli');
  });

  it('includes the "Try It Now" command section', () => {
    const html = renderHero();
    expect(html).toContain('Try It Now');
    expect(html).toContain('npx skills');
    expect(html).toContain('heroCmdCarousel');
  });

  it('includes the hero leaderboard heading', () => {
    const html = renderHero();
    expect(html).toContain('hero-leaderboard-heading');
    expect(html).toContain('Skills Leaderboard');
  });

  it('includes the copy icon in the hero command', () => {
    const html = renderHero();
    expect(html).toContain('heroCopyIcon');
    expect(html).toContain('copy-icon');
  });

  it('renders all listed agents as hero-agent-badge elements', () => {
    const html = renderHero();
    const expectedAgents = [
      'claude-code', 'cursor', 'copilot', 'codex', 'windsurf',
      'gemini-cli', 'opencode', 'roo', 'cline', 'amp',
      'goose', 'kiro-cli', 'trae', 'vscode',
    ];
    for (const agent of expectedAgents) {
      expect(html).toContain(`<span class="hero-agent-badge">${agent}</span>`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: renderSearchInput
// ---------------------------------------------------------------------------

describe('renderSearchInput', () => {
  it('renders a search container with input', () => {
    const html = renderSearchInput();
    expect(html).toContain('search-container');
    expect(html).toContain('id="searchInput"');
    expect(html).toContain('type="text"');
  });

  it('has the correct placeholder text', () => {
    const html = renderSearchInput();
    expect(html).toContain('placeholder="Search skills..."');
  });

  it('includes the / keyboard shortcut hint', () => {
    const html = renderSearchInput();
    expect(html).toContain('id="searchKbd"');
    expect(html).toContain('/');
  });

  it('includes a clear button', () => {
    const html = renderSearchInput();
    expect(html).toContain('id="searchClear"');
    expect(html).toContain('search-clear');
  });

  it('includes the search icon SVG', () => {
    const html = renderSearchInput();
    expect(html).toContain('search-icon');
    expect(html).toContain('<svg');
  });

  it('disables autocomplete', () => {
    const html = renderSearchInput();
    expect(html).toContain('autocomplete="off"');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderTabs
// ---------------------------------------------------------------------------

describe('renderTabs', () => {
  it('renders all four tab buttons', () => {
    const html = renderTabs('all-time');
    expect(html).toContain('All Time');
    expect(html).toContain('Trending (24h)');
    expect(html).toContain('Hot');
    expect(html).toContain('Installed');
  });

  it('marks the active tab with the active class', () => {
    const html = renderTabs('trending');
    // The trending tab should have "active" class
    expect(html).toContain('class="tab active"');
    // Check that it's the trending one
    const trendingMatch = html.match(/class="tab active"[^>]*data-tab="trending"/);
    expect(trendingMatch).not.toBeNull();
  });

  it('marks all-time as active by default', () => {
    const html = renderTabs('all-time');
    const allTimeMatch = html.match(/class="tab active"[^>]*data-tab="all-time"/);
    expect(allTimeMatch).not.toBeNull();
  });

  it('shows total count when provided', () => {
    const html = renderTabs('all-time', 1500);
    expect(html).toContain('All Time (1,500)');
  });

  it('shows installed count when provided', () => {
    const html = renderTabs('all-time', undefined, 12);
    expect(html).toContain('Installed (12)');
  });

  it('does not show counts when not provided', () => {
    const html = renderTabs('all-time');
    expect(html).toContain('>All Time</button>');
    expect(html).toContain('>Installed</button>');
  });

  it('includes correct data-tab attributes', () => {
    const html = renderTabs('all-time');
    expect(html).toContain('data-tab="all-time"');
    expect(html).toContain('data-tab="trending"');
    expect(html).toContain('data-tab="hot"');
    expect(html).toContain('data-tab="installed"');
  });

  it('wraps tabs in a nav element with tabs class', () => {
    const html = renderTabs('all-time');
    expect(html).toContain('<nav class="tabs">');
  });

  it('marks installed tab as active', () => {
    const html = renderTabs('installed');
    const installedMatch = html.match(/class="tab active"[^>]*data-tab="installed"/);
    expect(installedMatch).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: renderChips
// ---------------------------------------------------------------------------

describe('renderChips', () => {
  it('renders chip buttons for each category', () => {
    const html = renderChips(['react', 'next', 'ai']);
    expect(html).toContain('data-category="react"');
    expect(html).toContain('data-category="next"');
    expect(html).toContain('data-category="ai"');
  });

  it('includes the category text in each chip', () => {
    const html = renderChips(['react', 'testing']);
    expect(html).toContain('>react</button>');
    expect(html).toContain('>testing</button>');
  });

  it('marks the active chip with active class', () => {
    const html = renderChips(['react', 'next'], 'react');
    // The react chip should be active
    const reactMatch = html.match(/class="chip active"[^>]*data-category="react"/);
    expect(reactMatch).not.toBeNull();
  });

  it('does not mark any chip as active when no activeChip', () => {
    const html = renderChips(['react', 'next']);
    // No chip should have active class (only "chip " without "active")
    const activeMatches = html.match(/class="chip active"/g);
    expect(activeMatches).toBeNull();
  });

  it('includes the add filter button', () => {
    const html = renderChips(['react']);
    expect(html).toContain('chip-add');
    expect(html).toContain('data-action="addFilter"');
    expect(html).toContain('>+</button>');
  });

  it('includes filter label', () => {
    const html = renderChips(['react']);
    expect(html).toContain('chips-label');
    expect(html).toContain('Filter');
  });

  it('renders empty list with only the add button', () => {
    const html = renderChips([]);
    expect(html).toContain('chip-add');
    // No category chips
    expect(html).not.toContain('data-category=');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderGridHeader
// ---------------------------------------------------------------------------

describe('renderGridHeader', () => {
  it('renders the grid header with column labels', () => {
    const html = renderGridHeader();
    expect(html).toContain('grid-header');
    expect(html).toContain('#');
    expect(html).toContain('Skill');
    expect(html).toContain('Installs');
  });

  it('right-aligns the Installs column', () => {
    const html = renderGridHeader();
    expect(html).toContain('text-align: right');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderSkeletonRows
// ---------------------------------------------------------------------------

describe('renderSkeletonRows', () => {
  it('renders the correct number of skeleton rows', () => {
    const html = renderSkeletonRows(5);
    const matches = html.match(/class="skeleton"/g);
    expect(matches).toHaveLength(5);
  });

  it('renders 0 rows when count is 0', () => {
    const html = renderSkeletonRows(0);
    expect(html).toBe('');
  });

  it('includes skeleton bar elements', () => {
    const html = renderSkeletonRows(1);
    expect(html).toContain('skeleton-bar');
    expect(html).toContain('skeleton-bar-sm');
  });

  it('renders 10 rows for default leaderboard', () => {
    const html = renderSkeletonRows(10);
    const matches = html.match(/class="skeleton"/g);
    expect(matches).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Tests: renderLeaderboardRow
// ---------------------------------------------------------------------------

describe('renderLeaderboardRow', () => {
  it('renders a grid row with skill data', () => {
    const skill = makeLeaderboardSkill();
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('class="grid-row"');
    expect(html).toContain('data-source="vercel-labs/agent-skills"');
    expect(html).toContain('data-skill="react-best-practices"');
  });

  it('shows rank number', () => {
    const skill = makeLeaderboardSkill();
    const html = renderLeaderboardRow(skill, 42, false);

    expect(html).toContain('class="row-rank">42</span>');
  });

  it('shows skill name and source', () => {
    const skill = makeLeaderboardSkill({
      name: 'My Skill',
      source: 'org/repo',
    });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('class="row-name">My Skill</div>');
    expect(html).toContain('class="row-source">org/repo</div>');
  });

  it('formats installs as K for thousands', () => {
    const skill = makeLeaderboardSkill({ installs: 74800 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('74.8K');
  });

  it('formats installs below 1000 as-is', () => {
    const skill = makeLeaderboardSkill({ installs: 500 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('>500</span>');
  });

  it('shows Install button when not installed', () => {
    const skill = makeLeaderboardSkill();
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('class="btn-install "');
    expect(html).toContain('Install');
    expect(html).not.toContain('btn-installed');
  });

  it('shows Installed button when installed', () => {
    const skill = makeLeaderboardSkill();
    const html = renderLeaderboardRow(skill, 1, true);

    expect(html).toContain('btn-installed');
    expect(html).toContain('Installed');
  });

  it('includes data attributes for install action', () => {
    const skill = makeLeaderboardSkill({
      source: 'org/repo',
      skillId: 'my-skill',
    });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('data-install="org/repo"');
    expect(html).toContain('data-skill-name="my-skill"');
  });

  it('shows positive change indicator', () => {
    const skill = makeLeaderboardSkill({ change: 5 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('change-positive');
    expect(html).toContain('+5');
  });

  it('shows negative change indicator', () => {
    const skill = makeLeaderboardSkill({ change: -3 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('change-negative');
    expect(html).toContain('-3');
  });

  it('does not show change indicator when change is 0', () => {
    const skill = makeLeaderboardSkill({ change: 0 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).not.toContain('change-positive');
    expect(html).not.toContain('change-negative');
  });

  it('does not show change indicator when change is undefined', () => {
    const skill = makeLeaderboardSkill({ change: undefined });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).not.toContain('change-positive');
    expect(html).not.toContain('change-negative');
  });

  it('includes data-detail attribute with source/skillId', () => {
    const skill = makeLeaderboardSkill({
      source: 'org/repo',
      skillId: 'skill-x',
    });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('data-detail="org/repo/skill-x"');
  });

  it('includes onclick stopPropagation on the install button', () => {
    const skill = makeLeaderboardSkill();
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('onclick="event.stopPropagation()"');
  });

  it('formats exactly 1000 installs as 1K', () => {
    const skill = makeLeaderboardSkill({ installs: 1000 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('1K');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderSearchRow
// ---------------------------------------------------------------------------

describe('renderSearchRow', () => {
  it('delegates to renderLeaderboardRow with correct parameters', () => {
    const skill = makeSearchSkill({
      source: 'org/repo',
      skillId: 'search-skill',
      name: 'Search Skill',
      installs: 1200,
    });
    const html = renderSearchRow(skill, 3, true);

    expect(html).toContain('data-source="org/repo"');
    expect(html).toContain('data-skill="search-skill"');
    expect(html).toContain('Search Skill');
    expect(html).toContain('1.2K');
    expect(html).toContain('btn-installed');
    expect(html).toContain('class="row-rank">3</span>');
  });

  it('renders not installed state', () => {
    const skill = makeSearchSkill();
    const html = renderSearchRow(skill, 1, false);

    expect(html).not.toContain('btn-installed');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderEmptyState
// ---------------------------------------------------------------------------

describe('renderEmptyState', () => {
  it('renders a message in an empty-state div', () => {
    const html = renderEmptyState('No skills found');
    expect(html).toBe('<div class="empty-state">No skills found</div>');
  });

  it('renders custom message', () => {
    const html = renderEmptyState('Error: API timeout');
    expect(html).toContain('Error: API timeout');
    expect(html).toContain('class="empty-state"');
  });

  it('handles empty message', () => {
    const html = renderEmptyState('');
    expect(html).toBe('<div class="empty-state"></div>');
  });
});

// ---------------------------------------------------------------------------
// Tests: renderDetailView
// ---------------------------------------------------------------------------

describe('renderDetailView', () => {
  it('renders the detail view container', () => {
    const detail = makeSkillDetail();
    const html = renderDetailView(detail);

    expect(html).toContain('class="detail-view"');
  });

  it('renders the back button', () => {
    const detail = makeSkillDetail();
    const html = renderDetailView(detail);

    expect(html).toContain('id="backBtn"');
    expect(html).toContain('back-btn');
    expect(html).toContain('Back to results');
  });

  it('renders breadcrumb navigation', () => {
    const detail = makeSkillDetail({
      source: 'vercel-labs/agent-skills',
      name: 'react-best-practices',
    });
    const html = renderDetailView(detail);

    expect(html).toContain('detail-breadcrumb');
    expect(html).toContain('data-nav="home"');
    expect(html).toContain('>skills</a>');
    expect(html).toContain('>vercel-labs</a>');
    expect(html).toContain('>agent-skills</a>');
    expect(html).toContain('>react-best-practices</span>');
  });

  it('renders external links in breadcrumb with correct URLs', () => {
    const detail = makeSkillDetail({ source: 'org/repo' });
    const html = renderDetailView(detail);

    expect(html).toContain('data-url="https://skills.sh/org"');
    expect(html).toContain('data-url="https://skills.sh/org/repo"');
  });

  it('renders skill title', () => {
    const detail = makeSkillDetail({ name: 'react-best-practices' });
    const html = renderDetailView(detail);

    expect(html).toContain('class="detail-title">react-best-practices</h1>');
  });

  it('renders install command with copy button', () => {
    const detail = makeSkillDetail({
      installCommand: 'npx skills add https://github.com/org/repo --skill test',
    });
    const html = renderDetailView(detail);

    expect(html).toContain('id="copyCmd"');
    expect(html).toContain('detail-cmd-text');
    expect(html).toContain('npx skills add https://github.com/org/repo --skill test');
    expect(html).toContain('copy-icon');
  });

  it('HTML-escapes the install command', () => {
    const detail = makeSkillDetail({
      installCommand: 'npx skills add <repo>',
    });
    const html = renderDetailView(detail);

    expect(html).toContain('&lt;repo&gt;');
    expect(html).not.toContain('<repo>');
  });

  it('renders SKILL.md content', () => {
    const detail = makeSkillDetail({
      skillMdHtml: '<h1>React Best Practices</h1><p>Guidelines.</p>',
    });
    const html = renderDetailView(detail);

    expect(html).toContain('SKILL.md');
    expect(html).toContain('class="prose"');
    expect(html).toContain('<h1>React Best Practices</h1>');
    expect(html).toContain('<p>Guidelines.</p>');
  });

  it('renders weekly installs sidebar section', () => {
    const detail = makeSkillDetail({ weeklyInstalls: '74.8K' });
    const html = renderDetailView(detail);

    expect(html).toContain('Weekly Installs');
    expect(html).toContain('74.8K');
    expect(html).toContain('sidebar-value-large');
  });

  it('renders repository link section', () => {
    const detail = makeSkillDetail({ repository: 'vercel-labs/agent-skills' });
    const html = renderDetailView(detail);

    expect(html).toContain('Repository');
    expect(html).toContain('data-url="https://github.com/vercel-labs/agent-skills"');
    expect(html).toContain('vercel-labs/agent-skills');
  });

  it('renders first seen date', () => {
    const detail = makeSkillDetail({ firstSeen: 'Jan 16, 2026' });
    const html = renderDetailView(detail);

    expect(html).toContain('First Seen');
    expect(html).toContain('Jan 16, 2026');
  });

  it('renders GitHub stars when available', () => {
    const detail = makeSkillDetail({ githubStars: '6.8K' });
    const html = renderDetailView(detail);

    expect(html).toContain('GitHub Stars');
    expect(html).toContain('6.8K');
    expect(html).toContain('star-icon');
  });

  it('omits GitHub stars section when not available', () => {
    const detail = makeSkillDetail({ githubStars: undefined });
    const html = renderDetailView(detail);

    expect(html).not.toContain('GitHub Stars');
  });

  it('renders per-agent breakdown', () => {
    const detail = makeSkillDetail({
      perAgent: [
        { agent: 'claude-code', installs: '50K' },
        { agent: 'cursor', installs: '24.8K' },
      ],
    });
    const html = renderDetailView(detail);

    expect(html).toContain('Installed On');
    expect(html).toContain('agent-table');
    expect(html).toContain('claude-code');
    expect(html).toContain('50K');
    expect(html).toContain('cursor');
    expect(html).toContain('24.8K');
  });

  it('omits per-agent section when empty', () => {
    const detail = makeSkillDetail({ perAgent: [] });
    const html = renderDetailView(detail);

    expect(html).not.toContain('Installed On');
    expect(html).not.toContain('agent-table');
  });

  it('includes SKILL.md file icon header', () => {
    const detail = makeSkillDetail();
    const html = renderDetailView(detail);

    expect(html).toContain('detail-skillmd-header');
    expect(html).toContain('SKILL.md');
    // Should contain the file icon SVG
    expect(html).toContain('<svg');
  });

  it('uses detail-grid layout with content and aside', () => {
    const detail = makeSkillDetail();
    const html = renderDetailView(detail);

    expect(html).toContain('detail-grid');
    expect(html).toContain('detail-content');
    expect(html).toContain('<aside>');
  });

  it('renders correctly with minimal data', () => {
    const detail = makeSkillDetail({
      name: 'minimal',
      source: 'org/repo',
      weeklyInstalls: 'N/A',
      firstSeen: 'N/A',
      repository: 'org/repo',
      installCommand: 'npx skills add org/repo',
      perAgent: [],
      skillMdHtml: '',
      githubStars: undefined,
    });
    const html = renderDetailView(detail);

    expect(html).toContain('minimal');
    expect(html).toContain('N/A');
    expect(html).toContain('detail-view');
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge cases and special characters
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('renderLeaderboardRow handles special characters in skill name', () => {
    const skill = makeLeaderboardSkill({
      name: 'skill <with> "special" & chars',
      source: 'org/repo',
    });
    const html = renderLeaderboardRow(skill, 1, false);

    // The name is rendered as-is (not escaped in templates.ts renderLeaderboardRow),
    // but the source and data attributes are used directly
    expect(html).toContain('skill <with> "special" & chars');
  });

  it('renderDetailView escapes install command HTML entities', () => {
    const detail = makeSkillDetail({
      installCommand: 'npx skills add "test & <repo>"',
    });
    const html = renderDetailView(detail);

    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&quot;');
  });

  it('renderSkeletonRows handles large count', () => {
    const html = renderSkeletonRows(100);
    const matches = html.match(/class="skeleton"/g);
    expect(matches).toHaveLength(100);
  });

  it('renderChips handles many categories', () => {
    const cats = Array.from({ length: 20 }, (_, i) => `cat-${i}`);
    const html = renderChips(cats);

    for (const cat of cats) {
      expect(html).toContain(`data-category="${cat}"`);
    }
  });

  it('renderLeaderboardRow with exact 1K installs', () => {
    const skill = makeLeaderboardSkill({ installs: 1000 });
    const html = renderLeaderboardRow(skill, 1, false);

    // 1000 / 1000 = 1.0 -> should format as "1K" (the .0 is stripped)
    expect(html).toContain('1K');
  });

  it('renderLeaderboardRow with 999 installs (below K threshold)', () => {
    const skill = makeLeaderboardSkill({ installs: 999 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('999');
    expect(html).not.toContain('K');
  });

  it('renderLeaderboardRow with 0 installs', () => {
    const skill = makeLeaderboardSkill({ installs: 0 });
    const html = renderLeaderboardRow(skill, 1, false);

    expect(html).toContain('>0</span>');
  });
});

import { describe, it, expect } from 'vitest';

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
  renderEmptyState,
  renderNavBar,
  renderHero,
} from '../../../../views/marketplace/templates';

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
// Tests: Edge cases and special characters
// ---------------------------------------------------------------------------

describe('edge cases', () => {
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
});

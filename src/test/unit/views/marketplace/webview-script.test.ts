/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  formatInstalls,
  getAuditBadgeClass,
  setConfig,
  renderRow,
  renderInstalledRow,
  renderInstalledCard,
  renderInstalledGroup,
  renderDetailHtml,
  renderAuditsView,
  renderDocsView,
  initializeWebview,
  type VsCodeApi,
  type WebviewConfig,
  type SkillData,
  type InstalledSkillData,
  type DetailData,
} from '../../../../views/marketplace/webview-script';

// ── Helpers ──────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<WebviewConfig> = {}): WebviewConfig {
  return {
    icons: {
      github: '<svg id="github"></svg>',
      star: '<svg id="star"></svg>',
      share: '<svg id="share"></svg>',
      trash: '<svg id="trash"></svg>',
      update: '<svg id="update"></svg>',
      back: '<svg id="back"></svg>',
      file: '<svg id="file"></svg>',
      copy: '<svg id="copy"></svg>',
    },
    skeletonRows10: '<div class="skeleton">10</div>',
    skeletonRows5: '<div class="skeleton">5</div>',
    ...overrides,
  };
}

function makeApi(overrides: Partial<VsCodeApi> = {}): VsCodeApi {
  return {
    postMessage: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
    setState: vi.fn(),
    ...overrides,
  };
}

function setupMinimalDom(): void {
  document.body.innerHTML = `
    <nav>
      <span class="nav-brand">skills.sh</span>
      <a data-nav-page="audits">Audits</a>
      <a data-nav-page="docs">Docs</a>
    </nav>
    <div class="hero">
      <pre class="hero-ascii"></pre>
      <div class="hero-cmd-line">
        <span class="hero-cmd-prefix">npx skills</span>
        <span id="heroCmdCarousel"><span class="hero-cmd-item active">add &lt;owner/repo&gt;</span></span>
        <span id="heroCopyIcon" class="hero-copy-icon"><svg id="copy-svg"></svg></span>
      </div>
    </div>
    <div class="hero-leaderboard-heading"></div>
    <div class="container">
      <div class="search-container">
        <input id="searchInput" />
        <span id="searchKbd">/</span>
        <button id="searchClear" style="display:none"></button>
      </div>
      <div class="tabs">
        <button class="tab active" data-tab="all-time">All Time</button>
        <button class="tab" data-tab="weekly">Weekly</button>
        <button class="tab" data-tab="installed">Installed</button>
      </div>
      <div class="chips">
        <button class="chip" data-category="react">react</button>
        <button class="chip" data-category="next">next</button>
        <button class="chip chip-add">+</button>
      </div>
      <div class="grid-header"></div>
      <div id="results"></div>
    </div>
  `;
}

// ── Pure function tests ──────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles null/undefined input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(escapeHtml(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(escapeHtml(undefined as any)).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('formatInstalls', () => {
  it('returns raw number for values under 1000', () => {
    expect(formatInstalls(42)).toBe('42');
  });

  it('formats 1000 as 1K', () => {
    expect(formatInstalls(1000)).toBe('1K');
  });

  it('formats 1500 as 1.5K', () => {
    expect(formatInstalls(1500)).toBe('1.5K');
  });

  it('formats 10000 as 10K', () => {
    expect(formatInstalls(10000)).toBe('10K');
  });

  it('returns 0 for zero', () => {
    expect(formatInstalls(0)).toBe('0');
  });
});

describe('getAuditBadgeClass', () => {
  it.each([
    ['pass', 'audit-badge-pass'],
    ['safe', 'audit-badge-pass'],
    ['0 alerts', 'audit-badge-pass'],
    ['low risk', 'audit-badge-pass'],
    ['fail', 'audit-badge-fail'],
    ['critical', 'audit-badge-fail'],
    ['high risk', 'audit-badge-fail'],
    ['moderate', 'audit-badge-warn'],
    ['unknown', 'audit-badge-warn'],
    ['', 'audit-badge-warn'],
  ])('returns %s → %s', (input, expected) => {
    expect(getAuditBadgeClass(input)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(getAuditBadgeClass('PASS')).toBe('audit-badge-pass');
    expect(getAuditBadgeClass('FAIL')).toBe('audit-badge-fail');
  });

  it('trims whitespace', () => {
    expect(getAuditBadgeClass('  pass  ')).toBe('audit-badge-pass');
  });
});

// ── Render function tests ────────────────────────────────────────────

describe('renderRow', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('renders a basic skill row with rank', () => {
    const skill: SkillData = { name: 'test-skill', source: 'owner/repo', installs: 500 };
    const html = renderRow(skill, 1, false, false);
    expect(html).toContain('row-rank');
    expect(html).toContain('1');
    expect(html).toContain('test-skill');
    expect(html).toContain('owner/repo');
    expect(html).toContain('Install');
  });

  it('shows "✓ Installed" for installed skills', () => {
    const skill: SkillData = { name: 'my-skill', source: 'a/b' };
    const html = renderRow(skill, 2, true, false);
    expect(html).toContain('btn-installed');
    expect(html).toContain('✓ Installed');
  });

  it('shows "Update" for updatable skills', () => {
    const skill: SkillData = { name: 'my-skill', source: 'a/b' };
    const html = renderRow(skill, 3, true, true);
    expect(html).toContain('btn-updatable');
    expect(html).toContain('Update');
  });

  it('renders positive change indicator', () => {
    const skill: SkillData = { name: 'rising', source: 'a/b', change: 5 };
    const html = renderRow(skill, 1, false, false);
    expect(html).toContain('change-positive');
    expect(html).toContain('+5');
  });

  it('renders negative change indicator', () => {
    const skill: SkillData = { name: 'falling', source: 'a/b', change: -3 };
    const html = renderRow(skill, 1, false, false);
    expect(html).toContain('change-negative');
    expect(html).toContain('-3');
  });

  it('does not render change for zero', () => {
    const skill: SkillData = { name: 'stable', source: 'a/b', change: 0 };
    const html = renderRow(skill, 1, false, false);
    expect(html).not.toContain('change-positive');
    expect(html).not.toContain('change-negative');
  });

  it('formats install count', () => {
    const skill: SkillData = { name: 'popular', source: 'a/b', installs: 2500 };
    const html = renderRow(skill, 1, false, false);
    expect(html).toContain('2.5K');
  });

  it('uses skillId as fallback when name is missing', () => {
    const skill: SkillData = { skillId: 'fallback-id', source: 'a/b' };
    const html = renderRow(skill, 1, false, false);
    expect(html).toContain('fallback-id');
  });
});

describe('renderInstalledRow (legacy delegate)', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('delegates to renderInstalledCard', () => {
    const skill: InstalledSkillData = {
      name: 'Test Skill', folderName: 'test-skill',
      source: 'owner/repo', scope: 'global',
    };
    const row = renderInstalledRow(skill, new Set());
    const card = renderInstalledCard(skill, new Set());
    expect(row).toBe(card);
  });

  it('renders card with name and scope badge', () => {
    const skill: InstalledSkillData = {
      name: 'Test Skill', folderName: 'test-skill',
      source: 'owner/repo', scope: 'global',
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).toContain('Test Skill');
    expect(html).toContain('scope-global');
    expect(html).toContain('installed-card');
  });

  it('renders project skill with scope badge', () => {
    const skill: InstalledSkillData = {
      name: 'Proj Skill', folderName: 'proj',
      source: 'a/b', scope: 'project',
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).toContain('scope-project');
  });

  it('renders update button when hasUpdate', () => {
    const skill: InstalledSkillData = {
      name: 'Upd', folderName: 'upd',
      source: 'a/b', hasUpdate: true,
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).toContain('btn-action-update');
    expect(html).toContain('Update');
  });

  it('renders uninstall button when no update', () => {
    const skill: InstalledSkillData = {
      name: 'Rm', folderName: 'rm',
      source: 'a/b',
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).toContain('btn-action-remove');
    expect(html).toContain('Uninstall');
  });
});

describe('renderInstalledCard', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('renders enabled skill with status-dot-on and toggle on', () => {
    const skill: InstalledSkillData = {
      name: 'My Skill', folderName: 'my-skill',
      source: 'owner/repo', scope: 'global',
      disableModelInvocation: false,
    };
    const html = renderInstalledCard(skill, new Set());
    expect(html).toContain('status-dot-on');
    expect(html).toContain('toggle-switch on');
    expect(html).toContain('Auto-invoke: ON');
  });

  it('renders disabled skill with status-dot-off', () => {
    const skill: InstalledSkillData = {
      name: 'Disabled Skill', folderName: 'disabled',
      source: 'owner/repo', scope: 'global',
      disableModelInvocation: true,
    };
    const html = renderInstalledCard(skill, new Set());
    expect(html).toContain('status-dot-off');
    expect(html).not.toContain('toggle-switch on');
    expect(html).toContain('Auto-invoke: OFF');
  });

  it('renders scope badge and agent count in meta', () => {
    const skill: InstalledSkillData = {
      name: 'Test', folderName: 'test',
      source: 'a/b', scope: 'project',
      agents: ['Claude Code', 'Cursor'],
    };
    const html = renderInstalledCard(skill, new Set());
    expect(html).toContain('scope-project');
    expect(html).toContain('2 agents');
  });

  it('renders update button when hasUpdate is true', () => {
    const skill: InstalledSkillData = {
      name: 'Upd', folderName: 'upd',
      source: 'a/b', hasUpdate: true,
    };
    const html = renderInstalledCard(skill, new Set());
    expect(html).toContain('btn-action-update');
    expect(html).not.toContain('btn-action-remove');
  });

  it('renders overflow menu button', () => {
    const skill: InstalledSkillData = {
      name: 'Test', folderName: 'test',
      source: 'a/b',
    };
    const html = renderInstalledCard(skill, new Set());
    expect(html).toContain('overflow-menu-btn');
    expect(html).toContain('data-overflow="test"');
  });

  it('renders data-toggle-invoke attribute', () => {
    const skill: InstalledSkillData = {
      name: 'Test', folderName: 'my-skill',
      source: 'a/b',
    };
    const html = renderInstalledCard(skill, new Set());
    expect(html).toContain('data-toggle-invoke="my-skill"');
  });
});

describe('renderInstalledGroup', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('returns empty string for empty skills array', () => {
    expect(renderInstalledGroup('Empty', [], true, new Set())).toBe('');
  });

  it('renders expanded group with card grid', () => {
    const skills: InstalledSkillData[] = [
      { name: 'A', folderName: 'a', source: 'x/y' },
    ];
    const html = renderInstalledGroup('Test Group', skills, true, new Set());
    expect(html).toContain('installed-group-header');
    expect(html).not.toContain('collapsed');
    expect(html).toContain('installed-group-body open');
    expect(html).toContain('installed-grid');
    expect(html).toContain('installed-card');
    expect(html).toContain('Test Group (1)');
  });

  it('renders collapsed group', () => {
    const skills: InstalledSkillData[] = [
      { name: 'B', folderName: 'b', source: 'x/y' },
    ];
    const html = renderInstalledGroup('Collapsed', skills, false, new Set());
    expect(html).toContain('installed-group-header collapsed');
    expect(html).not.toContain('installed-group-body open');
  });
});

describe('renderDetailHtml', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('renders detail view with back button and breadcrumbs', () => {
    const detail: DetailData = {
      name: 'my-skill',
      source: 'owner/repo',
      installCommand: 'npx skills add owner/repo',
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('detail-view');
    expect(html).toContain('Back');
    expect(html).toContain('owner');
    expect(html).toContain('repo');
    expect(html).toContain('my-skill');
  });

  it('renders install command', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'npx skills add a/b',
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('npx skills add a/b');
    expect(html).toContain('copyCmd');
  });

  it('renders weekly installs', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'npx skills add a/b',
      weeklyInstalls: '1,234',
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('1,234');
  });

  it('renders "N/A" when weeklyInstalls missing', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'npx skills add a/b',
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('N/A');
  });

  it('renders GitHub stars when present', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd', githubStars: '500',
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('GitHub Stars');
    expect(html).toContain('500');
  });

  it('renders repository link', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd', repository: 'owner/repo',
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('https://github.com/owner/repo');
  });

  it('renders install button for non-installed skill', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd', isInstalled: false,
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('btn-install');
    expect(html).toContain('Install');
  });

  it('renders uninstall button for installed skill', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd', isInstalled: true,
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('btn-action-remove');
    expect(html).toContain('Uninstall');
  });

  it('renders update button for installed skill with update', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd', isInstalled: true, hasUpdate: true,
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('btn-action-update');
    expect(html).toContain('Update');
  });

  it('renders per-agent breakdown', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd',
      perAgent: [{ agent: 'claude', installs: 100 }],
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('claude');
    expect(html).toContain('100');
  });

  it('renders security audits section', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd',
      securityAudits: [{ partner: 'Socket', status: 'pass', url: 'https://example.com' }],
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('Security Audits');
    expect(html).toContain('Socket');
    expect(html).toContain('audit-badge-pass');
  });

  it('renders SKILL.md content', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd',
      skillMdHtml: '<h2>Usage</h2><p>Run it</p>',
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('<h2>Usage</h2><p>Run it</p>');
  });

  it('renders manifest button for installed skill with source', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd', isInstalled: true, inManifest: false,
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('Add to Skills.json');
  });

  it('renders manifest active for in-manifest skill', () => {
    const detail: DetailData = {
      name: 'test', source: 'a/b',
      installCommand: 'cmd', isInstalled: true, inManifest: true,
    };
    const html = renderDetailHtml(detail);
    expect(html).toContain('btn-action-active');
    expect(html).toContain('Remove from Skills.json');
  });
});

describe('renderAuditsView', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('renders audits header and back button', () => {
    const html = renderAuditsView({ skills: [] });
    expect(html).toContain('Security Audits');
    expect(html).toContain('Back');
    expect(html).toContain('No audit data available');
  });

  it('renders audit rows with badges', () => {
    const html = renderAuditsView({
      skills: [{
        name: 'Safe Skill', skillId: 'safe', source: 'a/b',
        audits: [{ status: 'pass' }, { status: 'fail' }],
      }],
    });
    expect(html).toContain('Safe Skill');
    expect(html).toContain('audit-badge-pass');
    expect(html).toContain('audit-badge-fail');
  });

  it('pads badges to 3 columns', () => {
    const html = renderAuditsView({
      skills: [{
        name: 'One', skillId: 'one', source: 'a/b',
        audits: [{ status: 'pass' }],
      }],
    });
    // Should have pass badge + 2 dash badges
    const dashCount = (html.match(/—/g) || []).length;
    expect(dashCount).toBe(2);
  });
});

describe('renderDocsView', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('renders docs with sidebar and content', () => {
    const html = renderDocsView({ page: 'overview', title: 'Overview', html: '<p>Hello</p>' });
    expect(html).toContain('docs-view');
    expect(html).toContain('Back');
    expect(html).toContain('Overview');
    expect(html).toContain('<p>Hello</p>');
  });

  it('marks the active page in sidebar', () => {
    const html = renderDocsView({ page: 'cli', title: 'CLI', html: '' });
    expect(html).toContain('docs-sidebar-link active');
    // Only "cli" link should have the active class
    expect(html).toMatch(/data-docs-page="cli">CLI<\/a>/);
    expect(html).not.toMatch(/data-docs-page="overview"[^>]*active/);
  });

  it('renders all sidebar links', () => {
    const html = renderDocsView({ page: 'overview', title: 'Overview', html: '' });
    expect(html).toContain('Overview');
    expect(html).toContain('CLI');
    expect(html).toContain('FAQ');
  });
});

// ── DOM interaction tests ────────────────────────────────────────────

describe('initializeWebview', () => {
  let api: VsCodeApi;
  let config: WebviewConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    setupMinimalDom();
    api = makeApi();
    config = makeConfig();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('sends ready message on init', () => {
    initializeWebview(api, config);
    expect(api.postMessage).toHaveBeenCalledWith({ command: 'ready' });
  });

  it('loads leaderboard on first init (no saved state)', () => {
    initializeWebview(api, config);
    expect(api.postMessage).toHaveBeenCalledWith({
      command: 'leaderboard',
      payload: { view: 'all-time', page: 0 },
    });
  });

  it('renders skeleton rows into results on leaderboard load', () => {
    initializeWebview(api, config);
    const results = document.getElementById('results')!;
    expect(results.innerHTML).toContain('skeleton');
  });

  it('restores saved search state', () => {
    (api.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      searchQuery: 'react',
      currentView: 'search-results',
    });
    initializeWebview(api, config);
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    expect(searchInput.value).toBe('react');
    expect(api.postMessage).toHaveBeenCalledWith({
      command: 'search',
      payload: { query: 'react' },
    });
  });

  it('restores installed tab from saved state', () => {
    (api.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      currentView: 'installed',
    });
    initializeWebview(api, config);
    // Send empty installed data so the loaded flag is set
    window.dispatchEvent(new MessageEvent('message', {
      data: { command: 'installedSkillsData', payload: [] },
    }));
    const results = document.getElementById('results')!;
    expect(results.innerHTML).toContain('No skills installed yet');
  });

  describe('search behavior', () => {
    it('debounces search input (300ms)', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = 'test query';
      searchInput.dispatchEvent(new Event('input'));

      // Should not have sent search yet
      expect(api.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ command: 'search' }),
      );

      vi.advanceTimersByTime(300);
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'search',
        payload: { query: 'test query' },
      });
    });

    it('does not search for single character', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = 'a';
      searchInput.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(300);
      expect(api.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ command: 'search' }),
      );
    });

    it('clears search and loads leaderboard on empty input', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;

      // First search
      searchInput.value = 'react';
      searchInput.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(300);

      // Clear
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'leaderboard',
        payload: expect.objectContaining({ page: 0 }),
      });
    });

    it('saves state after debounced search', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = 'test';
      searchInput.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(300);
      expect(api.setState).toHaveBeenCalled();
    });

    it('collapses hero on search input', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = 'x';
      searchInput.dispatchEvent(new Event('input'));
      const hero = document.querySelector('.hero')!;
      expect(hero.classList.contains('collapsed')).toBe(true);
    });

    it('expands hero when search cleared', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;

      // Search first
      searchInput.value = 'x';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelector('.hero')!.classList.contains('collapsed')).toBe(true);

      // Clear
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      expect(document.querySelector('.hero')!.classList.contains('collapsed')).toBe(false);
    });
  });

  describe('keyboard shortcuts', () => {
    it('"/" focuses search input', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
      expect(document.activeElement).toBe(searchInput);
    });

    it('Escape clears and blurs search', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = 'something';
      searchInput.focus();
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(searchInput.value).toBe('');
    });
  });

  describe('tab switching', () => {
    it('clicking tab sends leaderboard command', () => {
      initializeWebview(api, config);
      const weeklyTab = document.querySelector('.tab[data-tab="weekly"]') as HTMLElement;
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      weeklyTab.click();
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'leaderboard',
        payload: { view: 'weekly', page: 0 },
      });
    });

    it('updates active class on tab click', () => {
      initializeWebview(api, config);
      const weeklyTab = document.querySelector('.tab[data-tab="weekly"]') as HTMLElement;
      weeklyTab.click();
      expect(weeklyTab.classList.contains('active')).toBe(true);
      expect(document.querySelector('.tab[data-tab="all-time"]')!.classList.contains('active')).toBe(false);
    });

    it('installed tab renders local view', () => {
      initializeWebview(api, config);
      // Send empty installed data so the loaded flag is set
      window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'installedSkillsData', payload: [] },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();
      const results = document.getElementById('results')!;
      expect(results.innerHTML).toContain('No skills installed');
    });

    it('clears search when switching to installed tab', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = 'something';

      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();
      expect(searchInput.value).toBe('');
    });
  });

  describe('chip clicking', () => {
    it('clicking chip sends search with category', () => {
      initializeWebview(api, config);
      const reactChip = document.querySelector('.chip[data-category="react"]') as HTMLElement;
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      reactChip.click();
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'search',
        payload: { query: 'react' },
      });
    });

    it('clicking active chip deselects and loads leaderboard', () => {
      initializeWebview(api, config);
      const reactChip = document.querySelector('.chip[data-category="react"]') as HTMLElement;
      reactChip.click(); // activate
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      reactChip.click(); // deactivate
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'leaderboard',
        payload: expect.objectContaining({ page: 0 }),
      });
    });

    it('add filter button sends openCategorySettings', () => {
      initializeWebview(api, config);
      const addBtn = document.querySelector('.chip-add') as HTMLElement;
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      addBtn.click();
      expect(api.postMessage).toHaveBeenCalledWith({ command: 'openCategorySettings' });
    });
  });

  describe('message handling', () => {
    it('leaderboardResult renders rows', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'leaderboardResult',
          payload: {
            skills: [{ name: 'skill1', source: 'a/b', installs: 100 }],
            total: 50, hasMore: false, page: 0,
            installedNames: [], updatableNames: [],
          },
        },
      }));
      const results = document.getElementById('results')!;
      expect(results.innerHTML).toContain('skill1');
      expect(results.innerHTML).toContain('grid-row');
    });

    it('leaderboardResult page > 0 appends rows', () => {
      initializeWebview(api, config);
      // First page
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'leaderboardResult',
          payload: {
            skills: [{ name: 'first', source: 'a/b' }],
            total: 2, hasMore: true, page: 0,
            installedNames: [], updatableNames: [],
          },
        },
      }));
      // Second page
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'leaderboardResult',
          payload: {
            skills: [{ name: 'second', source: 'c/d' }],
            total: 2, hasMore: false, page: 1,
            installedNames: [], updatableNames: [],
          },
        },
      }));
      const results = document.getElementById('results')!;
      expect(results.innerHTML).toContain('first');
      expect(results.innerHTML).toContain('second');
    });

    it('searchResult renders rows', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'searchResult',
          payload: {
            skills: [{ name: 'found', source: 'x/y' }],
            count: 1,
            installedNames: [], updatableNames: [],
          },
        },
      }));
      const results = document.getElementById('results')!;
      expect(results.innerHTML).toContain('found');
    });

    it('searchResult with empty results shows empty state', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'searchResult',
          payload: {
            skills: [], count: 0,
            installedNames: [], updatableNames: [],
          },
        },
      }));
      const results = document.getElementById('results')!;
      expect(results.innerHTML).toContain('No skills found');
    });

    it('error message displays error', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'error', payload: 'Something went wrong' },
      }));
      const results = document.getElementById('results')!;
      expect(results.innerHTML).toContain('Error: Something went wrong');
    });

    it('updateButtonStates updates button classes', () => {
      initializeWebview(api, config);
      // First render some rows with install buttons
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-install" data-skill-name="skill1">Install</button>'
        + '<button class="btn-install" data-skill-name="skill2">Install</button>';

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'updateButtonStates',
          payload: {
            installedNames: ['skill1'],
            updatableNames: ['skill2'],
            manifestSkillNames: [],
          },
        },
      }));

      const btn1 = results.querySelector('[data-skill-name="skill1"]')!;
      expect(btn1.classList.contains('btn-installed')).toBe(true);
      expect(btn1.textContent).toBe('✓ Installed');

      const btn2 = results.querySelector('[data-skill-name="skill2"]')!;
      expect(btn2.classList.contains('btn-updatable')).toBe(true);
      expect(btn2.textContent).toBe('Update');
    });

    describe('updateButtonStates: updating guard', () => {
      it('updatingNames skill shows "Updating..." with btn-updating class and is disabled', () => {
        initializeWebview(api, config);
        const results = document.getElementById('results')!;
        results.innerHTML = '<button class="btn-install" data-skill-name="skill1">Install</button>';

        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateButtonStates',
            payload: {
              installedNames: [],
              updatableNames: [],
              updatingNames: ['skill1'],
              manifestSkillNames: [],
            },
          },
        }));

        const btn = results.querySelector('[data-skill-name="skill1"]') as HTMLButtonElement;
        expect(btn.classList.contains('btn-updating')).toBe(true);
        expect(btn.textContent).toBe('Updating...');
        expect(btn.disabled).toBe(true);
      });

      it('updatingNames takes priority over installedNames', () => {
        initializeWebview(api, config);
        const results = document.getElementById('results')!;
        results.innerHTML = '<button class="btn-install" data-skill-name="skill1">Install</button>';

        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateButtonStates',
            payload: {
              installedNames: ['skill1'],
              updatableNames: [],
              updatingNames: ['skill1'],
              manifestSkillNames: [],
            },
          },
        }));

        const btn = results.querySelector('[data-skill-name="skill1"]') as HTMLButtonElement;
        expect(btn.classList.contains('btn-updating')).toBe(true);
        expect(btn.textContent).toBe('Updating...');
      });

      it('updatingNames takes priority over updatableNames', () => {
        initializeWebview(api, config);
        const results = document.getElementById('results')!;
        results.innerHTML = '<button class="btn-install" data-skill-name="skill1">Install</button>';

        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateButtonStates',
            payload: {
              installedNames: [],
              updatableNames: ['skill1'],
              updatingNames: ['skill1'],
              manifestSkillNames: [],
            },
          },
        }));

        const btn = results.querySelector('[data-skill-name="skill1"]') as HTMLButtonElement;
        expect(btn.classList.contains('btn-updating')).toBe(true);
        expect(btn.textContent).toBe('Updating...');
      });

      it('updatingNames takes priority over default "Install" state', () => {
        initializeWebview(api, config);
        const results = document.getElementById('results')!;
        results.innerHTML = '<button class="btn-install" data-skill-name="skill1">Install</button>';

        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateButtonStates',
            payload: {
              installedNames: [],
              updatableNames: [],
              updatingNames: ['skill1'],
              manifestSkillNames: [],
            },
          },
        }));

        const btn = results.querySelector('[data-skill-name="skill1"]') as HTMLButtonElement;
        expect(btn.classList.contains('btn-updating')).toBe(true);
        expect(btn.textContent).toBe('Updating...');
        // Should NOT be in Install state
        expect(btn.textContent).not.toBe('Install');
      });

      it('skill NOT in updatingNames falls through to normal logic (regression guard)', () => {
        initializeWebview(api, config);
        const results = document.getElementById('results')!;
        results.innerHTML = '<button class="btn-install" data-skill-name="skill1">Install</button>'
          + '<button class="btn-install" data-skill-name="skill2">Install</button>';

        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateButtonStates',
            payload: {
              installedNames: ['skill1'],
              updatableNames: [],
              updatingNames: ['skill2'],
              manifestSkillNames: [],
            },
          },
        }));

        // skill1 should show installed state (not updating)
        const btn1 = results.querySelector('[data-skill-name="skill1"]') as HTMLButtonElement;
        expect(btn1.classList.contains('btn-installed')).toBe(true);
        expect(btn1.textContent).toBe('✓ Installed');

        // skill2 should show updating state
        const btn2 = results.querySelector('[data-skill-name="skill2"]') as HTMLButtonElement;
        expect(btn2.classList.contains('btn-updating')).toBe(true);
        expect(btn2.textContent).toBe('Updating...');
      });

      it('Detail view: action buttons not replaced while skill is in updatingNames', () => {
        initializeWebview(api, config);

        // Navigate to detail view: click a grid row to push navStack, then dispatch detailResult
        const results = document.getElementById('results')!;
        results.innerHTML = '<div class="grid-row" data-source="owner/repo" data-skill="test-skill"><span>click</span></div>';
        results.querySelector('.grid-row')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // Render detail view for an installed skill (no hasUpdate → shows remove button)
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'detailResult',
            payload: {
              name: 'test-skill',
              source: 'owner/repo',
              installCommand: 'npx skills add owner/repo',
              isInstalled: true,
            },
          },
        }));

        const overlay = document.getElementById('detail-overlay')!;
        // Verify action buttons exist before updateButtonStates
        const removeBtn = overlay.querySelector('.btn-action-remove');
        expect(removeBtn).not.toBeNull();

        // Dispatch updateButtonStates with skill in updatingNames but NOT in installedNames
        // (simulates the mid-update state where the skill folder has been removed)
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            command: 'updateButtonStates',
            payload: {
              installedNames: [],
              updatableNames: [],
              updatingNames: ['test-skill'],
              manifestSkillNames: [],
            },
          },
        }));

        // Action buttons should NOT have been replaced with an Install button
        // because the updating guard skips detail button replacement
        expect(overlay.querySelector('.btn-action-remove')).not.toBeNull();
        expect(overlay.querySelector('.btn-install')).toBeNull();
      });
    });

    it('installedSkillsData updates installed tab label', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [
            { name: 'A', folderName: 'a', source: 'x/y' },
            { name: 'B', folderName: 'b', source: 'x/y' },
          ],
        },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]')!;
      expect(installedTab.textContent).toContain('2');
    });

    it('navigateTo audits sends audits command', () => {
      initializeWebview(api, config);
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'navigateTo', payload: { view: 'audits' } },
      }));
      expect(api.postMessage).toHaveBeenCalledWith({ command: 'audits' });
    });

    it('navigateTo docs sends docs command', () => {
      initializeWebview(api, config);
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'navigateTo', payload: { view: 'docs', page: 'faq' } },
      }));
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'docs',
        payload: { page: 'faq' },
      });
    });

    it('leaderboardResult updates all-time tab count', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'leaderboardResult',
          payload: {
            skills: [], total: 150, hasMore: false, page: 0,
            installedNames: [], updatableNames: [],
          },
        },
      }));
      const allTimeTab = document.querySelector('.tab[data-tab="all-time"]')!;
      expect(allTimeTab.textContent).toContain('150');
    });

    it('switchTab message activates the specified tab and sends leaderboard command', () => {
      initializeWebview(api, config);
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();

      window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'switchTab', payload: { tab: 'weekly' } },
      }));

      const weeklyTab = document.querySelector('.tab[data-tab="weekly"]')!;
      expect(weeklyTab.classList.contains('active')).toBe(true);
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'leaderboard',
        payload: { view: 'weekly', page: 0 },
      });
    });

    it('switchTab to installed renders installed view', () => {
      initializeWebview(api, config);
      // Pre-load installed data
      window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'installedSkillsData', payload: [] },
      }));

      window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'switchTab', payload: { tab: 'installed' } },
      }));

      const installedTab = document.querySelector('.tab[data-tab="installed"]')!;
      expect(installedTab.classList.contains('active')).toBe(true);
      const results = document.getElementById('results')!;
      expect(results.innerHTML).toContain('No skills installed');
    });

    it('navigateToDetail message creates overlay and sends detail command', () => {
      initializeWebview(api, config);
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'navigateToDetail',
          payload: { source: 'owner/repo', skillId: 'my-skill' },
        },
      }));

      const overlay = document.getElementById('detail-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay!.innerHTML).toContain('Loading skill details');
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'detail',
        payload: { source: 'owner/repo', skillId: 'my-skill' },
      });
    });
  });

  describe('results click delegation', () => {
    it('clicking grid row sends detail command', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<div class="grid-row" data-source="owner/repo" data-skill="my-skill"><span>click me</span></div>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.grid-row')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'detail',
        payload: { source: 'owner/repo', skillId: 'my-skill' },
      });
    });

    it('clicking install button sends install command', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-install" data-install="a/b" data-skill-name="test">Install</button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.btn-install')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'install',
        payload: { source: 'a/b', skillName: 'test' },
      });
    });

    it('clicking installed button does nothing', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-install btn-installed" data-install="a/b" data-skill-name="test">✓ Installed</button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.btn-install')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ command: 'install' }),
      );
    });

    it('clicking update button sends update command', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-install btn-updatable" data-skill-name="upd">Update</button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.btn-install')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'update',
        payload: { skillName: 'upd' },
      });
    });

    it('clicking remove button sends uninstall command', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-action btn-action-remove" data-skill-name="rm"><span>Uninstall</span></button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.btn-action-remove')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'uninstall',
        payload: { skillName: 'rm' },
      });
    });

    it('clicking install-missing button sends installFromManifest', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-install btn-install-missing">Install Missing</button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.btn-install-missing')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({ command: 'installFromManifest' });
    });
  });

  describe('manifest toggle', () => {
    it('clicking manifest button sends addToManifest', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-action btn-action-manifest" data-source="a/b" data-skill-name="sk"><span>Add to Skills.json</span></button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.btn-action-manifest')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'addToManifest',
        payload: { source: 'a/b', skillName: 'sk' },
      });
    });

    it('clicking active manifest button sends removeFromManifest', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="btn-action btn-action-manifest btn-action-active" data-source="a/b" data-skill-name="sk"><span>Remove from Skills.json</span></button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.btn-action-manifest')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'removeFromManifest',
        payload: { skillName: 'sk' },
      });
    });
  });

  describe('auto-invoke toggle', () => {
    it('clicking toggle sends toggleAutoInvoke and updates UI optimistically', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<div class="installed-card">'
        + '<div class="card-header"><span class="status-dot status-dot-on"></span></div>'
        + '<div class="card-toggle" data-toggle-invoke="my-skill">'
        + '<span class="toggle-switch on"></span>'
        + '<span>Auto-invoke: ON</span>'
        + '</div></div>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('[data-toggle-invoke]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'toggleAutoInvoke',
        payload: { folderName: 'my-skill', disable: true },
      });
      // Optimistic UI updates
      expect(results.querySelector('.toggle-switch')!.classList.contains('on')).toBe(false);
      expect(results.querySelector('.status-dot')!.classList.contains('status-dot-off')).toBe(true);
      expect(results.querySelector('.card-toggle span:last-child')!.textContent).toBe('Auto-invoke: OFF');
    });

    it('clicking toggle on disabled skill re-enables it', () => {
      initializeWebview(api, config);
      const results = document.getElementById('results')!;
      results.innerHTML = '<div class="installed-card">'
        + '<div class="card-header"><span class="status-dot status-dot-off"></span></div>'
        + '<div class="card-toggle" data-toggle-invoke="my-skill">'
        + '<span class="toggle-switch"></span>'
        + '<span>Auto-invoke: OFF</span>'
        + '</div></div>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('[data-toggle-invoke]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'toggleAutoInvoke',
        payload: { folderName: 'my-skill', disable: false },
      });
      expect(results.querySelector('.toggle-switch')!.classList.contains('on')).toBe(true);
      expect(results.querySelector('.status-dot')!.classList.contains('status-dot-on')).toBe(true);
    });
    it('stale installedSkillsData does not overwrite optimistic toggle state', () => {
      initializeWebview(api, config);
      // Send initial installed data with toggle ON (disableModelInvocation: false)
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'my-skill', source: 'a/b', scope: 'global', disableModelInvocation: false }],
        },
      }));
      // Switch to installed tab to render cards
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();

      // Click toggle to turn OFF (disableModelInvocation: true)
      const results = document.getElementById('results')!;
      results.querySelector('[data-toggle-invoke]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Simulate stale installedSkillsData arriving with OLD state (disableModelInvocation: false)
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'my-skill', source: 'a/b', scope: 'global', disableModelInvocation: false }],
        },
      }));

      // Toggle should still show OFF (the inflight guard patches the stale data)
      expect(results.querySelector('.toggle-switch')!.classList.contains('on')).toBe(false);
    });

    it('guard keeps patching even after matching data arrives (stale rescan protection)', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'my-skill', source: 'a/b', scope: 'global', disableModelInvocation: false }],
        },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();

      // Toggle OFF
      const results = document.getElementById('results')!;
      results.querySelector('[data-toggle-invoke]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Send MATCHING data (disableModelInvocation: true — same as what we toggled to)
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'my-skill', source: 'a/b', scope: 'global', disableModelInvocation: true }],
        },
      }));

      // Toggle should show OFF (confirmed state)
      expect(results.querySelector('.toggle-switch')!.classList.contains('on')).toBe(false);

      // Send STALE data (from in-flight rescan that started before toggle write)
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'my-skill', source: 'a/b', scope: 'global', disableModelInvocation: false }],
        },
      }));

      // Guard still active — should STILL show OFF (patched), not revert to ON
      expect(results.querySelector('.toggle-switch')!.classList.contains('on')).toBe(false);
    });

    it('rapid toggle OFF then ON preserves final state', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'my-skill', source: 'a/b', scope: 'global', disableModelInvocation: false }],
        },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();

      const results = document.getElementById('results')!;
      // Toggle OFF
      results.querySelector('[data-toggle-invoke]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Toggle back ON immediately
      results.querySelector('[data-toggle-invoke]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Stale data arrives (from first toggle's write — shows disable=true)
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'my-skill', source: 'a/b', scope: 'global', disableModelInvocation: true }],
        },
      }));

      // Should show ON (the final toggle state was disable=false, i.e. ON)
      expect(results.querySelector('.toggle-switch')!.classList.contains('on')).toBe(true);
    });
  });

  describe('overflow menu', () => {
    it('clicking overflow button creates overflow menu', () => {
      initializeWebview(api, config);
      // Send installed skills data so the skill lookup works
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global', path: '/skills/test' }],
        },
      }));
      const results = document.getElementById('results')!;
      results.innerHTML = '<div class="card-actions">'
        + '<button class="overflow-menu-btn" data-overflow="test-skill">⋯</button>'
        + '</div>';

      results.querySelector('.overflow-menu-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const menu = results.querySelector('.overflow-menu');
      expect(menu).not.toBeNull();
      expect(menu!.innerHTML).toContain('Open SKILL.md');
      expect(menu!.innerHTML).toContain('Copy path');
    });

    it('clicking "Open SKILL.md" sends openSkillFile command', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global' }],
        },
      }));
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="overflow-menu-item" data-action="open" data-folder="test-skill">Open SKILL.md</button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.overflow-menu-item')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'openSkillFile',
        payload: { folderName: 'test-skill' },
      });
    });

    it('clicking "Add to skills.json" sends addToManifest command', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global', inManifest: false }],
        },
      }));
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="overflow-menu-item" data-action="manifest" data-folder="test-skill" data-source="a/b">Add to skills.json</button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.overflow-menu-item')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'addToManifest',
        payload: { source: 'a/b', skillName: 'test-skill' },
      });
    });

    it('clicking "Remove from skills.json" sends removeFromManifest command', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global', inManifest: true }],
        },
      }));
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="overflow-menu-item" data-action="manifest" data-folder="test-skill" data-source="a/b">Remove from skills.json</button>';

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      results.querySelector('.overflow-menu-item')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'removeFromManifest',
        payload: { skillName: 'test-skill' },
      });
    });

    it('clicking "Copy path" copies skill path to clipboard', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global', path: '/home/user/.claude/skills/test-skill' }],
        },
      }));
      const results = document.getElementById('results')!;
      results.innerHTML = '<button class="overflow-menu-item" data-action="copy-path" data-folder="test-skill">Copy path</button>';

      results.querySelector('.overflow-menu-item')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/home/user/.claude/skills/test-skill');
    });
  });

  describe('info banner', () => {
    it('renders info banner in installed tab', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global' }],
        },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();

      const results = document.getElementById('results')!;
      const banner = results.querySelector('.info-banner');
      expect(banner).not.toBeNull();
      expect(banner!.textContent).toContain('auto-invoke');
      expect(banner!.querySelector('a[href*="anthropic"]')).not.toBeNull();
    });

    it('dismiss button removes the info banner', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global' }],
        },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();

      const results = document.getElementById('results')!;
      const dismissBtn = results.querySelector('[data-dismiss-info]') as HTMLElement;
      expect(dismissBtn).not.toBeNull();
      dismissBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(results.querySelector('.info-banner')).toBeNull();
    });

    it('banner stays dismissed after tab switch', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global' }],
        },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();

      // Dismiss
      const results = document.getElementById('results')!;
      const dismissBtn = results.querySelector('[data-dismiss-info]') as HTMLElement;
      dismissBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Switch away and back
      const weeklyTab = document.querySelector('.tab[data-tab="weekly"]') as HTMLElement;
      weeklyTab.click();
      installedTab.click();

      expect(results.querySelector('.info-banner')).toBeNull();
    });
  });

  describe('accordion debounce', () => {
    it('rapid clicks within 200ms do not double-toggle group header', () => {
      initializeWebview(api, config);
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'installedSkillsData',
          payload: [{ name: 'Test', folderName: 'test-skill', source: 'a/b', scope: 'global' }],
        },
      }));
      const installedTab = document.querySelector('.tab[data-tab="installed"]') as HTMLElement;
      installedTab.click();

      const results = document.getElementById('results')!;
      const header = results.querySelector('.installed-group-header') as HTMLElement;
      const body = header.nextElementSibling as HTMLElement;
      expect(header).not.toBeNull();

      const wasCollapsed = header.classList.contains('collapsed');
      const wasOpen = body.classList.contains('open');

      // First click — toggles
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(header.classList.contains('collapsed')).toBe(!wasCollapsed);
      expect(body.classList.contains('open')).toBe(!wasOpen);

      // Immediate second click — should be debounced (no change)
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(header.classList.contains('collapsed')).toBe(!wasCollapsed);
      expect(body.classList.contains('open')).toBe(!wasOpen);
    });
  });

  describe('detail view interactions (end-to-end)', () => {
    function openDetail(overrides: Partial<DetailData> = {}): void {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'detailResult',
          payload: {
            name: 'test-skill',
            source: 'owner/repo',
            installCommand: 'npx skills add owner/repo',
            ...overrides,
          },
        },
      }));
    }

    /** Push navStack entry by clicking a grid row, then dispatch detailResult */
    function openDetailWithNavStack(overrides: Partial<DetailData> = {}): void {
      // Insert a grid row in results and click it to push onto navStack
      const results = document.getElementById('results')!;
      results.innerHTML = '<div class="grid-row" data-source="owner/repo" data-skill="test-skill"><span>click</span></div>';
      results.querySelector('.grid-row')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Now dispatch detailResult to fill the overlay
      openDetail(overrides);
    }

    it('uninstall button in overlay sends uninstall command', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: true });

      const overlay = document.getElementById('detail-overlay')!;
      const removeBtn = overlay.querySelector('.btn-action-remove') as HTMLElement;
      expect(removeBtn).not.toBeNull();

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'uninstall',
        payload: { skillName: 'test-skill' },
      });
    });

    it('uninstall button shows "Removing..." and disables', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: true });

      const overlay = document.getElementById('detail-overlay')!;
      const removeBtn = overlay.querySelector('.btn-action-remove') as HTMLButtonElement;
      removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(removeBtn.disabled).toBe(true);
      expect(removeBtn.querySelector('span')!.textContent).toBe('Removing...');
    });

    it('update button in overlay sends update command', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: true, hasUpdate: true });

      const overlay = document.getElementById('detail-overlay')!;
      const updateBtn = overlay.querySelector('.btn-action-update') as HTMLElement;
      expect(updateBtn).not.toBeNull();

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      updateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'update',
        payload: { skillName: 'test-skill' },
      });
    });

    it('update button shows "Updating..." and disables', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: true, hasUpdate: true });

      const overlay = document.getElementById('detail-overlay')!;
      const updateBtn = overlay.querySelector('.btn-action-update') as HTMLButtonElement;
      updateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(updateBtn.disabled).toBe(true);
      expect(updateBtn.querySelector('span')!.textContent).toBe('Updating...');
    });

    it('manifest button renders without active class when not in manifest', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: true, source: 'a/b' });

      const overlay = document.getElementById('detail-overlay')!;
      const manifestBtn = overlay.querySelector('.btn-action-manifest') as HTMLButtonElement;
      expect(manifestBtn).not.toBeNull();
      expect(manifestBtn.classList.contains('btn-action-active')).toBe(false);
      expect(manifestBtn.dataset.source).toBe('a/b');
      expect(manifestBtn.dataset.skillName).toBe('test-skill');
      expect(manifestBtn.querySelector('span')!.textContent).toBe('Add to Skills.json');
    });

    it('manifest button renders with active class when in manifest', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: true, inManifest: true, source: 'a/b' });

      const overlay = document.getElementById('detail-overlay')!;
      const manifestBtn = overlay.querySelector('.btn-action-manifest') as HTMLButtonElement;
      expect(manifestBtn).not.toBeNull();
      expect(manifestBtn.classList.contains('btn-action-active')).toBe(true);
      expect(manifestBtn.querySelector('span')!.textContent).toBe('Remove from Skills.json');
    });

    it('install button sends install command', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: false, source: 'a/b' });

      const overlay = document.getElementById('detail-overlay')!;
      const installBtn = overlay.querySelector('.btn-install') as HTMLElement;
      expect(installBtn).not.toBeNull();

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      installBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'install',
        payload: { source: 'a/b', skillName: 'test-skill' },
      });
    });

    it('install button shows "Installing..." and disables', () => {
      initializeWebview(api, config);
      openDetail({ isInstalled: false, source: 'a/b' });

      const overlay = document.getElementById('detail-overlay')!;
      const installBtn = overlay.querySelector('.btn-install') as HTMLButtonElement;
      installBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(installBtn.disabled).toBe(true);
      expect(installBtn.textContent).toBe('Installing...');
    });

    it('back button removes overlay (goBack)', () => {
      initializeWebview(api, config);
      openDetailWithNavStack();

      const overlay = document.getElementById('detail-overlay')!;
      expect(overlay).not.toBeNull();

      const backBtn = overlay.querySelector('#backBtn') as HTMLElement;
      backBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(document.getElementById('detail-overlay')).toBeNull();
    });

    it('breadcrumb home navigates back', () => {
      initializeWebview(api, config);
      openDetailWithNavStack();

      const overlay = document.getElementById('detail-overlay')!;
      const homeLink = overlay.querySelector('[data-nav="home"]') as HTMLElement;
      expect(homeLink).not.toBeNull();

      homeLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // goBack removes the overlay
      expect(document.getElementById('detail-overlay')).toBeNull();
    });

    it('breadcrumb external sends openExternal', () => {
      initializeWebview(api, config);
      openDetail({ source: 'owner/repo', repository: 'owner/repo' });

      const overlay = document.getElementById('detail-overlay')!;
      const externalLinks = overlay.querySelectorAll('[data-nav="external"]');
      // Find the owner link
      const ownerLink = Array.from(externalLinks).find(
        el => el.getAttribute('data-url') === 'https://skills.sh/owner',
      ) as HTMLElement;
      expect(ownerLink).not.toBeNull();

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      ownerLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'openExternal',
        payload: { url: 'https://skills.sh/owner' },
      });
    });

    it('copy command copies install command to clipboard', () => {
      initializeWebview(api, config);
      openDetail({ installCommand: 'npx skills add owner/repo' });

      const overlay = document.getElementById('detail-overlay')!;
      const copyCmd = overlay.querySelector('#copyCmd') as HTMLElement;
      expect(copyCmd).not.toBeNull();

      copyCmd.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('npx skills add owner/repo');
    });
  });

  describe('audits view interactions', () => {
    function openAuditsView(): void {
      initializeWebview(api, config);
      // Click audits nav link
      const auditsLink = document.querySelector('[data-nav-page="audits"]') as HTMLElement;
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      auditsLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    it('clicking audits nav link sends audits command', () => {
      openAuditsView();
      expect(api.postMessage).toHaveBeenCalledWith({ command: 'audits' });
    });

    it('audits row click sends detail command', () => {
      openAuditsView();
      // Dispatch auditsResult with a skill row
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'auditsResult',
          payload: {
            skills: [{
              name: 'audit-skill',
              skillId: 'audit-skill',
              source: 'owner/audit-repo',
              audits: [{ status: 'pass' }],
            }],
          },
        },
      }));

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      const row = document.querySelector('.audits-row') as HTMLElement;
      expect(row).not.toBeNull();
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'detail',
        payload: { source: 'owner/audit-repo', skillId: 'audit-skill' },
      });
    });

    it('audits back button navigates back', () => {
      openAuditsView();
      // Dispatch auditsResult
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'auditsResult',
          payload: { skills: [] },
        },
      }));

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      const backBtn = document.getElementById('backBtn') as HTMLElement;
      expect(backBtn).not.toBeNull();
      backBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // navigateBack with previous view on navigationStack sends 'back'
      expect(api.postMessage).toHaveBeenCalledWith({ command: 'back' });
    });
  });

  describe('docs view interactions', () => {
    function openDocsView(): void {
      initializeWebview(api, config);
      const docsLink = document.querySelector('[data-nav-page="docs"]') as HTMLElement;
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      docsLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    it('clicking docs nav link sends docs command with overview page', () => {
      openDocsView();
      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'docs',
        payload: { page: 'overview' },
      });
    });

    it('docs sidebar link sends docs command with page', () => {
      openDocsView();
      // Dispatch docsResult with HTML
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'docsResult',
          payload: { page: 'overview', title: 'Overview', html: '<p>Hello</p>' },
        },
      }));

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      const cliLink = document.querySelector('[data-docs-page="cli"]') as HTMLElement;
      expect(cliLink).not.toBeNull();
      cliLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'docs',
        payload: { page: 'cli' },
      });
    });

    it('docs external link sends openExternal', () => {
      openDocsView();
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'docsResult',
          payload: {
            page: 'overview',
            title: 'Overview',
            html: '<a data-nav="external" data-url="https://example.com">Link</a>',
          },
        },
      }));

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      const extLink = document.querySelector('.docs-content [data-nav="external"]') as HTMLElement;
      expect(extLink).not.toBeNull();
      extLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({
        command: 'openExternal',
        payload: { url: 'https://example.com' },
      });
    });

    it('docs home link navigates back', () => {
      openDocsView();
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'docsResult',
          payload: {
            page: 'overview',
            title: 'Overview',
            html: '<a data-nav="home">Home</a>',
          },
        },
      }));

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      const homeLink = document.querySelector('.docs-content [data-nav="home"]') as HTMLElement;
      expect(homeLink).not.toBeNull();
      homeLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // navigateBack pops 'leaderboard' from navigationStack, sends 'back'
      expect(api.postMessage).toHaveBeenCalledWith({ command: 'back' });
    });

    it('docs back button navigates back', () => {
      openDocsView();
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          command: 'docsResult',
          payload: { page: 'overview', title: 'Overview', html: '' },
        },
      }));

      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();
      const backBtn = document.getElementById('backBtn') as HTMLElement;
      expect(backBtn).not.toBeNull();
      backBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({ command: 'back' });
    });
  });

  describe('navigation interactions', () => {
    it('nav brand click sends back command', () => {
      initializeWebview(api, config);
      (api.postMessage as ReturnType<typeof vi.fn>).mockClear();

      const brand = document.querySelector('.nav-brand') as HTMLElement;
      brand.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(api.postMessage).toHaveBeenCalledWith({ command: 'back' });
    });

    it('search clear button clears input and focuses it', () => {
      initializeWebview(api, config);
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      const searchClear = document.getElementById('searchClear') as HTMLElement;

      // Type something first
      searchInput.value = 'test query';
      searchInput.dispatchEvent(new Event('input'));

      searchClear.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(searchInput.value).toBe('');
      expect(document.activeElement).toBe(searchInput);
    });

    it('Alt+LeftArrow navigates back when navStack has items', () => {
      initializeWebview(api, config);
      // Push onto navStack by clicking a grid row
      const results = document.getElementById('results')!;
      results.innerHTML = '<div class="grid-row" data-source="o/r" data-skill="sk"><span>x</span></div>';
      results.querySelector('.grid-row')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Overlay should exist
      expect(document.getElementById('detail-overlay')).not.toBeNull();

      // Press Alt+ArrowLeft
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }));

      // Overlay should be removed
      expect(document.getElementById('detail-overlay')).toBeNull();
    });
  });

  describe('hero section', () => {
    it('hero copy icon copies current command to clipboard', () => {
      initializeWebview(api, config);
      const heroCopyIcon = document.getElementById('heroCopyIcon') as HTMLElement;

      heroCopyIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('npx skills add <owner/repo>');
    });

    it('hero copy icon shows checkmark feedback', () => {
      initializeWebview(api, config);
      const heroCopyIcon = document.getElementById('heroCopyIcon') as HTMLElement;

      heroCopyIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(heroCopyIcon.dataset.copying).toBe('true');
    });

    it('hero carousel rotates after 4 seconds', () => {
      initializeWebview(api, config);
      const carousel = document.getElementById('heroCmdCarousel')!;

      // Initially has one active item
      expect(carousel.querySelector('.hero-cmd-item.active')).not.toBeNull();

      vi.advanceTimersByTime(4000);

      // After 4s, old item gets slide-out class, new item is appended
      const items = carousel.querySelectorAll('.hero-cmd-item');
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(carousel.querySelector('.hero-cmd-item.slide-out')).not.toBeNull();
      expect(carousel.querySelector('.hero-cmd-item.slide-in')).not.toBeNull();
    });

    it('hero carousel completes transition after 300ms', () => {
      initializeWebview(api, config);
      const carousel = document.getElementById('heroCmdCarousel')!;

      vi.advanceTimersByTime(4000); // trigger rotation
      vi.advanceTimersByTime(300);  // complete transition

      // Old item should be removed, new item should be active with text 'update'
      const activeItem = carousel.querySelector('.hero-cmd-item.active');
      expect(activeItem).not.toBeNull();
      expect(activeItem!.textContent).toBe('update');
      // Only one item should remain
      expect(carousel.querySelectorAll('.hero-cmd-item').length).toBe(1);
    });
  });

  describe('state persistence', () => {
    it('saves state on tab switch', () => {
      initializeWebview(api, config);
      const weeklyTab = document.querySelector('.tab[data-tab="weekly"]') as HTMLElement;
      weeklyTab.click();
      expect(api.setState).toHaveBeenCalledWith(
        expect.objectContaining({ currentTab: 'weekly' }),
      );
    });

    it('saves state on chip click', () => {
      initializeWebview(api, config);
      const chip = document.querySelector('.chip[data-category="react"]') as HTMLElement;
      chip.click();
      expect(api.setState).toHaveBeenCalledWith(
        expect.objectContaining({ currentChip: 'react' }),
      );
    });
  });
});

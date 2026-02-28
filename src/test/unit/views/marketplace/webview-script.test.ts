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
    <nav><span class="nav-brand">skills.sh</span></nav>
    <div class="hero"><pre class="hero-ascii"></pre></div>
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

describe('renderInstalledRow', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('renders global skill with manifest button', () => {
    const skill: InstalledSkillData = {
      name: 'Test Skill', folderName: 'test-skill',
      source: 'owner/repo', scope: 'global',
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).toContain('Test Skill');
    expect(html).toContain('scope-global');
    expect(html).toContain('btn-action-manifest');
    expect(html).toContain('Add to Skills.json');
  });

  it('renders project skill with scope badge', () => {
    const skill: InstalledSkillData = {
      name: 'Proj Skill', folderName: 'proj',
      source: 'a/b', scope: 'project',
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).toContain('scope-project');
  });

  it('renders active manifest state when in manifest', () => {
    const skill: InstalledSkillData = {
      name: 'Mf Skill', folderName: 'mf',
      source: 'a/b', inManifest: true,
    };
    const html = renderInstalledRow(skill, new Set(['mf']));
    expect(html).toContain('btn-action-active');
    expect(html).toContain('Remove from Skills.json');
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

  it('omits manifest button when source is empty', () => {
    const skill: InstalledSkillData = {
      name: 'Custom', folderName: 'cust',
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).not.toContain('btn-action-manifest');
    expect(html).toContain('Custom skill');
  });

  it('shows description if present', () => {
    const skill: InstalledSkillData = {
      name: 'Desc', folderName: 'desc',
      source: 'a/b', description: 'A helpful description',
    };
    const html = renderInstalledRow(skill, new Set());
    expect(html).toContain('A helpful description');
  });
});

describe('renderInstalledGroup', () => {
  beforeEach(() => {
    setConfig(makeConfig());
  });

  it('returns empty string for empty skills array', () => {
    expect(renderInstalledGroup('Empty', [], true, new Set())).toBe('');
  });

  it('renders expanded group', () => {
    const skills: InstalledSkillData[] = [
      { name: 'A', folderName: 'a', source: 'x/y' },
    ];
    const html = renderInstalledGroup('Test Group', skills, true, new Set());
    expect(html).toContain('installed-group-header');
    expect(html).not.toContain('collapsed');
    expect(html).toContain('installed-group-body open');
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

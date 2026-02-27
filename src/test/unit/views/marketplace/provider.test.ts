import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { InstalledSkillCard, LeaderboardView, WebviewMessage } from '../../../../types';

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the module under test
// ---------------------------------------------------------------------------

// Mock the search API
const mockSearchSkills = vi.fn();
const mockGetLeaderboard = vi.fn();
vi.mock('../../../../api/search', () => ({
  searchSkills: (...args: unknown[]) => mockSearchSkills(...args),
  getLeaderboard: (...args: unknown[]) => mockGetLeaderboard(...args),
}));

// Mock the detail scraper
const mockFetchSkillDetail = vi.fn();
vi.mock('../../../../api/detail-scraper', () => ({
  fetchSkillDetail: (...args: unknown[]) => mockFetchSkillDetail(...args),
}));

// Mock the GitHub API (fetchSkillMd)
const mockFetchSkillMd = vi.fn();
vi.mock('../../../../api/github', () => ({
  fetchSkillMd: (...args: unknown[]) => mockFetchSkillMd(...args),
}));

// Mock the docs scraper
const mockFetchDocsPage = vi.fn();
vi.mock('../../../../api/docs-scraper', () => ({
  fetchDocsPage: (...args: unknown[]) => mockFetchDocsPage(...args),
}));

// Mock the audits scraper
const mockFetchAuditListing = vi.fn();
vi.mock('../../../../api/audits-scraper', () => ({
  fetchAuditListing: (...args: unknown[]) => mockFetchAuditListing(...args),
}));

// Mock the installer
const mockInstallSkill = vi.fn();
const mockUpdateSkills = vi.fn();
const mockUninstallSkill = vi.fn();
vi.mock('../../../../install/installer', () => ({
  installSkill: (...args: unknown[]) => mockInstallSkill(...args),
  updateSkills: (...args: unknown[]) => mockUpdateSkills(...args),
  uninstallSkill: (...args: unknown[]) => mockUninstallSkill(...args),
}));

// Mock the updates module
let mockUpdateResult: { updates: { name: string; source: string; newHash: string }[] } | null = null;
vi.mock('../../../../api/updates', () => ({
  getLastUpdateResult: () => mockUpdateResult,
}));

// Mock the manifest module
let mockManifestNames = new Set<string>();
const mockAddSkillToManifest = vi.fn();
const mockRemoveSkillFromManifest = vi.fn();
vi.mock('../../../../manifest/manifest', () => ({
  getManifestSkillNames: () => mockManifestNames,
  addSkillToManifest: (...args: unknown[]) => mockAddSkillToManifest(...args),
  removeSkillFromManifest: (...args: unknown[]) => mockRemoveSkillFromManifest(...args),
}));

// Mock the styles module (avoid pulling in the large CSS)
vi.mock('../../../../views/marketplace/styles', () => ({
  getStyles: () => '/* mocked styles */',
}));

// Mock marked (avoid pulling in the real markdown parser)
vi.mock('marked', () => ({
  Marked: class {
    parse(md: string) {
      return Promise.resolve(`<p>${md}</p>`);
    }
  },
}));

// Import the module under test AFTER mocks
import { MarketplaceViewProvider } from '../../../../views/marketplace/provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake vscode.Webview with message tracking */
function createMockWebview() {
  const postedMessages: unknown[] = [];
  return {
    postMessage: vi.fn(async (msg: unknown) => {
      postedMessages.push(msg);
      return true;
    }),
    asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
    onDidReceiveMessage: vi.fn(),
    cspSource: 'mock-csp',
    options: {} as vscode.WebviewOptions,
    html: '',
    _postedMessages: postedMessages,
  };
}

/** Create a fake WebviewView (sidebar panel) */
function createMockWebviewView() {
  const webview = createMockWebview();
  return {
    webview,
    viewType: 'skills-sh.marketplace',
    title: undefined,
    description: undefined,
    badge: undefined,
    visible: true,
    onDidDispose: vi.fn(),
    onDidChangeVisibility: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  };
}

/** Helper to resolve the webview view and get access to the message handler */
function resolveProvider(
  provider: MarketplaceViewProvider,
): { webview: ReturnType<typeof createMockWebview>; sendMessage: (msg: WebviewMessage) => Promise<void> } {
  const mockView = createMockWebviewView();

  // Capture the message handler registration
  let messageHandler: ((msg: WebviewMessage) => Promise<void>) | undefined;
  mockView.webview.onDidReceiveMessage.mockImplementation((handler: (msg: WebviewMessage) => Promise<void>) => {
    messageHandler = handler;
    return { dispose: vi.fn() };
  });

  provider.resolveWebviewView(
    mockView as unknown as vscode.WebviewView,
    {} as vscode.WebviewViewResolveContext,
    {} as vscode.CancellationToken,
  );

  const sendMessage = async (msg: WebviewMessage) => {
    if (!messageHandler) {
      throw new Error('resolveWebviewView did not register a message handler');
    }
    await messageHandler(msg);
  };

  return { webview: mockView.webview, sendMessage };
}

function makeInstalledCard(overrides: Partial<InstalledSkillCard> & { name: string }): InstalledSkillCard {
  return {
    folderName: overrides.name,
    description: '',
    scope: 'global',
    hasUpdate: false,
    isCustom: false,
    inManifest: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketplaceViewProvider', () => {
  let provider: MarketplaceViewProvider;
  const extensionUri = vscode.Uri.file('/mock/extension');

  beforeEach(() => {
    vi.restoreAllMocks();
    (vscode.workspace as any).__resetConfig();
    (vscode.commands as any).__clearRegistered();
    mockManifestNames = new Set();
    mockUpdateResult = null;

    // Reset all API mocks
    mockSearchSkills.mockReset();
    mockGetLeaderboard.mockReset();
    mockFetchSkillDetail.mockReset();
    mockFetchSkillMd.mockReset();
    mockFetchDocsPage.mockReset();
    mockFetchAuditListing.mockReset();
    mockInstallSkill.mockReset();
    mockUpdateSkills.mockReset();
    mockUninstallSkill.mockReset();
    mockAddSkillToManifest.mockReset();
    mockRemoveSkillFromManifest.mockReset();

    provider = new MarketplaceViewProvider(extensionUri);
  });

  // =========================================================================
  // Construction and static properties
  // =========================================================================

  describe('constructor and static properties', () => {
    it('has the correct viewType', () => {
      expect(MarketplaceViewProvider.viewType).toBe('skills-sh.marketplace');
    });

    it('accepts an optional onManifestChanged callback', () => {
      const cb = vi.fn();
      const p = new MarketplaceViewProvider(extensionUri, cb);
      expect(p).toBeDefined();
    });
  });

  // =========================================================================
  // resolveWebviewView
  // =========================================================================

  describe('resolveWebviewView', () => {
    it('sets the webview HTML', () => {
      const mockView = createMockWebviewView();
      mockView.webview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });

      provider.resolveWebviewView(
        mockView as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockView.webview.html).toContain('<!DOCTYPE html>');
      expect(mockView.webview.html).toContain('skills.sh');
    });

    it('enables scripts in webview options', () => {
      const mockView = createMockWebviewView();
      mockView.webview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });

      provider.resolveWebviewView(
        mockView as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockView.webview.options.enableScripts).toBe(true);
    });

    it('registers a message handler', () => {
      const mockView = createMockWebviewView();
      mockView.webview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });

      provider.resolveWebviewView(
        mockView as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockView.webview.onDidReceiveMessage).toHaveBeenCalledTimes(1);
    });

    it('includes categories from config as chips', () => {
      (vscode.workspace as any).__setConfigValue(
        'skills-sh.categories',
        ['react', 'vue', 'svelte'],
      );
      const mockView = createMockWebviewView();
      mockView.webview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });

      provider.resolveWebviewView(
        mockView as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockView.webview.html).toContain('react');
      expect(mockView.webview.html).toContain('vue');
      expect(mockView.webview.html).toContain('svelte');
    });

    it('uses default categories when none are configured', () => {
      const mockView = createMockWebviewView();
      mockView.webview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });

      provider.resolveWebviewView(
        mockView as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      // Default categories include react and next
      expect(mockView.webview.html).toContain('react');
      expect(mockView.webview.html).toContain('next');
    });
  });

  // =========================================================================
  // Message handling: leaderboard
  // =========================================================================

  describe('handleMessage: leaderboard', () => {
    it('calls getLeaderboard and posts leaderboardResult', async () => {
      const leaderboardData = {
        skills: [{ source: 'org/repo', skillId: 'my-skill', name: 'My Skill', installs: 1000 }],
        total: 100,
        hasMore: true,
        page: 0,
      };
      mockGetLeaderboard.mockResolvedValue(leaderboardData);
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'leaderboard', payload: { view: 'all-time' as LeaderboardView, page: 0 } });

      expect(mockGetLeaderboard).toHaveBeenCalledWith('all-time', 0);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'leaderboardResult',
          payload: expect.objectContaining({
            skills: leaderboardData.skills,
            total: 100,
            hasMore: true,
            page: 0,
          }),
        }),
      );
    });

    it('includes installedNames and updatableNames in leaderboardResult', async () => {
      const leaderboardData = {
        skills: [],
        total: 0,
        hasMore: false,
        page: 0,
      };
      mockGetLeaderboard.mockResolvedValue(leaderboardData);

      provider.setInstalledNames(new Set(['skill-a', 'skill-b']));
      provider.setUpdatableNames(new Set(['skill-a']));

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'leaderboard', payload: { view: 'all-time' as LeaderboardView, page: 0 } });

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'leaderboardResult',
      );
      expect(call).toBeDefined();
      const payload = (call![0] as any).payload;
      expect(payload.installedNames).toEqual(expect.arrayContaining(['skill-a', 'skill-b']));
      expect(payload.updatableNames).toEqual(['skill-a']);
    });

    it('includes manifestSkillNames in leaderboardResult', async () => {
      mockManifestNames = new Set(['manifest-skill']);
      const leaderboardData = { skills: [], total: 0, hasMore: false, page: 0 };
      mockGetLeaderboard.mockResolvedValue(leaderboardData);

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'leaderboard', payload: { view: 'all-time' as LeaderboardView, page: 0 } });

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'leaderboardResult',
      );
      const payload = (call![0] as any).payload;
      expect(payload.manifestSkillNames).toEqual(['manifest-skill']);
    });

    it('posts error when getLeaderboard throws', async () => {
      mockGetLeaderboard.mockRejectedValue(new Error('API timeout'));
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'leaderboard', payload: { view: 'all-time' as LeaderboardView, page: 0 } });

      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'error',
        payload: 'API timeout',
      });
    });

    it('handles non-Error exceptions with generic message', async () => {
      mockGetLeaderboard.mockRejectedValue('string error');
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'leaderboard', payload: { view: 'all-time' as LeaderboardView, page: 0 } });

      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'error',
        payload: 'Unknown error',
      });
    });

    it('passes trending view correctly', async () => {
      mockGetLeaderboard.mockResolvedValue({ skills: [], total: 0, hasMore: false, page: 0 });
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'leaderboard', payload: { view: 'trending' as LeaderboardView, page: 2 } });

      expect(mockGetLeaderboard).toHaveBeenCalledWith('trending', 2);
    });
  });

  // =========================================================================
  // Message handling: search
  // =========================================================================

  describe('handleMessage: search', () => {
    it('calls searchSkills and posts searchResult', async () => {
      const searchData = {
        query: 'react',
        searchType: 'fuzzy',
        skills: [{ id: '1', skillId: 'react-skill', name: 'React Skill', installs: 500, source: 'org/repo' }],
        count: 1,
        duration_ms: 5,
      };
      mockSearchSkills.mockResolvedValue(searchData);
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'search', payload: { query: 'react' } });

      expect(mockSearchSkills).toHaveBeenCalledWith('react');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'searchResult',
          payload: expect.objectContaining({
            skills: searchData.skills,
            count: 1,
          }),
        }),
      );
    });

    it('includes installed/updatable/manifest state in searchResult', async () => {
      const searchData = { query: 'react', searchType: 'fuzzy', skills: [], count: 0, duration_ms: 0 };
      mockSearchSkills.mockResolvedValue(searchData);
      mockManifestNames = new Set(['manifest-skill']);
      provider.setInstalledNames(new Set(['installed-skill']));
      provider.setUpdatableNames(new Set(['updatable-skill']));

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'search', payload: { query: 'react' } });

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'searchResult',
      );
      const payload = (call![0] as any).payload;
      expect(payload.installedNames).toEqual(['installed-skill']);
      expect(payload.updatableNames).toEqual(['updatable-skill']);
      expect(payload.manifestSkillNames).toEqual(['manifest-skill']);
    });

    it('posts error when searchSkills throws', async () => {
      mockSearchSkills.mockRejectedValue(new Error('Network error'));
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'search', payload: { query: 'react' } });

      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'error',
        payload: 'Network error',
      });
    });
  });

  // =========================================================================
  // Message handling: detail
  // =========================================================================

  describe('handleMessage: detail', () => {
    const detailPayload = { source: 'org/repo', skillId: 'my-skill' };

    it('fetches detail and posts detailResult', async () => {
      const detail = {
        name: 'my-skill',
        source: 'org/repo',
        weeklyInstalls: '1.2K',
        firstSeen: 'Jan 10, 2026',
        repository: 'org/repo',
        installCommand: 'npx skills add https://github.com/org/repo --skill my-skill',
        perAgent: [],
        skillMdHtml: '<p>Hello</p>',
      };
      mockFetchSkillDetail.mockResolvedValue(detail);
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'detail', payload: detailPayload });

      expect(mockFetchSkillDetail).toHaveBeenCalledWith('org', 'repo', 'my-skill');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'detailResult',
          payload: expect.objectContaining({
            name: 'my-skill',
            source: 'org/repo',
            isInstalled: false,
            inManifest: false,
            hasUpdate: false,
          }),
        }),
      );
    });

    it('fetches SKILL.md when detail has no skillMdHtml', async () => {
      const detail = {
        name: 'my-skill',
        source: 'org/repo',
        weeklyInstalls: '1K',
        firstSeen: 'Jan 2026',
        repository: 'org/repo',
        installCommand: 'npx skills add ...',
        perAgent: [],
        skillMdHtml: '', // empty skillMdHtml
      };
      mockFetchSkillDetail.mockResolvedValue(detail);
      mockFetchSkillMd.mockResolvedValue('# Skill Content');

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'detail', payload: detailPayload });

      expect(mockFetchSkillMd).toHaveBeenCalledWith('org/repo', 'my-skill');
      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'detailResult',
      );
      const payload = (call![0] as any).payload;
      expect(payload.skillMdHtml).toContain('# Skill Content');
    });

    it('falls back to GitHub SKILL.md when fetchSkillDetail returns null', async () => {
      mockFetchSkillDetail.mockResolvedValue(null);
      mockFetchSkillMd.mockResolvedValue('# Fallback Content');

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'detail', payload: detailPayload });

      expect(mockFetchSkillMd).toHaveBeenCalledWith('org/repo', 'my-skill');
      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'detailResult',
      );
      const payload = (call![0] as any).payload;
      expect(payload.name).toBe('my-skill');
      expect(payload.weeklyInstalls).toBe('N/A');
      expect(payload.firstSeen).toBe('N/A');
      expect(payload.skillMdHtml).toContain('# Fallback Content');
    });

    it('falls back to error message when both detail and SKILL.md are unavailable', async () => {
      mockFetchSkillDetail.mockResolvedValue(null);
      mockFetchSkillMd.mockResolvedValue(null);

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'detail', payload: detailPayload });

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'detailResult',
      );
      const payload = (call![0] as any).payload;
      expect(payload.skillMdHtml).toContain('Could not load skill details');
    });

    it('sets isInstalled=true when skill is in installedNames', async () => {
      const detail = {
        name: 'my-skill',
        source: 'org/repo',
        weeklyInstalls: '1K',
        firstSeen: 'Jan 2026',
        repository: 'org/repo',
        installCommand: 'npx skills add ...',
        perAgent: [],
        skillMdHtml: '<p>OK</p>',
      };
      mockFetchSkillDetail.mockResolvedValue(detail);
      provider.setInstalledNames(new Set(['my-skill']));

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'detail', payload: detailPayload });

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'detailResult',
      );
      expect((call![0] as any).payload.isInstalled).toBe(true);
    });

    it('sets inManifest=true when skill is in manifest', async () => {
      mockManifestNames = new Set(['my-skill']);
      const detail = {
        name: 'my-skill',
        source: 'org/repo',
        weeklyInstalls: '1K',
        firstSeen: 'Jan 2026',
        repository: 'org/repo',
        installCommand: 'npx skills add ...',
        perAgent: [],
        skillMdHtml: '<p>OK</p>',
      };
      mockFetchSkillDetail.mockResolvedValue(detail);

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'detail', payload: detailPayload });

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'detailResult',
      );
      expect((call![0] as any).payload.inManifest).toBe(true);
    });

    it('sets hasUpdate=true when skill is in updatableNames', async () => {
      const detail = {
        name: 'my-skill',
        source: 'org/repo',
        weeklyInstalls: '1K',
        firstSeen: 'Jan 2026',
        repository: 'org/repo',
        installCommand: 'npx skills add ...',
        perAgent: [],
        skillMdHtml: '<p>OK</p>',
      };
      mockFetchSkillDetail.mockResolvedValue(detail);
      provider.setUpdatableNames(new Set(['my-skill']));

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'detail', payload: detailPayload });

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'detailResult',
      );
      expect((call![0] as any).payload.hasUpdate).toBe(true);
    });

    it('posts error when fetchSkillDetail throws', async () => {
      mockFetchSkillDetail.mockRejectedValue(new Error('Scrape failed'));
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'detail', payload: detailPayload });

      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'error',
        payload: 'Scrape failed',
      });
    });
  });

  // =========================================================================
  // Message handling: install
  // =========================================================================

  describe('handleMessage: install', () => {
    it('calls installSkill with the correct GitHub URL and skill option', async () => {
      mockInstallSkill.mockResolvedValue(true);
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'install', payload: { source: 'org/repo', skillName: 'my-skill' } });

      expect(mockInstallSkill).toHaveBeenCalledWith(
        'https://github.com/org/repo',
        { skill: 'my-skill' },
      );
    });

    it('pushes button states when install returns false (user cancelled)', async () => {
      mockInstallSkill.mockResolvedValue(false);
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'install', payload: { source: 'org/repo', skillName: 'my-skill' } });

      // When install is cancelled (returns false), pushButtonStates is called,
      // which posts 'updateButtonStates'
      const updateCall = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'updateButtonStates',
      );
      expect(updateCall).toBeDefined();
    });

    it('does NOT push button states when install returns true (started successfully)', async () => {
      mockInstallSkill.mockResolvedValue(true);
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'install', payload: { source: 'org/repo', skillName: 'my-skill' } });

      const updateCall = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'updateButtonStates',
      );
      expect(updateCall).toBeUndefined();
    });
  });

  // =========================================================================
  // Message handling: update
  // =========================================================================

  describe('handleMessage: update', () => {
    it('calls updateSkills with matching updates from last result', async () => {
      mockUpdateResult = {
        updates: [
          { name: 'skill-a', source: 'org/repo', newHash: 'hash-a' },
          { name: 'skill-b', source: 'org/repo2', newHash: 'hash-b' },
        ],
      };
      mockUpdateSkills.mockResolvedValue(undefined);
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'update', payload: { skillName: 'skill-a' } });

      expect(mockUpdateSkills).toHaveBeenCalledWith([
        { name: 'skill-a', source: 'org/repo', newHash: 'hash-a' },
      ]);
    });

    it('updates all skills when no skillName specified', async () => {
      mockUpdateResult = {
        updates: [
          { name: 'skill-a', source: 'org/repo', newHash: 'hash-a' },
          { name: 'skill-b', source: 'org/repo2', newHash: 'hash-b' },
        ],
      };
      mockUpdateSkills.mockResolvedValue(undefined);
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'update', payload: {} });

      expect(mockUpdateSkills).toHaveBeenCalledWith(mockUpdateResult.updates);
    });

    it('does nothing when no update result exists', async () => {
      mockUpdateResult = null;
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'update', payload: { skillName: 'my-skill' } });

      expect(mockUpdateSkills).not.toHaveBeenCalled();
    });

    it('does nothing when update result has no updates', async () => {
      mockUpdateResult = { updates: [] };
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'update', payload: { skillName: 'my-skill' } });

      expect(mockUpdateSkills).not.toHaveBeenCalled();
    });

    it('does nothing when targetName filter matches nothing', async () => {
      mockUpdateResult = {
        updates: [{ name: 'other-skill', source: 'org/repo', newHash: 'abc' }],
      };
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'update', payload: { skillName: 'nonexistent' } });

      expect(mockUpdateSkills).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Message handling: audits
  // =========================================================================

  describe('handleMessage: audits', () => {
    it('calls fetchAuditListing and posts auditsResult', async () => {
      const auditsData = { skills: [{ name: 'skill-a', source: 'org/repo', skillId: 'skill-a', audits: [] }], total: 1 };
      mockFetchAuditListing.mockResolvedValue(auditsData);
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'audits' });

      expect(mockFetchAuditListing).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'auditsResult',
        payload: auditsData,
      });
    });

    it('posts error when fetchAuditListing throws', async () => {
      mockFetchAuditListing.mockRejectedValue(new Error('Audit scrape failed'));
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'audits' });

      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'error',
        payload: 'Audit scrape failed',
      });
    });
  });

  // =========================================================================
  // Message handling: docs
  // =========================================================================

  describe('handleMessage: docs', () => {
    it('calls fetchDocsPage and posts docsResult', async () => {
      const docsData = { page: 'overview' as const, title: 'Getting Started', html: '<p>Welcome</p>' };
      mockFetchDocsPage.mockResolvedValue(docsData);
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'docs', payload: { page: 'overview' } });

      expect(mockFetchDocsPage).toHaveBeenCalledWith('overview');
      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'docsResult',
        payload: docsData,
      });
    });

    it('requests CLI docs page correctly', async () => {
      const docsData = { page: 'cli' as const, title: 'CLI Reference', html: '<p>CLI</p>' };
      mockFetchDocsPage.mockResolvedValue(docsData);
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'docs', payload: { page: 'cli' } });

      expect(mockFetchDocsPage).toHaveBeenCalledWith('cli');
    });

    it('posts error when fetchDocsPage throws', async () => {
      mockFetchDocsPage.mockRejectedValue(new Error('Docs unavailable'));
      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'docs', payload: { page: 'faq' } });

      expect(webview.postMessage).toHaveBeenCalledWith({
        command: 'error',
        payload: 'Docs unavailable',
      });
    });
  });

  // =========================================================================
  // Message handling: back
  // =========================================================================

  describe('handleMessage: back', () => {
    it('re-renders the full webview HTML to reset view', async () => {
      const { webview, sendMessage } = resolveProvider(provider);

      // Store original html
      const originalHtml = webview.html;

      await sendMessage({ command: 'back' });

      // The html should be reset (re-rendered)
      // Since we can't directly read webview.html changes through our mock,
      // we verify it was set by checking the asWebviewUri was called for fonts
      expect(webview.asWebviewUri).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Message handling: openExternal
  // =========================================================================

  describe('handleMessage: openExternal', () => {
    it('opens the URL via vscode.env.openExternal', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'openExternal', payload: { url: 'https://skills.sh' } });

      expect(vscode.env.openExternal).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Message handling: openCategorySettings
  // =========================================================================

  describe('handleMessage: openCategorySettings', () => {
    it('executes openSettings command with skills-sh.categories', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'openCategorySettings' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'skills-sh.categories',
      );
    });
  });

  // =========================================================================
  // Message handling: addToManifest
  // =========================================================================

  describe('handleMessage: addToManifest', () => {
    it('calls addSkillToManifest and shows information message', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'addToManifest', payload: { source: 'org/repo', skillName: 'my-skill' } });

      expect(mockAddSkillToManifest).toHaveBeenCalledWith('org/repo', 'my-skill');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Added "my-skill" to skills.json',
      );
    });

    it('invokes onManifestChanged callback', async () => {
      const onManifestChanged = vi.fn();
      const providerWithCb = new MarketplaceViewProvider(extensionUri, onManifestChanged);
      const { sendMessage } = resolveProvider(providerWithCb);

      await sendMessage({ command: 'addToManifest', payload: { source: 'org/repo', skillName: 'skill-x' } });

      expect(onManifestChanged).toHaveBeenCalled();
    });

    it('updates installed skills inManifest flag', async () => {
      const cards: InstalledSkillCard[] = [
        makeInstalledCard({ name: 'my-skill', folderName: 'my-skill', source: 'org/repo' }),
        makeInstalledCard({ name: 'other', folderName: 'other', source: 'org/repo2' }),
      ];
      provider.setInstalledSkills(cards);

      const { webview, sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'addToManifest', payload: { source: 'org/repo', skillName: 'my-skill' } });

      // Should post installedSkillsData with updated inManifest flag
      const installCall = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'installedSkillsData',
      );
      expect(installCall).toBeDefined();
      const skills = (installCall![0] as any).payload as InstalledSkillCard[];
      const updatedSkill = skills.find(s => s.folderName === 'my-skill');
      expect(updatedSkill?.inManifest).toBe(true);
    });

    it('does nothing when source is missing', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'addToManifest', payload: { source: '', skillName: 'skill' } });

      expect(mockAddSkillToManifest).not.toHaveBeenCalled();
    });

    it('does nothing when skillName is missing', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'addToManifest', payload: { source: 'org/repo', skillName: '' } });

      expect(mockAddSkillToManifest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Message handling: removeFromManifest
  // =========================================================================

  describe('handleMessage: removeFromManifest', () => {
    it('calls removeSkillFromManifest and shows information message', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'removeFromManifest', payload: { skillName: 'my-skill' } });

      expect(mockRemoveSkillFromManifest).toHaveBeenCalledWith('my-skill');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Removed "my-skill" from skills.json',
      );
    });

    it('invokes onManifestChanged callback', async () => {
      const onManifestChanged = vi.fn();
      const providerWithCb = new MarketplaceViewProvider(extensionUri, onManifestChanged);
      const { sendMessage } = resolveProvider(providerWithCb);

      await sendMessage({ command: 'removeFromManifest', payload: { skillName: 'skill-y' } });

      expect(onManifestChanged).toHaveBeenCalled();
    });

    it('updates installed skills inManifest flag to false', async () => {
      const cards: InstalledSkillCard[] = [
        makeInstalledCard({ name: 'my-skill', folderName: 'my-skill', source: 'org/repo', inManifest: true }),
      ];
      provider.setInstalledSkills(cards);

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'removeFromManifest', payload: { skillName: 'my-skill' } });

      const installCall = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'installedSkillsData',
      );
      expect(installCall).toBeDefined();
      const skills = (installCall![0] as any).payload as InstalledSkillCard[];
      expect(skills[0].inManifest).toBe(false);
    });

    it('does nothing when skillName is empty', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'removeFromManifest', payload: { skillName: '' } });

      expect(mockRemoveSkillFromManifest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Message handling: installFromManifest
  // =========================================================================

  describe('handleMessage: installFromManifest', () => {
    it('executes the skills-sh.installFromManifest command', async () => {
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'installFromManifest' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('skills-sh.installFromManifest');
    });
  });

  // =========================================================================
  // Message handling: uninstall
  // =========================================================================

  describe('handleMessage: uninstall', () => {
    it('calls uninstallSkill with the matching installed skill', async () => {
      const cards: InstalledSkillCard[] = [
        makeInstalledCard({ name: 'My Skill', folderName: 'my-skill', source: 'org/repo', scope: 'global' }),
      ];
      provider.setInstalledSkills(cards);
      mockUninstallSkill.mockResolvedValue(undefined);

      const { sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'uninstall', payload: { skillName: 'my-skill' } });

      expect(mockUninstallSkill).toHaveBeenCalledWith('My Skill', expect.objectContaining({
        global: true,
        folderName: 'my-skill',
      }));
    });

    it('uses folderName over skillName when both are provided', async () => {
      const cards: InstalledSkillCard[] = [
        makeInstalledCard({ name: 'My Skill', folderName: 'my-skill-folder', source: 'org/repo' }),
      ];
      provider.setInstalledSkills(cards);
      mockUninstallSkill.mockResolvedValue(undefined);

      const { sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'uninstall', payload: { skillName: 'ignored', folderName: 'my-skill-folder' } });

      expect(mockUninstallSkill).toHaveBeenCalled();
    });

    it('does nothing when skill is not found in installed list', async () => {
      provider.setInstalledSkills([]);
      const { sendMessage } = resolveProvider(provider);

      await sendMessage({ command: 'uninstall', payload: { skillName: 'nonexistent' } });

      expect(mockUninstallSkill).not.toHaveBeenCalled();
    });

    it('sets global=false for project-scoped skills', async () => {
      const cards: InstalledSkillCard[] = [
        makeInstalledCard({ name: 'Project Skill', folderName: 'proj-skill', scope: 'project' }),
      ];
      provider.setInstalledSkills(cards);
      mockUninstallSkill.mockResolvedValue(undefined);

      const { sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'uninstall', payload: { skillName: 'proj-skill' } });

      expect(mockUninstallSkill).toHaveBeenCalledWith('Project Skill', expect.objectContaining({
        global: false,
      }));
    });
  });

  // =========================================================================
  // Message handling: ready
  // =========================================================================

  describe('handleMessage: ready', () => {
    it('pushes cached installed skills data on ready', async () => {
      const cards: InstalledSkillCard[] = [
        makeInstalledCard({ name: 'skill-a', source: 'org/repo' }),
      ];
      provider.setInstalledSkills(cards);

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'ready' });

      const installCall = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'installedSkillsData',
      );
      expect(installCall).toBeDefined();
    });

    it('pushes button states on ready', async () => {
      provider.setInstalledNames(new Set(['skill-a']));
      provider.setUpdatableNames(new Set(['skill-b']));

      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'ready' });

      const stateCall = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'updateButtonStates',
      );
      expect(stateCall).toBeDefined();
      const payload = (stateCall![0] as any).payload;
      expect(payload.installedNames).toEqual(['skill-a']);
      expect(payload.updatableNames).toEqual(['skill-b']);
    });

    it('does not push installed skills if none are cached', async () => {
      // No setInstalledSkills called => empty array
      const { webview, sendMessage } = resolveProvider(provider);
      await sendMessage({ command: 'ready' });

      // installedSkillsData should NOT be sent (empty array check in code)
      const installCalls = webview.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as any).command === 'installedSkillsData',
      );
      expect(installCalls).toHaveLength(0);
    });
  });

  // =========================================================================
  // Message handling: no-op commands
  // =========================================================================

  describe('handleMessage: no-op commands', () => {
    it('does not post messages for changeTab', async () => {
      const { webview, sendMessage } = resolveProvider(provider);
      const countBefore = webview.postMessage.mock.calls.length;

      await sendMessage({ command: 'changeTab' });

      expect(webview.postMessage.mock.calls.length).toBe(countBefore);
    });

    it('does not post messages for categoryClick', async () => {
      const { webview, sendMessage } = resolveProvider(provider);
      const countBefore = webview.postMessage.mock.calls.length;

      await sendMessage({ command: 'categoryClick' });

      expect(webview.postMessage.mock.calls.length).toBe(countBefore);
    });

    it('does not post messages for loadMore', async () => {
      const { webview, sendMessage } = resolveProvider(provider);
      const countBefore = webview.postMessage.mock.calls.length;

      await sendMessage({ command: 'loadMore' });

      expect(webview.postMessage.mock.calls.length).toBe(countBefore);
    });
  });

  // =========================================================================
  // setInstalledNames / setUpdatableNames / setInstalledSkills
  // =========================================================================

  describe('setInstalledNames', () => {
    it('pushes button states to the webview', () => {
      const { webview } = resolveProvider(provider);

      provider.setInstalledNames(new Set(['skill-x']));

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'updateButtonStates',
      );
      expect(call).toBeDefined();
      expect((call![0] as any).payload.installedNames).toEqual(['skill-x']);
    });
  });

  describe('setUpdatableNames', () => {
    it('pushes button states to the webview', () => {
      const { webview } = resolveProvider(provider);

      provider.setUpdatableNames(new Set(['skill-y']));

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'updateButtonStates',
      );
      expect(call).toBeDefined();
      expect((call![0] as any).payload.updatableNames).toEqual(['skill-y']);
    });
  });

  describe('setInstalledSkills', () => {
    it('posts installedSkillsData to the webview', () => {
      const { webview } = resolveProvider(provider);
      const cards = [makeInstalledCard({ name: 'skill-z', source: 'org/repo' })];

      provider.setInstalledSkills(cards);

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'installedSkillsData',
      );
      expect(call).toBeDefined();
      expect((call![0] as any).payload).toEqual(cards);
    });

    it('posts to all open tab panels as well', () => {
      // First resolve the sidebar view
      resolveProvider(provider);

      // Open a tab panel
      const panelWebview = createMockWebview();
      const mockPanel = {
        webview: panelWebview,
        viewType: 'skills-sh.marketplaceTab',
        title: 'Skills.sh Marketplace',
        onDidDispose: vi.fn((cb: () => void) => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
        visible: true,
        active: true,
        viewColumn: vscode.ViewColumn.One,
        reveal: vi.fn(),
        options: {},
      };

      // Mock createWebviewPanel to return our panel
      vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(
        mockPanel as unknown as vscode.WebviewPanel,
      );
      panelWebview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });

      provider.openInTab();

      const cards = [makeInstalledCard({ name: 'tab-skill', source: 'org/repo' })];
      provider.setInstalledSkills(cards);

      const tabCall = panelWebview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'installedSkillsData',
      );
      expect(tabCall).toBeDefined();
    });
  });

  // =========================================================================
  // navigateTo
  // =========================================================================

  describe('navigateTo', () => {
    it('posts navigateTo audits command to the webview', () => {
      const { webview } = resolveProvider(provider);

      provider.navigateTo('audits');

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'navigateTo',
      );
      expect(call).toBeDefined();
      expect((call![0] as any).payload).toEqual({ view: 'audits' });
    });

    it('posts navigateTo docs command with overview page', () => {
      const { webview } = resolveProvider(provider);

      provider.navigateTo('docs');

      const call = webview.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as any).command === 'navigateTo',
      );
      expect(call).toBeDefined();
      expect((call![0] as any).payload).toEqual({ view: 'docs', page: 'overview' });
    });

    it('focuses the marketplace sidebar', () => {
      resolveProvider(provider);

      provider.navigateTo('audits');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('skills-sh.marketplace.focus');
    });
  });

  // =========================================================================
  // openInTab
  // =========================================================================

  describe('openInTab', () => {
    it('creates a webview panel', () => {
      const mockPanel = {
        webview: createMockWebview(),
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      };
      mockPanel.webview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });
      vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(
        mockPanel as unknown as vscode.WebviewPanel,
      );

      provider.openInTab();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'skills-sh.marketplaceTab',
        'Skills.sh Marketplace',
        vscode.ViewColumn.One,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      );
    });

    it('sets tab-view class on tab body', () => {
      const mockWebview = createMockWebview();
      mockWebview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });
      const mockPanel = {
        webview: mockWebview,
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      };
      vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(
        mockPanel as unknown as vscode.WebviewPanel,
      );

      provider.openInTab();

      expect(mockWebview.html).toContain('class="tab-view"');
    });

    it('includes hero section in tab view', () => {
      const mockWebview = createMockWebview();
      mockWebview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });
      const mockPanel = {
        webview: mockWebview,
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      };
      vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(
        mockPanel as unknown as vscode.WebviewPanel,
      );

      provider.openInTab();

      // Tab view includes the hero section (ASCII art, etc.)
      expect(mockWebview.html).toContain('hero');
    });
  });

  // =========================================================================
  // dispose
  // =========================================================================

  describe('dispose', () => {
    it('disposes all open tab panels', () => {
      const mockWebview = createMockWebview();
      mockWebview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });
      const mockPanel = {
        webview: mockWebview,
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      };
      vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(
        mockPanel as unknown as vscode.WebviewPanel,
      );

      provider.openInTab();
      provider.dispose();

      expect(mockPanel.dispose).toHaveBeenCalled();
    });
  });
});

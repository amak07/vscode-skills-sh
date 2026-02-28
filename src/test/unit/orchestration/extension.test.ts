import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { window, workspace, commands, Uri } from 'vscode';
import { createSandbox, Sandbox } from '../../helpers/fs-sandbox';
import { mockFetch, jsonResponse, errorResponse } from '../../helpers/fetch-mock';
import {
  SAMPLE_SEARCH_RESPONSE,
  SAMPLE_LOCK_FILE,
  SAMPLE_MANIFEST,
  SAMPLE_GITHUB_TREE,
} from '../../helpers/fixtures';
import type { InstalledSkill } from '../../../types';
import { invalidateManifestCache } from '../../../manifest/manifest';

// ---------------------------------------------------------------------------
// Module mocks — MUST be set up BEFORE importing the module under test
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted above imports, so all variables they reference
// must be declared via vi.hoisted() to avoid temporal dead zone errors.
const {
  mockInstallSkill, mockUninstallSkill, mockUpdateSkills, mockDisposeTerminal,
  mockNotifyInstallDetected, mockSearchSkills, mockCheckUpdates,
  mockClearUpdateForSkill, mockSetInstalledNames, mockSetUpdatableNames,
  mockSetInstalledSkills, mockNavigateTo, mockOpenInTab, mockMarketplaceDispose,
  operationCompletedEmitter, installDetectedEmitter,
  getMockLastUpdateResult, setMockLastUpdateResult,
} = vi.hoisted(() => {
  // Lightweight event emitter (vscode.EventEmitter not available at hoist time)
  function createEvent<T>() {
    const listeners: ((e: T) => void)[] = [];
    return {
      event: (listener: (e: T) => void) => {
        listeners.push(listener);
        return { dispose: () => { const i = listeners.indexOf(listener); if (i >= 0) { listeners.splice(i, 1); } } };
      },
      fire: (e: T) => listeners.forEach(l => l(e)),
    };
  }

  let _lastUpdateResult: any = null;

  return {
    mockInstallSkill: vi.fn(async () => true),
    mockUninstallSkill: vi.fn(async () => {}),
    mockUpdateSkills: vi.fn(async () => {}),
    mockDisposeTerminal: vi.fn(),
    mockNotifyInstallDetected: vi.fn(),
    mockSearchSkills: vi.fn(async () => ({})),
    mockCheckUpdates: vi.fn(async () => _lastUpdateResult ?? { updates: [], errors: [] }),
    mockClearUpdateForSkill: vi.fn(),
    mockSetInstalledNames: vi.fn(),
    mockSetUpdatableNames: vi.fn(),
    mockSetInstalledSkills: vi.fn(),
    mockNavigateTo: vi.fn(),
    mockOpenInTab: vi.fn(),
    mockMarketplaceDispose: vi.fn(),
    operationCompletedEmitter: createEvent<void>(),
    installDetectedEmitter: createEvent<string>(),
    getMockLastUpdateResult: () => _lastUpdateResult,
    setMockLastUpdateResult: (v: any) => { _lastUpdateResult = v; },
  };
});

// Spread fs so properties become configurable (Node.js built-in restriction)
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal() as object),
}));

// Logger — suppress output during tests
vi.mock('../../../logger', () => ({
  getLog: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Installer — mock terminal-based install/uninstall
vi.mock('../../../install/installer', () => ({
  installSkill: (...args: unknown[]) => mockInstallSkill(...args),
  uninstallSkill: (...args: unknown[]) => mockUninstallSkill(...args),
  updateSkills: (...args: unknown[]) => mockUpdateSkills(...args),
  disposeTerminal: () => mockDisposeTerminal(),
  notifyInstallDetected: (name: string) => mockNotifyInstallDetected(name),
  onInstallDetected: installDetectedEmitter.event,
  onOperationCompleted: operationCompletedEmitter.event,
}));

// Search API
vi.mock('../../../api/search', () => ({
  searchSkills: (...args: unknown[]) => mockSearchSkills(...args),
}));

// Updates API
vi.mock('../../../api/updates', () => ({
  checkUpdates: (...args: unknown[]) => mockCheckUpdates(...args),
  getLastUpdateResult: () => getMockLastUpdateResult(),
  clearUpdateForSkill: (name: string) => mockClearUpdateForSkill(name),
}));

// GitHub API
vi.mock('../../../api/github', () => ({
  fetchRepoSkillList: vi.fn(async () => []),
  fetchSkillFolderHashes: vi.fn(async () => new Map()),
}));

// Marketplace provider — use a class (not vi.fn().mockImplementation) so
// restoreMocks doesn't reset the constructor between tests.
vi.mock('../../../views/marketplace/provider', () => ({
  MarketplaceViewProvider: class MockMarketplaceViewProvider {
    setInstalledNames = mockSetInstalledNames;
    setUpdatableNames = mockSetUpdatableNames;
    setInstalledSkills = mockSetInstalledSkills;
    navigateTo = mockNavigateTo;
    openInTab = mockOpenInTab;
    dispose = mockMarketplaceDispose;
    resolveWebviewView() {}
  },
}));

// Now import the module under test — activate() will register all commands
import { activate, deactivate } from '../../../extension';

// ---------------------------------------------------------------------------
// Sandbox & helpers
// ---------------------------------------------------------------------------

let sandbox: Sandbox;
let savedEnv: Record<string, string | undefined>;

/** Minimal ExtensionContext mock */
function makeContext(): any {
  const subscriptions: { dispose: () => void }[] = [];
  return {
    subscriptions,
    extensionUri: Uri.file('/mock/extension'),
    dispose() { subscriptions.forEach(s => s.dispose()); },
  };
}

/** Build a InstalledSkill fixture from partial overrides */
function makeSkill(overrides: Partial<InstalledSkill> & { name: string }): InstalledSkill {
  return {
    folderName: overrides.name,
    description: '',
    path: `/skills/${overrides.name}`,
    scope: 'global',
    metadata: {},
    isCustom: false,
    ...overrides,
  };
}

/** Execute a registered command (via the mock commands registry) */
async function exec(id: string, ...args: unknown[]) {
  return commands.executeCommand(id, ...args);
}

/** Get the handler registered for a given command */
function getHandler(id: string) {
  return (commands as any).__getRegistered().get(id);
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

let ctx: ReturnType<typeof makeContext>;

beforeEach(async () => {
  sandbox = createSandbox();

  // Redirect os.homedir() via env vars
  savedEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  };
  process.env.HOME = sandbox.home;
  process.env.USERPROFILE = sandbox.home;
  delete process.env.CLAUDE_CONFIG_DIR;
  invalidateManifestCache();

  // Point workspace to the sandbox
  (workspace as any).workspaceFolders = [
    { uri: { fsPath: sandbox.workspaceRoot }, name: 'test-workspace' },
  ];

  // Default: disable auto-refresh on focus and startup update check to keep tests focused
  (workspace as any).__setConfigValue('skills-sh.autoRefreshOnFocus', false);
  (workspace as any).__setConfigValue('skills-sh.checkUpdatesOnStartup', false);
  (workspace as any).__setConfigValue('skills-sh.promptSkillsJson', false);

  setMockLastUpdateResult(null);

  // Default window mocks — user cancels everything unless overridden
  (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showErrorMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

  // Activate the extension — this registers all commands, creates tree/watcher
  ctx = makeContext();
  activate(ctx);

  // Flush microtasks so the initial scan's .then() callback completes
  // (it populates previousSkillNames/previousSkillsList and may call marketplace methods)
  await new Promise(resolve => setTimeout(resolve, 0));

  // Re-clear all mock call history so each test starts from a clean slate
  mockInstallSkill.mockClear();
  mockUninstallSkill.mockClear();
  mockUpdateSkills.mockClear();
  mockDisposeTerminal.mockClear();
  mockNotifyInstallDetected.mockClear();
  mockSearchSkills.mockClear();
  mockCheckUpdates.mockClear();
  mockClearUpdateForSkill.mockClear();
  mockSetInstalledNames.mockClear();
  mockSetUpdatableNames.mockClear();
  mockSetInstalledSkills.mockClear();
  mockNavigateTo.mockClear();
  mockOpenInTab.mockClear();
  mockMarketplaceDispose.mockClear();

  // Re-clear window mock call history (initial scan may have called these)
  (window.showInformationMessage as ReturnType<typeof vi.fn>).mockClear();
  (window.showWarningMessage as ReturnType<typeof vi.fn>).mockClear();
  (window.showErrorMessage as ReturnType<typeof vi.fn>).mockClear();
  (window.showTextDocument as ReturnType<typeof vi.fn>).mockClear();
  (window.createTerminal as ReturnType<typeof vi.fn>).mockClear();

  // Re-set default mock behaviors after clearing
  (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showErrorMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

afterEach(() => {
  ctx.dispose();
  sandbox.cleanup();

  // Restore env vars
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

// ===========================================================================
// 1. resolveSkill — argument normalization
// ===========================================================================

describe('resolveSkill (via commands that use it)', () => {
  it('resolves a direct InstalledSkill argument', async () => {
    const skill = makeSkill({ name: 'test-skill', source: 'org/repo' });

    // openSkillFile calls resolveSkill(arg) internally
    await exec('skills-sh.openSkillFile', skill);

    expect(window.showTextDocument).toHaveBeenCalled();
  });

  it('resolves a SkillItem tree item (with .skill property)', async () => {
    const skill = makeSkill({ name: 'tree-skill', source: 'org/repo' });
    const treeItem = { skill };

    await exec('skills-sh.openSkillFile', treeItem);

    expect(window.showTextDocument).toHaveBeenCalled();
  });

  it('does nothing for undefined arg', async () => {
    await exec('skills-sh.openSkillFile', undefined);

    expect(window.showTextDocument).not.toHaveBeenCalled();
  });

  it('does nothing for arg without path', async () => {
    await exec('skills-sh.openSkillFile', { name: 'no-path' });

    expect(window.showTextDocument).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. Install skill — delegates to marketplace (Part 6)
// ===========================================================================

describe('skills-sh.installSkill command', () => {
  it('delegates to marketplace focus', async () => {
    await exec('skills-sh.installSkill');

    expect(commands.executeCommand).toHaveBeenCalledWith('skills-sh.marketplace.focus');
  });
});

// ===========================================================================
// 3. Uninstall flow: execute command -> uninstallSkill called
// ===========================================================================

describe('skills-sh.uninstallSkill command', () => {
  it('calls uninstallSkill with correct arguments for a global skill', async () => {
    const skill = makeSkill({
      name: 'react-best-practices',
      folderName: 'react-best-practices',
      path: '/home/.claude/skills/react-best-practices',
      scope: 'global',
    });

    await exec('skills-sh.uninstallSkill', skill);

    expect(mockUninstallSkill).toHaveBeenCalledWith('react-best-practices', {
      global: true,
      skillPath: '/home/.claude/skills/react-best-practices',
      folderName: 'react-best-practices',
    });
  });

  it('calls uninstallSkill with global=false for project skill', async () => {
    const skill = makeSkill({
      name: 'proj-skill',
      folderName: 'proj-skill',
      path: '/workspace/.claude/skills/proj-skill',
      scope: 'project',
    });

    await exec('skills-sh.uninstallSkill', skill);

    expect(mockUninstallSkill).toHaveBeenCalledWith('proj-skill', {
      global: false,
      skillPath: '/workspace/.claude/skills/proj-skill',
      folderName: 'proj-skill',
    });
  });

  it('resolves SkillItem tree items', async () => {
    const skill = makeSkill({ name: 'tree-skill', scope: 'global' });

    await exec('skills-sh.uninstallSkill', { skill });

    expect(mockUninstallSkill).toHaveBeenCalledWith('tree-skill', expect.objectContaining({
      global: true,
    }));
  });

  it('does nothing when arg is undefined', async () => {
    await exec('skills-sh.uninstallSkill', undefined);

    expect(mockUninstallSkill).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. Check updates flow
// ===========================================================================

describe('skills-sh.checkUpdates command', () => {
  it('scans for skills and reports when all are up to date', async () => {
    // Create a skill with source + hash in the sandbox so the scanner finds it
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-best-practices', {
      frontmatter: { name: 'React Best Practices', description: 'React skill' },
      asSymlink: true,
    });
    sandbox.writeLockFile(SAMPLE_LOCK_FILE);

    // checkUpdates returns no updates
    mockCheckUpdates.mockResolvedValue({ updates: [], errors: [] });
    setMockLastUpdateResult({ updates: [], errors: [] });

    await exec('skills-sh.checkUpdates');

    expect(mockCheckUpdates).toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('up to date'),
    );
  });

  it('reports updates available and offers Update All', async () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-best-practices', {
      frontmatter: { name: 'React Best Practices', description: 'React skill' },
      asSymlink: true,
    });
    sandbox.writeLockFile(SAMPLE_LOCK_FILE);

    const updates = [
      { name: 'React Best Practices', source: 'vercel-labs/agent-skills', newHash: 'newhash' },
    ];
    mockCheckUpdates.mockResolvedValue({ updates, errors: [] });
    setMockLastUpdateResult({ updates, errors: [] });

    // User clicks "Update All"
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Update All');

    await exec('skills-sh.checkUpdates');

    expect(mockCheckUpdates).toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('React Best Practices'),
      'Update All',
    );
    expect(mockUpdateSkills).toHaveBeenCalledWith(updates);
  });

  it('does not update when user dismisses', async () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-best-practices', {
      frontmatter: { name: 'React Best Practices', description: 'React skill' },
      asSymlink: true,
    });
    sandbox.writeLockFile(SAMPLE_LOCK_FILE);

    const updates = [
      { name: 'React Best Practices', source: 'vercel-labs/agent-skills', newHash: 'newhash' },
    ];
    mockCheckUpdates.mockResolvedValue({ updates, errors: [] });
    setMockLastUpdateResult({ updates, errors: [] });

    // User dismisses the message
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await exec('skills-sh.checkUpdates');

    expect(mockUpdateSkills).not.toHaveBeenCalled();
  });

  it('shows error when checkUpdates API fails', async () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-best-practices', {
      frontmatter: { name: 'React Best Practices', description: 'React skill' },
      asSymlink: true,
    });
    sandbox.writeLockFile(SAMPLE_LOCK_FILE);

    mockCheckUpdates.mockRejectedValue(new Error('API down'));

    await exec('skills-sh.checkUpdates');

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('API down'),
    );
  });

  it('reports untracked skills when no skills have hashes', async () => {
    // Create a symlink skill in .claude/skills/ pointing to a location
    // outside .agents/skills/ so canonical scan won't find it first.
    // This makes it isCustom=false (symlink) but with no lock entry (untracked).
    const fs = await import('fs');
    const path = await import('path');
    const externalDir = path.join(sandbox.root, 'external', 'orphan-skill');
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, 'SKILL.md'),
      '---\nname: "Orphan Skill"\ndescription: "No tracking"\n---\n# orphan-skill');
    const symlinkPath = path.join(sandbox.globalSkillsDir, 'orphan-skill');
    fs.symlinkSync(externalDir, symlinkPath, 'junction');

    await exec('skills-sh.checkUpdates');

    // Should not call checkUpdates (no skills with hashes)
    expect(mockCheckUpdates).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('missing tracking data'),
      'Browse Marketplace',
    );
  });
});

// ===========================================================================
// 5. Update all skills flow
// ===========================================================================

describe('skills-sh.updateAllSkills command', () => {
  it('calls updateSkills with cached updates', async () => {
    const updates = [
      { name: 'React Best Practices', source: 'vercel-labs/agent-skills', newHash: 'hash1' },
      { name: 'Supabase Auth', source: 'supabase-community/agent-skills', newHash: 'hash2' },
    ];
    setMockLastUpdateResult({ updates, errors: [] });

    await exec('skills-sh.updateAllSkills');

    expect(mockUpdateSkills).toHaveBeenCalledWith(updates);
  });

  it('shows info message when no updates available', async () => {
    setMockLastUpdateResult(null);

    await exec('skills-sh.updateAllSkills');

    expect(window.showInformationMessage).toHaveBeenCalledWith('No updates available.');
    expect(mockUpdateSkills).not.toHaveBeenCalled();
  });

  it('shows info message when update list is empty', async () => {
    setMockLastUpdateResult({ updates: [], errors: [] });

    await exec('skills-sh.updateAllSkills');

    expect(window.showInformationMessage).toHaveBeenCalledWith('No updates available.');
    expect(mockUpdateSkills).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 6. Add to manifest (skills.json)
// ===========================================================================

describe('skills-sh.addToManifest command', () => {
  it('adds a skill with source to skills.json and refreshes tree', async () => {
    const skill = makeSkill({
      name: 'React Best Practices',
      folderName: 'react-best-practices',
      source: 'vercel-labs/agent-skills',
    });

    await exec('skills-sh.addToManifest', skill);

    // Verify the manifest was written
    const fs = await import('fs');
    const manifestPath = `${sandbox.workspaceRoot}/skills.json`;
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'vercel-labs/agent-skills',
          skills: expect.arrayContaining(['react-best-practices']),
        }),
      ]),
    );

    // Verify success notification
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Added "React Best Practices" to skills.json'),
    );
  });

  it('shows warning when skill has no source', async () => {
    const skill = makeSkill({ name: 'No Source Skill' });

    await exec('skills-sh.addToManifest', skill);

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('has no known source'),
    );
  });

  it('resolves tree items correctly', async () => {
    const skill = makeSkill({
      name: 'tree-skill',
      folderName: 'tree-skill',
      source: 'my-org/skills',
    });

    await exec('skills-sh.addToManifest', { skill });

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Added "tree-skill" to skills.json'),
    );
  });

  it('does nothing for undefined arg', async () => {
    await exec('skills-sh.addToManifest', undefined);

    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. Remove from manifest (skills.json)
// ===========================================================================

describe('skills-sh.removeFromManifest command', () => {
  it('removes a skill from skills.json and refreshes tree', async () => {
    // Pre-populate the manifest
    sandbox.writeManifest(SAMPLE_MANIFEST);

    const skill = makeSkill({
      name: 'React Best Practices',
      folderName: 'react-best-practices',
      source: 'vercel-labs/agent-skills',
    });

    await exec('skills-sh.removeFromManifest', skill);

    // Verify the manifest was updated
    const fs = await import('fs');
    const manifestPath = `${sandbox.workspaceRoot}/skills.json`;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const vercelEntry = manifest.skills.find(
      (e: any) => e.source === 'vercel-labs/agent-skills',
    );
    // react-best-practices should be removed, only react-email remains
    expect(vercelEntry.skills).not.toContain('react-best-practices');
    expect(vercelEntry.skills).toContain('react-email');

    // Verify success notification
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Removed "React Best Practices" from skills.json'),
    );
  });

  it('removes entire source entry when last skill removed', async () => {
    sandbox.writeManifest({
      skills: [
        { source: 'org/single', skills: ['only-skill'] },
      ],
    });

    const skill = makeSkill({
      name: 'Only Skill',
      folderName: 'only-skill',
      source: 'org/single',
    });

    await exec('skills-sh.removeFromManifest', skill);

    const fs = await import('fs');
    const manifestPath = `${sandbox.workspaceRoot}/skills.json`;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.skills).toEqual([]);
  });

  it('does nothing for undefined arg', async () => {
    await exec('skills-sh.removeFromManifest', undefined);

    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 8. Install from manifest
// ===========================================================================

describe('skills-sh.installFromManifest command', () => {
  it('shows "no manifest" when skills.json does not exist', async () => {
    await exec('skills-sh.installFromManifest');

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'No skills.json found in this workspace.',
    );
  });

  it('shows "all installed" when no missing skills', async () => {
    // Create manifest and matching installed skills
    sandbox.writeManifest(SAMPLE_MANIFEST);
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-best-practices', {
      frontmatter: { name: 'React Best Practices', description: '' },
      asSymlink: true,
    });
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-email', {
      frontmatter: { name: 'React Email', description: '' },
      asSymlink: true,
    });
    sandbox.createSkill(sandbox.globalSkillsDir, 'supabase-auth', {
      frontmatter: { name: 'Supabase Auth', description: '' },
      asSymlink: true,
    });
    sandbox.writeLockFile(SAMPLE_LOCK_FILE);

    // Need to rescan so the tree provider has data
    await exec('skills-sh.refreshInstalled');

    await exec('skills-sh.installFromManifest');

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'All skills from skills.json are already installed.',
    );
  });

  it('shows quick pick for missing skills and creates terminal commands', async () => {
    // Manifest has 3 skills, but none are installed
    sandbox.writeManifest(SAMPLE_MANIFEST);

    // Rescan (empty) so tree provider state is fresh
    await exec('skills-sh.refreshInstalled');

    // User picks all items (pass through)
    (window.showQuickPick as ReturnType<typeof vi.fn>).mockImplementation(
      async (items: any[]) => items,
    );

    await exec('skills-sh.installFromManifest');

    // Should have shown a quick pick
    expect(window.showQuickPick).toHaveBeenCalled();

    // Should have created a terminal and sent install commands
    expect(window.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringContaining('Install from manifest') }),
    );
  });

  it('does nothing when user cancels quick pick', async () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    await exec('skills-sh.refreshInstalled');

    (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await exec('skills-sh.installFromManifest');

    // Terminal should not be created for install
    const terminalCalls = (window.createTerminal as ReturnType<typeof vi.fn>).mock.calls;
    const manifestTerminal = terminalCalls.find(
      (c: any[]) => c[0]?.name?.includes('Install from manifest'),
    );
    expect(manifestTerminal).toBeUndefined();
  });

  it('does nothing when user picks empty selection', async () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    await exec('skills-sh.refreshInstalled');

    (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await exec('skills-sh.installFromManifest');

    const terminalCalls = (window.createTerminal as ReturnType<typeof vi.fn>).mock.calls;
    const manifestTerminal = terminalCalls.find(
      (c: any[]) => c[0]?.name?.includes('Install from manifest'),
    );
    expect(manifestTerminal).toBeUndefined();
  });
});

// ===========================================================================
// 9. handleSkillChanges — central orchestration hub
// ===========================================================================

describe('handleSkillChanges (via watcher/operation triggers)', () => {
  it('rescans and syncs marketplace on operation completed', async () => {
    // Add a skill so the rescan finds it
    sandbox.createSkill(sandbox.globalSkillsDir, 'new-skill', {
      frontmatter: { name: 'New Skill', description: 'A new skill' },
      asSymlink: true,
    });

    // Fire the operation completed event — simulates terminal command finishing
    operationCompletedEmitter.fire();

    // Allow microtasks/promises to settle
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });

    // Marketplace should have been updated with installed names
    expect(mockSetInstalledNames).toHaveBeenCalled();
    expect(mockSetInstalledSkills).toHaveBeenCalled();
    expect(mockSetUpdatableNames).toHaveBeenCalled();
  });

  it('notifies install detected for each skill after rescan', async () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'skill-a', {
      frontmatter: { name: 'Skill A', description: '' },
    });
    sandbox.createSkill(sandbox.globalSkillsDir, 'skill-b', {
      frontmatter: { name: 'Skill B', description: '' },
    });

    operationCompletedEmitter.fire();

    await vi.waitFor(() => {
      expect(mockNotifyInstallDetected).toHaveBeenCalled();
    });

    // Both skills should have been notified
    const calls = mockNotifyInstallDetected.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain('Skill A');
    expect(calls).toContain('Skill B');
  });

  it('shows "new skills installed" notification when skills count increases', async () => {
    // First, do an initial scan to set previousSkillNames to a non-empty state
    sandbox.createSkill(sandbox.globalSkillsDir, 'existing-skill', {
      frontmatter: { name: 'Existing Skill', description: '' },
    });

    // Trigger an initial handleSkillChanges to populate previousSkillNames
    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });

    // Clear mocks after initial population
    mockSetInstalledNames.mockClear();
    mockSetInstalledSkills.mockClear();
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockClear();
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Now add another skill
    sandbox.createSkill(sandbox.globalSkillsDir, 'brand-new-skill', {
      frontmatter: { name: 'Brand New Skill', description: '' },
    });

    operationCompletedEmitter.fire();

    await vi.waitFor(() => {
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('new skill(s) installed'),
        'View Installed',
      );
    });
  });

  it('shows "skills removed" notification when skills count decreases', async () => {
    // Set up initial state with two skills
    sandbox.createSkill(sandbox.globalSkillsDir, 'skill-one', {
      frontmatter: { name: 'Skill One', description: '' },
    });
    sandbox.createSkill(sandbox.globalSkillsDir, 'skill-two', {
      frontmatter: { name: 'Skill Two', description: '' },
    });

    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });

    // Clear and remove a skill
    mockSetInstalledNames.mockClear();
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockClear();
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Remove one skill from the filesystem
    const fs = await import('fs');
    fs.rmSync(`${sandbox.globalSkillsDir}/skill-two`, { recursive: true, force: true });

    operationCompletedEmitter.fire();

    await vi.waitFor(() => {
      // getInstalledSkillNames() adds both name AND folderName per skill,
      // so removing 1 skill removes 2 entries from the names Set.
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('skill(s) removed'),
      );
    });
  });

  it('clears update cache for newly added skills', async () => {
    // First populate previousSkillNames
    sandbox.createSkill(sandbox.globalSkillsDir, 'old-skill', {
      frontmatter: { name: 'Old Skill', description: '' },
    });

    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });
    mockClearUpdateForSkill.mockClear();

    // Add a new skill
    sandbox.createSkill(sandbox.globalSkillsDir, 'freshly-installed', {
      frontmatter: { name: 'Freshly Installed', description: '' },
    });

    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockClearUpdateForSkill).toHaveBeenCalledWith('Freshly Installed');
    });
  });
});

// ===========================================================================
// 10. Post-install manifest prompt
// ===========================================================================

describe('post-install manifest prompt', () => {
  it('prompts to add newly installed skill to skills.json', async () => {
    // Set up with existing manifest and one existing skill
    sandbox.writeManifest({ skills: [{ source: 'vercel-labs/agent-skills', skills: ['old-skill'] }] });
    sandbox.createSkill(sandbox.globalSkillsDir, 'old-skill', {
      frontmatter: { name: 'Old Skill', description: '' },
      asSymlink: true,
    });
    sandbox.writeLockFile({
      version: 1,
      skills: {
        'old-skill': {
          source: 'vercel-labs/agent-skills',
          skillFolderHash: 'hash1',
          skillPath: 'skills/old-skill/SKILL.md',
        },
      },
    });

    // First trigger to populate previousSkillNames
    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });

    // Reset mocks
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockClear();
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Now "install" a new skill (add to filesystem + lock file)
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-best-practices', {
      frontmatter: { name: 'React Best Practices', description: '' },
      asSymlink: true,
    });

    const fs = await import('fs');
    const lockData = JSON.parse(fs.readFileSync(sandbox.lockFilePath, 'utf-8'));
    lockData.skills['vercel-react-best-practices'] = {
      source: 'vercel-labs/agent-skills',
      skillFolderHash: 'abc123def456',
      skillPath: 'skills/react-best-practices/SKILL.md',
    };
    fs.writeFileSync(sandbox.lockFilePath, JSON.stringify(lockData, null, 2));

    operationCompletedEmitter.fire();

    await vi.waitFor(() => {
      // Should prompt about the new install
      const calls = (window.showInformationMessage as ReturnType<typeof vi.fn>).mock.calls;
      const manifestPrompt = calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('Add it to this project'),
      );
      expect(manifestPrompt).toBeDefined();
    });
  });

  it('adds skill to manifest when user accepts', async () => {
    sandbox.writeManifest({ skills: [] });
    sandbox.createSkill(sandbox.globalSkillsDir, 'existing', {
      frontmatter: { name: 'Existing', description: '' },
      asSymlink: true,
    });
    sandbox.writeLockFile({
      version: 1,
      skills: {
        existing: { source: 'org/repo', skillFolderHash: 'h1', skillPath: 'skills/existing/SKILL.md' },
      },
    });

    // First trigger to populate previousSkillNames
    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });

    // Mock: user clicks "Add to skills.json" when prompted
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (msg: string, ...actions: string[]) => {
        if (typeof msg === 'string' && msg.includes('Add it to this project')) {
          return 'Add to skills.json';
        }
        return undefined;
      },
    );

    // Add new skill
    sandbox.createSkill(sandbox.globalSkillsDir, 'new-tracked', {
      frontmatter: { name: 'New Tracked', description: '' },
      asSymlink: true,
    });
    const fs = await import('fs');
    const lockData = JSON.parse(fs.readFileSync(sandbox.lockFilePath, 'utf-8'));
    lockData.skills['new-tracked'] = {
      source: 'org/repo',
      skillFolderHash: 'h2',
      skillPath: 'skills/new-tracked/SKILL.md',
    };
    fs.writeFileSync(sandbox.lockFilePath, JSON.stringify(lockData, null, 2));

    operationCompletedEmitter.fire();

    await vi.waitFor(() => {
      const manifestPath = `${sandbox.workspaceRoot}/skills.json`;
      if (!fs.existsSync(manifestPath)) { throw new Error('waiting...'); }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const entry = manifest.skills.find((e: any) => e.source === 'org/repo');
      // Must eventually contain the new skill
      if (!entry?.skills?.includes('new-tracked')) { throw new Error('waiting...'); }
      expect(entry.skills).toContain('new-tracked');
    });
  });
});

// ===========================================================================
// 11. Post-uninstall manifest prompt
// ===========================================================================

describe('post-uninstall manifest prompt', () => {
  it('prompts to remove uninstalled skill from skills.json', async () => {
    sandbox.writeManifest({
      skills: [{ source: 'org/repo', skills: ['to-remove', 'to-keep'] }],
    });

    sandbox.createSkill(sandbox.globalSkillsDir, 'to-remove', {
      frontmatter: { name: 'To Remove', description: '' },
      asSymlink: true,
    });
    sandbox.createSkill(sandbox.globalSkillsDir, 'to-keep', {
      frontmatter: { name: 'To Keep', description: '' },
      asSymlink: true,
    });
    sandbox.writeLockFile({
      version: 1,
      skills: {
        'to-remove': { source: 'org/repo', skillFolderHash: 'h1', skillPath: 'skills/to-remove/SKILL.md' },
        'to-keep': { source: 'org/repo', skillFolderHash: 'h2', skillPath: 'skills/to-keep/SKILL.md' },
      },
    });

    // First trigger to populate state
    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });

    // Clear and set up for removal
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockClear();
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // "Uninstall" the skill by removing it from filesystem
    const fs = await import('fs');
    fs.rmSync(`${sandbox.globalSkillsDir}/to-remove`, { recursive: true, force: true });
    // Also remove from agents dir (symlink target)
    fs.rmSync(`${sandbox.agentsDir}/to-remove`, { recursive: true, force: true });

    operationCompletedEmitter.fire();

    await vi.waitFor(() => {
      const calls = (window.showInformationMessage as ReturnType<typeof vi.fn>).mock.calls;
      const removePrompt = calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('Remove it from this project'),
      );
      expect(removePrompt).toBeDefined();
    });
  });

  it('removes skill from manifest when user accepts', async () => {
    sandbox.writeManifest({
      skills: [{ source: 'org/repo', skills: ['doomed-skill'] }],
    });

    sandbox.createSkill(sandbox.globalSkillsDir, 'doomed-skill', {
      frontmatter: { name: 'Doomed Skill', description: '' },
      asSymlink: true,
    });
    sandbox.writeLockFile({
      version: 1,
      skills: {
        'doomed-skill': { source: 'org/repo', skillFolderHash: 'h1', skillPath: 'skills/doomed-skill/SKILL.md' },
      },
    });

    operationCompletedEmitter.fire();
    await vi.waitFor(() => {
      expect(mockSetInstalledNames).toHaveBeenCalled();
    });

    // Mock: user clicks "Remove from skills.json" when prompted
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (msg: string, ...actions: string[]) => {
        if (typeof msg === 'string' && msg.includes('Remove it from this project')) {
          return 'Remove from skills.json';
        }
        return undefined;
      },
    );

    // Remove from filesystem
    const fs = await import('fs');
    fs.rmSync(`${sandbox.globalSkillsDir}/doomed-skill`, { recursive: true, force: true });
    fs.rmSync(`${sandbox.agentsDir}/doomed-skill`, { recursive: true, force: true });

    operationCompletedEmitter.fire();

    await vi.waitFor(() => {
      const manifestPath = `${sandbox.workspaceRoot}/skills.json`;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      // The manifest should have removed the skill, and the source entry if empty
      expect(manifest.skills).toEqual([]);
    });
  });
});

// ===========================================================================
// 12. Refresh command
// ===========================================================================

describe('skills-sh.refreshInstalled command', () => {
  it('rescans and syncs marketplace state', async () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'fresh-skill', {
      frontmatter: { name: 'Fresh Skill', description: '' },
    });

    mockSetInstalledNames.mockClear();
    mockSetInstalledSkills.mockClear();

    await exec('skills-sh.refreshInstalled');

    expect(mockSetInstalledNames).toHaveBeenCalled();
    expect(mockSetInstalledSkills).toHaveBeenCalled();
  });
});

// ===========================================================================
// 13. Copy skill path
// ===========================================================================

describe('skills-sh.copySkillPath command', () => {
  it('copies skill path to clipboard', async () => {
    const { env } = await import('vscode');
    const skill = makeSkill({
      name: 'copy-me',
      path: '/home/.claude/skills/copy-me',
    });

    await exec('skills-sh.copySkillPath', skill);

    expect(env.clipboard.writeText).toHaveBeenCalledWith('/home/.claude/skills/copy-me');
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('/home/.claude/skills/copy-me'),
    );
  });

  it('does nothing for undefined arg', async () => {
    const { env } = await import('vscode');

    await exec('skills-sh.copySkillPath', undefined);

    expect(env.clipboard.writeText).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 14. Open skill file / Preview skill file
// ===========================================================================

describe('skills-sh.openSkillFile command', () => {
  it('opens SKILL.md in text editor', async () => {
    const skill = makeSkill({
      name: 'my-skill',
      path: '/home/.claude/skills/my-skill',
    });

    await exec('skills-sh.openSkillFile', skill);

    expect(window.showTextDocument).toHaveBeenCalled();
    const arg = (window.showTextDocument as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.fsPath).toContain('my-skill/SKILL.md');
  });
});

describe('skills-sh.previewSkillFile command', () => {
  it('opens SKILL.md in markdown preview', async () => {
    const skill = makeSkill({
      name: 'my-skill',
      path: '/home/.claude/skills/my-skill',
    });

    await exec('skills-sh.previewSkillFile', skill);

    // Should call markdown.showPreview
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'markdown.showPreview',
      expect.objectContaining({ fsPath: expect.stringContaining('my-skill/SKILL.md') }),
    );
  });
});

// ===========================================================================
// 15. Navigation / UI commands
// ===========================================================================

describe('UI navigation commands', () => {
  it('skills-sh.openMarketplace focuses marketplace', async () => {
    await exec('skills-sh.openMarketplace');

    expect(commands.executeCommand).toHaveBeenCalledWith('skills-sh.marketplace.focus');
  });

  it('skills-sh.openMarketplaceTab opens in tab', async () => {
    await exec('skills-sh.openMarketplaceTab');

    expect(mockOpenInTab).toHaveBeenCalled();
  });

  it('skills-sh.openAudits navigates to audits', async () => {
    await exec('skills-sh.openAudits');

    expect(mockNavigateTo).toHaveBeenCalledWith('audits');
  });

  it('skills-sh.openDocs navigates to docs', async () => {
    await exec('skills-sh.openDocs');

    expect(mockNavigateTo).toHaveBeenCalledWith('docs');
  });

  it('skills-sh.openSettings opens VS Code settings', async () => {
    await exec('skills-sh.openSettings');

    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:skills-sh.skills-sh',
    );
  });
});

// ===========================================================================
// 18. Launch Claude with skill
// ===========================================================================

describe('skills-sh.launchClaudeWithSkill command', () => {
  it('opens terminal with Claude command in default terminal mode', async () => {
    const skill = makeSkill({ name: 'React Best Practices' });

    await exec('skills-sh.launchClaudeWithSkill', skill);

    expect(window.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringContaining('Claude - React Best Practices') }),
    );
  });

  it('tries extension mode when configured', async () => {
    (workspace as any).__setConfigValue('skills-sh.claudeLaunchTarget', 'extension');
    const { extensions } = await import('vscode');

    // Mock the extension as found
    (extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'anthropic.claude-code' });

    const skill = makeSkill({ name: 'React Best Practices' });
    await exec('skills-sh.launchClaudeWithSkill', skill);

    expect(commands.executeCommand).toHaveBeenCalledWith(
      'claude-vscode.editor.open',
      undefined,
      expect.stringContaining('React Best Practices'),
    );
  });

  it('shows warning when extension not found in extension mode', async () => {
    (workspace as any).__setConfigValue('skills-sh.claudeLaunchTarget', 'extension');
    const { extensions } = await import('vscode');
    (extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const skill = makeSkill({ name: 'React Best Practices' });
    await exec('skills-sh.launchClaudeWithSkill', skill);

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Claude Code extension not found'),
      'Open Settings',
    );
  });

  it('does nothing for undefined skill', async () => {
    await exec('skills-sh.launchClaudeWithSkill', undefined);

    // No terminal created, no command executed
    const termCalls = (window.createTerminal as ReturnType<typeof vi.fn>).mock.calls;
    const claudeTerminal = termCalls.find(
      (c: any[]) => c[0]?.name?.includes('Claude -'),
    );
    expect(claudeTerminal).toBeUndefined();
  });
});

// ===========================================================================
// 19. Update single skill
// ===========================================================================

describe('skills-sh.updateSingleSkill command', () => {
  it('updates a single skill from the update cache', async () => {
    const updates = [
      { name: 'React Best Practices', source: 'vercel-labs/agent-skills', newHash: 'hash1' },
      { name: 'Supabase Auth', source: 'supabase-community/agent-skills', newHash: 'hash2' },
    ];
    setMockLastUpdateResult({ updates, errors: [] });

    const item = { skill: { name: 'React Best Practices' } };
    await exec('skills-sh.updateSingleSkill', item);

    // Should update only the matching skill
    expect(mockUpdateSkills).toHaveBeenCalledWith([updates[0]]);
  });

  it('does nothing when skill not in update cache', async () => {
    setMockLastUpdateResult({ updates: [], errors: [] });

    const item = { skill: { name: 'Not In Cache' } };
    await exec('skills-sh.updateSingleSkill', item);

    expect(mockUpdateSkills).not.toHaveBeenCalled();
  });

  it('does nothing for missing item', async () => {
    await exec('skills-sh.updateSingleSkill', undefined);
    expect(mockUpdateSkills).not.toHaveBeenCalled();

    await exec('skills-sh.updateSingleSkill', {});
    expect(mockUpdateSkills).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 20. Deactivate
// ===========================================================================

describe('deactivate', () => {
  it('disposes terminal and marketplace provider', () => {
    deactivate();

    expect(mockDisposeTerminal).toHaveBeenCalled();
    expect(mockMarketplaceDispose).toHaveBeenCalled();
  });
});

// ===========================================================================
// 21. Command registration completeness
// ===========================================================================

describe('command registration', () => {
  it('registers all expected commands', () => {
    const registered = (commands as any).__getRegistered() as Map<string, unknown>;

    const expectedCommands = [
      'skills-sh.refreshInstalled',
      'skills-sh.openSkillFile',
      'skills-sh.previewSkillFile',
      'skills-sh.launchClaudeWithSkill',
      'skills-sh.installSkill',
      'skills-sh.uninstallSkill',
      'skills-sh.checkUpdates',
      'skills-sh.updateSingleSkill',
      'skills-sh.updateAllSkills',
      'skills-sh.openMarketplace',
      'skills-sh.copySkillPath',
      'skills-sh.viewInstalledInEditor',
      'skills-sh.openMarketplaceTab',
      'skills-sh.openAudits',
      'skills-sh.openDocs',
      'skills-sh.openSettings',
      'skills-sh.addToManifest',
      'skills-sh.removeFromManifest',
      'skills-sh.editManifest',
      'skills-sh.installFromManifest',
    ];

    for (const cmd of expectedCommands) {
      expect(registered.has(cmd), `Missing command: ${cmd}`).toBe(true);
    }
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workspace, TreeItemCollapsibleState } from 'vscode';
import { InstalledSkill, ScanResult } from '../../../types';

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the module under test
// ---------------------------------------------------------------------------

// Mock the github API (used by loadCustomSourceCounts)
vi.mock('../../../api/github', () => ({
  fetchRepoSkillList: vi.fn(async () => []),
}));

// Mock the updates module — controls which skills show "update available"
let mockUpdateResult: { updates: { name: string; source: string; newHash: string }[] } | null = null;
vi.mock('../../../api/updates', () => ({
  getLastUpdateResult: () => mockUpdateResult,
}));

// Mock the manifest module — controls which skills show "in manifest"
let mockManifestNames = new Set<string>();
vi.mock('../../../manifest/manifest', () => ({
  getManifestSkillNames: () => mockManifestNames,
}));

// Mock the logger
vi.mock('../../../logger', () => ({
  getLog: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { InstalledSkillsTreeProvider } from '../../../views/installed-tree';
import { SkillScanner } from '../../../local/scanner';
import type { AuditMapEntry, AuditCompositeScore } from '../../../api/audits-scraper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<InstalledSkill> & { name: string }): InstalledSkill {
  return {
    folderName: overrides.name,
    description: '',
    path: `/skills/${overrides.name}`,
    scope: 'global',
    metadata: {},
    isCustom: false,
    agents: [],
    ...overrides,
  };
}

function createMockScanner(skills: {
  globalSkills?: InstalledSkill[];
  projectSkills?: InstalledSkill[];
  wslGroups?: { distro: string; skills: InstalledSkill[] }[];
}): SkillScanner {
  const result: ScanResult = {
    globalSkills: skills.globalSkills ?? [],
    projectSkills: skills.projectSkills ?? [],
    wslGroups: skills.wslGroups,
  };
  return { scan: vi.fn(async () => result) } as unknown as SkillScanner;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InstalledSkillsTreeProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (workspace as any).__resetConfig();
    mockUpdateResult = null;
    mockManifestNames = new Set();
  });

  // --- getChildren: root level groups -------------------------------------

  describe('getChildren (root level)', () => {
    it('returns Quick Links group when no skills are installed', async () => {
      const scanner = createMockScanner({});
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      // Should have at least Quick Links
      const quickLinks = children.find((c: any) => c.groupType === 'quick-links');
      expect(quickLinks).toBeDefined();
    });

    it('groups global skills by source', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'react-skill', source: 'vercel/repo', hash: 'abc' }),
          makeSkill({ name: 'email-skill', source: 'vercel/repo', hash: 'def' }),
          makeSkill({ name: 'auth-skill', source: 'supabase/repo', hash: 'ghi' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const sourceGroups = children.filter((c: any) => c.groupType === 'source');
      expect(sourceGroups).toHaveLength(2);

      // Groups should be sorted by source name
      expect((sourceGroups[0] as any).label).toContain('supabase/repo');
      expect((sourceGroups[1] as any).label).toContain('vercel/repo');
    });

    it('creates "My Skills" group for custom skills', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'my-custom', isCustom: true }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const customGroup = children.find((c: any) => c.groupType === 'custom');
      expect(customGroup).toBeDefined();
      expect((customGroup as any).label).toContain('Custom Skills');
      expect((customGroup as any).children).toHaveLength(1);
    });

    it('creates "Untracked" group for skills without source or custom flag', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'orphan-skill', source: undefined, hash: undefined, isCustom: false }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const untrackedGroup = children.find((c: any) => c.groupType === 'untracked');
      expect(untrackedGroup).toBeDefined();
      expect((untrackedGroup as any).label).toContain('Untracked');
    });

    it('creates "Project Skills" group for project-scoped skills', async () => {
      const scanner = createMockScanner({
        projectSkills: [
          makeSkill({ name: 'proj-skill', scope: 'project' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const projectGroup = children.find((c: any) => c.groupType === 'project');
      expect(projectGroup).toBeDefined();
      expect((projectGroup as any).label).toContain('Project Skills');
    });

    it('creates "Updates Available" group near the top when updates exist', async () => {
      mockUpdateResult = {
        updates: [{ name: 'react-skill', source: 'vercel/repo', newHash: 'xyz' }],
      };
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'react-skill', source: 'vercel/repo', hash: 'abc' }),
          makeSkill({ name: 'other-skill', source: 'vercel/repo', hash: 'def' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      // Quick Links is unshifted to position 0; Updates is at position 1
      expect((children[0] as any).groupType).toBe('quick-links');
      expect((children[1] as any).groupType).toBe('updates');
      expect((children[1] as any).label).toContain('Updates Available (1)');
      expect((children[1] as any).collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
    });

    it('always includes Quick Links as the first group', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'some-skill', source: 'org/repo', hash: 'abc' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      expect((children[0] as any).groupType).toBe('quick-links');
    });
  });

  // --- Group ordering (full spectrum) -------------------------------------

  describe('group ordering', () => {
    it('orders groups: quick-links, updates, custom, source, untracked, project', async () => {
      mockUpdateResult = {
        updates: [{ name: 'updatable', source: 'org/repo', newHash: 'new' }],
      };

      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'updatable', source: 'org/repo', hash: 'old' }),
          makeSkill({ name: 'custom-skill', isCustom: true }),
          makeSkill({ name: 'tracked', source: 'org/repo', hash: 'abc' }),
          makeSkill({ name: 'orphan', isCustom: false }),
        ],
        projectSkills: [
          makeSkill({ name: 'proj', scope: 'project' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const groupTypes = children.map((c: any) => c.groupType);
      expect(groupTypes).toEqual([
        'quick-links',
        'updates',
        'custom',
        'source',
        'untracked',
        'project',
      ]);
    });
  });

  // --- SkillItem contextValue ---------------------------------------------

  describe('SkillItem contextValue', () => {
    it('sets "skill" for a normal installed skill', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'normal', source: 'org/repo', hash: 'abc' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      expect(skillItem.contextValue).toBe('skill');
    });

    it('sets "skill_manifest" when skill is in the manifest', async () => {
      mockManifestNames = new Set(['react-skill']);
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'react-skill', folderName: 'react-skill', source: 'org/repo', hash: 'abc' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      expect(skillItem.contextValue).toBe('skill_manifest');
    });

    it('sets "skill_updatable" when skill has an update', async () => {
      mockUpdateResult = {
        updates: [{ name: 'react-skill', source: 'org/repo', newHash: 'new' }],
      };
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'react-skill', source: 'org/repo', hash: 'old' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const updatesGroup = children.find((c: any) => c.groupType === 'updates') as any;
      const skillItem = updatesGroup.children[0];
      expect(skillItem.contextValue).toBe('skill_updatable');
    });

    it('sets "skill_updatable_manifest" for updatable skill in manifest', async () => {
      mockUpdateResult = {
        updates: [{ name: 'react-skill', source: 'org/repo', newHash: 'new' }],
      };
      mockManifestNames = new Set(['react-skill']);
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'react-skill', folderName: 'react-skill', source: 'org/repo', hash: 'old' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const updatesGroup = children.find((c: any) => c.groupType === 'updates') as any;
      const skillItem = updatesGroup.children[0];
      expect(skillItem.contextValue).toBe('skill_updatable_manifest');
    });
  });

  // --- SkillItem description / badges ------------------------------------

  describe('SkillItem display', () => {
    it('shows "Update available" in description for updatable skills', async () => {
      mockUpdateResult = {
        updates: [{ name: 'react-skill', source: 'org/repo', newHash: 'new' }],
      };
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'react-skill', source: 'org/repo', hash: 'old' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const updatesGroup = children.find((c: any) => c.groupType === 'updates') as any;
      expect(updatesGroup.children[0].description).toContain('Update available');
    });

    it('shows skill description instead of agent badge in tree view', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({
            name: 'multi-agent',
            description: 'My description',
            source: 'org/repo',
            hash: 'abc',
            agents: ['Claude Code', 'Cursor', 'skills.sh'],
          }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      // Agent badges removed from tree view — description shown instead
      expect(skillItem.description).toBe('My description');
      expect(skillItem.description).not.toContain('Claude Code');
    });

    it('shows (untracked) for skills without source or hash', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'orphan', source: undefined, hash: undefined, isCustom: false }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const untrackedGroup = children.find((c: any) => c.groupType === 'untracked') as any;
      expect(untrackedGroup.children[0].description).toContain('untracked');
    });
  });

  // --- getInstalledSkillNames / getAllInstalledSkills ----------------------

  describe('getInstalledSkillNames', () => {
    it('returns Set of both name and folderName for all skills', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'React Best Practices', folderName: 'react-best-practices' }),
        ],
        projectSkills: [
          makeSkill({ name: 'Project Skill', folderName: 'project-skill' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      // Force rescan to populate internal state
      await provider.getChildren();

      const names = provider.getInstalledSkillNames();
      expect(names.has('React Best Practices')).toBe(true);
      expect(names.has('react-best-practices')).toBe(true);
      expect(names.has('Project Skill')).toBe(true);
      expect(names.has('project-skill')).toBe(true);
    });

    it('returns empty Set before any scan', () => {
      const scanner = createMockScanner({});
      const provider = new InstalledSkillsTreeProvider(scanner);
      // Before getChildren/rescan, internal arrays are empty
      const names = provider.getInstalledSkillNames();
      expect(names.size).toBe(0);
    });

    it('includes WSL skills so the marketplace shows them as installed', async () => {
      const scanner = createMockScanner({
        wslGroups: [{
          distro: 'Ubuntu-20.04',
          skills: [makeSkill({ name: 'vercel-react-best-practices', folderName: 'vercel-react-best-practices', origin: 'wsl:Ubuntu-20.04' })],
        }],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      await provider.rescan();

      const names = provider.getInstalledSkillNames();
      expect(names.has('vercel-react-best-practices')).toBe(true);
    });
  });

  describe('getAllInstalledSkills', () => {
    it('returns combined global and project skills', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'global-a' })],
        projectSkills: [makeSkill({ name: 'project-b' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      await provider.getChildren();

      const all = provider.getAllInstalledSkills();
      expect(all).toHaveLength(2);
      expect(all.map(s => s.name)).toContain('global-a');
      expect(all.map(s => s.name)).toContain('project-b');
    });
  });

  // --- getChildren: group children -----------------------------------------

  describe('getChildren (group element)', () => {
    it('returns children of a source group', async () => {
      const scanner = createMockScanner({
        globalSkills: [
          makeSkill({ name: 'skill-a', source: 'org/repo', hash: 'abc' }),
          makeSkill({ name: 'skill-b', source: 'org/repo', hash: 'def' }),
        ],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const root = await provider.getChildren();
      const sourceGroup = root.find((c: any) => c.groupType === 'source');
      const children = await provider.getChildren(sourceGroup);
      expect(children).toHaveLength(2);
    });
  });

  // --- GroupItem contextValue ---------------------------------------------

  describe('GroupItem contextValue', () => {
    it('sets "updatesGroup" for updates group', async () => {
      mockUpdateResult = {
        updates: [{ name: 'skill', source: 'org/repo', newHash: 'new' }],
      };
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'skill', source: 'org/repo', hash: 'old' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const updatesGroup = children.find((c: any) => c.groupType === 'updates');
      expect(updatesGroup!.contextValue).toBe('updatesGroup');
    });

    it('sets "sourceGroup" for source groups', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'skill', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source');
      expect(sourceGroup!.contextValue).toBe('sourceGroup');
    });

    it('sets "group" for other group types', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'custom-s', isCustom: true })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const customGroup = children.find((c: any) => c.groupType === 'custom');
      expect(customGroup!.contextValue).toBe('group');
    });
  });

  // --- WSL distro groups --------------------------------------------------

  describe('WSL groups', () => {
    it('renders a collapsed "WSL: <distro> (N)" group at the bottom', async () => {
      const scanner = createMockScanner({
        wslGroups: [{
          distro: 'Ubuntu-20.04',
          skills: [
            makeSkill({ name: 'monorepo-management', origin: 'wsl:Ubuntu-20.04', isCustom: true }),
            makeSkill({ name: 'vercel-react-best-practices', origin: 'wsl:Ubuntu-20.04', isCustom: true }),
          ],
        }],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const wslGroup = children.find((c: any) => c.groupType === 'wsl') as any;
      expect(wslGroup).toBeDefined();
      expect(wslGroup.label).toBe('WSL: Ubuntu-20.04 (2)');
      expect(wslGroup.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
      expect(wslGroup.children).toHaveLength(2);
      // WSL group sits after Quick Links (which is always first)
      expect((children[0] as any).groupType).toBe('quick-links');
      expect(children.indexOf(wslGroup)).toBeGreaterThan(0);
    });

    it('renders WSL skill items read-only (excluded from the skill context menu)', async () => {
      const scanner = createMockScanner({
        wslGroups: [{
          distro: 'Ubuntu-20.04',
          skills: [makeSkill({ name: 'monorepo-management', origin: 'wsl:Ubuntu-20.04', isCustom: true })],
        }],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const wslGroup = children.find((c: any) => c.groupType === 'wsl') as any;
      const item = wslGroup.children[0];
      // contextValue must NOT start with "skill" (the menus key on /^skill/),
      // and there must be no click command (UNC preview is unreliable).
      expect(item.contextValue).toBe('wslSkill');
      expect(/^skill/.test(item.contextValue)).toBe(false);
      expect(item.command).toBeUndefined();
    });

    it('marks WSL skills as installed-context via origin in the tooltip', async () => {
      const scanner = createMockScanner({
        wslGroups: [{
          distro: 'Ubuntu-20.04',
          skills: [makeSkill({ name: 'monorepo-management', origin: 'wsl:Ubuntu-20.04', isCustom: true })],
        }],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const wslGroup = children.find((c: any) => c.groupType === 'wsl') as any;
      expect(wslGroup.children[0].tooltip).toContain('Location: WSL · Ubuntu-20.04');
    });

    it('nests native groups under a host-OS group when WSL is also present', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'native', source: 'org/repo', hash: 'abc' })],
        wslGroups: [{
          distro: 'Ubuntu-20.04',
          skills: [makeSkill({ name: 'w', origin: 'wsl:Ubuntu-20.04', isCustom: true })],
        }],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();

      const hostGroup = children.find((c: any) => c.groupType === 'host') as any;
      expect(hostGroup).toBeDefined();
      expect(['Windows', 'macOS', 'Linux']).toContain(hostGroup.label);
      expect(hostGroup.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
      // The native source group is nested under host, NOT at the top level.
      expect(children.find((c: any) => c.groupType === 'source')).toBeUndefined();
      expect((hostGroup.children as any[]).some(g => g.groupType === 'source')).toBe(true);
      // The WSL group is a sibling at the top level.
      expect(children.find((c: any) => c.groupType === 'wsl')).toBeDefined();
    });

    it('keeps native groups top-level (no host wrapper) when no WSL is present', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'native', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();

      expect(children.find((c: any) => c.groupType === 'host')).toBeUndefined();
      expect(children.find((c: any) => c.groupType === 'source')).toBeDefined();
    });

    it('does not show the "no skills" state when only WSL skills exist', async () => {
      const scanner = createMockScanner({
        wslGroups: [{
          distro: 'Ubuntu-20.04',
          skills: [makeSkill({ name: 'monorepo-management', origin: 'wsl:Ubuntu-20.04', isCustom: true })],
        }],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      await provider.rescan();

      const { commands } = await import('vscode');
      expect(commands.executeCommand).toHaveBeenCalledWith(
        'setContext', 'skills-sh.noSkillsFound', false,
      );
    });
  });

  // --- Quick Links content ------------------------------------------------

  describe('Quick Links', () => {
    it('contains all four quick links', async () => {
      const scanner = createMockScanner({});
      const provider = new InstalledSkillsTreeProvider(scanner);

      const children = await provider.getChildren();
      const quickLinks = children.find((c: any) => c.groupType === 'quick-links') as any;
      expect(quickLinks.children).toHaveLength(4);
      expect(quickLinks.children[0].label).toBe('Browse Marketplace');
      expect(quickLinks.children[1].label).toBe('View Installed in Detail');
      expect(quickLinks.children[2].label).toBe('Security Audits');
      expect(quickLinks.children[2].contextValue).toBe('quickLink');
      expect(quickLinks.children[3].label).toBe('Documentation');
    });
  });

  // --- refresh / rescan ---------------------------------------------------

  describe('refresh and rescan', () => {
    it('rescan triggers a new scan and refresh fires change event', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'skill-1', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      const changeListener = vi.fn();
      provider.onDidChangeTreeData(changeListener);

      await provider.rescan();

      expect(scanner.scan).toHaveBeenCalled();
      expect(changeListener).toHaveBeenCalled();
    });

    it('sets skills-sh.noSkillsFound context when no skills', async () => {
      const scanner = createMockScanner({});
      const provider = new InstalledSkillsTreeProvider(scanner);

      await provider.rescan();

      const { commands } = await import('vscode');
      expect(commands.executeCommand).toHaveBeenCalledWith(
        'setContext', 'skills-sh.noSkillsFound', true
      );
    });

    it('sets skills-sh.hasInstalledSkill to true when skills present', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'some-skill', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);

      await provider.rescan();

      const { commands } = await import('vscode');
      expect(commands.executeCommand).toHaveBeenCalledWith(
        'setContext', 'skills-sh.hasInstalledSkill', true
      );
    });

    it('sets skills-sh.hasInstalledSkill to false when no skills', async () => {
      const scanner = createMockScanner({});
      const provider = new InstalledSkillsTreeProvider(scanner);

      await provider.rescan();

      const { commands } = await import('vscode');
      expect(commands.executeCommand).toHaveBeenCalledWith(
        'setContext', 'skills-sh.hasInstalledSkill', false
      );
    });
  });

  // --- Audit icons ----------------------------------------------------------

  describe('audit icons on SkillItem', () => {
    function makeAuditMap(entries: Record<string, AuditCompositeScore>): Map<string, AuditMapEntry> {
      const map = new Map<string, AuditMapEntry>();
      for (const [key, score] of Object.entries(entries)) {
        map.set(key, {
          score,
          audits: [
            { partner: 'Gen Agent Trust Hub', status: score === 'pass' ? 'Safe' : score === 'warn' ? 'Med Risk' : 'Critical' },
            { partner: 'Socket', status: '0 alerts' },
          ],
        });
      }
      return map;
    }

    it('shows green circle-filled icon for pass score', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'safe-skill', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      provider.setAuditMap(makeAuditMap({ 'safe-skill': 'pass' }));

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      expect((skillItem.iconPath as any).id).toBe('circle-filled');
      expect((skillItem.iconPath as any).color.id).toBe('testing.iconPassed');
    });

    it('shows neutral circle-filled icon for partial score', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'partial-skill', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      provider.setAuditMap(makeAuditMap({ 'partial-skill': 'partial' }));

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      expect((skillItem.iconPath as any).id).toBe('circle-filled');
      expect((skillItem.iconPath as any).color.id).toBe('descriptionForeground');
    });

    it('shows red circle-filled icon for fail score', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'risky-skill', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      provider.setAuditMap(makeAuditMap({ 'risky-skill': 'fail' }));

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      expect((skillItem.iconPath as any).id).toBe('circle-filled');
      expect((skillItem.iconPath as any).color.id).toBe('testing.iconFailed');
    });

    it('keeps file-code icon when no audit data', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'unknown-skill', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      // No audit map set

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      expect((skillItem.iconPath as any).id).toBe('file-code');
    });

    it('keeps arrow-up icon for updatable skill even with audit data', async () => {
      mockUpdateResult = {
        updates: [{ name: 'updatable-skill', source: 'org/repo', newHash: 'new' }],
      };
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'updatable-skill', source: 'org/repo', hash: 'old' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      provider.setAuditMap(makeAuditMap({ 'updatable-skill': 'pass' }));

      const children = await provider.getChildren();
      const updatesGroup = children.find((c: any) => c.groupType === 'updates') as any;
      const skillItem = updatesGroup.children[0];
      expect((skillItem.iconPath as any).id).toBe('arrow-up');
    });

    it('includes Security Audits in tooltip when data exists', async () => {
      const scanner = createMockScanner({
        globalSkills: [makeSkill({ name: 'audited-skill', source: 'org/repo', hash: 'abc' })],
      });
      const provider = new InstalledSkillsTreeProvider(scanner);
      provider.setAuditMap(makeAuditMap({ 'audited-skill': 'pass' }));

      const children = await provider.getChildren();
      const sourceGroup = children.find((c: any) => c.groupType === 'source') as any;
      const skillItem = sourceGroup.children[0];
      expect(skillItem.tooltip).toContain('Security Audits:');
      expect(skillItem.tooltip).toContain('Gen Agent Trust Hub: Safe');
      expect(skillItem.tooltip).toContain('Socket: 0 alerts');
    });
  });
});

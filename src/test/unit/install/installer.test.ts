import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { window, workspace } from 'vscode';
import { createSandbox, Sandbox } from '../../helpers/fs-sandbox';

// Spread fs into a plain object so properties become configurable
// (Node.js built-in module properties are non-configurable, blocking vi.spyOn).
vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal() as object) }));

// We need to mock the logger before importing installer
vi.mock('../../../logger', () => ({
  getLog: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock the updates module
vi.mock('../../../api/updates', () => ({
  clearUpdateForSkill: vi.fn(),
}));

import {
  installSkill,
  uninstallSkill,
  onInstallDetected,
  onOperationCompleted,
  notifyInstallDetected,
  disposeTerminal,
} from '../../../install/installer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let sandbox: Sandbox;

/** Get the mock terminal created by vscode.window.createTerminal */
function getMockTerminal() {
  return (window.createTerminal as ReturnType<typeof vi.fn>).mock.results[0]?.value;
}

/** Simulate the user clicking "Install" on the confirmation dialog */
function acceptInstall() {
  (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Install');
}

/** Simulate the user clicking "Uninstall" on the warning dialog */
function acceptUninstall() {
  (window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Uninstall');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('installSkill', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: user cancels
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    // Default config
    (workspace as any).__resetConfig();
    // Dispose any leftover shared terminal
    disposeTerminal();
  });

  // --- Confirmation dialog -------------------------------------------------

  it('returns false when user cancels the install dialog', async () => {
    (window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const result = await installSkill('https://github.com/acme/tools');
    expect(result).toBe(false);
  });

  it('returns true when user confirms install', async () => {
    acceptInstall();
    const result = await installSkill('https://github.com/acme/tools');
    expect(result).toBe(true);
  });

  // --- Command construction ------------------------------------------------

  it('builds correct command with source and -y flag', async () => {
    acceptInstall();

    await installSkill('https://github.com/acme/tools');
    const terminal = getMockTerminal();
    expect(terminal.sendText).toHaveBeenCalled();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).toContain('npx skills add https://github.com/acme/tools');
    expect(cmd).not.toContain('-a');
    expect(cmd).toContain('-y');
  });

  it('adds -g flag when installed globally', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools');
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).toContain('-g');
  });

  it('omits -g flag when installed in project', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools', { global: false });
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).not.toContain('-g');
  });

  it('adds -s flag when skill option is provided', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools', { skill: 'react-skill' });
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).toContain('-s react-skill');
  });

  it('omits -s flag when no skill option is provided', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools');
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).not.toContain('-s');
  });

  // --- Explicit scope via options ------------------------------------------

  it('uses explicit global scope from options.global=true', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools', { global: true });
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).toContain('-g');
  });

  it('uses explicit project scope from options.global=false', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools', { global: false });
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).not.toContain('-g');
  });

  // --- Config-driven scope -------------------------------------------------

  it('uses "global" install scope from config', async () => {
    (workspace as any).__setConfigValue('skills-sh.installScope', 'global');
    acceptInstall();
    await installSkill('https://github.com/acme/tools');
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).toContain('-g');
  });

  it('uses "project" install scope from config (no -g)', async () => {
    (workspace as any).__setConfigValue('skills-sh.installScope', 'project');
    acceptInstall();
    await installSkill('https://github.com/acme/tools');
    const terminal = getMockTerminal();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).not.toContain('-g');
  });

  // --- Terminal usage ------------------------------------------------------

  it('shows the terminal when running install', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools');
    const terminal = getMockTerminal();
    expect(terminal.show).toHaveBeenCalled();
  });

  it('shows progress notification during install', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools');
    expect(window.withProgress).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// uninstallSkill
// ---------------------------------------------------------------------------

describe('uninstallSkill', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (workspace as any).__resetConfig();
    disposeTerminal();
  });

  it('does nothing when user cancels the uninstall dialog', async () => {
    (window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await uninstallSkill('my-skill');
    expect(window.createTerminal).not.toHaveBeenCalled();
  });

  // --- Global uninstall (CLI delegation) ---

  it('sends npx skills remove command for global uninstall', async () => {
    acceptUninstall();
    await uninstallSkill('react-skill', { global: true });
    const terminal = getMockTerminal();
    expect(terminal.sendText).toHaveBeenCalled();
    const cmd = terminal.sendText.mock.calls[0][0] as string;
    expect(cmd).toContain('npx skills remove react-skill');
    expect(cmd).toContain('-g');
    expect(cmd).toContain('-y');
  });


  // --- Project-scoped uninstall (direct cleanup) ---

  describe('project-scoped cleanup', () => {
    let sandbox: Sandbox;
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
      sandbox = createSandbox('installer-uninstall-');
      // Redirect os.homedir() to sandbox via env vars
      savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
      process.env.HOME = sandbox.home;
      process.env.USERPROFILE = sandbox.home;
    });

    afterEach(() => {
      sandbox.cleanup();
      // Restore env vars
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value !== undefined) { process.env[key] = value; }
        else { delete process.env[key]; }
      }
    });

    it('removes the skill directory at the provided skillPath', async () => {
      // Create a plain directory (not a symlink) for the project skill
      const skillDir = path.join(sandbox.projectSkillsDir, 'my-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: "my-skill"\n---\n');

      acceptUninstall();
      await uninstallSkill('my-skill', { global: false, skillPath: skillDir });

      expect(fs.existsSync(skillDir)).toBe(false);
    });

    it('removes content directory under ~/.agents/skills/ when no global symlink exists', async () => {
      // Create skill content in agents dir
      const contentDir = path.join(sandbox.agentsDir, 'test-skill');
      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(path.join(contentDir, 'SKILL.md'), '---\nname: "test-skill"\n---\n');

      // Create project symlink pointing to it
      const skillPath = path.join(sandbox.projectSkillsDir, 'test-skill');
      fs.symlinkSync(contentDir, skillPath, 'junction');

      acceptUninstall();
      await uninstallSkill('test-skill', {
        global: false,
        skillPath,
        folderName: 'test-skill',
      });

      // Both symlink and content should be removed
      expect(fs.existsSync(skillPath)).toBe(false);
      expect(fs.existsSync(contentDir)).toBe(false);
    });

    it('does NOT remove content when global symlink still exists', async () => {
      // Create skill content in agents dir
      const contentDir = path.join(sandbox.agentsDir, 'shared-skill');
      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(path.join(contentDir, 'SKILL.md'), '---\nname: "shared-skill"\n---\n');

      // Create project symlink
      const projectSkillPath = path.join(sandbox.projectSkillsDir, 'shared-skill');
      fs.symlinkSync(contentDir, projectSkillPath, 'junction');

      // Also create global symlink (still active)
      const globalSkillPath = path.join(sandbox.globalSkillsDir, 'shared-skill');
      fs.symlinkSync(contentDir, globalSkillPath, 'junction');

      acceptUninstall();
      await uninstallSkill('shared-skill', {
        global: false,
        skillPath: projectSkillPath,
        folderName: 'shared-skill',
      });

      // Project symlink removed, but content dir and global symlink should remain
      expect(fs.existsSync(projectSkillPath)).toBe(false);
      expect(fs.existsSync(contentDir)).toBe(true);
      expect(fs.existsSync(globalSkillPath)).toBe(true);
    });

    it('removes lock file entry when cleaning up content', async () => {
      const contentDir = path.join(sandbox.agentsDir, 'locked-skill');
      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(path.join(contentDir, 'SKILL.md'), '---\nname: "locked-skill"\n---\n');

      const skillPath = path.join(sandbox.projectSkillsDir, 'locked-skill');
      fs.symlinkSync(contentDir, skillPath, 'junction');

      // Write lock file with an entry for our skill
      sandbox.writeLockFile({
        version: 1,
        skills: {
          'locked-skill': {
            source: 'org/repo',
            skillFolderHash: 'abc123',
          },
          'other-skill': {
            source: 'org/other',
            skillFolderHash: 'def456',
          },
        },
      });

      acceptUninstall();
      await uninstallSkill('locked-skill', {
        global: false,
        skillPath,
        folderName: 'locked-skill',
      });

      // Lock file should still exist but without the removed skill
      const lockContent = JSON.parse(fs.readFileSync(sandbox.lockFilePath, 'utf-8'));
      expect(lockContent.skills['locked-skill']).toBeUndefined();
      expect(lockContent.skills['other-skill']).toBeDefined();
    });

    it('removes lock entry matched by skillPath fallback', async () => {
      const contentDir = path.join(sandbox.agentsDir, 'react-email');
      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(path.join(contentDir, 'SKILL.md'), '---\nname: "react-email"\n---\n');

      const skillPath = path.join(sandbox.projectSkillsDir, 'react-email');
      fs.symlinkSync(contentDir, skillPath, 'junction');

      // Lock file uses prefixed key but skillPath contains the folder name
      sandbox.writeLockFile({
        version: 1,
        skills: {
          'vercel-react-email': {
            source: 'vercel-labs/agent-skills',
            skillPath: 'skills/react-email/SKILL.md',
            skillFolderHash: 'abc123',
          },
        },
      });

      acceptUninstall();
      await uninstallSkill('react-email', {
        global: false,
        skillPath,
        folderName: 'react-email',
      });

      const lockContent = JSON.parse(fs.readFileSync(sandbox.lockFilePath, 'utf-8'));
      expect(lockContent.skills['vercel-react-email']).toBeUndefined();
    });

    it('fires onOperationCompleted after project cleanup', async () => {
      const skillDir = path.join(sandbox.projectSkillsDir, 'event-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: "event-skill"\n---\n');

      const completedFn = vi.fn();
      const disposable = onOperationCompleted(completedFn);

      acceptUninstall();
      await uninstallSkill('event-skill', { global: false, skillPath: skillDir });

      expect(completedFn).toHaveBeenCalled();
      disposable.dispose();
    });

    it('shows error message when cleanup fails', async () => {
      const fakePath = path.join(sandbox.projectSkillsDir, 'broken-skill');
      const rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      acceptUninstall();
      await uninstallSkill('broken-skill', { global: false, skillPath: fakePath });

      expect(window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );

      // Restore before afterEach cleanup uses fs.rmSync
      rmSyncSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Event emitters
// ---------------------------------------------------------------------------

describe('notifyInstallDetected', () => {
  it('fires the onInstallDetected event with the skill name', () => {
    const listener = vi.fn();
    const disposable = onInstallDetected(listener);

    notifyInstallDetected('my-new-skill');

    expect(listener).toHaveBeenCalledWith('my-new-skill');
    disposable.dispose();
  });

  it('fires multiple listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const d1 = onInstallDetected(listener1);
    const d2 = onInstallDetected(listener2);

    notifyInstallDetected('skill-x');

    expect(listener1).toHaveBeenCalledWith('skill-x');
    expect(listener2).toHaveBeenCalledWith('skill-x');
    d1.dispose();
    d2.dispose();
  });

  it('stops firing after dispose', () => {
    const listener = vi.fn();
    const disposable = onInstallDetected(listener);
    disposable.dispose();

    notifyInstallDetected('should-not-fire');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('disposeTerminal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    disposeTerminal();
  });

  it('disposes the shared terminal', async () => {
    acceptInstall();
    await installSkill('https://github.com/acme/tools');
    const terminal = getMockTerminal();

    disposeTerminal();

    expect(terminal.dispose).toHaveBeenCalled();
  });
});


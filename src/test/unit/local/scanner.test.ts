import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { workspace } from 'vscode';
import { SkillScanner } from '../../../local/scanner';
import { createSandbox, Sandbox } from '../../helpers/fs-sandbox';
import { SAMPLE_LOCK_FILE } from '../../helpers/fixtures';

let sandbox: Sandbox;
let scanner: SkillScanner;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  sandbox = createSandbox();
  scanner = new SkillScanner();

  // Save env vars, then redirect os.homedir() via HOME/USERPROFILE
  savedEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  };
  process.env.HOME = sandbox.home;
  process.env.USERPROFILE = sandbox.home;
  delete process.env.CLAUDE_CONFIG_DIR;

  // Point workspace to the sandbox workspace folder
  (workspace as any).workspaceFolders = [
    { uri: { fsPath: sandbox.workspaceRoot }, name: 'test-workspace' },
  ];
});

afterEach(() => {
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

// ─── scan() ──────────────────────────────────────────────

describe('SkillScanner.scan()', () => {

  it('finds skills in the global directory', async () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'my-skill', {
      frontmatter: { name: 'my-skill', description: 'A test skill' },
    });

    const result = await scanner.scan();

    expect(result.globalSkills.length).toBe(1);
    expect(result.globalSkills[0].name).toBe('my-skill');
    expect(result.globalSkills[0].scope).toBe('global');
  });

  it('finds skills in the project directory', async () => {
    sandbox.createSkill(sandbox.projectSkillsDir, 'proj-skill', {
      frontmatter: { name: 'proj-skill', description: 'Project-level skill' },
    });

    const result = await scanner.scan();

    expect(result.projectSkills.length).toBe(1);
    expect(result.projectSkills[0].name).toBe('proj-skill');
    expect(result.projectSkills[0].scope).toBe('project');
  });

  it('follows symlinks via isDirectoryEntry()', async () => {
    // asSymlink: creates real dir in .agents/skills/ + symlink in .claude/skills/
    // Scanner finds real dir via canonical scan — skill IS discovered (symlink following works)
    sandbox.createSkill(sandbox.globalSkillsDir, 'linked-skill', {
      frontmatter: { name: 'linked-skill', description: 'Symlinked skill' },
      asSymlink: true,
    });

    const result = await scanner.scan();

    expect(result.globalSkills.length).toBe(1);
    expect(result.globalSkills[0].name).toBe('linked-skill');
  });

  it('skips non-directory entries', async () => {
    // Create a regular file in the skills directory (not a directory/symlink)
    fs.writeFileSync(path.join(sandbox.globalSkillsDir, 'stray-file.txt'), 'not a skill');

    const result = await scanner.scan();

    expect(result.globalSkills.length).toBe(0);
  });

  it('skips directories without SKILL.md', async () => {
    // Create a directory but don't put SKILL.md in it
    const emptyDir = path.join(sandbox.globalSkillsDir, 'no-skill-md');
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(path.join(emptyDir, 'README.md'), '# Not a skill');

    const result = await scanner.scan();

    expect(result.globalSkills.length).toBe(0);
  });

  it('returns empty when the directory does not exist', async () => {
    // Remove the pre-created global skills directory
    fs.rmSync(sandbox.globalSkillsDir, { recursive: true, force: true });

    const result = await scanner.scan();

    expect(result.globalSkills.length).toBe(0);
  });

  it('matches lock entries by direct key', async () => {
    // Lock file has key "supabase-auth" — folder name matches directly
    sandbox.writeLockFile(SAMPLE_LOCK_FILE);
    sandbox.createSkill(sandbox.globalSkillsDir, 'supabase-auth', {
      frontmatter: { name: 'supabase-auth', description: 'Supabase auth skill' },
      asSymlink: true,
    });

    const result = await scanner.scan();

    const skill = result.globalSkills.find(s => s.name === 'supabase-auth');
    expect(skill).toBeDefined();
    expect(skill!.source).toBe('supabase-community/agent-skills');
    expect(skill!.hash).toBe('def456ghi789');
  });

  it('matches lock entries by skillPath fallback', async () => {
    // Lock key is "vercel-react-best-practices" but folder is "react-best-practices".
    // The scanner falls back to matching the folder portion of skillPath.
    sandbox.writeLockFile(SAMPLE_LOCK_FILE);
    sandbox.createSkill(sandbox.globalSkillsDir, 'react-best-practices', {
      frontmatter: { name: 'react-best-practices', description: 'React best practices' },
      asSymlink: true,
    });

    const result = await scanner.scan();

    const skill = result.globalSkills.find(s => s.name === 'react-best-practices');
    expect(skill).toBeDefined();
    expect(skill!.source).toBe('vercel-labs/agent-skills');
    expect(skill!.hash).toBe('abc123def456');
    expect(skill!.skillPath).toBe('skills/react-best-practices/SKILL.md');
  });

  it('marks skills as isCustom: true when not a symlink and no lock entry', async () => {
    // No lock file, no symlink => custom
    sandbox.createSkill(sandbox.globalSkillsDir, 'custom-skill', {
      frontmatter: { name: 'custom-skill', description: 'User-created skill' },
      // asSymlink not set => regular directory
    });

    const result = await scanner.scan();

    expect(result.globalSkills.length).toBe(1);
    expect(result.globalSkills[0].isCustom).toBe(true);
  });

  it('marks symlinked skills without lock entry as isCustom: false', async () => {
    // Create a symlink in .claude/skills/ pointing to an external location
    // (not in .agents/skills/ so canonical scan won't find the real dir first)
    const externalDir = path.join(sandbox.root, 'external', 'symlinked-no-lock');
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, 'SKILL.md'),
      '---\nname: "symlinked-no-lock"\ndescription: "Symlinked but no lock"\n---\n# symlinked-no-lock');
    fs.symlinkSync(externalDir, path.join(sandbox.globalSkillsDir, 'symlinked-no-lock'), 'junction');

    const result = await scanner.scan();

    const skill = result.globalSkills.find(s => s.name === 'symlinked-no-lock');
    expect(skill).toBeDefined();
    expect(skill!.isCustom).toBe(false); // symlink => not custom
  });

  it('respects CLAUDE_CONFIG_DIR env var', async () => {
    // Set CLAUDE_CONFIG_DIR to a custom location within the sandbox
    const customConfigDir = path.join(sandbox.root, 'custom-config');
    const customSkillsDir = path.join(customConfigDir, 'skills');
    fs.mkdirSync(customSkillsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = customConfigDir;

    sandbox.createSkill(customSkillsDir, 'env-skill', {
      frontmatter: { name: 'env-skill', description: 'Found via env var' },
    });

    // The default globalSkillsDir should NOT be scanned for Claude
    sandbox.createSkill(sandbox.globalSkillsDir, 'default-skill', {
      frontmatter: { name: 'default-skill', description: 'In default location' },
    });

    const result = await scanner.scan();

    // env-skill should be found (through CLAUDE_CONFIG_DIR)
    const envSkill = result.globalSkills.find(s => s.name === 'env-skill');
    expect(envSkill).toBeDefined();

    // default-skill should NOT be found via Claude agent
    // (it may still be found if Cursor/Windsurf/Codex dirs overlap, but
    // for Claude specifically, the env var overrides the default path)
    const defaultSkill = result.globalSkills.find(s => s.name === 'default-skill');
    // default-skill is in .claude/skills which is also Claude's default,
    // but CLAUDE_CONFIG_DIR overrides it so Claude won't scan it
    // However, other agents (cursor, windsurf, codex) won't find it either
    // since it's in .claude/skills, not their dirs. So it should be absent.
    expect(defaultSkill).toBeUndefined();
  });

  it('deduplicates skills across canonical and claude dirs', async () => {
    // Same skill in both .agents/skills/ (canonical) and .claude/skills/ (claude dir)
    sandbox.createSkill(sandbox.agentsDir, 'shared-skill', {
      frontmatter: { name: 'shared-skill', description: 'Shared skill' },
    });
    sandbox.createSkill(sandbox.globalSkillsDir, 'shared-skill', {
      frontmatter: { name: 'shared-skill', description: 'Shared skill' },
    });

    const result = await scanner.scan();

    // Should appear only once (canonical entry wins)
    const matches = result.globalSkills.filter(s => s.name === 'shared-skill');
    expect(matches.length).toBe(1);
    // Path should be from canonical dir
    expect(matches[0].path).toContain('.agents');
  });

  it('returns empty project skills when no workspace is open', async () => {
    (workspace as any).workspaceFolders = undefined;

    sandbox.createSkill(sandbox.globalSkillsDir, 'global-only', {
      frontmatter: { name: 'global-only', description: 'Global skill' },
    });

    const result = await scanner.scan();

    expect(result.projectSkills.length).toBe(0);
    expect(result.globalSkills.length).toBeGreaterThanOrEqual(1);
  });

  it('populates folderName distinct from parsed name', async () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'folder-name', {
      frontmatter: { name: 'display-name', description: 'Different name and folder' },
    });

    const result = await scanner.scan();

    expect(result.globalSkills.length).toBe(1);
    expect(result.globalSkills[0].folderName).toBe('folder-name');
    expect(result.globalSkills[0].name).toBe('display-name');
  });
});

// ─── getDiagnostics() ────────────────────────────────────

describe('SkillScanner.getDiagnostics()', () => {

  it('reports global dirs with path, exists, and skillCount', () => {
    const diag = scanner.getDiagnostics();

    expect(diag.globalDirs.length).toBe(2);
    // Both canonical (.agents/skills) and claude (.claude/skills) dirs should be present
    const canonicalDir = diag.globalDirs.find(d => d.path.includes('.agents'));
    const claudeDir = diag.globalDirs.find(d => d.path.includes('.claude'));
    expect(canonicalDir).toBeDefined();
    expect(claudeDir).toBeDefined();
    expect(canonicalDir!.exists).toBe(true);
    expect(claudeDir!.exists).toBe(true);
  });

  it('reports when no skill directories are found', () => {
    // Remove both canonical and claude directories
    fs.rmSync(sandbox.globalSkillsDir, { recursive: true, force: true });
    fs.rmSync(sandbox.agentsDir, { recursive: true, force: true });

    const diag = scanner.getDiagnostics();

    expect(diag.issues).toContain(
      'No skill directories found. Install skills via the Marketplace or npx skills add.',
    );
  });

  it('reports skillCount: 0 when subdirs exist but none have valid SKILL.md', () => {
    // Create a subdirectory without SKILL.md in the claude dir
    const emptyDir = path.join(sandbox.globalSkillsDir, 'bad-skill');
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(path.join(emptyDir, 'README.md'), '# Not a skill');

    const diag = scanner.getDiagnostics();

    const claudeDir = diag.globalDirs.find(d => d.path.includes('.claude'));
    expect(claudeDir).toBeDefined();
    expect(claudeDir!.exists).toBe(true);
    expect(claudeDir!.skillCount).toBe(0);
  });

  it('counts valid skills correctly in globalDirs', () => {
    sandbox.createSkill(sandbox.globalSkillsDir, 'valid-skill', {
      frontmatter: { name: 'valid-skill', description: 'Valid' },
    });

    const diag = scanner.getDiagnostics();

    const claudeDir = diag.globalDirs.find(d => d.path.includes('.claude'));
    expect(claudeDir).toBeDefined();
    expect(claudeDir!.exists).toBe(true);
    expect(claudeDir!.skillCount).toBe(1);
  });

  it('reports no workspace open', () => {
    (workspace as any).workspaceFolders = undefined;

    const diag = scanner.getDiagnostics();

    expect(diag.issues).toContain('No workspace open \u2014 project skills not scanned');
  });
});

// ─── getGlobalSkillsDir() / getProjectSkillsDir() ───────

describe('SkillScanner helper methods', () => {

  it('getGlobalSkillsDir returns default path', () => {
    const dir = scanner.getGlobalSkillsDir();
    expect(dir).toBe(path.join(sandbox.home, '.claude', 'skills'));
  });

  it('getGlobalSkillsDir respects CLAUDE_CONFIG_DIR', () => {
    process.env.CLAUDE_CONFIG_DIR = '/env/config';
    const dir = scanner.getGlobalSkillsDir();
    expect(dir).toBe(path.join('/env/config', 'skills'));
  });

  it('getProjectSkillsDir returns project path when workspace is open', () => {
    const dir = scanner.getProjectSkillsDir();
    expect(dir).toBe(path.join(sandbox.workspaceRoot, '.claude', 'skills'));
  });

  it('getProjectSkillsDir returns null when no workspace', () => {
    (workspace as any).workspaceFolders = undefined;
    const dir = scanner.getProjectSkillsDir();
    expect(dir).toBeNull();
  });
});

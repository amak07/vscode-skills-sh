import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Sandbox {
  root: string;
  home: string;
  workspaceRoot: string;
  globalSkillsDir: string;
  agentsDir: string;
  lockFilePath: string;
  projectSkillsDir: string;

  createSkill(dir: string, name: string, opts?: {
    frontmatter?: Record<string, string>;
    body?: string;
    asSymlink?: boolean;
  }): string;

  writeLockFile(data: Record<string, unknown>): void;

  writeProjectLockFile(data: Record<string, unknown>): void;

  writeManifest(data: Record<string, unknown>): void;

  cleanup(): void;
}

export function createSandbox(prefix = 'skills-test-'): Sandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = path.join(root, 'home');
  const workspaceRoot = path.join(root, 'workspace');

  const globalSkillsDir = path.join(home, '.claude', 'skills');
  const agentsDir = path.join(home, '.agents', 'skills');
  const lockFilePath = path.join(home, '.agents', '.skill-lock.json');
  const projectSkillsDir = path.join(workspaceRoot, '.claude', 'skills');

  fs.mkdirSync(globalSkillsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(projectSkillsDir, { recursive: true });

  return {
    root, home, workspaceRoot, globalSkillsDir, agentsDir,
    lockFilePath, projectSkillsDir,

    createSkill(dir, name, opts = {}) {
      const skillDir = path.join(dir, name);
      const fm = opts.frontmatter || { name, description: `Test skill: ${name}` };
      const yaml = Object.entries(fm).map(([k, v]) => `${k}: "${v}"`).join('\n');
      const content = `---\n${yaml}\n---\n${opts.body || `# ${name}`}`;

      if (opts.asSymlink) {
        const target = path.join(agentsDir, name);
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, 'SKILL.md'), content);
        fs.symlinkSync(target, skillDir, 'junction');
        return target;
      }

      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
      return skillDir;
    },

    writeLockFile(data) {
      fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });
      fs.writeFileSync(lockFilePath, JSON.stringify(data, null, 2));
    },

    writeProjectLockFile(data) {
      const lockPath = path.join(workspaceRoot, 'skills-lock.json');
      fs.writeFileSync(lockPath, JSON.stringify(data, null, 2));
    },

    writeManifest(data) {
      fs.writeFileSync(
        path.join(workspaceRoot, 'skills.json'),
        JSON.stringify(data, null, 2),
      );
    },

    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

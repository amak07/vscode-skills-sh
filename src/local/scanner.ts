import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { AgentConfig, InstalledSkill, KNOWN_AGENTS, SkillScope, SkillLockFile, ScanResult } from '../types';
import { parseSkillMd } from './parser';

export interface AgentDiagnostic {
  agentId: string;
  displayName: string;
  globalPath: string;
  globalExists: boolean;
  subdirCount: number;
  validSkillCount: number;
}

export interface ScanDiagnostic {
  agents: AgentDiagnostic[];
  projectPaths: string[];
  issues: string[];
}

export class SkillScanner {
  private lockFileData: SkillLockFile | null = null;

  /** Check if a dirent is a directory, following symlinks */
  private isDirectoryEntry(dir: string, entry: fs.Dirent): boolean {
    if (entry.isDirectory()) { return true; }
    if (entry.isSymbolicLink()) {
      try { return fs.statSync(path.join(dir, entry.name)).isDirectory(); }
      catch { return false; }
    }
    return false;
  }

  private getAgentConfigs(): Array<AgentConfig & { resolvedGlobalDir: string }> {
    const config = vscode.workspace.getConfiguration('skills-sh');
    const pathOverrides = config.get<Record<string, string>>('agentPaths', {});
    const enabledAgents = config.get<string[]>('scanAgents', KNOWN_AGENTS.map(a => a.id));

    return KNOWN_AGENTS.filter(a => enabledAgents.includes(a.id)).map(agent => {
      let resolvedGlobalDir: string;
      if (agent.id === 'claude') {
        const override = config.get<string>('globalSkillsDir', '');
        if (override) {
          resolvedGlobalDir = override.replace(/^~/, os.homedir());
        } else {
          const envDir = process.env.CLAUDE_CONFIG_DIR;
          resolvedGlobalDir = envDir
            ? path.join(envDir, 'skills')
            : path.join(os.homedir(), agent.globalDir);
        }
      } else if (pathOverrides[agent.id]) {
        resolvedGlobalDir = pathOverrides[agent.id].replace(/^~/, os.homedir());
      } else {
        resolvedGlobalDir = path.join(os.homedir(), agent.globalDir);
      }
      return { ...agent, resolvedGlobalDir };
    });
  }

  /** Returns the Claude-specific global dir (backward compat) */
  getGlobalSkillsDir(): string {
    const config = vscode.workspace.getConfiguration('skills-sh');
    const override = config.get<string>('globalSkillsDir', '');
    if (override) {
      return override.replace(/^~/, os.homedir());
    }
    const envDir = process.env.CLAUDE_CONFIG_DIR;
    if (envDir) {
      return path.join(envDir, 'skills');
    }
    return path.join(os.homedir(), '.claude', 'skills');
  }

  /** Returns the Claude-specific project dir (backward compat) */
  getProjectSkillsDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, '.claude', 'skills');
  }

  /** Returns all global skill directories across all agents */
  getAllGlobalDirs(): string[] {
    return this.getAgentConfigs().map(a => a.resolvedGlobalDir);
  }

  /** Returns all project-level skill directories across all agents */
  getAllProjectDirs(): string[] {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) { return []; }
    const root = ws[0].uri.fsPath;
    return KNOWN_AGENTS.map(a => path.join(root, a.projectDir));
  }

  async scan(): Promise<ScanResult> {
    this.loadLockFile();
    const agents = this.getAgentConfigs();

    const globalResults = await Promise.all(
      agents.map(async agent => ({
        displayName: agent.displayName,
        skills: await this.scanDirectory(agent.resolvedGlobalDir, 'global'),
      })),
    );

    const ws = vscode.workspace.workspaceFolders;
    const root = ws?.[0]?.uri.fsPath;
    const projectResults = root
      ? await Promise.all(
          agents.map(async agent => ({
            displayName: agent.displayName,
            skills: await this.scanDirectory(path.join(root, agent.projectDir), 'project'),
          })),
        )
      : [];

    return {
      globalSkills: this.deduplicateSkills(globalResults),
      projectSkills: this.deduplicateSkills(projectResults),
    };
  }

  private deduplicateSkills(
    results: Array<{ displayName: string; skills: InstalledSkill[] }>,
  ): InstalledSkill[] {
    const map = new Map<string, InstalledSkill>();
    for (const { displayName, skills } of results) {
      for (const skill of skills) {
        const existing = map.get(skill.name);
        if (existing) {
          if (!existing.agents.includes(displayName)) {
            existing.agents.push(displayName);
          }
        } else {
          const canonical = path.join(os.homedir(), '.agents', 'skills', skill.name);
          const resolvedPath = fs.existsSync(canonical) ? canonical : skill.path;
          map.set(skill.name, { ...skill, path: resolvedPath, agents: [displayName] });
        }
      }
    }
    return Array.from(map.values());
  }

  private async scanDirectory(dir: string, scope: SkillScope): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];

    if (!fs.existsSync(dir)) {
      return skills;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return skills;
    }

    for (const entry of entries) {
      if (!this.isDirectoryEntry(dir, entry)) {
        continue;
      }

      const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
      const parsed = parseSkillMd(skillMdPath);
      if (!parsed) {
        continue;
      }

      const lockEntry = this.findLockEntry(parsed.name);

      skills.push({
        name: parsed.name,
        description: parsed.description,
        path: path.join(dir, entry.name),
        scope,
        metadata: parsed.metadata,
        source: lockEntry?.source,
        hash: lockEntry?.skillFolderHash,
        agents: [],
      });
    }

    return skills;
  }

  getDiagnostics(): ScanDiagnostic {
    const agentConfigs = this.getAgentConfigs();
    const issues: string[] = [];
    const agentDiagnostics: AgentDiagnostic[] = [];

    let anyDirExists = false;

    for (const agent of agentConfigs) {
      const dir = agent.resolvedGlobalDir;
      const exists = fs.existsSync(dir);
      let subdirCount = 0;
      let validSkillCount = 0;

      if (exists) {
        anyDirExists = true;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const subdirs = entries.filter(e => this.isDirectoryEntry(dir, e));
          subdirCount = subdirs.length;
          for (const entry of subdirs) {
            const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
            if (parseSkillMd(skillMdPath)) {
              validSkillCount++;
            }
          }
          if (subdirCount > 0 && validSkillCount === 0) {
            issues.push(
              `${agent.displayName}: found ${subdirCount} folder(s) in ${dir} but none contain a valid SKILL.md`,
            );
          }
        } catch {
          issues.push(`Cannot read ${agent.displayName} skills directory: ${dir}`);
        }
      }

      agentDiagnostics.push({
        agentId: agent.id,
        displayName: agent.displayName,
        globalPath: dir,
        globalExists: exists,
        subdirCount,
        validSkillCount,
      });
    }

    if (!anyDirExists) {
      issues.push('No agent skill directories found. Install skills via the Marketplace or npx skills add.');
    }

    const projectPaths = this.getAllProjectDirs();
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) {
      issues.push('No workspace open — project skills not scanned');
    }

    return {
      agents: agentDiagnostics,
      projectPaths,
      issues,
    };
  }

  private loadLockFile(): void {
    const lockPath = path.join(os.homedir(), '.agents', '.skill-lock.json');
    try {
      const content = fs.readFileSync(lockPath, 'utf-8');
      this.lockFileData = JSON.parse(content) as SkillLockFile;
    } catch {
      this.lockFileData = null;
    }
  }

  private findLockEntry(skillName: string) {
    if (!this.lockFileData?.skills) {
      return null;
    }
    return this.lockFileData.skills[skillName] ?? null;
  }
}

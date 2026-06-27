import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { InstalledSkill, SkillScope, SkillLockFile, LocalLockFile, ScanResult, WslSkillGroup } from '../types';
import { parseSkillMd, parseSkillMdAsync, parseSkillMdContent } from './parser';
import { getLog } from '../logger';
import { findLockEntryByFolder } from '../utils/lock-file';
import { getGlobalLockPath } from '../utils/constants';
import { KNOWN_AGENTS, KnownAgent } from './known-agents';
import { getRunningWslDistros, dumpWslSkills, parseWslDump } from './wsl';

export interface ScanDiagnostic {
  globalDirs: { path: string; exists: boolean; skillCount: number; agent?: string }[];
  projectDirs: string[];
  issues: string[];
}

interface AgentScanEntry {
  skill: InstalledSkill;
  agentDisplayName: string;
  isCanonical: boolean;
}

export class SkillScanner {
  private lockFileData: SkillLockFile | null = null;
  private localLockData: LocalLockFile | null = null;

  /** Check if a dirent is a directory, following symlinks */
  private async isDirectoryEntry(dir: string, entry: fs.Dirent): Promise<boolean> {
    if (entry.isDirectory()) { return true; }
    if (entry.isSymbolicLink()) {
      try { return (await fs.promises.stat(path.join(dir, entry.name))).isDirectory(); }
      catch { return false; }
    }
    return false;
  }

  /** Sync version for getDiagnostics() where sync I/O is acceptable */
  private isDirectoryEntrySync(dir: string, entry: fs.Dirent): boolean {
    if (entry.isDirectory()) { return true; }
    if (entry.isSymbolicLink()) {
      try { return fs.statSync(path.join(dir, entry.name)).isDirectory(); }
      catch { return false; }
    }
    return false;
  }

  /** Returns the active agents based on user configuration. */
  private getActiveAgents(): KnownAgent[] {
    const activeIds = vscode.workspace.getConfiguration('skills-sh')
      .get<string[]>('activeAgents');
    if (!activeIds || activeIds.length === 0) {
      return KNOWN_AGENTS;
    }
    const idSet = new Set(activeIds);
    return KNOWN_AGENTS.filter(a => idSet.has(a.id));
  }

  /** Resolve the global skill directory for a given agent. */
  private resolveGlobalDir(agent: KnownAgent): string {
    if (agent.envOverride) {
      const envDir = process.env[agent.envOverride];
      if (envDir) {
        return path.join(envDir, 'skills');
      }
    }
    return path.join(os.homedir(), agent.skillsDir);
  }

  /** Returns the Claude-specific global dir (used by update checker). */
  getGlobalSkillsDir(): string {
    const claude = KNOWN_AGENTS.find(a => a.id === 'claude-code');
    return claude ? this.resolveGlobalDir(claude) : path.join(os.homedir(), '.claude', 'skills');
  }

  /** Returns the Claude-specific project dir */
  getProjectSkillsDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, '.claude', 'skills');
  }

  /** Returns all global skill directories to watch for changes */
  getAllGlobalDirs(): string[] {
    return this.getActiveAgents().map(agent => this.resolveGlobalDir(agent));
  }

  /** Returns all project-level skill directories */
  getAllProjectDirs(): string[] {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) { return []; }
    const root = ws[0].uri.fsPath;
    return this.getActiveAgents().map(agent => path.join(root, agent.skillsDir));
  }

  async scan(): Promise<ScanResult> {
    await this.loadLockFile();
    await this.loadLocalLockFile();

    // -- Global skills: scan all active agent directories --
    const activeAgents = this.getActiveAgents();
    const globalEntries: AgentScanEntry[] = [];
    for (const agent of activeAgents) {
      const dir = this.resolveGlobalDir(agent);
      const skills = await this.scanDirectory(dir, 'global');
      for (const skill of skills) {
        globalEntries.push({
          skill,
          agentDisplayName: agent.displayName,
          isCanonical: agent.isCanonical === true,
        });
      }
    }
    const globalSkills = this.deduplicateAcrossAgents(globalEntries);

    // -- Project skills: scan all known agent project directories --
    const ws = vscode.workspace.workspaceFolders;
    const root = ws?.[0]?.uri.fsPath;
    let projectSkills: InstalledSkill[] = [];
    if (root) {
      const projectEntries: AgentScanEntry[] = [];
      for (const agent of activeAgents) {
        const dir = path.join(root, agent.skillsDir);
        const skills = await this.scanDirectory(dir, 'project');
        for (const skill of skills) {
          projectEntries.push({
            skill,
            agentDisplayName: agent.displayName,
            isCanonical: agent.isCanonical === true,
          });
        }
      }
      projectSkills = this.deduplicateAcrossAgents(projectEntries);
    }

    // -- WSL skills (Windows host only): scan running distros' homes --
    const wslGroups = await this.scanWsl(activeAgents);

    return { globalSkills, projectSkills, wslGroups: wslGroups.length > 0 ? wslGroups : undefined };
  }

  /**
   * Deduplicate skills found across multiple agent directories.
   * Same skill in multiple dirs → single entry with merged agents[].
   * Canonical (~/.agents/skills/) entry is preferred for metadata.
   */
  private deduplicateAcrossAgents(entries: AgentScanEntry[]): InstalledSkill[] {
    const map = new Map<string, {
      skill: InstalledSkill;
      agents: Set<string>;
      hasCanonical: boolean;
    }>();

    for (const { skill, agentDisplayName, isCanonical } of entries) {
      const existing = map.get(skill.folderName);

      if (!existing) {
        map.set(skill.folderName, {
          skill: { ...skill, agents: [] },
          agents: new Set([agentDisplayName]),
          hasCanonical: isCanonical,
        });
      } else {
        existing.agents.add(agentDisplayName);
        // Prefer canonical entry for metadata (path, source, hash, etc.)
        if (isCanonical && !existing.hasCanonical) {
          existing.skill = { ...skill, agents: [] };
          existing.hasCanonical = true;
        }
      }
    }

    return Array.from(map.values()).map(({ skill, agents }) => ({
      ...skill,
      agents: Array.from(agents).sort(),
    }));
  }

  private async scanDirectory(
    dir: string,
    scope: SkillScope,
    globalLock: SkillLockFile | null = this.lockFileData,
  ): Promise<InstalledSkill[]> {
    const log = getLog();
    const skills: InstalledSkill[] = [];

    try {
      await fs.promises.access(dir);
    } catch {
      return skills;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return skills;
    }

    log.info(`[scanner] Scanning ${dir} (${scope}): ${entries.length} entries`);

    for (const entry of entries) {
      if (!(await this.isDirectoryEntry(dir, entry))) {
        continue;
      }

      const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
      const parsed = await parseSkillMdAsync(skillMdPath);
      if (!parsed) {
        continue;
      }

      const lockEntry = this.findLockEntry(entry.name, globalLock);
      const isSymlink = entry.isSymbolicLink();
      log.info(`[scanner]   ${entry.name}: name="${parsed.name}" symlink=${isSymlink} lock=${lockEntry ? `found (source=${lockEntry.source})` : 'NOT FOUND'}`);

      skills.push({
        name: parsed.name,
        folderName: entry.name,
        description: parsed.description,
        path: path.join(dir, entry.name),
        scope,
        metadata: parsed.metadata,
        source: lockEntry?.source,
        hash: lockEntry?.skillFolderHash,
        skillPath: lockEntry?.skillPath,
        isCustom: !isSymlink && !lockEntry,
        agents: [],
      });
    }

    return skills;
  }

  getDiagnostics(): ScanDiagnostic {
    const issues: string[] = [];

    const globalDirs = this.getActiveAgents().map(agent => {
      const dir = this.resolveGlobalDir(agent);
      const exists = fs.existsSync(dir);
      let skillCount = 0;
      if (exists) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (this.isDirectoryEntrySync(dir, entry)) {
              const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
              if (parseSkillMd(skillMdPath)) { skillCount++; }
            }
          }
        } catch {
          issues.push(`Cannot read skills directory: ${dir}`);
        }
      }
      return { path: dir, exists, skillCount, agent: agent.displayName };
    });

    if (!globalDirs.some(d => d.exists)) {
      issues.push('No skill directories found. Install skills via the Marketplace or npx skills add.');
    }

    const projectDirs = this.getAllProjectDirs();
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) {
      issues.push('No workspace open — project skills not scanned');
    }

    return { globalDirs, projectDirs, issues };
  }

  private async loadLockFile(): Promise<void> {
    this.lockFileData = await this.readLockFile(getGlobalLockPath());
  }

  /** Read and parse a `.skill-lock.json` at an arbitrary path (e.g. a WSL distro's). */
  private async readLockFile(lockPath: string): Promise<SkillLockFile | null> {
    const log = getLog();
    try {
      const content = await fs.promises.readFile(lockPath, 'utf-8');
      const data = JSON.parse(content) as SkillLockFile;
      const keys = Object.keys(data?.skills ?? {});
      log.info(`[scanner] Lock file loaded (${lockPath}): ${keys.length} skills`);
      return data;
    } catch {
      log.warn(`[scanner] Lock file not found or unreadable: ${lockPath}`);
      return null;
    }
  }

  /** Whether WSL scanning is enabled (Windows-only feature; default on). */
  private isWslScanEnabled(): boolean {
    return vscode.workspace.getConfiguration('skills-sh').get<boolean>('scanWsl', true);
  }

  /**
   * Scan running WSL distros (Windows host only) for installed skills. Reads
   * each distro via `wsl.exe -e` (NOT the unreliable `\\wsl$` UNC share),
   * parsing the SKILL.md + lock-file dump. Returns one group per distro that
   * has any skills.
   */
  private async scanWsl(activeAgents: KnownAgent[]): Promise<WslSkillGroup[]> {
    if (process.platform !== 'win32' || !this.isWslScanEnabled()) {
      return [];
    }
    const distros = await getRunningWslDistros();
    const agentDirs = activeAgents.map(a => a.skillsDir);
    const agentByDir = new Map(activeAgents.map(a => [a.skillsDir, a] as const));
    const groups: WslSkillGroup[] = [];

    for (const distro of distros) {
      const dump = await dumpWslSkills(distro, agentDirs);
      if (!dump) { continue; }
      const parsed = parseWslDump(dump);

      let lock: SkillLockFile | null = null;
      if (parsed.lockJson) {
        try { lock = JSON.parse(parsed.lockJson) as SkillLockFile; } catch { lock = null; }
      }

      const entries: AgentScanEntry[] = [];
      for (const s of parsed.skills) {
        const md = parseSkillMdContent(s.content);
        if (!md) { continue; }
        const agent = agentByDir.get(s.agentDir);
        const lockEntry = findLockEntryByFolder(lock, s.folderName);
        // Display path (informational): the WSL UNC path. Not always reachable.
        const winPath = `\\\\wsl$\\${distro}${parsed.home.replace(/\//g, '\\')}\\`
          + `${s.agentDir.replace(/\//g, '\\')}\\${s.folderName}`;
        entries.push({
          skill: {
            name: md.name,
            folderName: s.folderName,
            description: md.description,
            path: winPath,
            scope: 'global',
            metadata: md.metadata,
            source: lockEntry?.source,
            hash: lockEntry?.skillFolderHash,
            skillPath: lockEntry?.skillPath,
            isCustom: !lockEntry,
            agents: [],
            origin: `wsl:${distro}`,
          },
          agentDisplayName: agent?.displayName ?? s.agentDir,
          isCanonical: agent?.isCanonical === true,
        });
      }

      const deduped = this.deduplicateAcrossAgents(entries);
      if (deduped.length > 0) {
        groups.push({ distro, skills: deduped });
      }
    }
    return groups;
  }

  /** Load project-level skills-lock.json (created by npx skills add without -g) */
  private async loadLocalLockFile(): Promise<void> {
    const log = getLog();
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) { this.localLockData = null; return; }
    const lockPath = path.join(ws[0].uri.fsPath, 'skills-lock.json');
    try {
      const content = await fs.promises.readFile(lockPath, 'utf-8');
      this.localLockData = JSON.parse(content) as LocalLockFile;
      const keys = Object.keys(this.localLockData?.skills ?? {});
      log.info(`[scanner] Local lock file loaded: ${keys.length} skills — [${keys.join(', ')}]`);
    } catch {
      this.localLockData = null;
    }
  }

  private findLockEntry(folderName: string, globalLock: SkillLockFile | null = this.lockFileData) {
    // Check global lock (~/.agents/.skill-lock.json) via shared utility
    const globalEntry = findLockEntryByFolder(globalLock, folderName);
    if (globalEntry) {
      return globalEntry;
    }

    // Check local lock (<project>/skills-lock.json) for project-scope installs
    if (this.localLockData?.skills?.[folderName]) {
      const local = this.localLockData.skills[folderName];
      return {
        source: local.source,
        sourceType: local.sourceType,
        skillFolderHash: local.computedHash,
      };
    }

    return null;
  }
}

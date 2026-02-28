import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { InstalledSkill, SkillScope, SkillLockFile, LocalLockFile, ScanResult } from '../types';
import { parseSkillMd, parseSkillMdAsync } from './parser';
import { getLog } from '../logger';
import { findLockEntryByFolder } from '../utils/lock-file';
import { getGlobalLockPath } from '../utils/constants';

// Part 6: Simplified diagnostic — no per-agent tracking
export interface ScanDiagnostic {
  globalDirs: { path: string; exists: boolean; skillCount: number }[];
  projectDirs: string[];
  issues: string[];
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

  /** Canonical global dir where all marketplace skills live as real files */
  private getCanonicalGlobalDir(): string {
    return path.join(os.homedir(), '.agents', 'skills');
  }

  /** Claude-specific global dir (may contain custom/manual skills) */
  private getClaudeGlobalDir(): string {
    const envDir = process.env.CLAUDE_CONFIG_DIR;
    if (envDir) {
      return path.join(envDir, 'skills');
    }
    return path.join(os.homedir(), '.claude', 'skills');
  }

  /** Returns the Claude-specific global dir (used by file watcher, update checker, etc.) */
  getGlobalSkillsDir(): string {
    return this.getClaudeGlobalDir();
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
    return [this.getCanonicalGlobalDir(), this.getClaudeGlobalDir()];
  }

  /** Returns all project-level skill directories */
  getAllProjectDirs(): string[] {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) { return []; }
    const root = ws[0].uri.fsPath;
    return [
      path.join(root, '.agents', 'skills'),
      path.join(root, '.claude', 'skills'),
    ];
  }

  async scan(): Promise<ScanResult> {
    await this.loadLockFile();
    await this.loadLocalLockFile();

    const canonicalDir = this.getCanonicalGlobalDir();
    const claudeDir = this.getClaudeGlobalDir();

    // Scan canonical dir first (all marketplace skills), then Claude dir (custom only)
    const canonicalSkills = await this.scanDirectory(canonicalDir, 'global');
    const claudeSkills = await this.scanDirectory(claudeDir, 'global');
    const globalSkills = this.deduplicateGlobal(canonicalSkills, claudeSkills);

    // Project scanning: canonical project dir + Claude project dir
    const ws = vscode.workspace.workspaceFolders;
    const root = ws?.[0]?.uri.fsPath;
    let projectSkills: InstalledSkill[] = [];
    if (root) {
      const projectCanonical = await this.scanDirectory(path.join(root, '.agents', 'skills'), 'project');
      const projectClaude = await this.scanDirectory(path.join(root, '.claude', 'skills'), 'project');
      projectSkills = this.deduplicateGlobal(projectCanonical, projectClaude);
    }

    return { globalSkills, projectSkills };
  }

  /**
   * Deduplicate skills found across canonical + Claude dirs.
   * Prefer canonical entry. Only include Claude entries that aren't
   * already present (those would be custom/manual skills).
   */
  private deduplicateGlobal(
    canonicalSkills: InstalledSkill[],
    claudeSkills: InstalledSkill[],
  ): InstalledSkill[] {
    const map = new Map<string, InstalledSkill>();

    // Add all canonical skills first (these are the source of truth)
    for (const skill of canonicalSkills) {
      map.set(skill.folderName, skill);
    }

    // Add Claude skills only if not already present (these would be custom/manual)
    for (const skill of claudeSkills) {
      if (!map.has(skill.folderName)) {
        map.set(skill.folderName, skill);
      }
    }

    return Array.from(map.values());
  }

  private async scanDirectory(dir: string, scope: SkillScope): Promise<InstalledSkill[]> {
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

      const lockEntry = this.findLockEntry(entry.name);
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
      });
    }

    return skills;
  }

  getDiagnostics(): ScanDiagnostic {
    const issues: string[] = [];
    const dirs = [
      this.getCanonicalGlobalDir(),
      this.getClaudeGlobalDir(),
    ];

    const globalDirs = dirs.map(dir => {
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
      return { path: dir, exists, skillCount };
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
    const log = getLog();
    const lockPath = getGlobalLockPath();
    try {
      const content = await fs.promises.readFile(lockPath, 'utf-8');
      this.lockFileData = JSON.parse(content) as SkillLockFile;
      const keys = Object.keys(this.lockFileData?.skills ?? {});
      log.info(`[scanner] Lock file loaded: ${keys.length} skills — [${keys.join(', ')}]`);
    } catch {
      log.warn('[scanner] Lock file not found or unreadable');
      this.lockFileData = null;
    }
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

  private findLockEntry(folderName: string) {
    // Check global lock (~/.agents/.skill-lock.json) via shared utility
    const globalEntry = findLockEntryByFolder(this.lockFileData, folderName);
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

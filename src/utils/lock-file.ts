import * as fs from 'fs';
import { SkillLockFile, SkillLockEntry } from '../types';
import { getGlobalLockPath } from './constants';

/** Find a lock entry by folder name (direct match, then skillPath fallback). */
export function findLockEntryByFolder(
  lockFile: SkillLockFile | null,
  folderName: string,
): SkillLockEntry | null {
  if (!lockFile?.skills) { return null; }

  // Direct key match
  if (lockFile.skills[folderName]) {
    return lockFile.skills[folderName];
  }

  // Fallback: match folder name against the folder portion of skillPath
  for (const entry of Object.values(lockFile.skills)) {
    if (entry.skillPath) {
      const parts = entry.skillPath.replace(/\/SKILL\.md$/i, '').split('/');
      if (parts[parts.length - 1] === folderName) {
        return entry;
      }
    }
  }

  return null;
}

/** Find the lock key string for a given folder name. */
export function findLockKey(
  lockFile: SkillLockFile | null,
  folderName: string,
): string | undefined {
  if (!lockFile?.skills) { return undefined; }

  if (lockFile.skills[folderName]) { return folderName; }

  for (const [key, entry] of Object.entries(lockFile.skills)) {
    if (entry.skillPath) {
      const parts = entry.skillPath.replace(/\/SKILL\.md$/i, '').split('/');
      if (parts[parts.length - 1] === folderName) { return key; }
    }
  }

  return undefined;
}

/** Remove a skill entry from the global lock file by folder name. */
export function removeLockEntryByFolder(
  folderName: string,
  log?: { info: (msg: string) => void },
): boolean {
  const lockPath = getGlobalLockPath();
  try {
    const content = fs.readFileSync(lockPath, 'utf-8');
    const lockFile = JSON.parse(content) as SkillLockFile;
    if (!lockFile?.skills) { return false; }

    const key = findLockKey(lockFile, folderName);
    if (!key) { return false; }

    delete lockFile.skills[key];
    fs.writeFileSync(lockPath, JSON.stringify(lockFile, null, 2), 'utf-8');
    log?.info(`[lock-file] removed lock entry "${key}"`);
    return true;
  } catch {
    return false;
  }
}

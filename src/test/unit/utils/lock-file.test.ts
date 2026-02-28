import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  findLockEntryByFolder,
  findLockKey,
  removeLockEntryByFolder,
} from '../../../utils/lock-file';
import { SkillLockFile } from '../../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LOCK_FILE: SkillLockFile = {
  version: 1,
  skills: {
    'react-best-practices': {
      source: 'vercel-labs/agent-skills',
      skillFolderHash: 'abc123',
      skillPath: 'skills/react-best-practices/SKILL.md',
    },
    'supabase-auth': {
      source: 'supabase-community/agent-skills',
      skillFolderHash: 'def456',
      skillPath: 'skills/supabase-auth/SKILL.md',
    },
    'custom-key': {
      source: 'owner/repo',
      skillFolderHash: 'ghi789',
      skillPath: 'skills/my-custom-skill/SKILL.md',
    },
  },
};

// ---------------------------------------------------------------------------
// findLockEntryByFolder
// ---------------------------------------------------------------------------

describe('findLockEntryByFolder', () => {
  it('returns entry for a direct key match', () => {
    const entry = findLockEntryByFolder(LOCK_FILE, 'react-best-practices');
    expect(entry).not.toBeNull();
    expect(entry!.source).toBe('vercel-labs/agent-skills');
  });

  it('falls back to skillPath folder match', () => {
    const entry = findLockEntryByFolder(LOCK_FILE, 'my-custom-skill');
    expect(entry).not.toBeNull();
    expect(entry!.source).toBe('owner/repo');
  });

  it('returns null for unknown folder', () => {
    expect(findLockEntryByFolder(LOCK_FILE, 'nonexistent')).toBeNull();
  });

  it('returns null for null lockFile', () => {
    expect(findLockEntryByFolder(null, 'anything')).toBeNull();
  });

  it('returns null for lockFile with no skills', () => {
    expect(findLockEntryByFolder({ version: 1, skills: {} } as any, 'anything')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findLockKey
// ---------------------------------------------------------------------------

describe('findLockKey', () => {
  it('returns the direct key when it matches', () => {
    expect(findLockKey(LOCK_FILE, 'supabase-auth')).toBe('supabase-auth');
  });

  it('returns the indirect key via skillPath match', () => {
    expect(findLockKey(LOCK_FILE, 'my-custom-skill')).toBe('custom-key');
  });

  it('returns undefined for unknown folder', () => {
    expect(findLockKey(LOCK_FILE, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined for null lockFile', () => {
    expect(findLockKey(null, 'anything')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// removeLockEntryByFolder
// ---------------------------------------------------------------------------

describe('removeLockEntryByFolder', () => {
  let tmpDir: string;
  let lockPath: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-file-test-'));
    const agentsDir = path.join(tmpDir, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    lockPath = path.join(agentsDir, '.skill-lock.json');

    // Redirect homedir so getGlobalLockPath() points to our tmpDir
    savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = savedEnv.HOME;
    process.env.USERPROFILE = savedEnv.USERPROFILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes a skill entry by direct key and writes back', () => {
    fs.writeFileSync(lockPath, JSON.stringify(LOCK_FILE, null, 2));
    const result = removeLockEntryByFolder('react-best-practices');
    expect(result).toBe(true);

    const updated = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(updated.skills['react-best-practices']).toBeUndefined();
    expect(updated.skills['supabase-auth']).toBeDefined();
  });

  it('removes a skill entry by skillPath fallback', () => {
    fs.writeFileSync(lockPath, JSON.stringify(LOCK_FILE, null, 2));
    const result = removeLockEntryByFolder('my-custom-skill');
    expect(result).toBe(true);

    const updated = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(updated.skills['custom-key']).toBeUndefined();
  });

  it('returns false when folder is not found', () => {
    fs.writeFileSync(lockPath, JSON.stringify(LOCK_FILE, null, 2));
    expect(removeLockEntryByFolder('nonexistent')).toBe(false);
  });

  it('returns false when lock file does not exist', () => {
    expect(removeLockEntryByFolder('anything')).toBe(false);
  });

  it('calls log.info when removing', () => {
    fs.writeFileSync(lockPath, JSON.stringify(LOCK_FILE, null, 2));
    const log = { info: (msg: string) => { log._msg = msg; }, _msg: '' };
    removeLockEntryByFolder('react-best-practices', log);
    expect(log._msg).toContain('react-best-practices');
  });
});

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import {
  SKILLS_SH_API,
  SKILLS_SH_BASE,
  GITHUB_RAW_BASE,
  GITHUB_API_BASE,
  BRANCH_FALLBACKS,
  getGlobalLockPath,
  getAgentsSkillsDir,
  CACHE_TTL_SEARCH,
  CACHE_TTL_GITHUB,
  CACHE_TTL_DETAIL,
  CACHE_TTL_AUDITS,
  CACHE_TTL_DOCS,
} from '../../../utils/constants';

describe('URL constants', () => {
  it('SKILLS_SH_API points to skills.sh API', () => {
    expect(SKILLS_SH_API).toBe('https://skills.sh/api');
  });

  it('SKILLS_SH_BASE points to skills.sh', () => {
    expect(SKILLS_SH_BASE).toBe('https://skills.sh');
  });

  it('GITHUB_RAW_BASE points to raw.githubusercontent.com', () => {
    expect(GITHUB_RAW_BASE).toBe('https://raw.githubusercontent.com');
  });

  it('GITHUB_API_BASE points to api.github.com', () => {
    expect(GITHUB_API_BASE).toBe('https://api.github.com');
  });
});

describe('BRANCH_FALLBACKS', () => {
  it('contains main and master in order', () => {
    expect(BRANCH_FALLBACKS).toEqual(['main', 'master']);
  });
});

describe('getGlobalLockPath', () => {
  it('returns path under homedir/.agents', () => {
    const result = getGlobalLockPath();
    expect(result).toBe(path.join(os.homedir(), '.agents', '.skill-lock.json'));
  });
});

describe('getAgentsSkillsDir', () => {
  it('returns path under homedir/.agents/skills', () => {
    const result = getAgentsSkillsDir();
    expect(result).toBe(path.join(os.homedir(), '.agents', 'skills'));
  });
});

describe('Cache TTL constants', () => {
  it('CACHE_TTL_SEARCH is 1 hour', () => {
    expect(CACHE_TTL_SEARCH).toBe(3600 * 1000);
  });

  it('CACHE_TTL_GITHUB is 1 hour', () => {
    expect(CACHE_TTL_GITHUB).toBe(3600 * 1000);
  });

  it('CACHE_TTL_DETAIL is 30 minutes', () => {
    expect(CACHE_TTL_DETAIL).toBe(1800 * 1000);
  });

  it('CACHE_TTL_AUDITS is 30 minutes', () => {
    expect(CACHE_TTL_AUDITS).toBe(1800 * 1000);
  });

  it('CACHE_TTL_DOCS is 1 hour', () => {
    expect(CACHE_TTL_DOCS).toBe(3600 * 1000);
  });

  it('all TTLs are positive numbers', () => {
    for (const ttl of [CACHE_TTL_SEARCH, CACHE_TTL_GITHUB, CACHE_TTL_DETAIL, CACHE_TTL_AUDITS, CACHE_TTL_DOCS]) {
      expect(ttl).toBeGreaterThan(0);
    }
  });
});

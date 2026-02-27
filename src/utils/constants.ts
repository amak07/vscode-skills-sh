import * as os from 'os';
import * as path from 'path';

// API base URLs
export const SKILLS_SH_API = 'https://skills.sh/api';
export const SKILLS_SH_BASE = 'https://skills.sh';
export const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
export const GITHUB_API_BASE = 'https://api.github.com';

// Git branch fallbacks for GitHub content fetching
export const BRANCH_FALLBACKS = ['main', 'master'] as const;

// Filesystem paths
export function getGlobalLockPath(): string {
  return path.join(os.homedir(), '.agents', '.skill-lock.json');
}

export function getAgentsSkillsDir(): string {
  return path.join(os.homedir(), '.agents', 'skills');
}

// Cache TTLs (milliseconds)
export const CACHE_TTL_SEARCH = 3600 * 1000;  // 1 hour (default, overridden by setting)
export const CACHE_TTL_GITHUB = 3600 * 1000;  // 1 hour
export const CACHE_TTL_DETAIL = 1800 * 1000;  // 30 minutes
export const CACHE_TTL_AUDITS = 1800 * 1000;  // 30 minutes
export const CACHE_TTL_DOCS   = 3600 * 1000;  // 1 hour

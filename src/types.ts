// === API Types: /api/search ===

export interface SearchSkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export interface SearchResponse {
  query: string;
  searchType: string;
  skills: SearchSkill[];
  count: number;
  duration_ms: number;
}

// === API Types: /api/skills/{view}/{page} ===

export interface LeaderboardSkill {
  source: string;
  skillId: string;
  name: string;
  installs: number;
  installsYesterday?: number;
  change?: number;
}

export interface LeaderboardResponse {
  skills: LeaderboardSkill[];
  total: number;
  hasMore: boolean;
  page: number;
}

export type LeaderboardView = 'all-time' | 'trending' | 'hot';

// === Update checking ===

export interface UpdateCheckResponse {
  updates: { name: string; source: string; newHash: string }[];
  errors: string[];
}

// === Detail page (scraped from RSC) ===

export interface SkillSecurityAudit {
  partner: string;   // "Gen Agent Trust Hub", "Socket", "Snyk"
  status: string;    // "Pass", "Warn", "Fail"
  url: string;       // full URL to security detail page on skills.sh
}

export interface SkillDetail {
  name: string;
  source: string;
  weeklyInstalls: string;
  firstSeen: string;
  repository: string;
  installCommand: string;
  perAgent: { agent: string; installs: string }[];
  skillMdHtml: string;
  githubStars?: string;
  securityAudits?: SkillSecurityAudit[];
}

// === Audits listing (scraped from /audits) ===

export interface SkillAuditResult {
  partner: string;   // "Gen Agent Trust Hub" | "Socket" | "Snyk"
  status: string;    // "Pass", "Warn", "Fail", "Safe", "Low", "Med", "High", "Critical"
  alertCount?: string;
}

export interface AuditListingSkill {
  name: string;
  source: string;
  skillId: string;
  audits: SkillAuditResult[];
}

export interface AuditListingResponse {
  skills: AuditListingSkill[];
  total: number;
}

// === Docs (scraped from /docs, /docs/cli, /docs/faq) ===

export type DocsPage = 'overview' | 'cli' | 'faq';

export interface DocsContent {
  page: DocsPage;
  title: string;
  html: string;
}

// === Local types ===

export type SkillScope = 'global' | 'project';

export interface AgentConfig {
  id: string;
  displayName: string;
  globalDir: string;
  projectDir: string;
}

// KNOWN_AGENTS removed in Part 6 — scanner now uses canonical dirs directly.
// Kept AgentConfig type above for potential future use.
// See: ~/.agents/skills/ (all marketplace skills) + ~/.claude/skills/ (custom skills)

export interface InstalledSkill {
  name: string;
  folderName: string;
  description: string;
  path: string;
  scope: SkillScope;
  metadata: Record<string, unknown>;
  source?: string;
  hash?: string;
  skillPath?: string; // e.g. "skills/react-email/SKILL.md" — from lock file
  isCustom: boolean; // true = regular directory (user-created), false = symlink (marketplace)
}

export interface ScanResult {
  globalSkills: InstalledSkill[];
  projectSkills: InstalledSkill[];
}

export interface SkillLockEntry {
  source: string;
  sourceType?: string;
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash: string;
  installedAt?: string;
  updatedAt?: string;
}

export interface SkillLockFile {
  version: number;
  skills: Record<string, SkillLockEntry>;
}

// === Local lock file (project-level skills-lock.json) ===

export interface LocalLockEntry {
  source: string;
  sourceType: string;
  computedHash: string;
}

export interface LocalLockFile {
  version: number;
  skills: Record<string, LocalLockEntry>;
}

// === Webview message types ===

export type WebviewCommand =
  | 'search'
  | 'leaderboard'
  | 'detail'
  | 'install'
  | 'update'
  | 'back'
  | 'changeTab'
  | 'categoryClick'
  | 'loadMore'
  | 'openExternal'
  | 'openCategorySettings'
  | 'addToManifest'
  | 'removeFromManifest'
  | 'installFromManifest'
  | 'uninstall'
  | 'audits'
  | 'docs'
  | 'ready';

export interface WebviewMessage {
  command: WebviewCommand;
  payload?: unknown;
}

export type ViewState = 'leaderboard' | 'search-results' | 'detail' | 'installed' | 'audits' | 'docs';

// === Project skills manifest (skills.json) ===

export interface SkillManifestEntry {
  source: string;      // GitHub owner/repo (e.g. "vercel-labs/agent-skills")
  skills: string[];    // Skill folder names within that source
}

export interface SkillManifest {
  skills: SkillManifestEntry[];
}

// === Installed tab (lightweight subset for webview) ===

export interface InstalledSkillCard {
  name: string;
  folderName: string;
  description: string;
  path: string;
  source?: string;
  scope: SkillScope;
  hasUpdate: boolean;
  isCustom: boolean;
  inManifest: boolean;
}

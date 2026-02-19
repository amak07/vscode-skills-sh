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

// === API Types: check-updates ===

export interface UpdateCheckRequest {
  skills: { name: string; source: string; skillFolderHash: string }[];
  forceRefresh?: boolean;
}

export interface UpdateCheckResponse {
  updates: { name: string; source: string; newHash: string }[];
  errors: string[];
}

// === Detail page (scraped from RSC) ===

export interface SkillDetail {
  name: string;
  source: string;
  weeklyInstalls: string;
  firstSeen: string;
  repository: string;
  installCommand: string;
  perAgent: { agent: string; installs: string }[];
  skillMdHtml: string;
}

// === Local types ===

export type SkillScope = 'global' | 'project';

export interface AgentConfig {
  id: string;
  displayName: string;
  globalDir: string;
  projectDir: string;
}

export const KNOWN_AGENTS: AgentConfig[] = [
  { id: 'claude',   displayName: 'Claude',   globalDir: '.claude/skills',           projectDir: '.claude/skills' },
  { id: 'cursor',   displayName: 'Cursor',   globalDir: '.cursor/skills',           projectDir: '.cursor/skills' },
  { id: 'windsurf', displayName: 'Windsurf', globalDir: '.codeium/windsurf/skills', projectDir: '.windsurf/skills' },
  { id: 'codex',    displayName: 'Codex',    globalDir: '.codex/skills',            projectDir: '.codex/skills' },
];

export interface InstalledSkill {
  name: string;
  folderName: string;
  description: string;
  path: string;
  scope: SkillScope;
  metadata: Record<string, unknown>;
  source?: string;
  hash?: string;
  agents: string[];
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
  | 'openCategorySettings';

export interface WebviewMessage {
  command: WebviewCommand;
  payload?: unknown;
}

export type ViewState = 'leaderboard' | 'search-results' | 'detail';

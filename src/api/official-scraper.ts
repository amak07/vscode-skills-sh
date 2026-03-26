import { OfficialListingResponse, OfficialOwner, OfficialRepo, OfficialSkill } from '../types';
import { ApiCache, SingleCache } from '../utils/api-cache';
import { SKILLS_SH_BASE, CACHE_TTL_OFFICIAL } from '../utils/constants';

const cache = new SingleCache<OfficialListingResponse>(CACHE_TTL_OFFICIAL);

export async function fetchOfficialListing(): Promise<OfficialListingResponse> {
  const hit = cache.get();
  if (hit) { return hit; }

  try {
    const response = await fetch(`${SKILLS_SH_BASE}/official`);
    if (!response.ok) {
      return { owners: [], total: 0 };
    }

    const html = await response.text();
    const owners = parseOfficialListing(html);
    const result: OfficialListingResponse = { owners, total: owners.length };

    cache.set(result);
    return result;
  } catch {
    return { owners: [], total: 0 };
  }
}

// ── Individual owner page ───────────────────────────────────────────

const ownerCache = new ApiCache<OfficialOwner>(CACHE_TTL_OFFICIAL);

/** Fetch fresh data from an individual owner page (e.g. skills.sh/anthropics). */
export async function fetchOfficialOwner(ownerName: string): Promise<OfficialOwner | null> {
  const hit = ownerCache.get(ownerName);
  if (hit) { return hit; }

  try {
    const response = await fetch(`${SKILLS_SH_BASE}/${encodeURIComponent(ownerName)}`);
    if (!response.ok) { return null; }

    const html = await response.text();
    const owner = parseOwnerPage(html, ownerName);
    if (owner) { ownerCache.set(ownerName, owner); }
    return owner;
  } catch {
    return null;
  }
}

/** Parse an individual owner page into an OfficialOwner.
 *
 *  Owner pages use RSC (React Server Components) and embed repo data as
 *  pre-rendered virtual DOM — NOT as raw JSON objects. We extract:
 *    - Repo names from link hrefs: `"href":"/owner/repo-name"`
 *    - Install counts from spans: `"font-mono text-sm text-foreground","children":"NNN"`
 *    - Skill counts from text: `[N," ","skills"]` or `[N," ","skill"]`
 */
function parseOwnerPage(html: string, ownerName: string): OfficialOwner | null {
  const searchHtml = html.indexOf('\\"') !== -1 ? html.replace(/\\"/g, '"') : html;
  const escapedOwner = ownerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Extract repo names from link hrefs
  const repoPattern = new RegExp(`"href":"\\/${escapedOwner}\\/([^"]+)"`, 'g');
  const repoNames: string[] = [];
  let m;
  while ((m = repoPattern.exec(searchHtml)) !== null) {
    repoNames.push(m[1]);
  }
  if (repoNames.length === 0) { return null; }

  // Extract install counts (human-readable, e.g. "697.4K", "285")
  const installPattern = /"font-mono text-sm text-foreground","children":"([\d,.]+K?)"/g;
  const installStrings: string[] = [];
  while ((m = installPattern.exec(searchHtml)) !== null) {
    installStrings.push(m[1]);
  }

  // Extract per-repo skill counts: [N," ","skills"] or [N," ","skill"]
  const skillCountPattern = /"children":\[(\d+)," ","skills?"/g;
  const skillCounts: number[] = [];
  while ((m = skillCountPattern.exec(searchHtml)) !== null) {
    skillCounts.push(parseInt(m[1], 10));
  }

  // Build repos — each array should be in the same order (sorted by installs desc)
  const repos: OfficialRepo[] = repoNames.map((name, i) => ({
    repo: `${ownerName}/${name}`,
    totalInstalls: parseHumanCount(installStrings[i] || '0'),
    skills: buildSkillPlaceholders(skillCounts[i] ?? 1),
  }));

  const totalInstalls = repos.reduce((sum, r) => sum + r.totalInstalls, 0);
  const skillCount = repos.reduce((sum, r) => sum + r.skills.length, 0);
  const featuredRepo = repos.length > 0 ? repos[0].repo.replace(/^[^/]+\//, '') : undefined;

  return { owner: ownerName, repos, totalInstalls, repoCount: repos.length, skillCount, featuredRepo };
}

/** Parse human-readable install count (e.g. "697.4K" → 697400, "285" → 285). */
function parseHumanCount(s: string): number {
  if (s.endsWith('K')) {
    return Math.round(parseFloat(s.slice(0, -1)) * 1000);
  }
  if (s.endsWith('M')) {
    return Math.round(parseFloat(s.slice(0, -1)) * 1_000_000);
  }
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}

/** Build placeholder skill entries when we only know the count (not individual names). */
function buildSkillPlaceholders(count: number): OfficialSkill[] {
  return Array.from({ length: count }, (_, i) => ({ name: `skill-${i + 1}`, installs: 0 }));
}

// ── Individual repo page ────────────────────────────────────────────

const repoCache = new ApiCache<OfficialRepo>(CACHE_TTL_OFFICIAL);

/** Fetch fresh data from an individual repo page (e.g. skills.sh/anthropics/skills). */
export async function fetchOfficialRepo(ownerName: string, repoName: string): Promise<OfficialRepo | null> {
  const key = `${ownerName}/${repoName}`;
  const hit = repoCache.get(key);
  if (hit) { return hit; }

  try {
    const response = await fetch(`${SKILLS_SH_BASE}/${encodeURIComponent(ownerName)}/${encodeURIComponent(repoName)}`);
    if (!response.ok) { return null; }

    const html = await response.text();
    const repo = parseRepoPage(html, ownerName, repoName);
    if (repo) { repoCache.set(key, repo); }
    return repo;
  } catch {
    return null;
  }
}

/** Parse a repo page RSC vdom to extract individual skill names and install counts.
 *
 *  Repo pages list skills as link rows. We extract:
 *    - Skill names from `"href":"/owner/repo/skill-name"` links
 *    - Install counts from spans: `"font-mono text-sm text-foreground","children":"NNN"`
 */
function parseRepoPage(html: string, ownerName: string, repoName: string): OfficialRepo | null {
  const searchHtml = html.indexOf('\\"') !== -1 ? html.replace(/\\"/g, '"') : html;
  const escapedPath = `${ownerName}/${repoName}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Extract skill names from links: "href":"/owner/repo/skill-name"
  const skillPattern = new RegExp(`"href":"\\/${escapedPath}\\/([^"]+)"`, 'g');
  const skillNames: string[] = [];
  let m;
  while ((m = skillPattern.exec(searchHtml)) !== null) {
    skillNames.push(m[1]);
  }
  if (skillNames.length === 0) { return null; }

  // Extract install counts from styled spans
  const installPattern = /"font-mono text-sm text-foreground","children":"([\d,.]+K?)"/g;
  const installStrings: string[] = [];
  while ((m = installPattern.exec(searchHtml)) !== null) {
    installStrings.push(m[1]);
  }

  const skills: OfficialSkill[] = skillNames.map((name, i) => ({
    name,
    installs: parseHumanCount(installStrings[i] || '0'),
  }));

  const totalInstalls = skills.reduce((sum, s) => sum + s.installs, 0);

  return {
    repo: `${ownerName}/${repoName}`,
    totalInstalls,
    skills,
  };
}

// ── Official listing ────────────────────────────────────────────────

function parseOfficialListing(html: string): OfficialOwner[] {
  // The /official page is a Next.js RSC page. Owner data is embedded in
  // self.__next_f.push() script blocks as serialized JSON containing an
  // "owners" array with the structure:
  //   { owner, repos: [{ repo, totalInstalls, skills: [{ name, installs }] }], totalInstalls, featuredRepo, featuredSkill }

  // Strategy: find the chunk containing "owners" and extract the JSON array
  // by matching balanced brackets (handles nested objects with brackets in values).
  // RSC payloads encode JSON inside JS string literals, so quotes appear as \"
  // in the raw HTML source. Normalize before parsing.
  const needsUnescape = html.indexOf('\\"owners\\"') !== -1;
  const searchHtml = needsUnescape ? html.replace(/\\"/g, '"') : html;

  const marker = searchHtml.indexOf('"owners"');
  if (marker === -1) {
    return parseOfficialFromHtml(html);
  }

  const arrayStart = searchHtml.indexOf('[', marker);
  if (arrayStart === -1) {
    return parseOfficialFromHtml(html);
  }

  const arrayJson = extractBalancedArray(searchHtml, arrayStart);
  if (!arrayJson) {
    return parseOfficialFromHtml(html);
  }

  try {
    const rawOwners = JSON.parse(arrayJson) as RawOwner[];
    return rawOwners.map(toOfficialOwner);
  } catch {
    return parseOfficialFromHtml(html);
  }
}

/** Extract a balanced [...] substring starting at the given position. */
function extractBalancedArray(text: string, start: number): string | null {
  if (text[start] !== '[') { return null; }
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) { continue; }
    if (ch === '[') { depth++; }
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

interface RawSkill { name: string; installs: number }
interface RawRepo { repo: string; totalInstalls: number; skills: RawSkill[] }
interface RawOwner {
  owner: string;
  repos: RawRepo[];
  totalInstalls: number;
  featuredRepo?: string;
  featuredSkill?: string;
}

function toOfficialOwner(raw: RawOwner): OfficialOwner {
  const repos: OfficialRepo[] = (raw.repos || []).map(r => ({
    repo: r.repo,
    totalInstalls: r.totalInstalls || 0,
    skills: (r.skills || []).map((s): OfficialSkill => ({
      name: s.name,
      installs: s.installs || 0,
    })),
  }));

  const skillCount = repos.reduce((sum, r) => sum + r.skills.length, 0);
  // featuredRepo: use the RSC field if present, otherwise fall back to the
  // short name of the first repo (the part after "owner/").
  const featuredRepo = raw.featuredRepo
    || (repos.length > 0 ? repos[0].repo.replace(/^[^/]+\//, '') : undefined);

  return {
    owner: raw.owner,
    repos,
    totalInstalls: raw.totalInstalls || 0,
    repoCount: repos.length,
    skillCount,
    featuredRepo,
  };
}

/** Fallback: parse from rendered HTML card structure if RSC payload changes. */
function parseOfficialFromHtml(html: string): OfficialOwner[] {
  const owners: OfficialOwner[] = [];

  // Cards link to /{owner} and contain the owner name, repo count, and skill count.
  const cardRegex = /<a[^>]*href="\/([^"\/]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const owner = match[1];
    const cardHtml = match[2];

    // Skip non-owner links (audits, docs, etc.)
    if (['official', 'audits', 'docs', 'api', '_next'].includes(owner)) { continue; }

    // The rendered page shows two numbers per card: repos count and skills count.
    const numbers = cardHtml.match(/(\d[\d,]*)/g);
    if (!numbers || numbers.length < 2) { continue; }

    const repoCount = parseInt(numbers[0].replace(/,/g, ''), 10);
    const skillCount = parseInt(numbers[1].replace(/,/g, ''), 10);

    owners.push({
      owner,
      repos: [],
      totalInstalls: 0,
      repoCount: repoCount || 0,
      skillCount: skillCount || 0,
    });
  }

  return owners;
}

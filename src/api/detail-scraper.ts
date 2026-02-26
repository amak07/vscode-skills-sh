import { SkillDetail, SkillSecurityAudit } from '../types';

interface CacheEntry {
  detail: SkillDetail;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1800 * 1000; // 30 minutes — detail data changes slowly

export async function fetchSkillDetail(
  owner: string,
  repo: string,
  skillId: string
): Promise<SkillDetail | null> {
  const cacheKey = `${owner}/${repo}/${skillId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.detail;
  }

  try {
    const url = `https://skills.sh/${owner}/${repo}/${skillId}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const detail = parseRenderedHtml(html, owner, repo, skillId);
    if (detail) {
      cache.set(cacheKey, { detail, timestamp: Date.now() });
    }
    return detail;
  } catch {
    return null;
  }
}

function parseRenderedHtml(
  html: string,
  owner: string,
  repo: string,
  skillId: string
): SkillDetail | null {
  try {
    // Weekly Installs: <span>Weekly Installs</span></div><div class="...">121.0K</div>
    const weeklyInstalls = extractPattern(
      html,
      /Weekly Installs<\/span><\/div><div[^>]*>([\d,.]+K?)<\/div>/
    ) || 'N/A';

    // First Seen: <span>First Seen</span></div><div class="...">Jan 16, 2026</div>
    const firstSeen = extractPattern(
      html,
      /First Seen<\/span><\/div><div[^>]*>([^<]+)<\/div>/
    ) || 'N/A';

    // GitHub Stars: <span>GitHub Stars</span></div><div ...><svg...>...</svg><span>6.8K</span></div>
    const githubStars = extractPattern(
      html,
      /GitHub Stars<\/span><\/div><div[^>]*>[\s\S]*?<span>([\d,.]+K?)<\/span><\/div>/
    ) || undefined;

    // Install command: npx skills add https://github.com/owner/repo --skill skillId
    const installCommand = extractPattern(html, /(npx skills add[^<"]+)/)
      || `npx skills add https://github.com/${owner}/${repo} --skill ${skillId}`;

    // Per-agent breakdown from the "Installed on" section
    const perAgent = extractPerAgentData(html);

    // SKILL.md rendered content from the prose div
    const skillMdHtml = extractSkillMdContent(html);

    // Security audit badges (Gen Agent Trust Hub, Socket, Snyk)
    const securityAudits = extractSecurityAudits(html);

    return {
      name: skillId,
      source: `${owner}/${repo}`,
      weeklyInstalls,
      firstSeen,
      repository: `${owner}/${repo}`,
      installCommand,
      perAgent,
      skillMdHtml,
      githubStars,
      securityAudits: securityAudits.length > 0 ? securityAudits : undefined,
    };
  } catch {
    return null;
  }
}

function extractPattern(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function extractPerAgentData(html: string): { agent: string; installs: string }[] {
  const agents: { agent: string; installs: string }[] = [];

  // Find the "Installed on" section, then extract agent rows
  // Each row: <span class="text-foreground">claude-code</span><span class="text-muted-foreground font-mono">74.8K</span>
  const installedSection = html.match(/Installed on[\s\S]*?<div class="divide-y[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  if (!installedSection) {
    return agents;
  }

  const section = installedSection[1];
  const rowRegex = /class="text-foreground">([^<]+)<\/span>[\s\S]*?font-mono">([^<]+)<\/span>/g;
  let match;
  while ((match = rowRegex.exec(section)) !== null) {
    agents.push({ agent: match[1].trim(), installs: match[2].trim() });
  }

  return agents;
}

function extractSecurityAudits(html: string): SkillSecurityAudit[] {
  const audits: SkillSecurityAudit[] = [];

  // The Security Audits section contains <a> links with partner name and status badge:
  //   <a ... href="/owner/repo/skill/security/partner-slug">
  //     <span class="...text-foreground...">Partner Name</span>
  //     <span class="...font-mono uppercase...bg-green-500/10 text-green-500">Pass</span>
  //   </a>
  const section = html.match(
    /Security Audits<\/div>\s*<div class="divide-y[^"]*">([\s\S]*?)<\/div>\s*<\/div>/
  );
  if (!section) {
    return audits;
  }

  const rowRegex = /href="([^"]*\/security\/[^"]*)"[\s\S]*?text-foreground[^>]*>([^<]+)<\/span>[\s\S]*?font-mono\s+uppercase[^>]*>([^<]+)<\/span>/g;
  let match;
  while ((match = rowRegex.exec(section[1])) !== null) {
    audits.push({
      partner: match[2].trim(),
      status: match[3].trim(),
      url: `https://skills.sh${match[1]}`,
    });
  }

  return audits;
}

function extractSkillMdContent(html: string): string {
  // The SKILL.md content is inside a div with class="prose prose-invert max-w-none ..."
  // The content column uses lg:col-span-9 and sidebar uses lg:col-span-3

  // Primary: capture prose content, stopping before the sidebar column (col-span-3)
  const proseMatch = html.match(/class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*col-span-3/);
  if (proseMatch) {
    return proseMatch[1];
  }

  // Fallback: stop before <aside> tag (older page layouts)
  const asideMatch = html.match(/class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<aside/);
  if (asideMatch) {
    return asideMatch[1];
  }

  // Last resort: stop before "Weekly Installs" sidebar section
  const weeklyMatch = html.match(/class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>[\s\S]*?(?=Weekly Installs<\/span>)/);
  if (weeklyMatch) {
    return weeklyMatch[1];
  }

  return '';
}

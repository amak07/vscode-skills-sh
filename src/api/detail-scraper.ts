import { SkillDetail, SkillSecurityAudit } from '../types';
import { ApiCache } from '../utils/api-cache';
import { SKILLS_SH_BASE, CACHE_TTL_DETAIL } from '../utils/constants';

const cache = new ApiCache<SkillDetail>(CACHE_TTL_DETAIL);

export async function fetchSkillDetail(
  owner: string,
  repo: string,
  skillId: string
): Promise<SkillDetail | null> {
  const cacheKey = `${owner}/${repo}/${skillId}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `${SKILLS_SH_BASE}/${owner}/${repo}/${skillId}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const detail = parseRenderedHtml(html, owner, repo, skillId);
    if (detail) {
      cache.set(cacheKey, detail);
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

    // Summary card content (prose inside the Summary section)
    const summaryHtml = extractSummaryContent(html);

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
      summaryHtml: summaryHtml || undefined,
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
      url: `${SKILLS_SH_BASE}${match[1]}`,
    });
  }

  return audits;
}

function extractSummaryContent(html: string): string {
  // Summary card: <div>Summary</div><div class="..."><div class="prose ...">CONTENT</div></div></div>
  const match = html.match(/Summary<\/div>\s*<div[^>]*>\s*<div class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  return match ? match[1] : '';
}

function extractSkillMdContent(html: string): string {
  // The SKILL.md content is inside a prose div that follows the "SKILL.md" label.
  // skills.sh also has a Summary card with its own prose div earlier in the page,
  // so we anchor to the SKILL.md label to avoid matching the wrong prose div.
  // The content column uses lg:col-span-9 and sidebar uses lg:col-span-3.

  // Primary: match the prose div after the "SKILL.md" label, stop before sidebar
  const skillMdMatch = html.match(/SKILL\.md<\/span><\/div>\s*<div class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*col-span-3/);
  if (skillMdMatch) {
    return skillMdMatch[1];
  }

  // Fallback: match prose after SKILL.md label, stop before <aside>
  const asideMatch = html.match(/SKILL\.md<\/span><\/div>\s*<div class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<aside/);
  if (asideMatch) {
    return asideMatch[1];
  }

  // Legacy fallback: first prose div before col-span-3 (pre-Summary card layouts)
  const legacyMatch = html.match(/class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*col-span-3/);
  if (legacyMatch) {
    return legacyMatch[1];
  }

  return '';
}

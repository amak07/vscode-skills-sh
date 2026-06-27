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
    // Installs: <span>Installs</span></div><div class="text-3xl ...">10.7K</div>
    // (skills.sh renamed this sidebar stat from "Weekly Installs" to total "Installs".)
    const installs = extractPattern(
      html,
      />Installs<\/span><\/div><div[^>]*>([\d,.]+[KM]?)<\/div>/
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

    // SKILL.md content: above-the-fold prose, plus the below-the-fold RSC chunk
    // when skills.sh has truncated the page behind a "Show more" button.
    const visible = extractSkillMdContent(html);
    const isTruncated = html.includes('>Show more</button>');
    const hidden = isTruncated ? extractHiddenReadmeChunk(html) : null;
    if (isTruncated && hidden === null) {
      // Page is truncated but no flight chunk was recovered — surfaces the
      // multi-chunk-split limitation or a skills.sh payload change in the field.
      console.warn(`[detail-scraper] truncated page but no RSC chunk recovered: ${owner}/${repo}/${skillId}`);
    }
    const skillMdHtml = visible + (hidden ?? '');

    // Security audit badges (Gen Agent Trust Hub, Socket, Snyk)
    const securityAudits = extractSecurityAudits(html);

    return {
      name: skillId,
      source: `${owner}/${repo}`,
      installs,
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
  // Anchor on the "SKILL.md" label (which appears after the Summary card's own
  // prose div), then capture the prose div content up to the first closing
  // </div>. skills.sh's current layout wraps the prose in an extra <div> and
  // appends a gradient + "Show more" button before the sidebar, so we no longer
  // anchor the end on the sidebar.
  //
  // Accepted tradeoff: markdown-rendered prose from skills.sh contains no <div>
  // elements, so the first </div> reliably closes the prose block. A SKILL.md
  // that embeds a raw <div> would be truncated at that div — not observed in
  // sampled skills. The below-the-fold remainder is recovered separately from
  // the RSC flight data (see extractHiddenReadmeChunk), so a truncated tail here
  // is also partially covered there on truncated pages.
  const primary = html.match(
    /SKILL\.md<\/span><\/div>[\s\S]*?<div class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>/
  );
  if (primary) {
    return primary[1];
  }

  // Legacy fallback: first prose div before the col-span-3 sidebar. Intentionally
  // un-anchored on the SKILL.md label to support old pre-Summary-card layouts;
  // only reached when the primary (anchored) match fails.
  const legacy = html.match(
    /class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*col-span-3/
  );
  if (legacy) {
    return legacy[1];
  }

  return '';
}

/**
 * Extract the below-the-fold SKILL.md content from the RSC flight data.
 *
 * skills.sh truncates the rendered prose and ships the remainder as a standalone
 * React Server Component text chunk pushed via `self.__next_f.push([1,"…"])`.
 * Each payload is a JS string; `JSON.parse` decodes the `<`/`\n`/`\"`
 * escapes. The readme remainder is the longest payload whose decoded body starts
 * with `<` (HTML) — distinct from JSON-LD `__html` blobs, which start with `{`.
 *
 * Known limitation: if the remainder is split across multiple text chunks, only
 * the largest is returned. Not observed in sampled skills.
 */
export function extractHiddenReadmeChunk(html: string): string | null {
  const PUSH = 'self.__next_f.push([1,';
  let idx = 0;
  let best: string | null = null;

  while ((idx = html.indexOf(PUSH, idx)) !== -1) {
    // The push's second argument is always a quoted JS string in Next.js RSC. If
    // the next non-space char isn't a quote, skip — avoids a runaway indexOf.
    const argStart = idx + PUSH.length;
    if (html[argStart] !== '"') {
      idx = argStart;
      continue;
    }
    const open = argStart;
    // Walk to the closing unescaped quote, respecting backslash escapes.
    let i = open + 1;
    let escaped = false;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { break; }
    }
    const token = html.slice(open, i + 1);
    idx = i + 1;

    let payload: string;
    try {
      payload = JSON.parse(token) as string;
    } catch {
      continue;
    }

    // Strip a leading RSC text-chunk prefix like "2a:T4ce6," (lowercase hex).
    const body = payload.replace(/^[0-9a-f]+:T[0-9a-f]+,/, '');
    if (body.trimStart().startsWith('<') && (best === null || body.length > best.length)) {
      best = body;
    }
  }

  return best;
}

import { SkillDetail } from '../types';

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

    // Install command: npx skills add https://github.com/owner/repo --skill skillId
    const installCommand = extractPattern(html, /(npx skills add[^<"]+)/)
      || `npx skills add https://github.com/${owner}/${repo} --skill ${skillId}`;

    // Per-agent breakdown from the "Installed on" section
    const perAgent = extractPerAgentData(html);

    // SKILL.md rendered content from the prose div
    const skillMdHtml = extractSkillMdContent(html);

    return {
      name: skillId,
      source: `${owner}/${repo}`,
      weeklyInstalls,
      firstSeen,
      repository: `${owner}/${repo}`,
      installCommand,
      perAgent,
      skillMdHtml,
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

function extractSkillMdContent(html: string): string {
  // The SKILL.md content is inside a div with class="prose prose-invert max-w-none ..."
  // Extract everything from the opening prose tag to the closing </div> before </aside> or </main>
  const proseMatch = html.match(/class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<aside/);
  if (proseMatch) {
    return proseMatch[1];
  }

  // Fallback: broader match
  const fallbackMatch = html.match(/class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/main>/);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }

  return '';
}

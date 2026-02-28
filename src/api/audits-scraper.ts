import { AuditListingResponse, AuditListingSkill, SkillAuditResult } from '../types';
import { SingleCache } from '../utils/api-cache';
import { SKILLS_SH_BASE, CACHE_TTL_AUDITS } from '../utils/constants';

const cache = new SingleCache<AuditListingResponse>(CACHE_TTL_AUDITS);

export async function fetchAuditListing(): Promise<AuditListingResponse> {
  const hit = cache.get();
  if (hit) {
    return hit;
  }

  try {
    const response = await fetch(`${SKILLS_SH_BASE}/audits`);
    if (!response.ok) {
      return { skills: [], total: 0 };
    }

    const html = await response.text();
    const skills = parseAuditListing(html);
    const result: AuditListingResponse = { skills, total: skills.length };

    cache.set(result);
    return result;
  } catch {
    return { skills: [], total: 0 };
  }
}

function parseAuditListing(html: string): AuditListingSkill[] {
  const skills: AuditListingSkill[] = [];

  // Each row is an <a> with grid layout and href like /owner/repo/skillId
  // Row structure:
  //   <a class="group grid ..." href="/owner/repo/skillId">
  //     <div class="...font-mono">rank</div>
  //     <div class="min-w-0">
  //       <h3 class="font-semibold text-foreground...">skillName</h3>
  //       <p class="...font-mono truncate">owner/repo</p>
  //     </div>
  //     <div><span class="...text-green-500...">Safe</span></div>
  //     <div><span class="...text-green-500...">0 alerts</span></div>
  //     <div><span class="...text-amber-500...">Med Risk</span></div>
  //   </a>
  const rowRegex = /<a[^>]*class="group grid[^"]*"[^>]*href="\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const href = match[1]; // "owner/repo/skillId"
    const rowHtml = match[2];

    const parts = href.split('/');
    if (parts.length < 3) { continue; }
    const source = `${parts[0]}/${parts[1]}`;
    const skillId = parts.slice(2).join('/');

    // Extract skill name
    const nameMatch = rowHtml.match(/<h3[^>]*>([^<]+)<\/h3>/);
    const name = nameMatch ? nameMatch[1].trim() : skillId;

    // Extract the 3 audit badge statuses by finding spans with color classes
    const audits = extractAuditBadges(rowHtml);

    skills.push({ name, source, skillId, audits });
  }

  return skills;
}

function extractAuditBadges(rowHtml: string): SkillAuditResult[] {
  const audits: SkillAuditResult[] = [];
  const partners = ['Gen Agent Trust Hub', 'Socket', 'Snyk'];

  // Find all badge spans with color classes and text content
  // Pattern: text-(green|amber|red)-500 bg-...-500/10">...SVG...</svg>Text</span>
  const badgeRegex = /text-(green|amber|red)-500\s+bg-\1-500\/10">[^]*?<\/svg>([^<]*)<\/span>/g;
  let match;
  let idx = 0;

  while ((match = badgeRegex.exec(rowHtml)) !== null && idx < 3) {
    const color = match[1]; // green, amber, red
    const text = match[2].trim();

    audits.push({
      partner: partners[idx] || `Partner ${idx + 1}`,
      status: text || colorToStatus(color),
      alertCount: text.includes('alert') ? text : undefined,
    });
    idx++;
  }

  return audits;
}

function colorToStatus(color: string): string {
  switch (color) {
    case 'green': return 'Pass';
    case 'amber': return 'Warn';
    case 'red': return 'Fail';
    default: return 'N/A';
  }
}

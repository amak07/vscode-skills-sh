import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { fetchAuditListing, computeAuditScore, buildAuditMap } from '../../../api/audits-scraper';
import { mockFetch, htmlResponse, errorResponse } from '../../helpers/fetch-mock';

// The audits-scraper has a 30-minute module-level cache.
// We use fake timers to expire it between tests.

function buildAuditsHtml(
  skills: Array<{
    href: string;
    name: string;
    source: string;
    rank: number;
    badges: Array<{ color: 'green' | 'amber' | 'red'; text: string }>;
  }>
): string {
  const rows = skills.map(s => {
    const badgeHtml = s.badges.map(b =>
      `<div><span class="inline-flex items-center text-${b.color}-500 bg-${b.color}-500/10">` +
      `<svg class="w-3 h-3"></svg>${b.text}</span></div>`
    ).join('\n');

    return `<a class="group grid grid-cols-6 items-center" href="/${s.href}">
  <div class="font-mono">${s.rank}</div>
  <div class="min-w-0">
    <h3 class="font-semibold text-foreground">${s.name}</h3>
    <p class="font-mono truncate">${s.source}</p>
  </div>
  ${badgeHtml}
</a>`;
  }).join('\n');

  return `<html><body><div class="audit-list">${rows}</div></body></html>`;
}

describe('fetchAuditListing', () => {
  // Install fake timers ONCE and keep them active across all tests.
  // Advancing 31+ min in afterEach expires the module-level cache
  // because the fake clock monotonically increases (no reset between tests).
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    // Advance past 30-min cache TTL to expire any cached data
    vi.advanceTimersByTime(31 * 60 * 1000);
  });

  // --- Error handling (test first, before any successful fetch populates cache) ---

  it('returns empty list on HTTP error', async () => {
    mockFetch({ 'skills.sh/audits': errorResponse(500) });
    const result = await fetchAuditListing();
    expect(result.skills).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty list when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await fetchAuditListing();
    expect(result.skills).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty list for empty HTML', async () => {
    mockFetch({ 'skills.sh/audits': htmlResponse('<html><body></body></html>') });
    const result = await fetchAuditListing();
    expect(result.skills).toEqual([]);
    expect(result.total).toBe(0);
  });

  // --- Parsing ---

  it('parses a single skill row with three audit badges', async () => {
    const html = buildAuditsHtml([{
      href: 'vercel-labs/agent-skills/react-best-practices',
      name: 'React Best Practices',
      source: 'vercel-labs/agent-skills',
      rank: 1,
      badges: [
        { color: 'green', text: 'Safe' },
        { color: 'green', text: '0 alerts' },
        { color: 'amber', text: 'Med Risk' },
      ],
    }]);
    mockFetch({ 'skills.sh/audits': htmlResponse(html) });

    const result = await fetchAuditListing();
    expect(result.skills).toHaveLength(1);
    expect(result.total).toBe(1);

    const skill = result.skills[0];
    expect(skill.name).toBe('React Best Practices');
    expect(skill.source).toBe('vercel-labs/agent-skills');
    expect(skill.skillId).toBe('react-best-practices');

    expect(skill.audits).toHaveLength(3);
    expect(skill.audits[0]).toEqual({ partner: 'Gen Agent Trust Hub', status: 'Safe', alertCount: undefined });
    expect(skill.audits[1]).toEqual({ partner: 'Socket', status: '0 alerts', alertCount: '0 alerts' });
    expect(skill.audits[2]).toEqual({ partner: 'Snyk', status: 'Med Risk', alertCount: undefined });
  });

  it('assigns correct partners in order', async () => {
    const html = buildAuditsHtml([{
      href: 'acme/repo/my-skill',
      name: 'My Skill',
      source: 'acme/repo',
      rank: 1,
      badges: [
        { color: 'green', text: 'Safe' },
        { color: 'amber', text: '3 alerts' },
        { color: 'red', text: 'High Risk' },
      ],
    }]);
    mockFetch({ 'skills.sh/audits': htmlResponse(html) });

    const result = await fetchAuditListing();
    const audits = result.skills[0].audits;
    expect(audits[0].partner).toBe('Gen Agent Trust Hub');
    expect(audits[0].status).toBe('Safe');
    expect(audits[1].partner).toBe('Socket');
    expect(audits[1].alertCount).toBe('3 alerts');
    expect(audits[2].partner).toBe('Snyk');
    expect(audits[2].status).toBe('High Risk');
  });

  it('parses multiple skill rows', async () => {
    const html = buildAuditsHtml([
      {
        href: 'org/repo/skill-a',
        name: 'Skill A',
        source: 'org/repo',
        rank: 1,
        badges: [
          { color: 'green', text: 'Safe' },
          { color: 'green', text: '0 alerts' },
          { color: 'green', text: 'Low' },
        ],
      },
      {
        href: 'other/repo/skill-b',
        name: 'Skill B',
        source: 'other/repo',
        rank: 2,
        badges: [
          { color: 'red', text: 'Unsafe' },
          { color: 'red', text: '5 alerts' },
          { color: 'red', text: 'Critical' },
        ],
      },
    ]);
    mockFetch({ 'skills.sh/audits': htmlResponse(html) });

    const result = await fetchAuditListing();
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].name).toBe('Skill A');
    expect(result.skills[1].name).toBe('Skill B');
    expect(result.skills[1].source).toBe('other/repo');
  });

  it('handles href with nested skill IDs', async () => {
    const html = buildAuditsHtml([{
      href: 'org/repo/sub/path',
      name: 'Nested Skill',
      source: 'org/repo',
      rank: 1,
      badges: [],
    }]);
    mockFetch({ 'skills.sh/audits': htmlResponse(html) });

    const result = await fetchAuditListing();
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].skillId).toBe('sub/path');
  });

  it('skips rows with fewer than 3 href parts', async () => {
    const html = `<html><body>
<a class="group grid grid-cols-6" href="/too-short">
  <div class="min-w-0"><h3 class="font-semibold text-foreground">Bad</h3></div>
</a>
<a class="group grid grid-cols-6" href="/org/repo/good-skill">
  <div class="min-w-0"><h3 class="font-semibold text-foreground">Good</h3></div>
</a>
</body></html>`;
    mockFetch({ 'skills.sh/audits': htmlResponse(html) });

    const result = await fetchAuditListing();
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('Good');
  });

  it('uses skillId as name when h3 is not found', async () => {
    const html = `<html><body>
<a class="group grid grid-cols-6" href="/org/repo/fallback-name">
  <div class="font-mono">1</div>
  <div class="min-w-0">
    <p class="font-mono truncate">org/repo</p>
  </div>
</a>
</body></html>`;
    mockFetch({ 'skills.sh/audits': htmlResponse(html) });

    const result = await fetchAuditListing();
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('fallback-name');
  });

  // --- Caching ---

  it('returns cached result on second call', async () => {
    const html = buildAuditsHtml([{
      href: 'org/repo/cached',
      name: 'Cached Skill',
      source: 'org/repo',
      rank: 1,
      badges: [],
    }]);
    const fetchFn = mockFetch({ 'skills.sh/audits': htmlResponse(html) });

    const first = await fetchAuditListing();
    const second = await fetchAuditListing();
    expect(second).toEqual(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ── computeAuditScore ─────────────────────────────────────────────────

describe('computeAuditScore', () => {
  it('returns "unknown" for empty audits', () => {
    expect(computeAuditScore([])).toBe('unknown');
  });

  it('returns "pass" when all partners pass', () => {
    expect(computeAuditScore([
      { partner: 'Gen Agent Trust Hub', status: 'Safe' },
      { partner: 'Socket', status: '0 alerts' },
      { partner: 'Snyk', status: 'Low Risk' },
    ])).toBe('pass');
  });

  it('returns "pass" for "Pass" status string', () => {
    expect(computeAuditScore([
      { partner: 'Gen Agent Trust Hub', status: 'Pass' },
    ])).toBe('pass');
  });

  it('returns "warn" when any partner has warn-level status', () => {
    expect(computeAuditScore([
      { partner: 'Gen Agent Trust Hub', status: 'Safe' },
      { partner: 'Socket', status: 'Med Risk' },
      { partner: 'Snyk', status: 'Pass' },
    ])).toBe('warn');
  });

  it('returns "warn" for unrecognized status strings', () => {
    expect(computeAuditScore([
      { partner: 'Gen Agent Trust Hub', status: 'Something New' },
    ])).toBe('warn');
  });

  it('returns "fail" when any partner has fail-level status', () => {
    expect(computeAuditScore([
      { partner: 'Gen Agent Trust Hub', status: 'Safe' },
      { partner: 'Socket', status: '0 alerts' },
      { partner: 'Snyk', status: 'Critical' },
    ])).toBe('fail');
  });

  it('returns "fail" for "High Risk" status', () => {
    expect(computeAuditScore([
      { partner: 'Snyk', status: 'High Risk' },
    ])).toBe('fail');
  });

  it('fail takes priority over warn', () => {
    expect(computeAuditScore([
      { partner: 'Gen Agent Trust Hub', status: 'Safe' },
      { partner: 'Socket', status: 'Med Risk' },
      { partner: 'Snyk', status: 'Fail' },
    ])).toBe('fail');
  });

  it('is case-insensitive', () => {
    expect(computeAuditScore([
      { partner: 'Test', status: 'SAFE' },
    ])).toBe('pass');
    expect(computeAuditScore([
      { partner: 'Test', status: 'CRITICAL' },
    ])).toBe('fail');
  });
});

// ── buildAuditMap ─────────────────────────────────────────────────────

describe('buildAuditMap', () => {
  it('builds a map keyed by skillId', () => {
    const listing = {
      skills: [
        {
          name: 'React Best Practices',
          source: 'vercel-labs/agent-skills',
          skillId: 'react-best-practices',
          audits: [
            { partner: 'Gen Agent Trust Hub', status: 'Safe' },
            { partner: 'Socket', status: '0 alerts' },
            { partner: 'Snyk', status: 'Low Risk' },
          ],
        },
        {
          name: 'Risky Skill',
          source: 'acme/repo',
          skillId: 'risky',
          audits: [
            { partner: 'Gen Agent Trust Hub', status: 'Safe' },
            { partner: 'Socket', status: '5 alerts', alertCount: '5 alerts' },
            { partner: 'Snyk', status: 'Critical' },
          ],
        },
      ],
      total: 2,
    };

    const map = buildAuditMap(listing);
    expect(map.size).toBe(2);

    const react = map.get('react-best-practices');
    expect(react).toBeDefined();
    expect(react!.score).toBe('pass');
    expect(react!.audits).toHaveLength(3);

    const risky = map.get('risky');
    expect(risky).toBeDefined();
    expect(risky!.score).toBe('fail');
  });

  it('returns empty map for empty listing', () => {
    const map = buildAuditMap({ skills: [], total: 0 });
    expect(map.size).toBe(0);
  });
});

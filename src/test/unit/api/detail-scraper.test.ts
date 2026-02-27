import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockFetch, htmlResponse, errorResponse } from '../../helpers/fetch-mock';

// The module caches results in a module-level Map, so we need a fresh import each test suite.
// We clear the cache by manipulating time or using unique owner/repo/skillId combos.

import { fetchSkillDetail } from '../../../api/detail-scraper';

// ---------------------------------------------------------------------------
// HTML fixtures — match the regex patterns the scraper actually uses
// ---------------------------------------------------------------------------

/** Minimal but complete detail page containing all extractable fields. */
function buildDetailHtml(opts: {
  weeklyInstalls?: string;
  firstSeen?: string;
  githubStars?: string;
  installCommand?: string;
  agents?: { name: string; installs: string }[];
  skillMdBody?: string;
  securityAudits?: { partner: string; status: string; slug: string }[];
} = {}): string {
  const weeklyInstalls = opts.weeklyInstalls ?? '121.0K';
  const firstSeen = opts.firstSeen ?? 'Jan 16, 2026';
  const githubStars = opts.githubStars ?? '6.8K';
  const installCommand = opts.installCommand ?? 'npx skills add https://github.com/acme/tools --skill my-skill';
  const agents = opts.agents ?? [
    { name: 'claude-code', installs: '74.8K' },
    { name: 'cursor', installs: '23.1K' },
  ];
  const skillMdBody = opts.skillMdBody ?? '<h1>My Skill</h1><p>Great skill.</p>';
  const securityAudits = opts.securityAudits ?? [];

  const agentRows = agents.map(a =>
    `<div class="flex"><span class="text-foreground">${a.name}</span><span class="text-muted-foreground font-mono">${a.installs}</span></div>`
  ).join('\n');

  const installedSection = agents.length > 0
    ? `Installed on<div class="divide-y divide-border">${agentRows}</div></div></div>`
    : '';

  const securitySection = securityAudits.length > 0
    ? `Security Audits</div><div class="divide-y divide-border">${securityAudits.map(a =>
        `<a class="flex" href="/acme/tools/my-skill/security/${a.slug}">` +
        `<span class="text-foreground">${a.partner}</span>` +
        `<span class="font-mono uppercase bg-green-500/10 text-green-500">${a.status}</span></a>`
      ).join('\n')}</div></div>`
    : '';

  return `<html><body>
<span>Weekly Installs</span></div><div class="stat-value">${weeklyInstalls}</div>
<span>First Seen</span></div><div class="stat-value">${firstSeen}</div>
<span>GitHub Stars</span></div><div class="sidebar-value"><svg class="icon"></svg><span>${githubStars}</span></div>
<code>${installCommand}</code>
${installedSection}
<div class="prose prose-invert max-w-none">${skillMdBody}</div></div></div><div class="col-span-3">sidebar</div>
${securitySection}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchSkillDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Successful parsing -------------------------------------------------

  it('extracts weekly installs from detail page', async () => {
    mockFetch({ 'skills.sh/acme/tools/my-skill': htmlResponse(buildDetailHtml({ weeklyInstalls: '42.5K' })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'my-skill');
    expect(detail).not.toBeNull();
    expect(detail!.weeklyInstalls).toBe('42.5K');
  });

  it('extracts first seen date', async () => {
    mockFetch({ 'skills.sh/acme/tools/first-seen': htmlResponse(buildDetailHtml({ firstSeen: 'Feb 03, 2026' })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'first-seen');
    expect(detail).not.toBeNull();
    expect(detail!.firstSeen).toBe('Feb 03, 2026');
  });

  it('extracts github stars', async () => {
    mockFetch({ 'skills.sh/acme/tools/stars': htmlResponse(buildDetailHtml({ githubStars: '12.3K' })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'stars');
    expect(detail).not.toBeNull();
    expect(detail!.githubStars).toBe('12.3K');
  });

  it('extracts install command', async () => {
    const cmd = 'npx skills add https://github.com/acme/tools --skill special';
    mockFetch({ 'skills.sh/acme/tools/cmd': htmlResponse(buildDetailHtml({ installCommand: cmd })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'cmd');
    expect(detail).not.toBeNull();
    expect(detail!.installCommand).toBe(cmd);
  });

  it('extracts per-agent data', async () => {
    mockFetch({
      'skills.sh/acme/tools/agents': htmlResponse(buildDetailHtml({
        agents: [
          { name: 'claude-code', installs: '50.0K' },
          { name: 'windsurf', installs: '10.0K' },
        ],
      })),
    });
    const detail = await fetchSkillDetail('acme', 'tools', 'agents');
    expect(detail).not.toBeNull();
    expect(detail!.perAgent).toHaveLength(2);
    expect(detail!.perAgent[0]).toEqual({ agent: 'claude-code', installs: '50.0K' });
    expect(detail!.perAgent[1]).toEqual({ agent: 'windsurf', installs: '10.0K' });
  });

  it('extracts SKILL.md HTML content (prose)', async () => {
    const body = '<h2>Usage</h2><p>Run this.</p>';
    mockFetch({ 'skills.sh/acme/tools/prose': htmlResponse(buildDetailHtml({ skillMdBody: body })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'prose');
    expect(detail).not.toBeNull();
    expect(detail!.skillMdHtml).toContain('<h2>Usage</h2>');
    expect(detail!.skillMdHtml).toContain('<p>Run this.</p>');
  });

  it('extracts security audits when present', async () => {
    mockFetch({
      'skills.sh/acme/tools/secure': htmlResponse(buildDetailHtml({
        securityAudits: [
          { partner: 'Gen Agent Trust Hub', status: 'Pass', slug: 'gen-agent-trust-hub' },
          { partner: 'Socket', status: 'Pass', slug: 'socket' },
        ],
      })),
    });
    const detail = await fetchSkillDetail('acme', 'tools', 'secure');
    expect(detail).not.toBeNull();
    expect(detail!.securityAudits).toHaveLength(2);
    expect(detail!.securityAudits![0].partner).toBe('Gen Agent Trust Hub');
    expect(detail!.securityAudits![0].status).toBe('Pass');
    expect(detail!.securityAudits![0].url).toContain('/security/gen-agent-trust-hub');
  });

  it('returns undefined securityAudits when none are present', async () => {
    mockFetch({ 'skills.sh/acme/tools/noaudit': htmlResponse(buildDetailHtml({ securityAudits: [] })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'noaudit');
    expect(detail).not.toBeNull();
    expect(detail!.securityAudits).toBeUndefined();
  });

  it('populates name, source, and repository fields', async () => {
    mockFetch({ 'skills.sh/org/repo/skill-x': htmlResponse(buildDetailHtml()) });
    const detail = await fetchSkillDetail('org', 'repo', 'skill-x');
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe('skill-x');
    expect(detail!.source).toBe('org/repo');
    expect(detail!.repository).toBe('org/repo');
  });

  // --- Empty / missing fields --------------------------------------------

  it('returns N/A for missing weekly installs', async () => {
    const html = '<html><body><div class="prose prose-invert max-w-none">body</div></div></div><div class="col-span-3">side</div></body></html>';
    mockFetch({ 'skills.sh/a/b/na': htmlResponse(html) });
    const detail = await fetchSkillDetail('a', 'b', 'na');
    expect(detail).not.toBeNull();
    expect(detail!.weeklyInstalls).toBe('N/A');
    expect(detail!.firstSeen).toBe('N/A');
  });

  it('returns empty array for per-agent when Installed on section is missing', async () => {
    const html = '<html><body><span>Weekly Installs</span></div><div class="v">10</div>' +
      '<span>First Seen</span></div><div class="v">Jan 01, 2026</div>' +
      '<div class="prose prose-invert max-w-none">hi</div></div></div><div class="col-span-3">side</div>' +
      '</body></html>';
    mockFetch({ 'skills.sh/a/b/noagents': htmlResponse(html) });
    const detail = await fetchSkillDetail('a', 'b', 'noagents');
    expect(detail).not.toBeNull();
    expect(detail!.perAgent).toEqual([]);
  });

  it('falls back to constructed install command when not found in HTML', async () => {
    // HTML with no npx skills add pattern
    const html = '<html><body>' +
      '<span>Weekly Installs</span></div><div class="v">5</div>' +
      '<span>First Seen</span></div><div class="v">Jan 01, 2026</div>' +
      '<div class="prose prose-invert max-w-none">content</div></div></div><div class="col-span-3">side</div>' +
      '</body></html>';
    mockFetch({ 'skills.sh/owner/repo/fallback-cmd': htmlResponse(html) });
    const detail = await fetchSkillDetail('owner', 'repo', 'fallback-cmd');
    expect(detail).not.toBeNull();
    expect(detail!.installCommand).toBe('npx skills add https://github.com/owner/repo --skill fallback-cmd');
  });

  // --- Error handling -----------------------------------------------------

  it('returns null on HTTP error', async () => {
    mockFetch({ 'skills.sh/a/b/err': errorResponse(500) });
    const detail = await fetchSkillDetail('a', 'b', 'err');
    expect(detail).toBeNull();
  });

  it('returns null on 404', async () => {
    mockFetch({ 'skills.sh/a/b/missing': errorResponse(404) });
    const detail = await fetchSkillDetail('a', 'b', 'missing');
    expect(detail).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const detail = await fetchSkillDetail('a', 'b', 'netfail');
    expect(detail).toBeNull();
  });

  // --- Caching ------------------------------------------------------------

  it('returns cached result on second call with same args', async () => {
    const fetchFn = mockFetch({ 'skills.sh/cache/test/cachetest': htmlResponse(buildDetailHtml()) });
    const first = await fetchSkillDetail('cache', 'test', 'cachetest');
    expect(first).not.toBeNull();

    const second = await fetchSkillDetail('cache', 'test', 'cachetest');
    expect(second).toEqual(first);
    // fetch should only have been called once
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

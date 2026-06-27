import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mockFetch, htmlResponse, errorResponse } from '../../helpers/fetch-mock';

// The module caches results in a module-level Map, so we need a fresh import each test suite.
// We clear the cache by manipulating time or using unique owner/repo/skillId combos.

import { fetchSkillDetail, extractHiddenReadmeChunk } from '../../../api/detail-scraper';

// ---------------------------------------------------------------------------
// HTML fixtures — match the regex patterns the scraper actually uses
// ---------------------------------------------------------------------------

/** Minimal but complete detail page containing all extractable fields. */
function buildDetailHtml(opts: {
  installs?: string;
  firstSeen?: string;
  githubStars?: string;
  installCommand?: string;
  agents?: { name: string; installs: string }[];
  skillMdBody?: string;
  summaryBody?: string;
  truncated?: boolean;
  hiddenChunkBody?: string;
  securityAudits?: { partner: string; status: string; slug: string }[];
} = {}): string {
  const installs = opts.installs ?? '121.0K';
  const firstSeen = opts.firstSeen ?? 'Jan 16, 2026';
  const githubStars = opts.githubStars ?? '6.8K';
  const installCommand = opts.installCommand ?? 'npx skills add https://github.com/acme/tools --skill my-skill';
  const agents = opts.agents ?? [
    { name: 'claude-code', installs: '74.8K' },
    { name: 'cursor', installs: '23.1K' },
  ];
  const skillMdBody = opts.skillMdBody ?? '<h1>My Skill</h1><p>Great skill.</p>';
  const summaryBody = opts.summaryBody ?? '<p><strong>Short summary.</strong></p>';
  const securityAudits = opts.securityAudits ?? [];
  const truncated = opts.truncated ?? false;
  const hiddenChunkBody = opts.hiddenChunkBody ?? '';

  // New skills.sh layout wraps the prose in an extra <div> and inserts a
  // gradient + "Show more" button between the prose and the sidebar.
  const skillMdBlock = truncated
    ? `<svg class="icon"></svg><span>SKILL.md</span></div><div><div class="prose prose-invert max-w-none">${skillMdBody}</div>` +
      `<div class="relative"><div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" aria-hidden="true"></div></div>` +
      `<button type="button" class="mt-4 w-full py-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Show more</button>` +
      `</div></div></div><div class=" lg:col-span-3">sidebar</div>`
    : `<svg class="icon"></svg><span>SKILL.md</span></div><div class="prose prose-invert max-w-none">${skillMdBody}</div></div></div><div class=" lg:col-span-3">sidebar</div>`;

  // The below-the-fold remainder ships as a standalone RSC text chunk.
  const chunkScripts = truncated && hiddenChunkBody
    ? `<script>self.__next_f.push([1,"2a:T100,"])</script>` +
      `<script>self.__next_f.push([1,${JSON.stringify(hiddenChunkBody)}])</script>`
    : '';

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
<span>Installs</span></div><div class="stat-value">${installs}</div>
<span>First Seen</span></div><div class="stat-value">${firstSeen}</div>
<span>GitHub Stars</span></div><div class="sidebar-value"><svg class="icon"></svg><span>${githubStars}</span></div>
<code>${installCommand}</code>
${installedSection}
<div class="summary-card"><div class="text-xs">Summary</div><div class="prose-wrapper"><div class="prose prose-invert max-w-none">${summaryBody}</div></div></div>
${skillMdBlock}
${securitySection}
${chunkScripts}
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

  it('extracts the installs count from detail page', async () => {
    mockFetch({ 'skills.sh/acme/tools/my-skill': htmlResponse(buildDetailHtml({ installs: '42.5K' })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'my-skill');
    expect(detail).not.toBeNull();
    expect(detail!.installs).toBe('42.5K');
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

  it('extracts above-the-fold SKILL.md prose on the new (truncated) layout', async () => {
    // Isolate above-the-fold extraction: a truncated page (Show more present) but
    // no flight chunk, so skillMdHtml must equal the visible prose body exactly —
    // even after Task 2 wires in the chunk concat (no chunk → nothing appended).
    const body = '<h2>When to Use</h2><p>Visible part.</p><h3>1. Why Monorepos?</h3>';
    mockFetch({ 'skills.sh/acme/tools/newlayout': htmlResponse(buildDetailHtml({ truncated: true, skillMdBody: body })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'newlayout');
    expect(detail).not.toBeNull();
    expect(detail!.skillMdHtml).toContain('<h2>When to Use</h2>');
    expect(detail!.skillMdHtml).toContain('<h3>1. Why Monorepos?</h3>');
    // Must stop at the prose div close — no below-the-fold gradient / "Show more"
    // button or sidebar bleed. Exact-equality makes this a true regression guard:
    // the pre-fix extractor fell through to the legacy fallback and returned the
    // gradient + Show more + sidebar markup (verified red).
    expect(detail!.skillMdHtml).toBe(body);
  });

  it('captures full SKILL.md (above + below fold) from a real skills.sh page', async () => {
    const fixture = readFileSync(
      join(process.cwd(), 'src/test/fixtures/detail-monorepo-management.html'),
      'utf8'
    );
    mockFetch({ 'skills.sh/wshobson/agents/monorepo-management': htmlResponse(fixture) });
    const detail = await fetchSkillDetail('wshobson', 'agents', 'monorepo-management');
    expect(detail).not.toBeNull();
    expect(detail!.skillMdHtml).toContain('Why Monorepos?');   // above the fold (visible prose)
    expect(detail!.skillMdHtml).toContain('Common Pitfalls');  // below the fold (RSC chunk)
    expect(detail!.skillMdHtml).toContain('Best Practices');   // below the fold
    // skills.sh's sidebar "Installs" stat (renamed from "Weekly Installs").
    expect(detail!.installs).toBe('10.7K');
  });

  it('appends the hidden RSC chunk to the visible prose when truncated', async () => {
    const body = '<h3>1. Why Monorepos?</h3>';
    const hidden = '<p><strong>Advantages:</strong></p><h2>Common Pitfalls</h2><p>Circular deps.</p>';
    mockFetch({ 'skills.sh/acme/tools/full': htmlResponse(buildDetailHtml({ truncated: true, skillMdBody: body, hiddenChunkBody: hidden })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'full');
    expect(detail).not.toBeNull();
    expect(detail!.skillMdHtml).toContain('<h3>1. Why Monorepos?</h3>'); // above the fold
    expect(detail!.skillMdHtml).toContain('<h2>Common Pitfalls</h2>');    // below the fold
  });

  it('does not append a chunk when the page is not truncated', async () => {
    // A stray HTML push exists but there is no Show more button.
    const stray = '<script>self.__next_f.push([1,"<p>unrelated chunk body that is long</p>"])</script>';
    let html = buildDetailHtml({ skillMdBody: '<h2>Short</h2><p>All visible.</p>' });
    html = html.replace('</body>', stray + '</body>');
    mockFetch({ 'skills.sh/acme/tools/short': htmlResponse(html) });
    const detail = await fetchSkillDetail('acme', 'tools', 'short');
    expect(detail).not.toBeNull();
    expect(detail!.skillMdHtml).toContain('<h2>Short</h2>');
    expect(detail!.skillMdHtml).not.toContain('unrelated chunk body');
  });

  it('extracts SKILL.md HTML content (prose)', async () => {
    const body = '<h2>Usage</h2><p>Run this.</p>';
    mockFetch({ 'skills.sh/acme/tools/prose': htmlResponse(buildDetailHtml({ skillMdBody: body })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'prose');
    expect(detail).not.toBeNull();
    expect(detail!.skillMdHtml).toContain('<h2>Usage</h2>');
    expect(detail!.skillMdHtml).toContain('<p>Run this.</p>');
  });

  it('extracts summary card content', async () => {
    const summary = '<p><strong>A great tool.</strong></p><ul><li>Feature one</li></ul>';
    mockFetch({ 'skills.sh/acme/tools/summary': htmlResponse(buildDetailHtml({ summaryBody: summary })) });
    const detail = await fetchSkillDetail('acme', 'tools', 'summary');
    expect(detail).not.toBeNull();
    expect(detail!.summaryHtml).toContain('<strong>A great tool.</strong>');
    expect(detail!.summaryHtml).toContain('<li>Feature one</li>');
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

  it('returns N/A for missing installs count', async () => {
    const html = '<html><body><div class="prose prose-invert max-w-none">body</div></div></div><div class="col-span-3">side</div></body></html>';
    mockFetch({ 'skills.sh/a/b/na': htmlResponse(html) });
    const detail = await fetchSkillDetail('a', 'b', 'na');
    expect(detail).not.toBeNull();
    expect(detail!.installs).toBe('N/A');
    expect(detail!.firstSeen).toBe('N/A');
  });

  it('returns empty array for per-agent when Installed on section is missing', async () => {
    const html = '<html><body><span>Installs</span></div><div class="v">10</div>' +
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
      '<span>Installs</span></div><div class="v">5</div>' +
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

describe('extractHiddenReadmeChunk', () => {
  it('decodes the longest HTML push and strips the RSC text-chunk prefix', () => {
    const html =
      '<script>self.__next_f.push([1,"2a:T100,"])</script>' +
      '<script>self.__next_f.push([1,"2a:T100,\\u003ch2\\u003eHidden\\u003c/h2\\u003e\\n\\u003cp\\u003eBody.\\u003c/p\\u003e"])</script>' +
      '<script>self.__next_f.push([1,"{\\"@context\\":\\"https://schema.org\\"}"])</script>';
    const out = extractHiddenReadmeChunk(html);
    expect(out).toBe('<h2>Hidden</h2>\n<p>Body.</p>');
  });

  it('returns null when no HTML payload qualifies', () => {
    const html = '<script>self.__next_f.push([1,"{\\"a\\":1}"])</script>';
    expect(extractHiddenReadmeChunk(html)).toBeNull();
  });

  it('returns the longest HTML payload when several compete', () => {
    const html =
      '<script>self.__next_f.push([1,"<p>short</p>"])</script>' +
      '<script>self.__next_f.push([1,"<h2>the longer below-the-fold readme body</h2>"])</script>' +
      '<script>self.__next_f.push([1,"<p>mid</p>"])</script>';
    expect(extractHiddenReadmeChunk(html)).toBe('<h2>the longer below-the-fold readme body</h2>');
  });

  it('ignores a non-string push argument without latching onto a later quote', () => {
    const html =
      '<script>self.__next_f.push([1,42])</script>' +
      '<script>self.__next_f.push([1,"<p>real body</p>"])</script>';
    expect(extractHiddenReadmeChunk(html)).toBe('<p>real body</p>');
  });
});

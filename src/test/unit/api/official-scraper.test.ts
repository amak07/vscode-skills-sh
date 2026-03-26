import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { fetchOfficialListing, fetchOfficialOwner, fetchOfficialRepo } from '../../../api/official-scraper';
import { mockFetch, htmlResponse, errorResponse } from '../../helpers/fetch-mock';

// ── Test fixtures ────────────────────────────────────────────────────

/** Build a mock /official page with RSC-style embedded JSON data. */
function buildOfficialRscHtml(owners: Array<{
  owner: string;
  repos: Array<{
    repo: string;
    totalInstalls: number;
    skills: Array<{ name: string; installs: number }>;
  }>;
  totalInstalls: number;
}>): string {
  // The real page has "owners":[...] in the raw HTML as part of RSC JSON.
  // The parser looks for the literal string "owners" followed by a balanced JSON array.
  const ownersJson = JSON.stringify(owners);
  return `<html><body>
<script>self.__next_f.push([1,"data":{"owners":${ownersJson},"meta":"foo"}])</script>
</body></html>`;
}

/** Build a mock /official page with only rendered HTML cards (no RSC payload). */
function buildOfficialCardsHtml(owners: Array<{
  owner: string;
  repoCount: number;
  totalInstalls: number;
}>): string {
  const cards = owners.map(o =>
    `<a href="/${o.owner}" class="card"><span>${o.repoCount}</span><span>${o.totalInstalls.toLocaleString()}</span></a>`
  ).join('\n');
  return `<html><body>
<a href="/official">Official</a>
<a href="/audits">Audits</a>
${cards}
</body></html>`;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('fetchOfficialListing', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    // Advance past 30-min cache TTL
    vi.advanceTimersByTime(31 * 60 * 1000);
  });

  // --- Error handling ---

  it('returns empty list on HTTP error', async () => {
    mockFetch({ 'skills.sh/official': errorResponse(500) });
    const result = await fetchOfficialListing();
    expect(result.owners).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty list on network error', async () => {
    mockFetch({
      'skills.sh/official': () => { throw new Error('Network error'); },
    });
    const result = await fetchOfficialListing();
    expect(result.owners).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty list when page has no owner data', async () => {
    mockFetch({ 'skills.sh/official': htmlResponse('<html><body>No data</body></html>') });
    const result = await fetchOfficialListing();
    expect(result.owners).toEqual([]);
    expect(result.total).toBe(0);
  });

  // --- RSC parsing ---

  it('parses RSC payload with single owner', async () => {
    const html = buildOfficialRscHtml([{
      owner: 'anthropics',
      repos: [{
        repo: 'anthropics/skills',
        totalInstalls: 500,
        skills: [
          { name: 'frontend-design', installs: 300 },
          { name: 'claude-api', installs: 200 },
        ],
      }],
      totalInstalls: 500,
    }]);
    mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result = await fetchOfficialListing();
    expect(result.total).toBe(1);
    expect(result.owners).toHaveLength(1);

    const owner = result.owners[0];
    expect(owner.owner).toBe('anthropics');
    expect(owner.totalInstalls).toBe(500);
    expect(owner.repoCount).toBe(1);
    expect(owner.repos).toHaveLength(1);
    expect(owner.repos[0].repo).toBe('anthropics/skills');
    expect(owner.repos[0].skills).toHaveLength(2);
    expect(owner.repos[0].skills[0]).toEqual({ name: 'frontend-design', installs: 300 });
  });

  it('parses RSC payload with multiple owners and repos', async () => {
    const html = buildOfficialRscHtml([
      {
        owner: 'vercel-labs',
        repos: [
          {
            repo: 'vercel-labs/agent-skills',
            totalInstalls: 1000,
            skills: [{ name: 'next-intl', installs: 1000 }],
          },
          {
            repo: 'vercel-labs/other-repo',
            totalInstalls: 200,
            skills: [{ name: 'some-skill', installs: 200 }],
          },
        ],
        totalInstalls: 1200,
      },
      {
        owner: 'microsoft',
        repos: [{
          repo: 'microsoft/skills',
          totalInstalls: 800,
          skills: [{ name: 'typescript', installs: 800 }],
        }],
        totalInstalls: 800,
      },
    ]);
    mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result = await fetchOfficialListing();
    expect(result.total).toBe(2);
    expect(result.owners[0].owner).toBe('vercel-labs');
    expect(result.owners[0].repoCount).toBe(2);
    expect(result.owners[1].owner).toBe('microsoft');
    expect(result.owners[1].repoCount).toBe(1);
  });

  it('handles owners with empty repos array', async () => {
    const html = buildOfficialRscHtml([{
      owner: 'empty-org',
      repos: [],
      totalInstalls: 0,
    }]);
    mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result = await fetchOfficialListing();
    expect(result.total).toBe(1);
    expect(result.owners[0].repos).toEqual([]);
    expect(result.owners[0].repoCount).toBe(0);
  });

  // --- HTML fallback parsing ---

  it('falls back to HTML card parsing when RSC payload is absent', async () => {
    const html = buildOfficialCardsHtml([
      { owner: 'anthropics', repoCount: 11, totalInstalls: 256 },
      { owner: 'microsoft', repoCount: 23, totalInstalls: 630 },
    ]);
    mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result = await fetchOfficialListing();
    expect(result.total).toBe(2);
    expect(result.owners[0].owner).toBe('anthropics');
    expect(result.owners[0].repoCount).toBe(11);
    // Fallback parses the two visible columns: repos and skills (not installs)
    expect(result.owners[0].skillCount).toBe(256);
    expect(result.owners[0].totalInstalls).toBe(0);
    expect(result.owners[0].repos).toEqual([]);
  });

  it('skips nav links (official, audits, docs) in HTML fallback', async () => {
    const html = buildOfficialCardsHtml([
      { owner: 'anthropics', repoCount: 11, totalInstalls: 256 },
    ]);
    mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result = await fetchOfficialListing();
    // Should only have 'anthropics', not 'official', 'audits'
    const ownerNames = result.owners.map(o => o.owner);
    expect(ownerNames).not.toContain('official');
    expect(ownerNames).not.toContain('audits');
    expect(ownerNames).toContain('anthropics');
  });

  // --- Caching ---

  it('serves from cache on second call within TTL', async () => {
    const html = buildOfficialRscHtml([{
      owner: 'cached-org',
      repos: [],
      totalInstalls: 42,
    }]);
    const fetchMock = mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result1 = await fetchOfficialListing();
    const result2 = await fetchOfficialListing();

    expect(result1.total).toBe(1);
    expect(result2.total).toBe(1);
    // Only one fetch call — second served from cache
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after cache expires', async () => {
    const html = buildOfficialRscHtml([{
      owner: 'org-v1',
      repos: [],
      totalInstalls: 10,
    }]);
    const fetchMock = mockFetch({ 'skills.sh/official': htmlResponse(html) });

    await fetchOfficialListing();
    // Expire cache
    vi.advanceTimersByTime(31 * 60 * 1000);
    await fetchOfficialListing();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // --- RSC payload with special characters ---

  // --- Escaped RSC payload (real-world format) ---

  it('parses RSC payload with escaped quotes (real-world format)', async () => {
    // Real Next.js RSC pages embed JSON inside JS string literals,
    // so all quotes appear as \" in the raw HTML source.
    const ownersJson = JSON.stringify([{
      owner: 'anthropics',
      repos: [{
        repo: 'anthropics/skills',
        totalInstalls: 500,
        skills: [{ name: 'frontend-design', installs: 300 }],
      }],
      totalInstalls: 500,
    }]);
    // Escape quotes to simulate real RSC payload
    const escaped = ownersJson.replace(/"/g, '\\"');
    const html = `<html><body><script>self.__next_f.push([1,"data\\":{\\"owners\\":${escaped}}"])</script></body></html>`;
    mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result = await fetchOfficialListing();
    expect(result.total).toBe(1);
    expect(result.owners[0].owner).toBe('anthropics');
    expect(result.owners[0].repoCount).toBe(1);
    expect(result.owners[0].skillCount).toBe(1);
    expect(result.owners[0].repos[0].skills[0].name).toBe('frontend-design');
  });

  it('handles skill names with special characters', async () => {
    const html = buildOfficialRscHtml([{
      owner: 'test-org',
      repos: [{
        repo: 'test-org/skills',
        totalInstalls: 100,
        skills: [{ name: 'skill-with-dashes-and_underscores', installs: 100 }],
      }],
      totalInstalls: 100,
    }]);
    mockFetch({ 'skills.sh/official': htmlResponse(html) });

    const result = await fetchOfficialListing();
    expect(result.owners[0].repos[0].skills[0].name).toBe('skill-with-dashes-and_underscores');
  });
});

// ── fetchOfficialOwner ──────────────────────────────────────────────

/** Build a mock /{owner} page with RSC-embedded repos JSON. */
/** Build a mock owner page with RSC virtual DOM format (matches real site structure). */
function buildOwnerPageHtml(ownerName: string, repos: Array<{
  repo: string;
  totalInstalls: number;
  skills: Array<{ name: string; installs: number }>;
}>): string {
  // Generate RSC vdom entries for each repo row
  const rows = repos.map(r => {
    const repoShort = r.repo.split('/')[1];
    const skillCount = r.skills.length;
    const installStr = formatHumanCount(r.totalInstalls);
    const skillNames = r.skills.map(s => s.name).join(', ');
    return `["$","$L4","${repoShort}",{"href":"/${r.repo}","className":"group grid","children":[["$","div",null,{"className":"min-w-0","children":[["$","h3",null,{"className":"font-semibold","children":"${repoShort}"}],["$","p",null,{"className":"text-xs","children":[${skillCount}," ","skill${skillCount === 1 ? '' : 's'}",":"," ","${skillNames}"]}]]}],["$","div",null,{"className":"text-right","children":["$","span",null,{"className":"font-mono text-sm text-foreground","children":"${installStr}"}]}]]}]`;
  });
  const escaped = rows.join('\\n').replace(/"/g, '\\"');
  return `<html><body>
<script>(self.__next_f=self.__next_f||[]).push([0])</script>
<script>self.__next_f.push([1,"${escaped}"])</script>
</body></html>`;
}

function formatHumanCount(n: number): string {
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1000) { return (n / 1000).toFixed(1) + 'K'; }
  return String(n);
}

describe('fetchOfficialOwner', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.advanceTimersByTime(31 * 60 * 1000);
  });

  it('parses owner page with repos and skills', async () => {
    const html = buildOwnerPageHtml('anthropics', [
      {
        repo: 'anthropics/skills',
        totalInstalls: 695800,
        skills: [
          { name: 'frontend-design', installs: 221000 },
          { name: 'mcp-builder', installs: 150000 },
        ],
      },
      {
        repo: 'anthropics/claude-code',
        totalInstalls: 46100,
        skills: [{ name: 'plugin-structure', installs: 46100 }],
      },
    ]);
    mockFetch({ 'skills.sh/anthropics': htmlResponse(html) });

    const result = await fetchOfficialOwner('anthropics');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('anthropics');
    expect(result!.repoCount).toBe(2);
    expect(result!.skillCount).toBe(3);
    // Human-readable counts are rounded: 695800 → "695.8K" → 695800, 46100 → "46.1K" → 46100
    expect(result!.totalInstalls).toBe(695800 + 46100);
    expect(result!.repos[0].repo).toBe('anthropics/skills');
    expect(result!.repos[0].skills).toHaveLength(2);
    expect(result!.repos[1].repo).toBe('anthropics/claude-code');
  });

  it('returns null on HTTP error', async () => {
    mockFetch({ 'skills.sh/test-org': errorResponse(404) });
    const result = await fetchOfficialOwner('test-org');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch({
      'skills.sh/test-org': () => { throw new Error('Network error'); },
    });
    const result = await fetchOfficialOwner('test-org');
    expect(result).toBeNull();
  });

  it('returns null when page has no repos data', async () => {
    mockFetch({ 'skills.sh/test-org': htmlResponse('<html><body>No data</body></html>') });
    const result = await fetchOfficialOwner('test-org');
    expect(result).toBeNull();
  });

  it('serves from cache on second call within TTL', async () => {
    const html = buildOwnerPageHtml('cached-org', [{
      repo: 'cached-org/skills',
      totalInstalls: 100,
      skills: [{ name: 'test-skill', installs: 100 }],
    }]);
    const fetchMock = mockFetch({ 'skills.sh/cached-org': htmlResponse(html) });

    const result1 = await fetchOfficialOwner('cached-org');
    const result2 = await fetchOfficialOwner('cached-org');

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1!.owner).toBe('cached-org');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parses RSC vdom with escaped quotes (real-world format)', async () => {
    // Real pages embed RSC chunks with escaped quotes inside JS string literals
    const html = buildOwnerPageHtml('test-org', [{
      repo: 'test-org/skills',
      totalInstalls: 500,
      skills: [{ name: 'test-skill', installs: 500 }],
    }]);
    mockFetch({ 'skills.sh/test-org': htmlResponse(html) });

    const result = await fetchOfficialOwner('test-org');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('test-org');
    expect(result!.repoCount).toBe(1);
    expect(result!.repos[0].skills).toHaveLength(1);
  });

  it('ignores /official prefetch data and parses only RSC vdom repo links', async () => {
    // The page may embed stale /official JSON alongside fresh RSC vdom.
    // The parser should extract repos from vdom hrefs, not JSON.
    const officialOwners = JSON.stringify([{
      owner: 'anthropics',
      repos: [{ repo: 'anthropics/skills', totalInstalls: 918000, skills: [{ name: 'old-skill', installs: 918000 }] }],
      totalInstalls: 918000,
    }]);
    // RSC vdom with fresh data
    const vdom = buildOwnerPageHtml('anthropics', [
      { repo: 'anthropics/skills', totalInstalls: 695800, skills: [{ name: 'frontend-design', installs: 221000 }] },
      { repo: 'anthropics/claude-code', totalInstalls: 46100, skills: [{ name: 'plugin-structure', installs: 46100 }] },
    ]);
    // Inject stale /official JSON before the vdom
    const html = vdom.replace('<script>(self.__next_f', `<script>self.__next_f.push([1,"data":{"owners":${officialOwners}}])</script>\n<script>(self.__next_f`);
    mockFetch({ 'skills.sh/anthropics': htmlResponse(html) });

    const result = await fetchOfficialOwner('anthropics');
    expect(result).not.toBeNull();
    expect(result!.totalInstalls).toBe(695800 + 46100);
    expect(result!.repoCount).toBe(2);
    expect(result!.repos[0].totalInstalls).toBe(695800);
  });
});

// ── fetchOfficialRepo ───────────────────────────────────────────────

/** Build a mock repo page with RSC vdom format (skill links + install counts). */
function buildRepoPageHtml(ownerName: string, repoName: string, skills: Array<{
  name: string;
  installs: number;
}>): string {
  const rows = skills.map(s => {
    const installStr = formatHumanCount(s.installs);
    return `["$","$L4","${s.name}",{"href":"/${ownerName}/${repoName}/${s.name}","className":"group grid","children":[["$","h3",null,{"className":"font-semibold","children":"${s.name}"}],["$","div",null,{"className":"text-right","children":["$","span",null,{"className":"font-mono text-sm text-foreground","children":"${installStr}"}]}]]}]`;
  });
  const escaped = rows.join('\\n').replace(/"/g, '\\"');
  return `<html><body>
<script>(self.__next_f=self.__next_f||[]).push([0])</script>
<script>self.__next_f.push([1,"${escaped}"])</script>
</body></html>`;
}

describe('fetchOfficialRepo', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.advanceTimersByTime(31 * 60 * 1000);
  });

  it('parses repo page with individual skill names and installs', async () => {
    const html = buildRepoPageHtml('anthropics', 'skills', [
      { name: 'frontend-design', installs: 195200 },
      { name: 'skill-creator', installs: 103800 },
      { name: 'pdf', installs: 49000 },
    ]);
    mockFetch({ 'skills.sh/anthropics/skills': htmlResponse(html) });

    const result = await fetchOfficialRepo('anthropics', 'skills');
    expect(result).not.toBeNull();
    expect(result!.repo).toBe('anthropics/skills');
    expect(result!.skills).toHaveLength(3);
    expect(result!.skills[0].name).toBe('frontend-design');
    expect(result!.skills[0].installs).toBe(195200);
    expect(result!.skills[1].name).toBe('skill-creator');
    expect(result!.skills[2].name).toBe('pdf');
    expect(result!.totalInstalls).toBe(195200 + 103800 + 49000);
  });

  it('returns null on HTTP error', async () => {
    mockFetch({ 'skills.sh/test-org/test-repo': errorResponse(404) });
    const result = await fetchOfficialRepo('test-org', 'test-repo');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch({
      'skills.sh/test-org/test-repo': () => { throw new Error('Network error'); },
    });
    const result = await fetchOfficialRepo('test-org', 'test-repo');
    expect(result).toBeNull();
  });

  it('returns null when page has no skill links', async () => {
    mockFetch({ 'skills.sh/test-org/test-repo': htmlResponse('<html><body>No data</body></html>') });
    const result = await fetchOfficialRepo('test-org', 'test-repo');
    expect(result).toBeNull();
  });

  it('serves from cache on second call within TTL', async () => {
    const html = buildRepoPageHtml('cached-org', 'cached-repo', [
      { name: 'test-skill', installs: 500 },
    ]);
    const fetchMock = mockFetch({ 'skills.sh/cached-org/cached-repo': htmlResponse(html) });

    const result1 = await fetchOfficialRepo('cached-org', 'cached-repo');
    const result2 = await fetchOfficialRepo('cached-org', 'cached-repo');

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1!.skills[0].name).toBe('test-skill');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── Live diagnostic (toggle .skip → .only to run against real site) ─

describe.skip('live diagnostic — official owner parser', () => {
  it('anthropics: parsed data diverges from /official snapshot', async () => {
    vi.useRealTimers();

    // Restore real fetch (test setup stubs it with vi.fn())
    const nativeFetch = (await import('undici')).fetch as unknown as typeof globalThis.fetch;
    vi.stubGlobal('fetch', nativeFetch);

    // Re-import the module to get a fresh instance with the real fetch
    vi.resetModules();
    const { fetchOfficialOwner: liveFetch } = await import('../../../api/official-scraper');
    const result = await liveFetch('anthropics');
    expect(result).not.toBeNull();

    console.log('Parsed anthropics data:', JSON.stringify({
      repoCount: result!.repoCount,
      skillCount: result!.skillCount,
      totalInstalls: result!.totalInstalls,
      repos: result!.repos.map(r => ({
        repo: r.repo,
        totalInstalls: r.totalInstalls,
        skillCount: r.skills.length,
      })),
    }, null, 2));

    // Sanity checks
    expect(result!.repoCount).toBeGreaterThan(5);
    expect(result!.skillCount).toBeGreaterThan(100);
    // /official data has ~918K; real owner page should have ~810K.
    // If this fails, we're still parsing stale /official data.
    expect(result!.totalInstalls).toBeLessThan(900_000);
  });
});

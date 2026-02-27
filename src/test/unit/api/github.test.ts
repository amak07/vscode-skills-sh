import { describe, it, expect, beforeEach } from 'vitest';
import { mockFetch, jsonResponse, errorResponse } from '../../helpers/fetch-mock';
import { SAMPLE_GITHUB_TREE } from '../../helpers/fixtures';

// The github module has module-level caches. We need to reset them between tests.
// We'll use dynamic imports combined with vi.resetModules() to get fresh module instances.
import { vi } from 'vitest';

async function freshImport() {
  vi.resetModules();
  return await import('../../../api/github');
}

// ---------------------------------------------------------------------------
// fetchSkillMd
// ---------------------------------------------------------------------------

describe('fetchSkillMd', () => {
  let fetchSkillMd: typeof import('../../../api/github').fetchSkillMd;

  beforeEach(async () => {
    const mod = await freshImport();
    fetchSkillMd = mod.fetchSkillMd;
  });

  it('fetches SKILL.md from the main branch first', async () => {
    const fetchFn = mockFetch({
      'main/skills/react-best-practices/SKILL.md': {
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({}),
        text: async () => '# React Best Practices',
      },
    });

    const result = await fetchSkillMd('vercel-labs/agent-skills', 'react-best-practices');
    expect(result).toBe('# React Best Practices');

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/main/skills/');
  });

  it('falls back to master branch when main returns 404', async () => {
    const fetchFn = mockFetch({
      'main/skills/react-best-practices/SKILL.md': errorResponse(404, 'Not Found'),
      'master/skills/react-best-practices/SKILL.md': {
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({}),
        text: async () => '# From Master',
      },
    });

    const result = await fetchSkillMd('vercel-labs/agent-skills', 'react-best-practices');
    expect(result).toBe('# From Master');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns null when both branches fail', async () => {
    mockFetch({
      'main/skills/my-skill/SKILL.md': errorResponse(404, 'Not Found'),
      'master/skills/my-skill/SKILL.md': errorResponse(404, 'Not Found'),
    });

    const result = await fetchSkillMd('owner/repo', 'my-skill');
    expect(result).toBeNull();
  });

  it('caches results to avoid redundant requests', async () => {
    const fetchFn = mockFetch({
      'main/skills/react-best-practices/SKILL.md': {
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({}),
        text: async () => '# Cached Content',
      },
    });

    const r1 = await fetchSkillMd('vercel-labs/agent-skills', 'react-best-practices');
    const r2 = await fetchSkillMd('vercel-labs/agent-skills', 'react-best-practices');

    expect(r1).toBe('# Cached Content');
    expect(r2).toBe('# Cached Content');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('handles network errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await fetchSkillMd('owner/repo', 'some-skill');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchRepoSkillList
// ---------------------------------------------------------------------------

describe('fetchRepoSkillList', () => {
  let fetchRepoSkillList: typeof import('../../../api/github').fetchRepoSkillList;

  beforeEach(async () => {
    const mod = await freshImport();
    fetchRepoSkillList = mod.fetchRepoSkillList;
  });

  it('returns skill folder names from the tree', async () => {
    mockFetch({
      'api.github.com/repos/vercel-labs/agent-skills/git/trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const result = await fetchRepoSkillList('vercel-labs/agent-skills');
    expect(result).toContain('react-best-practices');
    expect(result).toContain('react-email');
    expect(result).toHaveLength(2);
  });

  it('falls back to master when main branch fails', async () => {
    mockFetch({
      'trees/main': errorResponse(404, 'Not Found'),
      'trees/master': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const result = await fetchRepoSkillList('owner/repo');
    expect(result).toContain('react-best-practices');
  });

  it('returns empty array when both branches fail', async () => {
    mockFetch({
      'trees/main': errorResponse(404, 'Not Found'),
      'trees/master': errorResponse(404, 'Not Found'),
    });

    const result = await fetchRepoSkillList('owner/repo');
    expect(result).toEqual([]);
  });

  it('only considers blob entries ending with SKILL.md', async () => {
    mockFetch({
      'trees/main': jsonResponse({
        tree: [
          { path: 'skills/valid-skill/SKILL.md', type: 'blob', sha: 'a1' },
          { path: 'skills/valid-skill', type: 'tree', sha: 'a2' },
          { path: 'README.md', type: 'blob', sha: 'a3' },
          { path: 'skills/another/README.md', type: 'blob', sha: 'a4' },
        ],
      }),
    });

    const result = await fetchRepoSkillList('owner/repo');
    expect(result).toEqual(['valid-skill']);
  });

  it('extracts skill name from nested paths correctly', async () => {
    mockFetch({
      'trees/main': jsonResponse({
        tree: [
          { path: 'deep/nested/skills/my-skill/SKILL.md', type: 'blob', sha: 'x' },
        ],
      }),
    });

    const result = await fetchRepoSkillList('owner/repo');
    // The skill name is the parent folder of SKILL.md
    expect(result).toEqual(['my-skill']);
  });

  it('caches the tree to avoid redundant API calls', async () => {
    const fetchFn = mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    await fetchRepoSkillList('owner/repo');
    await fetchRepoSkillList('owner/repo');

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// fetchSkillFolderHashes
// ---------------------------------------------------------------------------

describe('fetchSkillFolderHashes', () => {
  let fetchSkillFolderHashes: typeof import('../../../api/github').fetchSkillFolderHashes;

  beforeEach(async () => {
    const mod = await freshImport();
    fetchSkillFolderHashes = mod.fetchSkillFolderHashes;
  });

  it('returns a Map of folder paths to tree SHAs', async () => {
    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const result = await fetchSkillFolderHashes('vercel-labs/agent-skills');
    expect(result).toBeInstanceOf(Map);
    expect(result.get('skills/react-best-practices')).toBe('abc123def456');
    expect(result.get('skills/react-email')).toBe('def456ghi789');
  });

  it('only includes tree entries that have a corresponding SKILL.md blob', async () => {
    mockFetch({
      'trees/main': jsonResponse({
        tree: [
          { path: 'skills/with-skillmd', type: 'tree', sha: 'tree1' },
          { path: 'skills/with-skillmd/SKILL.md', type: 'blob', sha: 'blob1' },
          { path: 'skills/without-skillmd', type: 'tree', sha: 'tree2' },
          { path: 'skills/without-skillmd/README.md', type: 'blob', sha: 'blob2' },
        ],
      }),
    });

    const result = await fetchSkillFolderHashes('owner/repo');
    expect(result.has('skills/with-skillmd')).toBe(true);
    expect(result.has('skills/without-skillmd')).toBe(false);
  });

  it('returns empty Map when both branches fail', async () => {
    mockFetch({
      'trees/main': errorResponse(404),
      'trees/master': errorResponse(404),
    });

    const result = await fetchSkillFolderHashes('owner/repo');
    expect(result.size).toBe(0);
  });

  it('returns empty Map when tree has no SKILL.md files', async () => {
    mockFetch({
      'trees/main': jsonResponse({
        tree: [
          { path: 'src/index.ts', type: 'blob', sha: 'x1' },
          { path: 'README.md', type: 'blob', sha: 'x2' },
        ],
      }),
    });

    const result = await fetchSkillFolderHashes('owner/repo');
    expect(result.size).toBe(0);
  });

  it('handles network errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await fetchSkillFolderHashes('owner/repo');
    expect(result.size).toBe(0);
  });
});

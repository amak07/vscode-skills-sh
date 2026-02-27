import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockFetch, jsonResponse, errorResponse } from '../../helpers/fetch-mock';
import { SAMPLE_GITHUB_TREE } from '../../helpers/fixtures';

// The updates module has module-level state (lastUpdateResult).
// We also need to control the github module it imports from.
// Use dynamic re-imports for fresh state each test.

async function freshImport() {
  vi.resetModules();
  return await import('../../../api/updates');
}

// ---------------------------------------------------------------------------
// checkUpdates
// ---------------------------------------------------------------------------

describe('checkUpdates', () => {
  let checkUpdates: typeof import('../../../api/updates').checkUpdates;

  beforeEach(async () => {
    const mod = await freshImport();
    checkUpdates = mod.checkUpdates;
  });

  it('detects updates when remote hash differs from local hash', async () => {
    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD_HASH_different',
        skillPath: 'skills/react-best-practices/SKILL.md',
      },
    ];

    const result = await checkUpdates(skills);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].name).toBe('react-best-practices');
    expect(result.updates[0].source).toBe('vercel-labs/agent-skills');
    expect(result.updates[0].newHash).toBe('abc123def456');
  });

  it('reports no updates when hashes match', async () => {
    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'abc123def456', // matches the fixture
        skillPath: 'skills/react-best-practices/SKILL.md',
      },
    ];

    const result = await checkUpdates(skills);
    expect(result.updates).toHaveLength(0);
  });

  it('groups skills by source to batch API calls', async () => {
    const fetchFn = mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD_HASH',
        skillPath: 'skills/react-best-practices/SKILL.md',
      },
      {
        name: 'react-email',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD_HASH',
        skillPath: 'skills/react-email/SKILL.md',
      },
    ];

    const result = await checkUpdates(skills);
    // Both skills from the same source: only one tree fetch
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.updates).toHaveLength(2);
  });

  it('handles multiple sources separately', async () => {
    const secondTree = {
      tree: [
        { path: 'skills/supabase-auth', type: 'tree', sha: 'supabase-new-hash' },
        { path: 'skills/supabase-auth/SKILL.md', type: 'blob', sha: 'sb-blob' },
      ],
    };

    const fetchFn = mockFetch({
      'vercel-labs/agent-skills/git/trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
      'supabase-community/agent-skills/git/trees/main': jsonResponse(secondTree),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'abc123def456', // matches, so no update
        skillPath: 'skills/react-best-practices/SKILL.md',
      },
      {
        name: 'supabase-auth',
        source: 'supabase-community/agent-skills',
        skillFolderHash: 'old-hash',
        skillPath: 'skills/supabase-auth/SKILL.md',
      },
    ];

    const result = await checkUpdates(skills);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].name).toBe('supabase-auth');
    expect(result.updates[0].newHash).toBe('supabase-new-hash');
  });

  it('defaults folderPath to skills/<name> when skillPath is not provided', async () => {
    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD_HASH',
        // no skillPath — should derive from name
      },
    ];

    const result = await checkUpdates(skills);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].name).toBe('react-best-practices');
  });

  it('strips /SKILL.md suffix from skillPath to compute folderPath', async () => {
    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'react-email',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'different-hash',
        skillPath: 'skills/react-email/SKILL.md',
      },
    ];

    const result = await checkUpdates(skills);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].newHash).toBe('def456ghi789');
  });

  it('returns empty updates when skills list is empty', async () => {
    const result = await checkUpdates([]);
    expect(result.updates).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('ignores skills whose folder is not found in the remote tree', async () => {
    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'nonexistent-skill',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'some-hash',
      },
    ];

    const result = await checkUpdates(skills);
    expect(result.updates).toHaveLength(0);
  });

  it('handles API failures gracefully (empty hashes)', async () => {
    mockFetch({
      'trees/main': errorResponse(403, 'Rate limited'),
      'trees/master': errorResponse(403, 'Rate limited'),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'some-hash',
      },
    ];

    const result = await checkUpdates(skills);
    // No updates because we couldn't fetch hashes
    expect(result.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getLastUpdateResult
// ---------------------------------------------------------------------------

describe('getLastUpdateResult', () => {
  it('returns null before any checkUpdates call', async () => {
    const mod = await freshImport();
    expect(mod.getLastUpdateResult()).toBeNull();
  });

  it('returns the last checkUpdates result', async () => {
    const mod = await freshImport();

    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD_HASH',
      },
    ];

    await mod.checkUpdates(skills);
    const result = mod.getLastUpdateResult();
    expect(result).not.toBeNull();
    expect(result!.updates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// clearUpdateForSkill
// ---------------------------------------------------------------------------

describe('clearUpdateForSkill', () => {
  it('removes a specific skill from the cached update result', async () => {
    const mod = await freshImport();

    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    const skills = [
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD_HASH_1',
        skillPath: 'skills/react-best-practices/SKILL.md',
      },
      {
        name: 'react-email',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD_HASH_2',
        skillPath: 'skills/react-email/SKILL.md',
      },
    ];

    await mod.checkUpdates(skills);
    expect(mod.getLastUpdateResult()!.updates).toHaveLength(2);

    mod.clearUpdateForSkill('react-best-practices');
    expect(mod.getLastUpdateResult()!.updates).toHaveLength(1);
    expect(mod.getLastUpdateResult()!.updates[0].name).toBe('react-email');
  });

  it('does nothing when lastUpdateResult is null', async () => {
    const mod = await freshImport();
    // Should not throw
    mod.clearUpdateForSkill('anything');
    expect(mod.getLastUpdateResult()).toBeNull();
  });

  it('does nothing when skill name is not in updates', async () => {
    const mod = await freshImport();

    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    await mod.checkUpdates([
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD',
      },
    ]);

    mod.clearUpdateForSkill('nonexistent-skill');
    expect(mod.getLastUpdateResult()!.updates).toHaveLength(1);
  });

  it('results in empty updates array when all skills are cleared', async () => {
    const mod = await freshImport();

    mockFetch({
      'trees/main': jsonResponse(SAMPLE_GITHUB_TREE),
    });

    await mod.checkUpdates([
      {
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
        skillFolderHash: 'OLD',
      },
    ]);

    mod.clearUpdateForSkill('react-best-practices');
    expect(mod.getLastUpdateResult()!.updates).toHaveLength(0);
  });
});

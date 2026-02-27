import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';
import { createSandbox, Sandbox } from '../../helpers/fs-sandbox';
import { SAMPLE_MANIFEST } from '../../helpers/fixtures';

// Import module under test
import {
  getManifestPath,
  readManifest,
  writeManifest,
  addSkillToManifest,
  removeSkillFromManifest,
  isSkillInManifest,
  getManifestSkillNames,
  getMissingSkills,
} from '../../../manifest/manifest';
import { InstalledSkill, SkillManifest } from '../../../types';

let sandbox: Sandbox;

beforeEach(() => {
  sandbox = createSandbox('manifest-test-');
  // Point the vscode workspace mock at our sandbox workspace
  (workspace as any).workspaceFolders = [
    { uri: { fsPath: sandbox.workspaceRoot }, name: 'test-workspace' },
  ];
});

afterEach(() => {
  sandbox.cleanup();
  (workspace as any).workspaceFolders = undefined;
});

// ---------------------------------------------------------------------------
// getManifestPath
// ---------------------------------------------------------------------------

describe('getManifestPath', () => {
  it('returns the path to skills.json in workspace root', () => {
    const result = getManifestPath();
    expect(result).toBe(path.join(sandbox.workspaceRoot, 'skills.json'));
  });

  it('returns null when workspaceFolders is undefined', () => {
    (workspace as any).workspaceFolders = undefined;
    expect(getManifestPath()).toBeNull();
  });

  it('returns null when workspaceFolders is empty', () => {
    (workspace as any).workspaceFolders = [];
    expect(getManifestPath()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readManifest
// ---------------------------------------------------------------------------

describe('readManifest', () => {
  it('reads and parses a valid skills.json', () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    const result = readManifest();
    expect(result).not.toBeNull();
    expect(result!.skills).toHaveLength(2);
    expect(result!.skills[0].source).toBe('vercel-labs/agent-skills');
  });

  it('returns null when skills.json does not exist', () => {
    expect(readManifest()).toBeNull();
  });

  it('returns null when skills.json contains invalid JSON', () => {
    const manifestPath = path.join(sandbox.workspaceRoot, 'skills.json');
    fs.writeFileSync(manifestPath, 'not valid json {{}{', 'utf-8');
    expect(readManifest()).toBeNull();
  });

  it('returns null when JSON is valid but missing skills array', () => {
    const manifestPath = path.join(sandbox.workspaceRoot, 'skills.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 1 }), 'utf-8');
    expect(readManifest()).toBeNull();
  });

  it('returns null when skills is not an array', () => {
    const manifestPath = path.join(sandbox.workspaceRoot, 'skills.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ skills: 'not-array' }), 'utf-8');
    expect(readManifest()).toBeNull();
  });

  it('returns null when no workspace is open', () => {
    (workspace as any).workspaceFolders = undefined;
    expect(readManifest()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// writeManifest
// ---------------------------------------------------------------------------

describe('writeManifest', () => {
  it('writes manifest to skills.json in the workspace root', () => {
    const manifest: SkillManifest = { skills: [{ source: 'test/repo', skills: ['my-skill'] }] };
    writeManifest(manifest);
    const manifestPath = path.join(sandbox.workspaceRoot, 'skills.json');
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    expect(raw).toContain('"source": "test/repo"');
    expect(raw).toContain('"my-skill"');
    // Should end with a trailing newline
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('overwrites existing manifest', () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    const newManifest: SkillManifest = { skills: [] };
    writeManifest(newManifest);
    const result = readManifest();
    expect(result).not.toBeNull();
    expect(result!.skills).toHaveLength(0);
  });

  it('does nothing when no workspace is open', () => {
    (workspace as any).workspaceFolders = undefined;
    // Should not throw
    writeManifest({ skills: [] });
  });
});

// ---------------------------------------------------------------------------
// addSkillToManifest
// ---------------------------------------------------------------------------

describe('addSkillToManifest', () => {
  it('creates skills.json if it does not exist', () => {
    addSkillToManifest('owner/repo', 'new-skill');
    const result = readManifest();
    expect(result).not.toBeNull();
    expect(result!.skills).toHaveLength(1);
    expect(result!.skills[0].source).toBe('owner/repo');
    expect(result!.skills[0].skills).toEqual(['new-skill']);
  });

  it('adds a skill to an existing source entry', () => {
    sandbox.writeManifest({
      skills: [{ source: 'owner/repo', skills: ['existing-skill'] }],
    });
    addSkillToManifest('owner/repo', 'another-skill');
    const result = readManifest();
    expect(result!.skills[0].skills).toContain('existing-skill');
    expect(result!.skills[0].skills).toContain('another-skill');
  });

  it('creates a new source entry for a different repo', () => {
    sandbox.writeManifest({
      skills: [{ source: 'owner/repo-a', skills: ['skill-a'] }],
    });
    addSkillToManifest('owner/repo-b', 'skill-b');
    const result = readManifest();
    expect(result!.skills).toHaveLength(2);
  });

  it('does not add duplicate skill names', () => {
    addSkillToManifest('owner/repo', 'my-skill');
    addSkillToManifest('owner/repo', 'my-skill');
    const result = readManifest();
    expect(result!.skills[0].skills).toEqual(['my-skill']);
  });

  it('sorts skills alphabetically within a source', () => {
    addSkillToManifest('owner/repo', 'zebra-skill');
    addSkillToManifest('owner/repo', 'alpha-skill');
    const result = readManifest();
    expect(result!.skills[0].skills).toEqual(['alpha-skill', 'zebra-skill']);
  });

  it('sorts entries by source for consistency', () => {
    addSkillToManifest('zzz/repo', 'skill-z');
    addSkillToManifest('aaa/repo', 'skill-a');
    const result = readManifest();
    expect(result!.skills[0].source).toBe('aaa/repo');
    expect(result!.skills[1].source).toBe('zzz/repo');
  });
});

// ---------------------------------------------------------------------------
// removeSkillFromManifest
// ---------------------------------------------------------------------------

describe('removeSkillFromManifest', () => {
  it('removes a skill by folder name', () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    removeSkillFromManifest('react-email');
    const result = readManifest();
    expect(result!.skills[0].skills).toEqual(['react-best-practices']);
  });

  it('removes the entire source entry when it becomes empty', () => {
    sandbox.writeManifest({
      skills: [{ source: 'owner/repo', skills: ['only-skill'] }],
    });
    removeSkillFromManifest('only-skill');
    const result = readManifest();
    expect(result!.skills).toHaveLength(0);
  });

  it('does nothing when skill name is not found', () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    removeSkillFromManifest('nonexistent-skill');
    const result = readManifest();
    // Unchanged
    expect(result!.skills).toHaveLength(2);
  });

  it('does nothing when manifest does not exist', () => {
    // Should not throw
    removeSkillFromManifest('anything');
  });

  it('does nothing when no workspace is open', () => {
    (workspace as any).workspaceFolders = undefined;
    removeSkillFromManifest('anything');
  });
});

// ---------------------------------------------------------------------------
// isSkillInManifest
// ---------------------------------------------------------------------------

describe('isSkillInManifest', () => {
  it('returns true when skill exists in the manifest', () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    expect(isSkillInManifest('react-best-practices')).toBe(true);
    expect(isSkillInManifest('supabase-auth')).toBe(true);
  });

  it('returns false when skill is not in the manifest', () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    expect(isSkillInManifest('nonexistent')).toBe(false);
  });

  it('returns false when manifest does not exist', () => {
    expect(isSkillInManifest('anything')).toBe(false);
  });

  it('returns false when no workspace is open', () => {
    (workspace as any).workspaceFolders = undefined;
    expect(isSkillInManifest('anything')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getManifestSkillNames
// ---------------------------------------------------------------------------

describe('getManifestSkillNames', () => {
  it('returns a Set of all skill names across sources', () => {
    sandbox.writeManifest(SAMPLE_MANIFEST);
    const names = getManifestSkillNames();
    expect(names).toBeInstanceOf(Set);
    expect(names.size).toBe(3);
    expect(names.has('react-best-practices')).toBe(true);
    expect(names.has('react-email')).toBe(true);
    expect(names.has('supabase-auth')).toBe(true);
  });

  it('returns empty Set when manifest does not exist', () => {
    const names = getManifestSkillNames();
    expect(names.size).toBe(0);
  });

  it('returns empty Set when no workspace is open', () => {
    (workspace as any).workspaceFolders = undefined;
    const names = getManifestSkillNames();
    expect(names.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getMissingSkills
// ---------------------------------------------------------------------------

describe('getMissingSkills', () => {
  const installedSkills: InstalledSkill[] = [
    {
      name: 'React Best Practices',
      folderName: 'react-best-practices',
      description: 'React tips',
      path: '/some/path',
      scope: 'global',
      metadata: {},
      agents: ['claude'],
      isCustom: false,
    },
  ];

  it('returns skills listed in manifest but not installed', () => {
    const manifest: SkillManifest = {
      skills: [
        { source: 'vercel-labs/agent-skills', skills: ['react-best-practices', 'react-email'] },
        { source: 'supabase-community/agent-skills', skills: ['supabase-auth'] },
      ],
    };
    const missing = getMissingSkills(manifest, installedSkills);
    expect(missing).toHaveLength(2);
    expect(missing).toContainEqual({ source: 'vercel-labs/agent-skills', skillName: 'react-email' });
    expect(missing).toContainEqual({ source: 'supabase-community/agent-skills', skillName: 'supabase-auth' });
  });

  it('returns empty array when all manifest skills are installed', () => {
    const manifest: SkillManifest = {
      skills: [
        { source: 'vercel-labs/agent-skills', skills: ['react-best-practices'] },
      ],
    };
    const missing = getMissingSkills(manifest, installedSkills);
    expect(missing).toHaveLength(0);
  });

  it('returns all skills when nothing is installed', () => {
    const manifest: SkillManifest = {
      skills: [
        { source: 'owner/repo', skills: ['skill-a', 'skill-b'] },
      ],
    };
    const missing = getMissingSkills(manifest, []);
    expect(missing).toHaveLength(2);
  });

  it('returns empty array for empty manifest', () => {
    const manifest: SkillManifest = { skills: [] };
    const missing = getMissingSkills(manifest, installedSkills);
    expect(missing).toHaveLength(0);
  });

  it('matches by either name or folderName', () => {
    // "React Best Practices" is the name, "react-best-practices" is the folderName
    const manifest: SkillManifest = {
      skills: [
        { source: 'owner/repo', skills: ['React Best Practices'] },
      ],
    };
    const missing = getMissingSkills(manifest, installedSkills);
    // Should be found via name match
    expect(missing).toHaveLength(0);
  });
});

import { ApiCache } from '../utils/api-cache';
import { GITHUB_RAW_BASE, GITHUB_API_BASE, BRANCH_FALLBACKS, CACHE_TTL_GITHUB } from '../utils/constants';

const contentCache = new ApiCache<string>(CACHE_TTL_GITHUB);

interface TreeItem {
  path: string;
  type: string;
  sha: string;
}

const treeCache = new ApiCache<TreeItem[]>(CACHE_TTL_GITHUB);

export async function fetchSkillMd(source: string, skillName: string): Promise<string | null> {
  const cacheKey = `${source}/${skillName}`;
  const cached = contentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Try main branch first, then master
  for (const branch of BRANCH_FALLBACKS) {
    const url = `${GITHUB_RAW_BASE}/${source}/${branch}/skills/${skillName}/SKILL.md`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        contentCache.set(cacheKey, content);
        return content;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/** Fetch the full repo tree (main -> master fallback, cached 1h). Returns null if both fail. */
async function fetchRepoTree(source: string): Promise<TreeItem[] | null> {
  const cached = treeCache.get(source);
  if (cached) {
    return cached;
  }

  for (const branch of BRANCH_FALLBACKS) {
    const url = `${GITHUB_API_BASE}/repos/${source}/git/trees/${branch}?recursive=1`;
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      if (!response.ok) { continue; }
      const data = (await response.json()) as { tree: TreeItem[] };
      treeCache.set(source, data.tree);
      return data.tree;
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchRepoSkillList(source: string): Promise<string[]> {
  const tree = await fetchRepoTree(source);
  if (!tree) { return []; }
  return tree
    .filter(item => item.type === 'blob' && item.path.endsWith('/SKILL.md'))
    .map(item => {
      const parts = item.path.split('/');
      return parts[parts.length - 2];
    });
}

/** Fetch the tree SHA for each skill folder in a repo (main -> master fallback).
 *  Returns Map<folderPath, treeSHA> e.g. "skills/react-email" -> "83ea2cb2..." */
export async function fetchSkillFolderHashes(
  source: string
): Promise<Map<string, string>> {
  const tree = await fetchRepoTree(source);
  if (!tree) { return new Map(); }

  // Collect all paths that have a SKILL.md blob
  const skillMdPaths = new Set(
    tree
      .filter(item => item.type === 'blob' && item.path.endsWith('/SKILL.md'))
      .map(item => item.path.replace(/\/SKILL\.md$/, ''))
  );

  // Return the tree SHA for each skill folder
  const result = new Map<string, string>();
  for (const item of tree) {
    if (item.type === 'tree' && skillMdPaths.has(item.path)) {
      result.set(item.path, item.sha);
    }
  }
  return result;
}

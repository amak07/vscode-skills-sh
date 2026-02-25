interface CacheEntry {
  content: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 3600 * 1000; // 1 hour

export async function fetchSkillMd(source: string, skillName: string): Promise<string | null> {
  const cacheKey = `${source}/${skillName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  // Try main branch first, then master
  for (const branch of ['main', 'master']) {
    const url = `https://raw.githubusercontent.com/${source}/${branch}/skills/${skillName}/SKILL.md`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        cache.set(cacheKey, { content, timestamp: Date.now() });
        return content;
      }
    } catch {
      continue;
    }
  }

  return null;
}

interface TreeItem {
  path: string;
  type: string;
  sha: string;
}

const treeCache = new Map<string, { tree: TreeItem[]; timestamp: number }>();

/** Fetch the full repo tree (main → master fallback, cached 1h). Returns null if both fail. */
async function fetchRepoTree(source: string): Promise<TreeItem[] | null> {
  const cached = treeCache.get(source);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tree;
  }

  for (const branch of ['main', 'master']) {
    const url = `https://api.github.com/repos/${source}/git/trees/${branch}?recursive=1`;
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      if (!response.ok) { continue; }
      const data = (await response.json()) as { tree: TreeItem[] };
      treeCache.set(source, { tree: data.tree, timestamp: Date.now() });
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

/** Fetch the tree SHA for each skill folder in a repo (main → master fallback).
 *  Returns Map<folderPath, treeSHA> e.g. "skills/react-email" → "83ea2cb2..." */
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

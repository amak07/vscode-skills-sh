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

export async function fetchRepoSkillList(source: string): Promise<string[]> {
  // Use GitHub Trees API to get all SKILL.md paths in the repo
  // Try main branch first, then master as fallback
  for (const branch of ['main', 'master']) {
    const url = `https://api.github.com/repos/${source}/git/trees/${branch}?recursive=1`;
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      if (!response.ok) {
        continue;
      }
      const data = (await response.json()) as { tree: { path: string; type: string }[] };
      return data.tree
        .filter(item => item.type === 'blob' && item.path.endsWith('/SKILL.md'))
        .map(item => {
          const parts = item.path.split('/');
          // Return the directory name before SKILL.md
          return parts[parts.length - 2];
        });
    } catch {
      continue;
    }
  }
  return [];
}

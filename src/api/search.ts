import { SearchResponse, LeaderboardResponse, LeaderboardView } from '../types';

const SKILLS_SH_API = 'https://skills.sh/api';
const CACHE_TTL_MS = 3_600_000; // 1 hour
const SEARCH_RESULTS_LIMIT = 50; // matches skills.sh website

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (CACHE_TTL_MS > 0 && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function searchSkills(query: string, limit?: number): Promise<SearchResponse> {
  if (query.length < 2) {
    return { query, searchType: 'fuzzy', skills: [], count: 0, duration_ms: 0 };
  }

  const resultLimit = limit ?? SEARCH_RESULTS_LIMIT;
  const cacheKey = `search:${query}:${resultLimit}`;
  const cached = getCached<SearchResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${SKILLS_SH_API}/search?q=${encodeURIComponent(query)}&limit=${resultLimit}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Search API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SearchResponse;
  setCache(cacheKey, data);
  return data;
}

export async function getLeaderboard(view: LeaderboardView, page: number = 0): Promise<LeaderboardResponse> {
  const cacheKey = `leaderboard:${view}:${page}`;
  const cached = getCached<LeaderboardResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${SKILLS_SH_API}/skills/${view}/${page}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Leaderboard API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as LeaderboardResponse;
  setCache(cacheKey, data);
  return data;
}

export function clearCache(): void {
  cache.clear();
}

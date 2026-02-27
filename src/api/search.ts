import * as vscode from 'vscode';
import { SearchResponse, LeaderboardResponse, LeaderboardView } from '../types';
import { ApiCache } from '../utils/api-cache';
import { SKILLS_SH_API } from '../utils/constants';

const cache = new ApiCache<unknown>(
  () => vscode.workspace.getConfiguration('skills-sh').get<number>('searchCacheTTL', 3600) * 1000
);

export async function searchSkills(query: string, limit?: number): Promise<SearchResponse> {
  if (query.length < 2) {
    return { query, searchType: 'fuzzy', skills: [], count: 0, duration_ms: 0 };
  }

  const resultLimit = limit ?? vscode.workspace.getConfiguration('skills-sh').get<number>('searchResultsLimit', 20);
  const cacheKey = `search:${query}:${resultLimit}`;
  const cached = cache.get(cacheKey) as SearchResponse | null;
  if (cached) {
    return cached;
  }

  const url = `${SKILLS_SH_API}/search?q=${encodeURIComponent(query)}&limit=${resultLimit}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Search API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SearchResponse;
  cache.set(cacheKey, data);
  return data;
}

export async function getLeaderboard(view: LeaderboardView, page: number = 0): Promise<LeaderboardResponse> {
  const cacheKey = `leaderboard:${view}:${page}`;
  const cached = cache.get(cacheKey) as LeaderboardResponse | null;
  if (cached) {
    return cached;
  }

  const url = `${SKILLS_SH_API}/skills/${view}/${page}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Leaderboard API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as LeaderboardResponse;
  cache.set(cacheKey, data);
  return data;
}

export function clearCache(): void {
  cache.clear();
}

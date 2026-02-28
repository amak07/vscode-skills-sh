import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workspace } from 'vscode';
import { mockFetch, jsonResponse, errorResponse } from '../../helpers/fetch-mock';
import {
  SAMPLE_SEARCH_RESPONSE,
  SAMPLE_LEADERBOARD_RESPONSE,
} from '../../helpers/fixtures';

// Import module under test
import { searchSkills, getLeaderboard, clearCache } from '../../../api/search';

beforeEach(() => {
  // Always clear the internal cache between tests
  clearCache();
});

// ---------------------------------------------------------------------------
// searchSkills
// ---------------------------------------------------------------------------

describe('searchSkills', () => {
  it('returns empty result for queries shorter than 2 characters', async () => {
    const result = await searchSkills('r');
    expect(result.skills).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.query).toBe('r');
  });

  it('returns empty result for empty query', async () => {
    const result = await searchSkills('');
    expect(result.skills).toHaveLength(0);
  });

  it('constructs the correct URL with query and default limit', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/search?q=react');
    expect(calledUrl).toContain('&limit=20'); // default limit from config
  });

  it('uses the provided limit parameter', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react', 5);

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('&limit=5');
  });

  it('uses config-based limit when no explicit limit is given', async () => {
    (workspace as any).__setConfigValue('skills-sh.searchResultsLimit', 50);
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react');

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('&limit=50');
  });

  it('returns parsed API response', async () => {
    mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    const result = await searchSkills('react');
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].name).toBe('React Best Practices');
    expect(result.count).toBe(2);
    expect(result.duration_ms).toBe(12);
  });

  it('URL-encodes the query parameter', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react email');

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=react%20email');
  });

  it('throws on non-OK response', async () => {
    mockFetch({
      'skills.sh/api/search': errorResponse(500, 'Internal Server Error'),
    });

    await expect(searchSkills('react')).rejects.toThrow('Search API error: 500');
  });

  it('caches results for the same query and limit', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    const result1 = await searchSkills('react');
    const result2 = await searchSkills('react');

    expect(fetchFn).toHaveBeenCalledTimes(1); // only one fetch call
    expect(result1).toEqual(result2);
  });

  it('does not share cache between different queries', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react');
    await searchSkills('angular');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not share cache between different limits', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react', 5);
    await searchSkills('react', 10);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('expires cache after TTL', async () => {
    // Set TTL to 1 second for testing
    (workspace as any).__setConfigValue('skills-sh.searchCacheTTL', 1);

    let now = 1000000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Advance time past 1-second TTL (TTL is multiplied by 1000 in the module)
    now += 2000;

    await searchSkills('react');
    expect(fetchFn).toHaveBeenCalledTimes(2);

    dateNowSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getLeaderboard
// ---------------------------------------------------------------------------

describe('getLeaderboard', () => {
  it('constructs the correct URL for all-time view', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    await getLeaderboard('all-time');

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://skills.sh/api/skills/all-time/0');
  });

  it('constructs the correct URL for trending view with page', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    await getLeaderboard('trending', 3);

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://skills.sh/api/skills/trending/3');
  });

  it('defaults page to 0', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    await getLeaderboard('hot');

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/hot/0');
  });

  it('returns parsed leaderboard response', async () => {
    mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    const result = await getLeaderboard('all-time');
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('React Best Practices');
    expect(result.total).toBe(150);
    expect(result.hasMore).toBe(true);
  });

  it('throws on non-OK response', async () => {
    mockFetch({
      'skills.sh/api/skills': errorResponse(503, 'Service Unavailable'),
    });

    await expect(getLeaderboard('all-time')).rejects.toThrow('Leaderboard API error: 503');
  });

  it('caches results for the same view and page', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    await getLeaderboard('all-time', 0);
    await getLeaderboard('all-time', 0);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not share cache between different views', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    await getLeaderboard('all-time');
    await getLeaderboard('trending');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not share cache between different pages', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    await getLeaderboard('all-time', 0);
    await getLeaderboard('all-time', 1);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// clearCache
// ---------------------------------------------------------------------------

describe('clearCache', () => {
  it('clears all cached search results', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/search': jsonResponse(SAMPLE_SEARCH_RESPONSE),
    });

    await searchSkills('react');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clearCache();

    await searchSkills('react');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('clears all cached leaderboard results', async () => {
    const fetchFn = mockFetch({
      'skills.sh/api/skills': jsonResponse(SAMPLE_LEADERBOARD_RESPONSE),
    });

    await getLeaderboard('all-time');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clearCache();

    await getLeaderboard('all-time');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiCache, SingleCache } from '../../../utils/api-cache';

// ---------------------------------------------------------------------------
// ApiCache
// ---------------------------------------------------------------------------

describe('ApiCache', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null for a missing key', () => {
    const cache = new ApiCache<string>(60_000);
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    const cache = new ApiCache<number>(60_000);
    cache.set('a', 42);
    expect(cache.get('a')).toBe(42);
  });

  it('expires entries after the TTL', () => {
    const cache = new ApiCache<string>(5_000);
    cache.set('k', 'val');
    expect(cache.get('k')).toBe('val');

    vi.advanceTimersByTime(5_000);
    expect(cache.get('k')).toBeNull();
  });

  it('does not expire entries before the TTL', () => {
    const cache = new ApiCache<string>(5_000);
    cache.set('k', 'val');
    vi.advanceTimersByTime(4_999);
    expect(cache.get('k')).toBe('val');
  });

  it('supports dynamic TTL via function', () => {
    let ttl = 1_000;
    const cache = new ApiCache<string>(() => ttl);
    cache.set('k', 'val');

    vi.advanceTimersByTime(500);
    expect(cache.get('k')).toBe('val');

    vi.advanceTimersByTime(500);
    expect(cache.get('k')).toBeNull();

    // Increase TTL — new entries should last longer
    ttl = 10_000;
    cache.set('k2', 'val2');
    vi.advanceTimersByTime(5_000);
    expect(cache.get('k2')).toBe('val2');
  });

  it('delete removes a specific key', () => {
    const cache = new ApiCache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.delete('a');
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe('2');
  });

  it('clear removes all entries', () => {
    const cache = new ApiCache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeNull();
  });

  it('size reflects the number of stored entries', () => {
    const cache = new ApiCache<number>(60_000);
    expect(cache.size).toBe(0);
    cache.set('x', 1);
    cache.set('y', 2);
    expect(cache.size).toBe(2);
  });

  it('overwrites value on repeated set', () => {
    const cache = new ApiCache<string>(60_000);
    cache.set('k', 'old');
    cache.set('k', 'new');
    expect(cache.get('k')).toBe('new');
    expect(cache.size).toBe(1);
  });

  it('does not expire entries when TTL is 0', () => {
    const cache = new ApiCache<string>(0);
    cache.set('k', 'val');
    vi.advanceTimersByTime(999_999);
    expect(cache.get('k')).toBe('val');
  });
});

// ---------------------------------------------------------------------------
// SingleCache
// ---------------------------------------------------------------------------

describe('SingleCache', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when empty', () => {
    const cache = new SingleCache<string>(60_000);
    expect(cache.get()).toBeNull();
  });

  it('stores and retrieves a value', () => {
    const cache = new SingleCache<number>(60_000);
    cache.set(99);
    expect(cache.get()).toBe(99);
  });

  it('expires after the TTL', () => {
    const cache = new SingleCache<string>(2_000);
    cache.set('data');
    vi.advanceTimersByTime(2_000);
    expect(cache.get()).toBeNull();
  });

  it('does not expire before the TTL', () => {
    const cache = new SingleCache<string>(2_000);
    cache.set('data');
    vi.advanceTimersByTime(1_999);
    expect(cache.get()).toBe('data');
  });

  it('clear removes the stored value', () => {
    const cache = new SingleCache<string>(60_000);
    cache.set('data');
    cache.clear();
    expect(cache.get()).toBeNull();
  });

  it('overwrites previous value on set', () => {
    const cache = new SingleCache<string>(60_000);
    cache.set('old');
    cache.set('new');
    expect(cache.get()).toBe('new');
  });

  it('does not expire when TTL is 0', () => {
    const cache = new SingleCache<string>(0);
    cache.set('forever');
    vi.advanceTimersByTime(999_999);
    expect(cache.get()).toBe('forever');
  });
});

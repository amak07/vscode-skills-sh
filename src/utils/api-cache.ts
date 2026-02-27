/**
 * Generic TTL-based cache. Replaces duplicate CacheEntry implementations
 * across search.ts, github.ts, detail-scraper.ts, audits-scraper.ts, docs-scraper.ts.
 */
export class ApiCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();

  constructor(private readonly ttlMs: number | (() => number)) {}

  private getTtl(): number {
    return typeof this.ttlMs === 'function' ? this.ttlMs() : this.ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) { return null; }
    const ttl = this.getTtl();
    if (ttl > 0 && Date.now() - entry.timestamp >= ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Single-value TTL cache (for modules that cache one result, not a map). */
export class SingleCache<T> {
  private entry: { data: T; timestamp: number } | null = null;

  constructor(private readonly ttlMs: number) {}

  get(): T | null {
    if (!this.entry) { return null; }
    if (this.ttlMs > 0 && Date.now() - this.entry.timestamp >= this.ttlMs) {
      this.entry = null;
      return null;
    }
    return this.entry.data;
  }

  set(data: T): void {
    this.entry = { data, timestamp: Date.now() };
  }

  clear(): void {
    this.entry = null;
  }
}

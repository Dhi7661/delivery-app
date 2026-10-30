interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class CatalogCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(defaultTtlMs = 3 * 60 * 1000) {
    // Default 3 minutes TTL (within plan's 1 to 5 minutes requirement)
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses += 1;
      return null;
    }

    this.hits += 1;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Invalidates all cached catalog entries when prices or product availability change.
   */
  invalidate(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      entriesCount: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)).toFixed(2) : '0.00',
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

export const catalogCache = new CatalogCache();

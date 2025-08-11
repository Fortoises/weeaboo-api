export class SimpleCache<T> {
  private cache = new Map<string, { data: T; expires: number }>();
  private ttl: number;

  constructor(ttlSeconds: number) {
    this.ttl = ttlSeconds * 1000;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    console.log(`[Cache HIT] Serving ${key} from in-memory cache.`);
    return item.data;
  }

  set(key: string, data: T) {
    console.log(`[Cache SET] Storing ${key} in in-memory cache for ${this.ttl / 1000} seconds.`);
    const expires = Date.now() + this.ttl;
    this.cache.set(key, { data, expires });
  }
}
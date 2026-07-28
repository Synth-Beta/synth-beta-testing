/** Timeouts, soft cache, and rate limiting for adapters. */

export class MemoryCache {
  private store = new Map<string, { exp: number; value: unknown }>();

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.exp) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 15 * 60 * 1000) {
    this.store.set(key, { value, exp: Date.now() + ttlMs });
  }
}

export class RateLimiter {
  private timestamps = new Map<string, number[]>();

  constructor(private maxPerWindow: number, private windowMs: number) {}

  async take(bucket: string): Promise<void> {
    const now = Date.now();
    const arr = (this.timestamps.get(bucket) || []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.maxPerWindow) {
      const wait = this.windowMs - (now - arr[0]);
      await sleep(Math.max(wait, 50));
      return this.take(bucket);
    }
    arr.push(Date.now());
    this.timestamps.set(bucket, arr);
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createFetchHelpers(limiter: RateLimiter, cache: MemoryCache, defaultTimeoutMs = 8000) {
  const getEnv = (key: string) =>
    (typeof process !== 'undefined' ? process.env?.[key] : undefined) ||
    (typeof Deno !== 'undefined' ? (Deno as { env?: { get: (k: string) => string | undefined } }).env?.get(key) : undefined);

  async function fetchText(url: string, init?: RequestInit): Promise<string> {
    await limiter.take(new URL(url).host);
    const cacheKey = `text:${url}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;
    const res = await withTimeout(
      fetch(url, {
        ...init,
        headers: {
          'User-Agent': 'synth-editorial-research/2.0 (+https://getsynth.app)',
          Accept: 'text/html,application/xhtml+xml,application/xml,application/json,application/rss+xml;q=0.9,*/*;q=0.8',
          ...(init?.headers || {}),
        },
      }),
      defaultTimeoutMs,
      url,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = await res.text();
    cache.set(cacheKey, text);
    return text;
  }

  async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const text = await fetchText(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers || {}) },
    });
    return JSON.parse(text) as T;
  }

  return { getEnv, fetchText, fetchJson, cacheGet: cache.get.bind(cache), cacheSet: cache.set.bind(cache) };
}

// Deno global typing shim for shared package
declare const Deno: { env?: { get: (k: string) => string | undefined } } | undefined;

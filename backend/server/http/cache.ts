import {createHash} from 'node:crypto';

/**
 * Tiny in-memory TTL cache. MyBoma runs as a single Render instance, so a process-local
 * cache is consistent; with several instances each would hold its own copy and only the
 * TTL would bound staleness.
 */
export class TtlCache<V> {
  private entries = new Map<string, {value: V; expiresAt: number}>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V) {
    this.entries.delete(key);
    // Map keeps insertion order, so the first key is the oldest.
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, {value, expiresAt: this.now() + this.ttlMs});
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

/** Raw rows of the public "available listings" feed, keyed by limit/offset. */
export const publicListingsCache = new TtlCache<unknown[]>(60_000, 8);

/** Call after any write that can change which properties are listed or how they look. */
export const invalidatePublicListings = () => publicListingsCache.clear();

/** Weak ETag over a JSON body, so unchanged responses can be answered with 304. */
export const weakEtag = (body: string) => `W/"${createHash('sha1').update(body).digest('base64url')}"`;

/**
 * Cache-Control for files in the built frontend, by path relative to the dist folder.
 * Vite fingerprints everything under assets/, so those never change; index.html must
 * always revalidate; other public files (photos, icons, manifest) change rarely.
 */
export const staticCacheControl = (relativePath: string) => {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('assets/')) return 'public, max-age=31536000, immutable';
  if (normalized === 'index.html' || normalized.endsWith('.html')) return 'no-cache';
  // The service worker scripts must update promptly.
  if (/(^|\/)(sw|service-worker|OneSignalSDKWorker)[^/]*\.js$/.test(normalized)) return 'no-cache';
  return 'public, max-age=86400, stale-while-revalidate=604800';
};

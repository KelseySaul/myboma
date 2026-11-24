import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  TtlCache,
  invalidatePublicListings,
  publicListingsCache,
  staticCacheControl,
  weakEtag,
} from '../server/http/cache.ts';

describe('TtlCache', () => {
  it('returns values until they expire', () => {
    let now = 1_000;
    const cache = new TtlCache<string>(100, 5, () => now);
    cache.set('a', 'one');
    assert.equal(cache.get('a'), 'one');
    now += 99;
    assert.equal(cache.get('a'), 'one');
    now += 1;
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.size, 0);
  });

  it('evicts the oldest entry when full', () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('b'), 2);
    assert.equal(cache.get('c'), 3);
  });

  it('re-setting a key refreshes it instead of evicting another', () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    assert.equal(cache.size, 2);
    assert.equal(cache.get('a'), 10);
    assert.equal(cache.get('b'), 2);
  });
});

describe('public listings cache', () => {
  it('is emptied by invalidatePublicListings', () => {
    publicListingsCache.set('200:0', [{id: 'x'}]);
    assert.ok(publicListingsCache.get('200:0'));
    invalidatePublicListings();
    assert.equal(publicListingsCache.get('200:0'), undefined);
  });
});

describe('weakEtag', () => {
  it('is stable for equal bodies and differs otherwise', () => {
    assert.equal(weakEtag('[1]'), weakEtag('[1]'));
    assert.notEqual(weakEtag('[1]'), weakEtag('[2]'));
    assert.match(weakEtag('[]'), /^W\/".+"$/);
  });
});

describe('staticCacheControl', () => {
  it('caches fingerprinted assets forever', () => {
    assert.equal(staticCacheControl('assets/index-abc123.js'), 'public, max-age=31536000, immutable');
    assert.equal(staticCacheControl('assets\\index-abc123.css'), 'public, max-age=31536000, immutable');
  });

  it('always revalidates HTML and service workers', () => {
    assert.equal(staticCacheControl('index.html'), 'no-cache');
    assert.equal(staticCacheControl('OneSignalSDKWorker.js'), 'no-cache');
  });

  it('caches other public files for a day', () => {
    assert.equal(staticCacheControl('hero/hero-1.webp'), 'public, max-age=86400, stale-while-revalidate=604800');
    assert.equal(staticCacheControl('manifest.webmanifest'), 'public, max-age=86400, stale-while-revalidate=604800');
  });
});

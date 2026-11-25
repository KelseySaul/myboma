import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {assertAllowedRedirectUrl, buildAllowedRedirectOrigins} from '../server/helpers';
import {parseAccountIdsParam} from '../server/http/schemas';

describe('buildAllowedRedirectOrigins', () => {
  it('collects origins from app base and cors list', () => {
    const origins = buildAllowedRedirectOrigins(
      'http://localhost:4173',
      'http://localhost:5173,http://localhost:4173',
    );
    assert.equal(origins.has('http://localhost:4173'), true);
    assert.equal(origins.has('http://localhost:5173'), true);
  });
});

describe('assertAllowedRedirectUrl', () => {
  const allowed = buildAllowedRedirectOrigins('https://app.myboma.com', 'https://app.myboma.com');

  it('allows matching origin', () => {
    assert.doesNotThrow(() =>
      assertAllowedRedirectUrl('https://app.myboma.com/?ok=1', allowed),
    );
  });

  it('rejects foreign origin', () => {
    assert.throws(
      () => assertAllowedRedirectUrl('https://evil.example/phish', allowed),
      /not allowed/,
    );
  });
});

describe('parseAccountIdsParam', () => {
  const idA = '11111111-1111-4111-8111-111111111111';
  const idB = '22222222-2222-4222-8222-222222222222';

  it('parses comma-separated UUIDs and deduplicates', () => {
    assert.deepEqual(parseAccountIdsParam(`${idA}, ${idB}, ${idA}`), [idA, idB]);
  });

  it('accepts array query values and strips invalid entries', () => {
    assert.deepEqual(parseAccountIdsParam([`${idA},not-a-uuid`, idB, '']), [idA, idB]);
  });

  it('returns empty array for missing or invalid input', () => {
    assert.deepEqual(parseAccountIdsParam(undefined), []);
    assert.deepEqual(parseAccountIdsParam(''), []);
    assert.deepEqual(parseAccountIdsParam('all,invalid'), []);
  });
});

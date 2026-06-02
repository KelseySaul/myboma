import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {assertAllowedRedirectUrl, buildAllowedRedirectOrigins} from '../server/helpers';

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

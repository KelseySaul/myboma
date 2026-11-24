import assert from 'node:assert/strict';
import {type AddressInfo} from 'node:net';
import {after, before, describe, it} from 'node:test';
import express, {type Request} from 'express';
import sharp from 'sharp';
import {ImageRejectedError, imageKindForSubpath, toWebp} from '../server/services/images';
import {clientIp, makeLimiter, sessionKey} from '../server/http/rateLimits';

const fakeRequest = (headers: Record<string, string>, ip = '10.0.0.1') =>
  ({headers, ip, socket: {remoteAddress: ip}}) as unknown as Request;

describe('image uploads', () => {
  it('converts a large PNG to a WebP no bigger than 1600px, keeping the aspect ratio', async () => {
    const png = await sharp({create: {width: 4000, height: 2000, channels: 3, background: '#336699'}}).png().toBuffer();
    const {buffer, width, height} = await toWebp(png, 'photo');
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(width, 1600);
    assert.equal(height, 800);
  });

  it('shrinks avatars and logos to 512px and never enlarges small images', async () => {
    const jpeg = await sharp({create: {width: 3000, height: 3000, channels: 3, background: '#000'}}).jpeg().toBuffer();
    assert.equal((await toWebp(jpeg, 'avatar')).width, 512);
    const tiny = await sharp({create: {width: 100, height: 80, channels: 3, background: '#fff'}}).jpeg().toBuffer();
    assert.equal((await toWebp(tiny, 'photo')).width, 100);
  });

  it('applies EXIF orientation and strips metadata', async () => {
    // 200x100 stored with orientation 6 (rotate 90°) should come out 100x200.
    const rotated = await sharp({create: {width: 200, height: 100, channels: 3, background: '#f00'}})
      .jpeg()
      .withMetadata({orientation: 6})
      .toBuffer();
    const out = await toWebp(rotated, 'photo');
    assert.equal(out.width, 100);
    assert.equal(out.height, 200);
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
  });

  it('rejects files that are not real images, and SVG', async () => {
    await assert.rejects(toWebp(Buffer.from('%PDF-1.7 not an image')), ImageRejectedError);
    await assert.rejects(toWebp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), ImageRejectedError);
  });

  it('picks the output size from the upload subpath', () => {
    assert.equal(imageKindForSubpath('avatar'), 'avatar');
    assert.equal(imageKindForSubpath('platforms/abc'), 'logo');
    assert.equal(imageKindForSubpath(undefined), 'photo');
    assert.equal(imageKindForSubpath('private/receipts'), 'photo');
  });
});

describe('rate limit keys', () => {
  it('uses the Cloudflare client IP when present', () => {
    assert.equal(clientIp(fakeRequest({'cf-connecting-ip': '41.90.1.2'})), '41.90.1.2');
    assert.equal(clientIp(fakeRequest({}, '10.0.0.9')), '10.0.0.9');
  });

  it('hashes the session cookie or bearer token, never storing it', () => {
    const fromCookie = sessionKey(fakeRequest({cookie: 'theme=dark; __Secure-better-auth.session_token=abc.def'}));
    const fromBearer = sessionKey(fakeRequest({authorization: 'Bearer abc.def'}));
    assert.ok(fromCookie && /^[0-9a-f]{32}$/.test(fromCookie));
    assert.equal(fromCookie, fromBearer);
    assert.equal(sessionKey(fakeRequest({})), null);
  });
});

describe('rate limiter', () => {
  let baseUrl = '';
  let close: () => void = () => {};

  before(async () => {
    const app = express();
    app.post('/login', makeLimiter('test-cred', {windowMs: 60_000, limit: 2, skipSuccessfulRequests: true, error: 'Too many'}), (req, res) => {
      res.status(req.query.ok === '1' ? 200 : 401).json({});
    });
    app.get('/', makeLimiter('test-basic', {windowMs: 60_000, limit: 2, key: 'session', error: 'Slow down'}), (_req, res) => res.json({ok: true}));
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  after(() => close());

  it('returns 429 JSON with Retry-After once the limit is used up, per session', async () => {
    const headers = {cookie: 'better-auth.session_token=user-a'};
    assert.equal((await fetch(baseUrl, {headers})).status, 200);
    assert.equal((await fetch(baseUrl, {headers})).status, 200);
    const blocked = await fetch(baseUrl, {headers});
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), {error: 'Slow down'});
    assert.ok(blocked.headers.get('retry-after'));
    // A different signed-in user on the same IP is unaffected.
    assert.equal((await fetch(baseUrl, {headers: {cookie: 'better-auth.session_token=user-b'}})).status, 200);
  });

  it('only counts failed sign-ins', async () => {
    const headers = {cookie: 'better-auth.session_token=user-c'};
    for (let i = 0; i < 2; i += 1) assert.equal((await fetch(`${baseUrl}/login?ok=1`, {method: 'POST', headers})).status, 200);
    assert.equal((await fetch(`${baseUrl}/login`, {method: 'POST', headers})).status, 401);
    assert.equal((await fetch(`${baseUrl}/login`, {method: 'POST', headers})).status, 401);
    assert.equal((await fetch(`${baseUrl}/login`, {method: 'POST', headers})).status, 429);
  });
});

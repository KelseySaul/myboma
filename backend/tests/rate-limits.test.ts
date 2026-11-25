import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';
import type {Request, Response} from 'express';
import {makeLimiter} from '../server/http/rateLimits';

type MockResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  passedThrough: boolean;
};

async function invokeLimiter(
  limiter: ReturnType<typeof makeLimiter>,
  opts: {ip?: string; cfIp?: string; statusCode?: number; auth?: string} = {},
): Promise<MockResult> {
  const headers: Record<string, string> = {};
  const resEmitter = new EventEmitter();
  let status = opts.statusCode ?? 200;
  let body: unknown = null;
  let passedThrough = false;

  const req = {
    method: 'POST',
    path: '/test',
    ip: opts.ip ?? '127.0.0.1',
    headers: {
      ...(opts.cfIp ? {'cf-connecting-ip': opts.cfIp} : {}),
      ...(opts.auth ? {authorization: opts.auth} : {}),
    },
    socket: {remoteAddress: opts.ip ?? '127.0.0.1'},
    app: {get: () => false},
  } as unknown as Request;

  const res = Object.assign(resEmitter, {
    statusCode: status,
    headersSent: false,
    setHeader(name: string, value: string | number | string[]) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      return this;
    },
    append(name: string, value: string | string[]) {
      const key = name.toLowerCase();
      const next = Array.isArray(value) ? value.join(', ') : String(value);
      headers[key] = headers[key] ? `${headers[key]}, ${next}` : next;
      return this;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    status(code: number) {
      status = code;
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      this.headersSent = true;
      resEmitter.emit('finish');
      return this;
    },
    send(payload: unknown) {
      body = payload;
      this.headersSent = true;
      resEmitter.emit('finish');
      return this;
    },
  }) as unknown as Response;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    resEmitter.once('finish', done);
    void Promise.resolve(
      limiter(req, res, (err?: unknown) => {
        if (err) {
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }
        passedThrough = true;
        res.statusCode = opts.statusCode ?? 200;
        status = res.statusCode;
        resEmitter.emit('finish');
        done();
      }),
    ).catch((err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });

  return {status, headers, body, passedThrough};
}

describe('rate limiters (anti-abuse for sign-in and resend codes)', () => {
  it('blocks repeated 200 OK resend-code requests and returns Retry-After + retryAfterSeconds', async () => {
    const resendLimiter = makeLimiter('testResendCode', {
      windowMs: 60_000,
      limit: 3,
      error: 'Too many code requests.',
    });

    for (let i = 0; i < 3; i++) {
      const res = await invokeLimiter(resendLimiter, {cfIp: '198.51.100.10', statusCode: 200});
      assert.equal(res.passedThrough, true);
      assert.equal(res.status, 200);
    }

    const blocked = await invokeLimiter(resendLimiter, {cfIp: '198.51.100.10', statusCode: 200});
    assert.equal(blocked.passedThrough, false);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['retry-after']) >= 1);
    const payload = blocked.body as {error: string; retryAfterSeconds: number};
    assert.equal(payload.error, 'Too many code requests.');
    assert.ok(payload.retryAfterSeconds >= 1);
  });

  it('locks out repeated failed sign-in attempts while leaving separate IPs unaffected', async () => {
    const failedLimiter = makeLimiter('testFailedSignIn', {
      windowMs: 60_000,
      limit: 2,
      skipSuccessfulRequests: true,
      error: 'Too many failed sign-in attempts.',
    });

    // Successful sign-ins do not consume the failed-attempt budget
    const okRes = await invokeLimiter(failedLimiter, {cfIp: '203.0.113.10', statusCode: 200});
    assert.equal(okRes.passedThrough, true);

    // Two failed attempts exhaust the budget; the third is blocked with 429
    assert.equal((await invokeLimiter(failedLimiter, {cfIp: '203.0.113.10', statusCode: 401})).passedThrough, true);
    assert.equal((await invokeLimiter(failedLimiter, {cfIp: '203.0.113.10', statusCode: 401})).passedThrough, true);
    const blocked = await invokeLimiter(failedLimiter, {cfIp: '203.0.113.10', statusCode: 401});
    assert.equal(blocked.passedThrough, false);
    assert.equal(blocked.status, 429);

    // Different client IP is unaffected
    const otherIp = await invokeLimiter(failedLimiter, {cfIp: '203.0.113.11', statusCode: 401});
    assert.equal(otherIp.passedThrough, true);
  });
});

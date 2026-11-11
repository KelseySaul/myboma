import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  billingDateInDays,
  billingToday,
  buildRentInvoicePayload,
  currentBillingDueDate,
  dueDateForMonth,
  nextBillingDueDate,
} from '../src/lib/rentInvoices';
import {verifyMpesaCallback} from '../server/helpers';

describe('billing dates (Africa/Nairobi)', () => {
  it('builds first-of-month dates without timezone drift', () => {
    assert.equal(dueDateForMonth(2026, 10), '2026-11-01');
    assert.equal(dueDateForMonth(2026, 11), '2026-12-01');
    assert.equal(dueDateForMonth(2026, 12), '2027-01-01');
  });

  it('uses the Nairobi calendar day, not UTC', () => {
    // 2026-10-31 22:30 UTC is already 2026-11-01 01:30 in Nairobi (UTC+3).
    const lateUtc = new Date('2026-10-31T22:30:00Z');
    assert.equal(billingToday(lateUtc), '2026-11-01');
    assert.equal(currentBillingDueDate(lateUtc), '2026-11-01');
    assert.equal(nextBillingDueDate(lateUtc), '2026-12-01');
  });

  it('adds days across month boundaries', () => {
    assert.equal(billingDateInDays(30, new Date('2026-11-15T09:00:00Z')), '2026-12-15');
  });
});

describe('buildRentInvoicePayload', () => {
  it('always attributes the invoice to the property owner and platform', () => {
    const payload = buildRentInvoicePayload(
      {id: 'p1', landlordId: 'owner', platformId: 'plat', tenantId: 'T@X.com', price: '25000', status: 'rented', type: 'residential'},
      ' T@X.com ',
      '2099-01-01',
    );
    assert.equal(payload.landlordId, 'owner');
    assert.equal(payload.platformId, 'plat');
    assert.equal(payload.tenantId, 't@x.com');
    assert.equal(payload.amount, 25000);
    assert.equal(payload.status, 'pending');
  });
});

describe('verifyMpesaCallback', () => {
  const run = (secretEnv: string | undefined, req: {query?: Record<string, unknown>; headers?: Record<string, string>}) => {
    const previous = process.env.MPESA_CALLBACK_SECRET;
    if (secretEnv === undefined) delete process.env.MPESA_CALLBACK_SECRET;
    else process.env.MPESA_CALLBACK_SECRET = secretEnv;
    let status = 200;
    let nextCalled = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    };
    verifyMpesaCallback()({query: req.query ?? {}, headers: req.headers ?? {}} as any, res as any, () => {
      nextCalled = true;
    });
    if (previous === undefined) delete process.env.MPESA_CALLBACK_SECRET;
    else process.env.MPESA_CALLBACK_SECRET = previous;
    return {status, nextCalled};
  };

  it('fails closed when no secret is configured', () => {
    assert.deepEqual(run(undefined, {}), {status: 503, nextCalled: false});
  });

  it('accepts the secret from the callback URL query string', () => {
    assert.equal(run('s3cret', {query: {secret: 's3cret'}}).nextCalled, true);
  });

  it('accepts the secret from a header', () => {
    assert.equal(run('s3cret', {headers: {'x-mpesa-callback-secret': 's3cret'}}).nextCalled, true);
  });

  it('rejects a wrong or missing secret', () => {
    assert.deepEqual(run('s3cret', {query: {secret: 'nope'}}), {status: 401, nextCalled: false});
    assert.deepEqual(run('s3cret', {}), {status: 401, nextCalled: false});
  });
});

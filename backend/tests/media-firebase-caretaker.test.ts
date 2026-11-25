import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeStoredFileUrl} from '../server/http/fileUrls.ts';
import {
  FirebaseTokenError,
  normalizePhoneNumber,
  phoneLookupVariants,
  validateFirebaseGoogleClaims,
  validateFirebaseTokenClaims,
} from '../server/services/firebaseAuth.ts';
import {addMonthsToBillingDate, daysUntilDueDate} from '../../shared/rentInvoices.ts';
import {assertCanProvision, resolveProvisionedLandlordSubscription} from '../server/provisionPolicy.ts';
import {parseInvitePayload, serializeInvitePayload} from '../server/invitePolicy.ts';

test('normalizeStoredFileUrl fixes stale localhost:4173 and Render origins on web and mobile', () => {
  const webReq = {
    protocol: 'http',
    baseUrl: '/api/web',
    clientKind: 'web',
    get: (h: string) => (h.toLowerCase() === 'host' ? 'localhost:5173' : undefined),
  };
  const mobileReq = {
    protocol: 'https',
    baseUrl: '/api/mobile',
    clientKind: 'mobile',
    get: (h: string) => (h.toLowerCase() === 'host' ? 'myboma.kelseysaul.dev' : undefined),
  };

  assert.equal(
    normalizeStoredFileUrl(webReq, 'http://localhost:4173/api/files/uid-1/photo.webp'),
    '/api/files/uid-1/photo.webp',
  );
  assert.equal(
    normalizeStoredFileUrl(webReq, 'https://myboma.onrender.com/api/files/uid-1/photo.webp'),
    '/api/files/uid-1/photo.webp',
  );
  assert.equal(
    normalizeStoredFileUrl(webReq, 'http://localhost:4173/api/web/files/uid-1/private/receipt.webp'),
    '/api/web/files/uid-1/private/receipt.webp',
  );
  assert.equal(
    normalizeStoredFileUrl(mobileReq, '/api/files/uid-1/photo.webp'),
    'https://myboma.kelseysaul.dev/api/files/uid-1/photo.webp',
  );
  assert.equal(
    normalizeStoredFileUrl(webReq, 'https://images.unsplash.com/photo-123?auto=format'),
    'https://images.unsplash.com/photo-123?auto=format',
  );
});

test('Firebase phone normalization and token claim validation work as expected', () => {
  assert.equal(normalizePhoneNumber('0712 345 678'), '+254712345678');
  assert.equal(normalizePhoneNumber('254712345678'), '+254712345678');
  assert.equal(normalizePhoneNumber('+254712345678'), '+254712345678');
  assert.equal(normalizePhoneNumber('abc'), null);

  const variants = phoneLookupVariants('+254712345678');
  assert.ok(variants.includes('+254712345678'));
  assert.ok(variants.includes('254712345678'));
  assert.ok(variants.includes('0712345678'));

  const now = 1_800_000_000;
  const verified = validateFirebaseTokenClaims(
    {alg: 'RS256', kid: 'abc123'},
    {
      aud: 'myboma-c1c8b',
      iss: 'https://securetoken.google.com/myboma-c1c8b',
      sub: 'firebase-uid-1',
      exp: now + 3600,
      iat: now - 60,
      auth_time: now - 60,
      phone_number: '+254712345678',
    },
    'myboma-c1c8b',
    now,
  );
  assert.equal(verified.uid, 'firebase-uid-1');
  assert.equal(verified.phoneNumber, '+254712345678');

  assert.throws(
    () =>
      validateFirebaseTokenClaims(
        {alg: 'RS256', kid: 'abc123'},
        {
          aud: 'wrong-project',
          iss: 'https://securetoken.google.com/myboma-c1c8b',
          sub: 'firebase-uid-1',
          exp: now + 3600,
          iat: now - 60,
          phone_number: '+254712345678',
        },
        'myboma-c1c8b',
        now,
      ),
    FirebaseTokenError,
  );

  assert.throws(
    () =>
      validateFirebaseTokenClaims(
        {alg: 'RS256', kid: 'abc123'},
        {
          aud: 'myboma-c1c8b',
          iss: 'https://securetoken.google.com/myboma-c1c8b',
          sub: 'firebase-uid-1',
          exp: now - 600,
          iat: now - 3600,
          phone_number: '+254712345678',
        },
        'myboma-c1c8b',
        now,
      ),
    FirebaseTokenError,
  );
});

test('SuperAdmin landlord plan resolver computes free and paid plans accurately', () => {
  const anchor = new Date('2026-01-01T00:00:00Z');
  const freePlan = resolveProvisionedLandlordSubscription('free', 'monthly', anchor);
  assert.equal(freePlan.subscriptionPlan, 'free');
  assert.equal(freePlan.subscriptionStatus, 'active');
  assert.equal(freePlan.subscriptionExpiresAt, null);

  const proQuarterly = resolveProvisionedLandlordSubscription('pro', 'quarterly', anchor);
  assert.equal(proQuarterly.subscriptionPlan, 'pro:quarterly');
  assert.equal(proQuarterly.subscriptionStatus, 'active');
  assert.equal(proQuarterly.subscriptionExpiresAt, new Date(anchor.getTime() + 90 * 86_400_000).toISOString());

  const starterYearly = resolveProvisionedLandlordSubscription('starter', 'yearly', anchor);
  assert.equal(starterYearly.subscriptionPlan, 'starter:yearly');
  assert.equal(starterYearly.subscriptionExpiresAt, new Date(anchor.getTime() + 365 * 86_400_000).toISOString());
});

test('Landlords can provision caretakers for themselves and caretaker invite payloads round-trip', () => {
  const landlordActor = {
    uid: '11111111-1111-4111-8111-111111111111',
    email: 'landlord@example.com',
    role: 'landlord',
    isAdmin: false,
    isSuperAdmin: false,
    platformId: null,
  };

  assert.doesNotThrow(() =>
    assertCanProvision(landlordActor, {
      email: 'caretaker@example.com',
      displayName: 'Peter Caretaker',
      role: 'caretaker',
      landlordId: landlordActor.uid,
    }),
  );

  assert.throws(() =>
    assertCanProvision(landlordActor, {
      email: 'caretaker@example.com',
      displayName: 'Peter Caretaker',
      role: 'caretaker',
      landlordId: '22222222-2222-4222-8222-222222222222',
    }),
  );

  const serialized = serializeInvitePayload({
    v: 1,
    email: 'caretaker@example.com',
    role: 'caretaker',
    platformId: null,
    landlordId: landlordActor.uid,
    invitedBy: landlordActor.uid,
    invitedByName: 'Jane Landlord',
    displayName: 'Peter Caretaker',
    phone: '+254712345678',
    profile: {
      managedByAdminId: landlordActor.uid,
      propertyIds: ['33333333-3333-4333-8333-333333333333'],
    },
  });
  const parsed = parseInvitePayload(serialized);
  assert.equal(parsed?.role, 'caretaker');
  assert.deepEqual(parsed?.profile.propertyIds, ['33333333-3333-4333-8333-333333333333']);
});

test('Property Managers (agency admins) can invite landlords, tenants, and caretakers but not admins', () => {
  const agencyManager = {
    uid: '44444444-4444-4444-8444-444444444444',
    email: 'agency@example.com',
    role: 'admin',
    isAdmin: false,
    isSuperAdmin: false,
    platformId: null,
  };

  assert.doesNotThrow(() =>
    assertCanProvision(
      agencyManager,
      {
        email: 'owner@example.com',
        displayName: 'Grace Owner',
        role: 'landlord',
        rentRouting: 'admin',
      },
      true,
    ),
  );

  assert.doesNotThrow(() =>
    assertCanProvision(
      agencyManager,
      {
        email: 'staff@example.com',
        displayName: 'Sam Caretaker',
        role: 'caretaker',
        landlordId: agencyManager.uid,
      },
      true,
    ),
  );

  assert.throws(() =>
    assertCanProvision(
      agencyManager,
      {
        email: 'evil@example.com',
        displayName: 'Fake Admin',
        role: 'admin',
      },
      true,
    ),
  );
});

test('Firebase Google token claim validation accepts verified Google emails and rejects unverified ones', () => {
  const now = 1_800_000_000;
  const ok = validateFirebaseGoogleClaims(
    {alg: 'RS256', kid: 'kid-1'},
    {
      aud: 'myboma-c1c8b',
      iss: 'https://securetoken.google.com/myboma-c1c8b',
      sub: 'google-uid-42',
      exp: now + 3600,
      iat: now - 30,
      auth_time: now - 30,
      email: 'Grace.Wanjiku@gmail.com',
      email_verified: true,
      name: 'Grace Wanjiku',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    },
    'myboma-c1c8b',
    now,
  );
  assert.equal(ok.uid, 'google-uid-42');
  assert.equal(ok.email, 'grace.wanjiku@gmail.com');
  assert.equal(ok.name, 'Grace Wanjiku');
  assert.equal(ok.picture, 'https://lh3.googleusercontent.com/a/photo');

  assert.throws(
    () =>
      validateFirebaseGoogleClaims(
        {alg: 'RS256', kid: 'kid-1'},
        {
          aud: 'myboma-c1c8b',
          iss: 'https://securetoken.google.com/myboma-c1c8b',
          sub: 'google-uid-42',
          exp: now + 3600,
          iat: now - 30,
          email: 'unverified@gmail.com',
          email_verified: false,
        },
        'myboma-c1c8b',
        now,
      ),
    FirebaseTokenError,
  );
});

test('2-day rent reminder helper and advance-month billing date math clamp month ends accurately', () => {
  assert.equal(daysUntilDueDate('2026-12-01', '2026-11-29'), 2);
  assert.equal(daysUntilDueDate('2026-12-01', '2026-12-01'), 0);
  assert.equal(daysUntilDueDate('2026-12-01', '2026-12-04'), -3);

  assert.equal(addMonthsToBillingDate('2026-11-25', 1), '2026-12-25');
  assert.equal(addMonthsToBillingDate('2026-11-25', 3), '2027-02-25');
  assert.equal(addMonthsToBillingDate('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsToBillingDate('2028-01-31', 1), '2028-02-29');
});

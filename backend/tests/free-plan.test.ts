import assert from 'node:assert/strict';
import {before, describe, it} from 'node:test';
import {
  FREE_PLAN,
  encodeSubscriptionPlan,
  getSubscriptionAmount,
  getSubscriptionFeatures,
  isFreePlan,
  isLandlordSubscriptionActive,
} from '../../shared/landlordSubscription';
import type * as MiddlewareModule from '../server/http/middleware';
import type * as SubscriptionModule from '../server/landlordSubscriptionHandlers';
import type {UserProfileRecord} from '../server/types';

// db/client.ts requires a connection string at import time; nothing here queries it.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost/test';

let middleware: typeof MiddlewareModule;
let subscriptions: typeof SubscriptionModule;
before(async () => {
  middleware = await import('../server/http/middleware');
  subscriptions = await import('../server/landlordSubscriptionHandlers');
});

const landlord = (overrides: Partial<UserProfileRecord> = {}) =>
  ({
    uid: 'landlord-uid',
    email: 'landlord@example.com',
    role: 'landlord',
    isAdmin: false,
    isSuperAdmin: false,
    subscriptionPlan: FREE_PLAN,
    subscriptionStatus: 'active',
    subscriptionExpiresAt: null,
    ...overrides,
  }) as unknown as UserProfileRecord;

describe('free plan definition', () => {
  it('costs nothing and allows up to 2 units and 1 building without the maintenance hub', () => {
    assert.equal(getSubscriptionAmount('free', 'monthly'), 0);
    const features = getSubscriptionFeatures({subscriptionPlan: FREE_PLAN, role: 'landlord'});
    assert.equal(features.maxListings, 2);
    assert.equal(features.maxBuildings, 1);
    assert.equal(features.maintenanceHub, false);
  });

  it('matches the updated Starter, Pro, and Agency / Enterprise pricing and limits', () => {
    assert.equal(getSubscriptionAmount('starter', 'monthly'), 750);
    assert.equal(getSubscriptionAmount('starter', 'yearly'), 7500);
    const starter = getSubscriptionFeatures({subscriptionPlan: encodeSubscriptionPlan('starter', 'monthly'), role: 'landlord'});
    assert.equal(starter.maxListings, 10);
    assert.equal(starter.maxBuildings, 2);
    assert.equal(starter.maintenanceHub, true);

    assert.equal(getSubscriptionAmount('pro', 'monthly'), 2000);
    assert.equal(getSubscriptionAmount('pro', 'yearly'), 20000);
    const pro = getSubscriptionFeatures({subscriptionPlan: encodeSubscriptionPlan('pro', 'monthly'), role: 'landlord'});
    assert.equal(pro.maxListings, 20);
    assert.equal(pro.maxBuildings, 5);
    assert.equal(pro.caretakerAccess, true);

    assert.equal(getSubscriptionAmount('proplus', 'monthly'), 10000);
    assert.equal(getSubscriptionAmount('proplus', 'yearly'), 100000);
    const agency = getSubscriptionFeatures({subscriptionPlan: encodeSubscriptionPlan('proplus', 'monthly'), role: 'admin'});
    assert.equal(agency.maxListings, null);
    assert.equal(agency.maxBuildings, null);
    assert.equal(agency.agencyAccess, true);
  });

  it('is recognised only for the free tier', () => {
    assert.equal(isFreePlan(FREE_PLAN), true);
    assert.equal(isFreePlan(encodeSubscriptionPlan('starter', 'monthly')), false);
    assert.equal(isFreePlan(null), false);
  });
});

describe('free plan activity', () => {
  it('is active on the client without an expiry date', () => {
    assert.equal(
      isLandlordSubscriptionActive({role: 'landlord', subscriptionPlan: FREE_PLAN, subscriptionStatus: 'active', subscriptionExpiresAt: null}),
      true,
    );
  });

  it('still requires an expiry date for paid plans', () => {
    assert.equal(
      isLandlordSubscriptionActive({
        role: 'landlord',
        subscriptionPlan: encodeSubscriptionPlan('pro', 'monthly'),
        subscriptionStatus: 'active',
        subscriptionExpiresAt: null,
      }),
      false,
    );
  });

  it('is active on the server and limited to 2 units and 1 building', () => {
    assert.equal(middleware.hasActiveSubscription(landlord()), true);
    assert.equal(middleware.unitLimitFor(landlord()), 2);
    assert.equal(middleware.buildingLimitFor(landlord()), 1);
  });
});

describe('isOnFreePlan', () => {
  it('flags free-plan landlords', () => {
    assert.equal(middleware.isOnFreePlan(landlord()), true);
  });

  it('never applies to platform admins or paid landlords', () => {
    assert.equal(middleware.isOnFreePlan(landlord({isSuperAdmin: true})), false);
    assert.equal(middleware.isOnFreePlan(landlord({isAdmin: true})), false);
    assert.equal(middleware.isOnFreePlan(landlord({subscriptionPlan: encodeSubscriptionPlan('starter', 'monthly')})), false);
  });
});

describe('subscription request schemas', () => {
  it('free plan activation only needs rent payout details', () => {
    assert.equal(subscriptions.landlordFreePlanSchema.safeParse({rentPayoutMethod: 'cash'}).success, true);
    assert.equal(subscriptions.landlordFreePlanSchema.safeParse({rentPayoutMethod: 'mpesa'}).success, false);
  });

  it('paid checkout cannot be used to buy the free tier', () => {
    const result = subscriptions.landlordSubscriptionCheckoutSchema.safeParse({
      tier: 'free',
      billing: 'monthly',
      paymentMethod: 'mpesa',
      rentPayoutMethod: 'cash',
    });
    assert.equal(result.success, false);
  });
});

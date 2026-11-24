import assert from 'node:assert/strict';
import {before, describe, it} from 'node:test';
import type * as AuthzModule from '../db/authz';

// db/client.ts requires a connection string at import time; these tests only exercise the
// pure (non-querying) checks, so a placeholder URL is enough — nothing connects.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost/test';

let authz: typeof AuthzModule;
before(async () => {
  authz = await import('../db/authz');
});

const actor = (overrides: Partial<AuthzModule.Actor> = {}): AuthzModule.Actor => ({
  id: 'actor-uid',
  email: 'actor@example.com',
  role: 'landlord',
  isAdmin: false,
  isSuperAdmin: false,
  platformId: null,
  ...overrides,
});

describe('platform isolation', () => {
  it('a platform-less admin does not match platform-less rows', () => {
    assert.equal(authz.isAdminInPlatform(actor({role: 'admin', isAdmin: true}), null), false);
  });

  it('an admin matches only their own platform', () => {
    const admin = actor({role: 'admin', isAdmin: true, platformId: 'p1'});
    assert.equal(authz.isAdminInPlatform(admin, 'p1'), true);
    assert.equal(authz.isAdminInPlatform(admin, 'p2'), false);
    assert.equal(authz.isAdminInPlatform(admin, null), false);
  });

  it('super admins reach every platform', () => {
    assert.equal(authz.isAdminInPlatform(actor({isSuperAdmin: true}), 'anything'), true);
  });
});

describe('canWriteUser', () => {
  const target = {uid: 'victim', platformId: null, isAdmin: false, isSuperAdmin: false, role: 'landlord'};

  it('a self-signup admin (null platform) cannot write other null-platform users', () => {
    assert.equal(authz.canWriteUser(actor({role: 'admin', isAdmin: true}), target), false);
  });

  it('users cannot grant themselves admin', () => {
    const me = actor();
    assert.equal(authz.canWriteUser(me, {uid: me.id, platformId: null, isAdmin: true, isSuperAdmin: false, role: 'admin'}), false);
  });

  it('users may edit their own non-privileged profile', () => {
    const me = actor();
    assert.equal(authz.canWriteUser(me, {uid: me.id, platformId: null, isAdmin: false, isSuperAdmin: false, role: 'landlord'}), true);
  });
});

describe('building administration', () => {
  it('only the owner or a same-platform admin may administer a building', () => {
    const building = {landlordId: 'owner', platformId: 'p1'};
    assert.equal(authz.canAdministerBuilding(actor({id: 'owner'}), building), true);
    assert.equal(authz.canAdministerBuilding(actor({id: 'manager'}), building), false);
    assert.equal(authz.canAdministerBuilding(actor({isAdmin: true, platformId: 'p1'}), building), true);
    assert.equal(authz.canAdministerBuilding(actor({isAdmin: true, platformId: 'p2'}), building), false);
  });
});

describe('notifications', () => {
  it('recipients only see their own notifications', () => {
    assert.equal(authz.canViewNotification(actor({email: 'A@x.com'}), {recipientEmail: 'a@X.com'}), true);
    assert.equal(authz.canViewNotification(actor(), {recipientEmail: 'someone@else.com'}), false);
  });
});

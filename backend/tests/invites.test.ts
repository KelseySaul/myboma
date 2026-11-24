import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  INVITE_TTL_MS,
  buildInviteSignupBody,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteIdentifier,
  isInviteExpired,
  isWellFormedInviteToken,
  maskEmail,
  parseInvitePayload,
  resolveSignupProfile,
  serializeInvitePayload,
  type InvitePayload,
} from '../server/invitePolicy';

const payload = (overrides: Partial<InvitePayload> = {}): InvitePayload => ({
  v: 1,
  email: 'tenant@example.com',
  role: 'tenant',
  platformId: null,
  landlordId: 'landlord-uid',
  invitedBy: 'landlord-uid',
  invitedByName: 'Jane Landlord',
  displayName: 'Tom Tenant',
  phone: null,
  profile: {},
  ...overrides,
});

describe('invite tokens', () => {
  it('are 256-bit, URL-safe and unique', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    assert.equal(a.length, 43);
    assert.ok(isWellFormedInviteToken(a));
    assert.notEqual(a, b);
  });

  it('are stored only as a SHA-256 hash', () => {
    const token = generateInviteToken();
    const identifier = inviteIdentifier(token);
    assert.equal(identifier, `invite:${hashInviteToken(token)}`);
    assert.match(identifier, /^invite:[0-9a-f]{64}$/);
    assert.ok(!identifier.includes(token));
  });

  it('rejects malformed tokens before any lookup', () => {
    assert.equal(isWellFormedInviteToken(''), false);
    assert.equal(isWellFormedInviteToken('short'), false);
    assert.equal(isWellFormedInviteToken(`${'a'.repeat(42)}=`), false);
    assert.equal(isWellFormedInviteToken(undefined), false);
  });

  it('expire after seven days', () => {
    const now = new Date('2026-11-24T10:00:00Z');
    const expiresAt = inviteExpiry(now);
    assert.equal(expiresAt.getTime() - now.getTime(), INVITE_TTL_MS);
    assert.equal(isInviteExpired(expiresAt, new Date(now.getTime() + INVITE_TTL_MS - 1)), false);
    assert.equal(isInviteExpired(expiresAt, new Date(now.getTime() + INVITE_TTL_MS)), true);
  });
});

describe('invite payload', () => {
  it('round-trips and normalises the email', () => {
    const parsed = parseInvitePayload(serializeInvitePayload(payload({email: 'Tenant@Example.COM'})));
    assert.equal(parsed?.email, 'tenant@example.com');
    assert.equal(parsed?.role, 'tenant');
  });

  it('rejects anything that is not a valid invite', () => {
    assert.equal(parseInvitePayload('not json'), null);
    assert.equal(parseInvitePayload(JSON.stringify({v: 1, email: 'x@y.z', role: 'superadmin'})), null);
    assert.equal(parseInvitePayload(JSON.stringify({v: 2, email: 'x@y.z', role: 'tenant'})), null);
  });

  it('masks the email shown to whoever opens the link', () => {
    assert.equal(maskEmail('jane.doe@gmail.com'), 'j***@gmail.com');
  });
});

describe('accepting an invite', () => {
  it('always creates the account for the invited email, ignoring any email the browser sends', () => {
    const body = buildInviteSignupBody(payload(), {
      name: ' Attacker ',
      password: 'correct horse',
      email: 'attacker@evil.test',
    });
    assert.equal(body.email, 'tenant@example.com');
    assert.equal(body.name, 'Attacker');
    // The invitation itself is applied only after the token is verified.
    assert.equal(body.intended_role, 'hunter');
  });
});

describe('signup and pending invitations', () => {
  const invitation = {role: 'tenant' as const, platformId: 'platform-1', displayName: 'Tom', phone: '0700000000'};

  it('does not hand an invitation or tenancy to an unverified signup', () => {
    const result = resolveSignupProfile({invitation, emailVerified: false, requestedRole: 'hunter'});
    assert.equal(result.applyInvitation, false);
    assert.equal(result.role, 'hunter');
    assert.equal(result.platformId, null);
    assert.equal(result.linkLeases, false);
  });

  it('does not let an unverified signup claim the tenant role itself', () => {
    const result = resolveSignupProfile({invitation: null, emailVerified: false, requestedRole: 'tenant'});
    assert.equal(result.role, 'hunter');
  });

  it('does not grant admin to an unverified signup with an admin invitation', () => {
    const result = resolveSignupProfile({
      invitation: {...invitation, role: 'admin'},
      emailVerified: false,
      requestedRole: 'landlord',
    });
    assert.equal(result.role, 'landlord');
    assert.equal(result.applyInvitation, false);
  });

  it('applies the invitation for a verified mailbox (e.g. Google sign-in)', () => {
    const result = resolveSignupProfile({invitation, emailVerified: true, requestedRole: 'hunter'});
    assert.equal(result.applyInvitation, true);
    assert.equal(result.role, 'tenant');
    assert.equal(result.platformId, 'platform-1');
    assert.equal(result.linkLeases, true);
  });

  it('keeps a self-chosen landlord role when there is no invitation', () => {
    const result = resolveSignupProfile({invitation: null, emailVerified: false, requestedRole: 'landlord'});
    assert.equal(result.role, 'landlord');
  });
});

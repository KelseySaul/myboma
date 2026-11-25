/**
 * Account invitations: a single-use, expiring link emailed to the invitee. Only the SHA-256
 * of the token is stored (in Better Auth's `verification` table), the account is created
 * with the invited email when the link is used, and the token is deleted at that point.
 */
import {and, eq, isNull, like, sql} from 'drizzle-orm';
import {auth} from './auth.ts';
import {rootDb} from '../db/client.ts';
import * as schema from '../db/schema/index.js';
import {appBaseUrl} from './http/config.ts';
import {addPlatformMembership, membershipRoleFor} from './memberships.ts';
import {buildInviteEmail, sendEmail} from './services/email.ts';
import {
  INVITE_IDENTIFIER_PREFIX,
  buildInviteSignupBody,
  generateInviteToken,
  inviteExpiry,
  inviteIdentifier,
  isInviteExpired,
  isWellFormedInviteToken,
  parseInvitePayload,
  serializeInvitePayload,
  type InvitePayload,
} from './invitePolicy.ts';

// Invite tokens are system data: they are read by unauthenticated visitors and written on
// behalf of inviters, so they always use the owner connection rather than an RLS scope.
const db = rootDb;

/** Removes every outstanding invite link for an email (re-invites replace older links). */
export const revokeInvitesForEmail = async (email: string) => {
  const target = email.trim().toLowerCase();
  const rows = await db
    .select({id: schema.authVerification.id, value: schema.authVerification.value})
    .from(schema.authVerification)
    .where(like(schema.authVerification.identifier, `${INVITE_IDENTIFIER_PREFIX}%`));
  const ids = rows.filter((row) => parseInvitePayload(row.value)?.email === target).map((row) => row.id);
  for (const id of ids) {
    await db.delete(schema.authVerification).where(eq(schema.authVerification.id, id));
  }
  return ids.length;
};

/** Creates a fresh invite link for `payload.email` and emails it. */
export const createAndSendInvite = async (payload: Omit<InvitePayload, 'v'>) => {
  const email = payload.email.trim().toLowerCase();
  await revokeInvitesForEmail(email);

  const token = generateInviteToken();
  const expiresAt = inviteExpiry();
  await db.insert(schema.authVerification).values({
    identifier: inviteIdentifier(token),
    value: serializeInvitePayload({...payload, v: 1, email}),
    expiresAt,
  });

  const url = `${appBaseUrl.replace(/\/$/, '')}/invite?token=${encodeURIComponent(token)}`;
  await sendEmail(buildInviteEmail({to: email, inviterName: payload.invitedByName, role: payload.role, url, expiresAt}));
  return {expiresAt};
};

type LookupResult =
  | {status: 'ok'; id: string; payload: InvitePayload}
  | {status: 'invalid'}
  | {status: 'expired'};

export const lookupInvite = async (token: unknown): Promise<LookupResult> => {
  if (!isWellFormedInviteToken(token)) return {status: 'invalid'};
  const row = await db.query.authVerification.findFirst({
    where: eq(schema.authVerification.identifier, inviteIdentifier(token)),
  });
  if (!row) return {status: 'invalid'};
  if (isInviteExpired(row.expiresAt)) {
    await db.delete(schema.authVerification).where(eq(schema.authVerification.id, row.id));
    return {status: 'expired'};
  }
  const payload = parseInvitePayload(row.value);
  if (!payload) return {status: 'invalid'};
  return {status: 'ok', id: row.id, payload};
};

/** Gives an account everything its invitation promised: role, platform, profile fields, leases. */
export const applyInvitationToAccount = async (uid: string, payload: InvitePayload, details: {name: string; phone?: string | null}) => {
  const isAdmin = payload.role === 'admin';
  const {subscriptionExpiresAt, propertyIds, ...profile} = payload.profile ?? {};
  const managedByAdminId =
    profile.managedByAdminId !== undefined
      ? profile.managedByAdminId
      : payload.role === 'caretaker'
        ? payload.landlordId
        : undefined;
  await db
    .update(schema.users)
    .set({
      role: payload.role,
      isAdmin,
      platformId: payload.platformId,
      displayName: details.name || payload.displayName || 'User',
      phone: details.phone?.trim() || payload.phone || null,
      mustChangePassword: false,
      ...profile,
      ...(managedByAdminId !== undefined ? {managedByAdminId} : {}),
      ...(subscriptionExpiresAt !== undefined
        ? {subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null}
        : {}),
    })
    .where(eq(schema.users.uid, uid));

  await addPlatformMembership(payload.platformId, uid, isAdmin ? 'admin' : membershipRoleFor({role: payload.role}));

  // If a landlord invited a caretaker with specific properties assigned, link them in property_managers.
  if (payload.role === 'caretaker' && payload.landlordId && Array.isArray(propertyIds) && propertyIds.length > 0) {
    const ownedProperties = await db
      .select({id: schema.properties.id})
      .from(schema.properties)
      .where(eq(schema.properties.landlordId, payload.landlordId));
    const ownedSet = new Set(ownedProperties.map((p) => p.id));
    const validIds = propertyIds.filter((id) => ownedSet.has(id));
    for (const propertyId of validIds) {
      await db
        .insert(schema.propertyManagers)
        .values({propertyId, userId: uid, landlordId: payload.landlordId, role: 'manager'})
        .onConflictDoNothing();
    }
  }

  await db
    .update(schema.leases)
    .set({tenantUserId: uid})
    .where(and(sql`lower(${schema.leases.tenantEmail}) = ${payload.email}`, isNull(schema.leases.tenantUserId)));
};

export class InviteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Uses an invite: creates the account for the invited email, verifies it (opening the link
 * proves inbox access), applies the invitation and signs the person in. Returns the
 * Set-Cookie headers of the new session. The token is consumed in every terminal outcome.
 */
export const acceptInvite = async (input: {token: string; name: string; phone?: string | null; password: string}) => {
  const lookup = await lookupInvite(input.token);
  if (lookup.status === 'invalid') throw new InviteError(404, 'This invitation link is invalid or has already been used.');
  if (lookup.status === 'expired') throw new InviteError(410, 'This invitation has expired. Ask for a new one.');

  // Single use: claim the token before doing anything else, so two simultaneous requests
  // can't both create an account from it.
  const claimed = await db
    .delete(schema.authVerification)
    .where(eq(schema.authVerification.id, lookup.id))
    .returning({id: schema.authVerification.id});
  if (!claimed.length) throw new InviteError(404, 'This invitation link is invalid or has already been used.');

  const {payload} = lookup;
  const existing = await db.query.authUser.findFirst({
    where: sql`lower(${schema.authUser.email}) = ${payload.email}`,
    columns: {id: true},
  });
  if (existing) throw new InviteError(409, 'This email already has an account. Sign in instead.');

  const created = await auth.api.signUpEmail({
    body: buildInviteSignupBody(payload, input) as Parameters<typeof auth.api.signUpEmail>[0]['body'],
  });
  const uid = created.user.id;

  await db.update(schema.authUser).set({emailVerified: true}).where(eq(schema.authUser.id, uid));
  await applyInvitationToAccount(uid, payload, {name: input.name, phone: input.phone});

  // Sign in explicitly: signup may not open a session when email verification is required.
  const signIn = await auth.api.signInEmail({
    body: {email: payload.email, password: input.password},
    returnHeaders: true,
  });
  const setCookies = typeof signIn.headers?.getSetCookie === 'function'
    ? signIn.headers.getSetCookie()
    : signIn.headers?.get('set-cookie')
      ? [signIn.headers.get('set-cookie')!]
      : [];
  if (!setCookies.length) {
    throw new InviteError(500, 'Your account was created, but we could not sign you in. Please sign in with the password you chose.');
  }
  return {uid, email: payload.email, role: payload.role, setCookies};
};

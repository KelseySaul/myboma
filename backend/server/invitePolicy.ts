/**
 * Pure rules for account invitations: token generation/hashing, expiry, the stored payload,
 * and which invitation (if any) a new account inherits. No database access here, so it is
 * unit-tested directly; server/inviteService.ts does the I/O.
 */
import {createHash, randomBytes} from 'node:crypto';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_IDENTIFIER_PREFIX = 'invite:';

/**
 * Tracks emails currently being created through a verified single-use invite link so
 * Better-Auth's `sendOnSignUp` hook does not dispatch a redundant "Verify your email"
 * message right after the invitee already proved mailbox ownership by opening the invite.
 */
const activeInviteSignupEmails = new Map<string, number>();

export const beginInviteVerifiedSignup = (email: string) => {
  const key = email.trim().toLowerCase();
  if (!key) return;
  activeInviteSignupEmails.set(key, (activeInviteSignupEmails.get(key) ?? 0) + 1);
};

export const endInviteVerifiedSignup = (email: string) => {
  const key = email.trim().toLowerCase();
  if (!key) return;
  const remaining = (activeInviteSignupEmails.get(key) ?? 0) - 1;
  if (remaining > 0) activeInviteSignupEmails.set(key, remaining);
  else activeInviteSignupEmails.delete(key);
};

export const shouldSkipVerificationEmail = (email: string | null | undefined, emailVerified?: boolean | null) => {
  if (emailVerified) return true;
  if (!email) return false;
  return (activeInviteSignupEmails.get(email.trim().toLowerCase()) ?? 0) > 0;
};

export type InviteRole = 'tenant' | 'landlord' | 'hunter' | 'admin' | 'caretaker';

/** Profile fields the inviter chose that are applied when the invitee accepts. */
export type InviteProfileOverrides = Partial<{
  rentRecipientId: string | null;
  managedByAdminId: string | null;
  rentPayoutMethod: 'cash' | 'mpesa' | 'bank' | null;
  mpesaSettlementPhone: string | null;
  mpesaSettlementShortCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: 'none' | 'pending' | 'active' | 'expired' | 'suspended';
  subscriptionExpiresAt: string | null;
  propertyIds: string[];
}>;

export type InvitePayload = {
  v: 1;
  email: string;
  role: InviteRole;
  platformId: string | null;
  landlordId: string | null;
  invitedBy: string;
  invitedByName: string;
  displayName: string | null;
  phone: string | null;
  profile: InviteProfileOverrides;
};

/** A fresh secret for the email link. Only its hash is ever stored. */
export const generateInviteToken = () => randomBytes(32).toString('base64url');

export const hashInviteToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

export const inviteIdentifier = (token: string) => `${INVITE_IDENTIFIER_PREFIX}${hashInviteToken(token)}`;

/** Tokens are 32 random bytes in base64url: exactly 43 URL-safe characters. */
export const isWellFormedInviteToken = (token: unknown): token is string =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

export const inviteExpiry = (now = new Date()) => new Date(now.getTime() + INVITE_TTL_MS);

export const isInviteExpired = (expiresAt: Date | string, now = new Date()) =>
  new Date(expiresAt).getTime() <= now.getTime();

/** j***@gmail.com — enough for the invitee to recognise, useless to anyone else. */
export const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
};

export const serializeInvitePayload = (payload: InvitePayload) => JSON.stringify(payload);

export const parseInvitePayload = (value: string): InvitePayload | null => {
  try {
    const parsed = JSON.parse(value) as InvitePayload;
    if (parsed?.v !== 1 || typeof parsed.email !== 'string' || !parsed.email.includes('@')) return null;
    if (!['tenant', 'landlord', 'hunter', 'admin', 'caretaker'].includes(parsed.role)) return null;
    return {...parsed, email: parsed.email.trim().toLowerCase(), profile: parsed.profile ?? {}};
  } catch {
    return null;
  }
};

/**
 * Body for the account created when an invite is accepted. The email ALWAYS comes from
 * the stored invite, never from what the browser sent, so a leaked or forwarded link can
 * only ever create the invited person's account.
 */
export const buildInviteSignupBody = (
  payload: InvitePayload,
  input: {name: string; phone?: string | null; password: string} & Record<string, unknown>,
) => ({
  email: payload.email,
  password: input.password,
  name: input.name.trim(),
  full_name: input.name.trim(),
  phone: input.phone?.trim() || payload.phone || undefined,
  // The profile is created as a plain account; the invitation is applied explicitly
  // after the invite token has been verified (see inviteService.acceptInvite).
  intended_role: 'hunter',
});

type InvitationRow = {role: InviteRole; platformId: string | null; displayName: string | null; phone: string | null};

/**
 * Decides what a brand-new account gets at signup. An invitation is honoured only for a
 * mailbox the person has proven they own (Google sign-in, or later via email verification /
 * the invite link). Otherwise anyone could register an invited address first and take over
 * the tenancy, platform or admin rights waiting for it.
 */
export const resolveSignupProfile = (input: {
  invitation: InvitationRow | null | undefined;
  emailVerified: boolean;
  requestedRole: unknown;
  requestedName?: string | null;
  requestedPhone?: string | null;
  authName?: string | null;
}) => {
  const selfRole = ['landlord', 'tenant', 'hunter'].includes(String(input.requestedRole))
    ? (String(input.requestedRole) as 'landlord' | 'tenant' | 'hunter')
    : 'hunter';
  const applyInvitation = Boolean(input.invitation && input.emailVerified);
  const invitation = applyInvitation ? input.invitation! : null;
  // Self-chosen 'tenant' grants nothing by itself (no lease is linked without a verified
  // mailbox), but keep unverified tenant claims as hunters so the UI doesn't show an empty
  // tenant dashboard to someone who merely typed an invited address.
  const role: InviteRole = invitation ? invitation.role : selfRole === 'tenant' ? 'hunter' : selfRole;
  return {
    applyInvitation,
    role,
    platformId: invitation?.platformId ?? null,
    displayName: input.requestedName || invitation?.displayName || input.authName || 'User',
    phone: input.requestedPhone || invitation?.phone || null,
    linkLeases: input.emailVerified,
  };
};

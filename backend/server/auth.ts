import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import { and, eq, isNull, sql } from 'drizzle-orm';
// Auth is trusted system code: it always uses the owner connection, never a user's
// RLS-scoped request transaction (provisioning calls signUpEmail inside a request).
import { rootDb as db } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import {sendEmail} from './services/email.ts';
import {deploymentOrigins} from './http/config.ts';
import {resolveSignupProfile} from './invitePolicy.ts';

// Roles a person may pick for themselves at signup. 'admin' is deliberately absent:
// admin rights are only ever granted by a super admin (provisioning / role endpoint)
// or by an admin invitation once the invitee has proven ownership of the mailbox.
const SELF_SIGNUP_ROLES = ['landlord', 'tenant', 'hunter'] as const;
type Role = (typeof SELF_SIGNUP_ROLES)[number] | 'admin' | 'caretaker';

/**
 * Ports supabase-setup.sql's handle_new_user() trigger: on every new auth user
 * (email/password signup OR Google OAuth), look up a pending `invitations` row by
 * email and seed the app-level `public.users` profile row from it, falling back to
 * whatever the signup form sent (intended_role/phone/full_name), then 'hunter'.
 * There is no Postgres trigger system here, so this runs as a databaseHooks.user.create
 * "after" hook instead — same effect, same idempotent upsert-by-uid semantics.
 */
async function seedProfileForNewAuthUser(
  authUser: { id: string; email?: string | null; name?: string | null; emailVerified?: boolean | null },
  requestBody: Record<string, unknown> | undefined,
) {
  if (!authUser.email) throw new Error(`New auth user ${authUser.id} has no email; cannot provision a profile.`);
  const normalizedEmail = authUser.email.trim().toLowerCase();

  const invited = await db.query.invitations.findFirst({
    where: eq(schema.invitations.email, normalizedEmail),
  });

  // An invitation (tenant, managed landlord, admin) and any tenancy waiting for this email
  // are honoured only for a mailbox the person has proven they own (Google sign-in here;
  // email/password signups get them via afterEmailVerification or the invite link).
  // Otherwise anyone could register an invited address first and take what was meant for
  // its owner.
  const resolved = resolveSignupProfile({
    invitation: invited ?? null,
    emailVerified: Boolean(authUser.emailVerified),
    requestedRole: requestBody?.intended_role,
    requestedName: requestBody?.full_name as string | undefined,
    requestedPhone: requestBody?.phone as string | undefined,
    authName: authUser.name,
  });
  const resolvedRole: Role = resolved.role;
  const displayName = resolved.displayName;
  const phone = resolved.phone;
  const invitedPlatformId = resolved.platformId;
  const mustChangePassword = Boolean(requestBody?.must_change_password);
  const termsAcceptedAt = (requestBody?.terms_accepted_at as string | undefined) ?? null;
  const termsVersion = (requestBody?.terms_version as string | undefined) ?? null;
  const privacyVersion = (requestBody?.privacy_version as string | undefined) ?? null;

  const existing = await db.query.users.findFirst({ where: eq(schema.users.uid, authUser.id) });
  if (existing) {
    // Mirrors the trigger's ON CONFLICT merge: never clobber values the profile already has.
    await db
      .update(schema.users)
      .set({
        platformId: existing.platformId ?? invitedPlatformId,
        displayName: existing.displayName || displayName,
        phone: existing.phone || phone,
        mustChangePassword: existing.mustChangePassword || mustChangePassword,
      })
      .where(eq(schema.users.uid, authUser.id));
    return;
  }

  await db.insert(schema.users).values({
    uid: authUser.id,
    platformId: invitedPlatformId,
    managedByAdminId: resolved.applyInvitation && invited?.role === 'caretaker' ? (invited.landlordId ?? null) : null,
    email: normalizedEmail,
    displayName,
    role: resolvedRole,
    isAdmin: resolvedRole === 'admin',
    isSuperAdmin: false,
    phone,
    mustChangePassword,
    termsAcceptedAt: termsAcceptedAt ? new Date(termsAcceptedAt) : null,
    termsVersion,
    privacyVersion,
  });

  if (!resolved.linkLeases) return;
  // Tenancies created by email invitation now point at the real account (uid).
  await db
    .update(schema.leases)
    .set({ tenantUserId: authUser.id })
    .where(and(sql`lower(${schema.leases.tenantEmail}) = ${normalizedEmail}`, isNull(schema.leases.tenantUserId)));
}

/**
 * Applies a pending invitation and links waiting tenancies once the person has proven they
 * own the mailbox (email/password signups are unverified at creation; see seedProfile).
 */
async function applyInvitationAfterVerification(authUser: { id: string; email?: string | null }) {
  if (!authUser.email) return;
  const email = authUser.email.trim().toLowerCase();
  const invited = await db.query.invitations.findFirst({ where: eq(schema.invitations.email, email) });
  const profile = await db.query.users.findFirst({
    where: eq(schema.users.uid, authUser.id),
    columns: { role: true, platformId: true },
  });

  if (invited && profile) {
    if (invited.role === 'admin') {
      await db
        .update(schema.users)
        .set({ role: 'admin', isAdmin: true, platformId: invited.platformId ?? null })
        .where(eq(schema.users.uid, authUser.id));
    } else if (profile.role === 'hunter' && (invited.role === 'tenant' || invited.role === 'landlord' || invited.role === 'caretaker')) {
      // Only a plain account is upgraded; a role the person already earned (e.g. a paid
      // landlord) is never replaced by an invitation.
      await db
        .update(schema.users)
        .set({
          role: invited.role,
          platformId: profile.platformId ?? invited.platformId ?? null,
          ...(invited.role === 'caretaker' && invited.landlordId ? { managedByAdminId: invited.landlordId } : {}),
        })
        .where(eq(schema.users.uid, authUser.id));
    }
  }

  await db
    .update(schema.leases)
    .set({ tenantUserId: authUser.id })
    .where(and(sql`lower(${schema.leases.tenantEmail}) = ${email}`, isNull(schema.leases.tenantUserId)));
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.authUser,
      session: schema.authSession,
      account: schema.authAccount,
      verification: schema.authVerification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // The official domain and the Render URL (plus the native app WebViews) can all sign in.
  trustedOrigins: deploymentOrigins,
  emailAndPassword: {
    enabled: true,
    // Off by default so existing (unverified) accounts are not locked out. Turn on with
    // REQUIRE_EMAIL_VERIFICATION=true once existing users have been backfilled/verified.
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    // Reset links are single-use and expire after an hour (Better Auth's default).
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your MyBoma password',
        template: {
          preheader: 'Tap the button inside to choose a new password. This link expires in 1 hour.',
          eyebrow: 'Account security',
          tone: 'warning',
          heading: 'Reset your password',
          paragraphs: [
            'We received a request to reset the password for your MyBoma account.',
          ],
          callout: {
            label: 'Security notice',
            value: 'Link expires in 1 hour',
            sublabel: 'Single-use link for ' + user.email,
          },
          steps: [
            'Click the "Choose a new password" button below.',
            'Enter a strong password (at least 8 characters).',
            'Sign back in to your MyBoma dashboard.',
          ],
          button: {
            label: 'Choose a new password',
            url,
            hint: 'Click the button below to reset your password:',
          },
          closing: [
            "If you didn't ask for this reset, simply ignore this email — your password will stay unchanged.",
          ],
          footerNote: 'You received this because a password reset was requested for this email address.',
        },
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your MyBoma email',
        template: {
          preheader: 'Tap the button inside to confirm your email address and activate MyBoma.',
          eyebrow: 'Confirm your email',
          tone: 'brand',
          heading: 'Welcome to MyBoma — confirm your email',
          paragraphs: [
            'Thanks for signing up! Confirming your email activates your account and unlocks notifications and invitations.',
          ],
          steps: [
            'Click the "Verify email address" button below.',
            'You will be signed straight into MyBoma automatically.',
          ],
          button: {
            label: 'Verify email address',
            url,
            hint: 'Tap the purple button below to finish setting up your account:',
          },
          closing: ['If you did not create a MyBoma account, you can safely ignore this email.'],
          footerNote: 'You received this because an account was created with this email address.',
        },
      });
    },
    afterEmailVerification: async (user) => {
      await applyInvitationAfterVerification(user);
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 300, max: 5 },
      '/forget-password': { window: 300, max: 3 },
      '/request-password-reset': { window: 300, max: 3 },
      '/send-verification-email': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
    },
  },
  session: {
    // Avoids a session-table round trip on every API request; revocation takes effect
    // within maxAge.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  socialProviders: process.env.GOOGLE_CLIENT_ID
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,
  advanced: {
    database: {
      // Keep ids as real UUIDs so public.users.uid can reference user.id directly.
      generateId: 'uuid',
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          const body = context?.body as Record<string, unknown> | undefined;
          await seedProfileForNewAuthUser(user, body);
        },
      },
    },
  },
  // No admin plugin: it would add its own role/ban columns to `user`, duplicating
  // public.users' existing role/isAdmin/isSuperAdmin/status columns. Admin user
  // management (create/suspend/delete) is instead implemented directly in
  // server/adminHandlers.ts against those columns + auth.api.signUpEmail / the
  // Drizzle adapter, exactly matching what the app already enforces today.
  plugins: [bearer()],
});

export type Auth = typeof auth;

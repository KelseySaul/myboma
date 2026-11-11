import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import nodemailer from 'nodemailer';
import { and, eq, isNull, sql } from 'drizzle-orm';
// Auth is trusted system code: it always uses the owner connection, never a user's
// RLS-scoped request transaction (provisioning calls signUpEmail inside a request).
import { rootDb as db } from '../db/client.js';
import * as schema from '../db/schema/index.js';

// Roles a person may pick for themselves at signup. 'admin' is deliberately absent:
// admin rights are only ever granted by a super admin (provisioning / role endpoint)
// or by an admin invitation once the invitee has proven ownership of the mailbox.
const SELF_SIGNUP_ROLES = ['landlord', 'tenant', 'hunter'] as const;
type Role = (typeof SELF_SIGNUP_ROLES)[number] | 'admin';

function resolveRole(candidate: unknown): Role {
  return typeof candidate === 'string' && (SELF_SIGNUP_ROLES as readonly string[]).includes(candidate)
    ? (candidate as Role)
    : 'hunter';
}

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

  // An admin invitation is honoured only for a mailbox that is already verified (e.g.
  // Google OAuth). Email/password signups get it later via afterEmailVerification.
  const resolvedRole: Role =
    invited?.role === 'admin' && authUser.emailVerified ? 'admin' : resolveRole(invited?.role ?? requestBody?.intended_role);
  const displayName = (requestBody?.full_name as string | undefined) || invited?.displayName || authUser.name || 'User';
  const phone = (requestBody?.phone as string | undefined) || invited?.phone || null;
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
        platformId: existing.platformId ?? invited?.platformId ?? null,
        displayName: existing.displayName || displayName,
        phone: existing.phone || phone,
        mustChangePassword: existing.mustChangePassword || mustChangePassword,
      })
      .where(eq(schema.users.uid, authUser.id));
    return;
  }

  await db.insert(schema.users).values({
    uid: authUser.id,
    platformId: invited?.platformId ?? null,
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

  // Tenancies created by email invitation now point at the real account (uid).
  await db
    .update(schema.leases)
    .set({ tenantUserId: authUser.id })
    .where(and(sql`lower(${schema.leases.tenantEmail}) = ${normalizedEmail}`, isNull(schema.leases.tenantUserId)));
}

/** Applies a pending admin invitation once the invitee has proven they own the mailbox. */
async function applyAdminInvitationAfterVerification(authUser: { id: string; email?: string | null }) {
  if (!authUser.email) return;
  const invited = await db.query.invitations.findFirst({
    where: eq(schema.invitations.email, authUser.email.trim().toLowerCase()),
  });
  if (invited?.role !== 'admin') return;
  await db
    .update(schema.users)
    .set({ role: 'admin', isAdmin: true, platformId: invited.platformId ?? null })
    .where(eq(schema.users.uid, authUser.id));
}

let mailer: ReturnType<typeof nodemailer.createTransport> | null | undefined;
const getMailer = () => {
  if (mailer !== undefined) return mailer;
  mailer =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
      : null;
  return mailer;
};

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
  emailAndPassword: {
    enabled: true,
    // Off by default so existing (unverified) accounts are not locked out. Turn on with
    // REQUIRE_EMAIL_VERIFICATION=true once existing users have been backfilled/verified.
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const transport = getMailer();
      if (!transport) {
        console.warn(`[auth] SMTP not configured; cannot send verification email to ${user.email}`);
        return;
      }
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: 'Verify your MyBoma email',
        text: `Welcome to MyBoma. Confirm your email address by opening this link:

${url}

If you did not sign up, ignore this email.`,
      });
    },
    afterEmailVerification: async (user) => {
      await applyAdminInvitationAfterVerification(user);
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

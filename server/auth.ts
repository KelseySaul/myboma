import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema/index.js';

const ALLOWED_ROLES = ['landlord', 'tenant', 'hunter', 'admin'] as const;
type Role = (typeof ALLOWED_ROLES)[number];

function resolveRole(candidate: unknown): Role {
  return typeof candidate === 'string' && (ALLOWED_ROLES as readonly string[]).includes(candidate)
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
async function seedProfileForNewAuthUser(authUser: { id: string; email?: string | null; name?: string | null }, requestBody: Record<string, unknown> | undefined) {
  if (!authUser.email) throw new Error(`New auth user ${authUser.id} has no email; cannot provision a profile.`);
  const normalizedEmail = authUser.email.trim().toLowerCase();

  const invited = await db.query.invitations.findFirst({
    where: eq(schema.invitations.email, normalizedEmail),
  });

  const resolvedRole = resolveRole(invited?.role ?? requestBody?.intended_role);
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
  emailAndPassword: {
    enabled: true,
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

import {randomUUID} from 'node:crypto';
import {serializeSignedCookie} from 'better-call';
import {and, eq, inArray, isNull, sql} from 'drizzle-orm';
import {type Express} from 'express';
import {z} from 'zod';
import {rootDb as db} from '../../db/client.ts';
import * as schema from '../../db/schema/index.js';
import {auth} from '../auth.ts';
import {asyncHandler, credentialLimiter, getValidatedBody, validateBody} from '../http/middleware.ts';
import {
  FirebaseTokenError,
  phoneLookupVariants,
  verifyFirebasePhoneIdToken,
} from '../services/firebaseAuth.ts';

const firebasePhoneAuthSchema = z
  .object({
    idToken: z.string().min(20).max(8192),
    mode: z.enum(['signin', 'signup', 'auto']).optional().default('auto'),
    displayName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(320).optional(),
    intendedRole: z.enum(['hunter', 'landlord', 'tenant']).optional(),
    rememberMe: z.boolean().optional().default(true),
  })
  .strict();

/** Mints a genuine Better-Auth session row + signed Set-Cookie + bearer token header. */
async function createBetterAuthSessionForUser(
  userId: string,
  req: {ip?: string; headers: Record<string, string | string[] | undefined>},
  rememberMe: boolean,
) {
  const ctx = await auth.$context;
  const createdSession = await ctx.internalAdapter.createSession(
    userId,
    !rememberMe,
    {
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    },
  );

  const sessionCookie = ctx.authCookies.sessionToken;
  const maxAge = rememberMe ? ctx.sessionConfig.expiresIn : undefined;
  const signedCookie = await serializeSignedCookie(
    sessionCookie.name,
    createdSession.token,
    ctx.secret,
    {
      ...sessionCookie.attributes,
      ...(maxAge !== undefined ? {maxAge} : {}),
    },
  );

  // Clear any cached session-data cookie from an earlier account so cookieCache reloads cleanly.
  const clearCacheCookie = `${ctx.authCookies.sessionData.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

  return {
    token: createdSession.token,
    setCookies: [signedCookie, clearCacheCookie],
  };
}

/**
 * Registers `POST /api/auth/firebase-phone` BEFORE Better-Auth's `/api/auth/*` catch-all
 * so Firebase Phone OTP verification exchanges cleanly into a native MyBoma Better-Auth session.
 */
export function registerFirebaseAuthRoutes(app: Express) {
  app.post(
    '/api/auth/firebase-phone',
    credentialLimiter,
    validateBody(firebasePhoneAuthSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof firebasePhoneAuthSchema>>(req);

      let verified;
      try {
        verified = await verifyFirebasePhoneIdToken(body.idToken);
      } catch (err) {
        if (err instanceof FirebaseTokenError) {
          res.status(err.status).json({error: err.message});
          return;
        }
        throw err;
      }

      const phoneVariants = phoneLookupVariants(verified.phoneNumber);

      // 1. Look up existing MyBoma user by verified Firebase phone link or stored phone number.
      const existingLinkedAccount = await db.query.authAccount.findFirst({
        where: and(
          eq(schema.authAccount.providerId, 'firebase-phone'),
          eq(schema.authAccount.accountId, verified.uid),
        ),
        columns: {userId: true},
      });

      let existingUser = existingLinkedAccount
        ? await db.query.users.findFirst({where: eq(schema.users.uid, existingLinkedAccount.userId)})
        : await db.query.users.findFirst({
            where: inArray(sql`regexp_replace(coalesce(${schema.users.phone}, ''), '[^0-9+]', '', 'g')`, phoneVariants),
          });

      if (existingUser) {
        if (existingUser.status === 'suspended') {
          res.status(403).json({error: 'This account has been suspended.'});
          return;
        }

        // Link the firebase-phone provider account if matched via stored phone number.
        if (!existingLinkedAccount) {
          await db
            .insert(schema.authAccount)
            .values({
              userId: existingUser.uid,
              accountId: verified.uid,
              providerId: 'firebase-phone',
            })
            .onConflictDoNothing();
        }
        if (existingUser.phone !== verified.phoneNumber) {
          await db
            .update(schema.users)
            .set({phone: verified.phoneNumber})
            .where(eq(schema.users.uid, existingUser.uid));
        }

        const session = await createBetterAuthSessionForUser(existingUser.uid, req, body.rememberMe);
        res.setHeader('Set-Cookie', session.setCookies);
        res.setHeader('set-auth-token', session.token);
        res.json({
          ok: true,
          isNewUser: false,
          token: session.token,
          user: {id: existingUser.uid, email: existingUser.email, phone: verified.phoneNumber},
        });
        return;
      }

      // 2. No matching user exists yet.
      if (body.mode === 'signin') {
        res.status(404).json({
          error: 'No MyBoma account is linked to this phone number yet. Switch to Sign up to create one.',
        });
        return;
      }

      // Check for a pending invitation matching this verified phone number (non-admin only).
      const pendingInvite = await db.query.invitations.findFirst({
        where: inArray(sql`regexp_replace(coalesce(${schema.invitations.phone}, ''), '[^0-9+]', '', 'g')`, phoneVariants),
      });

      const phoneDigits = verified.phoneNumber.replace(/[^\d]/g, '');
      const candidateEmail = (body.email || pendingInvite?.email || `${phoneDigits}@phone.myboma.app`).trim().toLowerCase();

      // Ensure email is not already owned by another account (prevents account takeover).
      const emailTaken = await db.query.authUser.findFirst({
        where: sql`lower(${schema.authUser.email}) = ${candidateEmail}`,
        columns: {id: true},
      });
      if (emailTaken) {
        res.status(409).json({
          error: 'An account with this email already exists. Sign in with email first, or leave email blank to sign up by phone.',
        });
        return;
      }

      const displayName =
        body.displayName?.trim() ||
        pendingInvite?.displayName?.trim() ||
        `User ${phoneDigits.slice(-4)}`;

      // Phone OTP never auto-grants admin privileges; only landlord/tenant/caretaker/hunter.
      const invitedRole =
        pendingInvite && pendingInvite.role !== 'admin' ? pendingInvite.role : null;
      const requestedRole =
        body.intendedRole === 'landlord' ? 'landlord' : 'hunter';
      const resolvedRole = invitedRole ?? requestedRole;

      const uid = randomUUID();
      const isSyntheticEmail = candidateEmail.endsWith('@phone.myboma.app');

      await db.transaction(async (tx) => {
        await tx.insert(schema.authUser).values({
          id: uid,
          name: displayName,
          email: candidateEmail,
          emailVerified: isSyntheticEmail,
        });
        await tx.insert(schema.authAccount).values({
          userId: uid,
          accountId: verified.uid,
          providerId: 'firebase-phone',
        });
        await tx.insert(schema.users).values({
          uid,
          platformId: pendingInvite?.platformId ?? null,
          managedByAdminId: invitedRole === 'caretaker' ? (pendingInvite?.landlordId ?? null) : null,
          email: candidateEmail,
          displayName,
          role: resolvedRole,
          isAdmin: false,
          isSuperAdmin: false,
          phone: verified.phoneNumber,
          mustChangePassword: false,
        });
        if (pendingInvite && invitedRole === 'tenant') {
          await tx
            .update(schema.leases)
            .set({tenantUserId: uid})
            .where(and(sql`lower(${schema.leases.tenantEmail}) = ${pendingInvite.email.toLowerCase()}`, isNull(schema.leases.tenantUserId)));
        }
      });

      const session = await createBetterAuthSessionForUser(uid, req, body.rememberMe);
      res.setHeader('Set-Cookie', session.setCookies);
      res.setHeader('set-auth-token', session.token);
      res.status(201).json({
        ok: true,
        isNewUser: true,
        token: session.token,
        user: {id: uid, email: candidateEmail, phone: verified.phoneNumber},
      });
    }),
  );
}

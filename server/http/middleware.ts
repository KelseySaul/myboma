import * as Sentry from '@sentry/node';
import {isRlsEnabled} from '../../db/requestContext.ts';
import {runInRlsScope} from '../../db/rlsScope.ts';
import {eq} from 'drizzle-orm';
import {type NextFunction, type Request, type Response} from 'express';
import rateLimit from 'express-rate-limit';
import {fromNodeHeaders} from 'better-auth/node';
import {type ZodSchema} from 'zod';
import {sharedRateLimitStore} from '../rateLimitStore.ts';
import {auth} from '../auth.ts';
import {db, schema} from '../../db/client.ts';
import {isSuperAdminEmail} from '../../config/superAdmin.ts';
import {syncSuperAdminFromEnv} from '../adminHandlers.ts';
import {parseSubscriptionPlan, SUBSCRIPTION_TIERS} from '../../src/lib/landlordSubscription.ts';
import type {AuthenticatedRequest, UserProfileRecord} from '../types.ts';

export type ClientKind = 'web' | 'mobile';

export const asyncHandler =
  (handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req as AuthenticatedRequest, res, next).catch(next);
  };

export const sanitizeString = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

export const sanitizeInput = (value: unknown, keyName?: string): unknown => {
  // Never sanitize passwords
  if (keyName?.toLowerCase().includes('password')) return value;
  
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeInput(item, keyName));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeInput(entry, key)]),
    );
  }
  return value;
};

export const validateBody =
  <T>(schema: ZodSchema<T>) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(sanitizeInput(req.body));
    if (!parsed.success) {
      console.error('[Validation Failed]', parsed.error.issues);
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    req.validatedBody = parsed.data;
    next();
  };

/**
 * Server-written audit trail. Client-posted audit entries (/audit-logs) are only a
 * convenience; security-relevant events are recorded here, where they can't be skipped.
 */
export const recordAudit = async (
  actor: {uid: string; email: string; platformId?: string | null} | null,
  action: string,
  resource: string | null,
  resourceId: string | null,
  metadata?: Record<string, unknown>,
) => {
  try {
    // Savepoint: a failed audit insert must not abort the request's RLS transaction.
    await db.transaction((tx) => tx.insert(schema.auditLogs).values({
      userId: actor?.uid ?? null,
      userEmail: actor?.email ?? null,
      platformId: actor?.platformId ?? null,
      action,
      resource,
      resourceId,
      metadata: {...(metadata ?? {}), source: 'server'},
    }));
  } catch (error) {
    console.error('[Audit] Failed to record', action, error);
    Sentry.captureException(error);
  }
};

export const getClientKind = (req: Request): ClientKind => (req.baseUrl.includes('/mobile') ? 'mobile' : 'web');

/** Server-side source of truth for "is this landlord paid up" — the UI gate is cosmetic. */
export const hasActiveSubscription = (profile: UserProfileRecord) =>
  profile.subscriptionStatus === 'active' &&
  (!profile.subscriptionExpiresAt || new Date(profile.subscriptionExpiresAt).getTime() > Date.now());

/** Pro Plus "agency admin": role 'admin' earned by a paid, unexpired Pro Plus plan (not a platform admin). */
export const isAgencyAdmin = (profile: UserProfileRecord) =>
  profile.role === 'admin' &&
  parseSubscriptionPlan(profile.subscriptionPlan)?.tier === 'proplus' &&
  hasActiveSubscription(profile);

/** Unit limit for the caller's plan; null = unlimited. Platform admins are unlimited. */
export const unitLimitFor = (profile: UserProfileRecord): number | null => {
  if (profile.isSuperAdmin || profile.isAdmin) return null;
  const parsed = parseSubscriptionPlan(profile.subscriptionPlan);
  if (!parsed || !hasActiveSubscription(profile)) return 0;
  return SUBSCRIPTION_TIERS[parsed.tier].features.maxListings;
};

export const requireAuth = asyncHandler(async (req, res, next) => {
  // Native clients send `Authorization: Bearer <token>` (resolved by the bearer
  // plugin); web clients send the Better-Auth session cookie instead — both are
  // present on req.headers, so getSession alone determines whether either is valid.
  const session = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});

  if (!session?.user) {
    res.status(401).json({error: 'Not authenticated'});
    return;
  }

  const profileRow = await db.query.users.findFirst({
    where: eq(schema.users.uid, session.user.id),
  });

  if (!profileRow) {
    res.status(403).json({error: 'User profile is not provisioned'});
    return;
  }

  // Old Supabase Auth enforced suspension via `ban_duration` at the auth-provider
  // level; there is no equivalent here, so it's enforced at this single chokepoint
  // instead (server/adminHandlers.ts's handleSuspendUser only flips this DB column).
  if (profileRow.status === 'suspended') {
    res.status(403).json({error: 'This account has been suspended'});
    return;
  }

  let profile = profileRow as unknown as UserProfileRecord;
  // Only a verified mailbox may claim an env-listed super admin address; otherwise
  // whoever registers that address first would inherit full platform control.
  if (session.user.emailVerified) {
    profile = await syncSuperAdminFromEnv(profile, isSuperAdminEmail);
  }

  // Support impersonation: a super admin may view the app AS another user by sending
  // X-Impersonate-User. It is read-only (GET only) so support staff can't act on the
  // user's behalf, and the start of every session is audited server-side.
  const impersonateUid = req.headers['x-impersonate-user'];
  if (typeof impersonateUid === 'string' && impersonateUid && impersonateUid !== profile.uid) {
    if (!profile.isSuperAdmin) {
      res.status(403).json({error: 'Impersonation requires super admin'});
      return;
    }
    if (req.method !== 'GET') {
      res.status(403).json({error: 'Impersonation is read-only. Exit impersonation to make changes.'});
      return;
    }
    const target = await db.query.users.findFirst({where: eq(schema.users.uid, impersonateUid)});
    if (!target) {
      res.status(404).json({error: 'Impersonated user not found'});
      return;
    }
    req.impersonator = profile;
    profile = target as unknown as UserProfileRecord;
  }

  req.authUser = {id: session.user.id, email: session.user.email};
  req.profile = profile;
  req.clientKind = getClientKind(req);
  Sentry.setUser({id: session.user.id});

  // Database-enforced tenant boundary (docs/migrations/08-row-level-security.sql): the rest
  // of the request runs in one transaction scoped to this user's identity. When
  // impersonating, the scope is the target user's (read-only, see above).
  if (isRlsEnabled()) {
    await runInRlsScope(
      {
        uid: profile.uid,
        email: profile.email,
        platformId: profile.platformId ?? null,
        isAdmin: Boolean(profile.isAdmin),
        isSuperAdmin: Boolean(profile.isSuperAdmin),
      },
      res,
      next,
    );
    return;
  }
  next();
});

export const requireAdmin = asyncHandler(async (req, res, next) => {
  // Platform admin rights come only from the isAdmin/isSuperAdmin flags, which only super
  // admins can grant. The Pro Plus "agency admin" (role === 'admin') is honoured only
  // while a paid, unexpired Pro Plus plan backs it — `role` alone is never trusted.
  const profile = req.profile;
  if (!profile?.isSuperAdmin && !profile?.isAdmin && !(profile && isAgencyAdmin(profile))) {
    res.status(403).json({error: 'Admin access required'});
    return;
  }
  next();
});

export const requireSuperAdmin = asyncHandler(async (req, res, next) => {
  if (!req.profile?.isSuperAdmin) {
    res.status(403).json({error: 'Super admin access required'});
    return;
  }
  next();
});

export const getValidatedBody = <T>(req: AuthenticatedRequest) => req.validatedBody as T;

export const publicLimiter = rateLimit({
  store: sharedRateLimitStore('publicLimiter'),
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many requests, please try again later.'},
});

// NOTE: these limiters use the in-memory store, which is per serverless instance. For a
// global limit, back them with a shared store (e.g. Upstash Redis) or Vercel WAF rules.
export const credentialLimiter = rateLimit({
  store: sharedRateLimitStore('credentialLimiter'),
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many sign-in attempts. Please wait and try again.'},
});

export const authLimiter = rateLimit({
  store: sharedRateLimitStore('authLimiter'),
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'API rate limit exceeded, please try again later.'},
});

export const paymentLimiter = rateLimit({
  store: sharedRateLimitStore('paymentLimiter'),
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many payment attempts. Please wait and try again.'},
});

export const webhookLimiter = rateLimit({
  store: sharedRateLimitStore('webhookLimiter'),
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Webhook rate limit exceeded.'},
});

export const waitlistLimiter = rateLimit({
  store: sharedRateLimitStore('waitlistLimiter'),
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many waitlist requests. Please wait and try again.'},
});

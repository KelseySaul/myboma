// Must run before any other import: several modules (db/client.ts, server/auth.ts) read
// process.env at import time, which happens before this file's own top-level code runs.
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import {randomUUID} from 'node:crypto';
import {and, desc, eq, ilike, inArray, isNull, ne, or, sql} from 'drizzle-orm';
import express, {type ErrorRequestHandler, type NextFunction, type Request, type Response} from 'express';
import multer from 'multer';
import {buildObjectKey, getObjectStream, uploadObject} from './server/storage.ts';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {createProxyMiddleware} from 'http-proxy-middleware';
import nodemailer from 'nodemailer';
import path from 'path';
import {fileURLToPath} from 'url';
import {z, type ZodSchema} from 'zod';
import Stripe from 'stripe';
import {toNodeHandler, fromNodeHeaders} from 'better-auth/node';
import {auth} from './server/auth.ts';
import {db, schema} from './db/client.ts';
import {LEGAL_DOCUMENTS} from './src/legalDocuments.ts';
import {isSuperAdminEmail} from './config/superAdmin.ts';
import {assertAllowedRedirectUrl, verifyMpesaCallback} from './server/helpers.ts';
import {
  handleDeleteUser,
  handleProvisionUser,
  handleSuspendUser,
  manualRentPaidSchema,
  provisionUserSchema,
  suspendUserSchema,
  syncSuperAdminFromEnv,
  updatePlatformBrandingSchema,
} from './server/adminHandlers.ts';
import {
  activateLandlordSubscription,
  createPendingSubscriptionPayment,
  landlordSubscriptionCheckoutSchema,
  saveLandlordPayoutProfile,
} from './server/landlordSubscriptionHandlers.ts';
import {
  getSubscriptionAmount,
  parseSubscriptionPlan,
  SUBSCRIPTION_TIERS,
  type BillingPeriod,
  type SubscriptionTier,
} from './src/lib/landlordSubscription.ts';
import type {AuthenticatedRequest, RentPaymentRecord, UserProfileRecord} from './server/types.ts';
import {toActor} from './server/types.ts';
import {
  canCreateBooking,
  canCreateMaintenanceRequest,
  canManageBuilding,
  canManagePlatform,
  canManageProperty,
  canReadPlatformBranding,
  canUpdateMaintenanceRequest,
  canUpdateNotification,
  canWriteUser,
  isAdmin,
  isAdminInPlatform,
  isSuperAdmin,
} from './db/authz.ts';
import { handleSendRentReminder, processAutomatedRentReminders } from './server/notificationHandlers.ts';
import { syncAutomaticRentInvoices, ensureRentInvoiceForProperty } from './server/rentInvoiceSync.ts';
import cron from 'node-cron';

const app = express();
const PORT = Number(process.env.SERVER_PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const defaultCorsOrigins = 'http://localhost:5173,http://localhost:4173';

const buildDeploymentOrigins = (): string[] => {
  const origins = new Set<string>();
  const add = (value?: string) => {
    if (!value?.trim()) return;
    const normalized = value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`;
    try {
      origins.add(new URL(normalized).origin);
    } catch {
      // ignore invalid URLs
    }
  };

  for (const entry of (process.env.CORS_ORIGINS || defaultCorsOrigins).split(',')) {
    add(entry);
  }
  add(process.env.APP_BASE_URL || `http://localhost:${PORT}`);
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_BRANCH_URL);

  return [...origins];
};

const deploymentOrigins = buildDeploymentOrigins();
const appBaseUrl = process.env.APP_BASE_URL || deploymentOrigins[0] || `http://localhost:${PORT}`;
const allowedRedirectOrigins = new Set(deploymentOrigins);
const enableSupabaseProxy = process.env.ENABLE_SUPABASE_PROXY === 'true';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrub password fields from request body to prevent cleartext secrets in error reports
      if (event.request?.data && typeof event.request.data === 'object') {
        const data = event.request.data as Record<string, unknown>;
        const scrubbed = {...data};
        const sensitiveKeys = ['password', 'confirmPassword', 'newPassword', 'secret', 'token'];
        for (const key of sensitiveKeys) {
          if (key in scrubbed) scrubbed[key] = '[Filtered]';
        }
        event.request.data = scrubbed;
      }
      return event;
    },
  });
}

const requiredEnv = {
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
let pesapalTokenCache: {token: string; expiresAt: number} | null = null;

const emailTransporter =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : null;

type ClientKind = 'web' | 'mobile';

const nonSecretConfigStatus = () => ({
  supabaseUrl: Boolean(requiredEnv.supabaseUrl),
  supabaseAnonKey: Boolean(requiredEnv.supabaseAnonKey),
  supabaseServiceRoleKey: Boolean(requiredEnv.supabaseServiceRoleKey),
  stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
  pesapal: Boolean(
    process.env.PESAPAL_CONSUMER_KEY &&
      process.env.PESAPAL_CONSUMER_SECRET &&
      (process.env.PESAPAL_NOTIFICATION_ID || process.env.PESAPAL_IPN_URL),
  ),
  mpesa: Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_BUSINESS_SHORTCODE &&
      process.env.MPESA_PASSKEY &&
      process.env.MPESA_CALLBACK_URL,
  ),
  smtp: Boolean(emailTransporter),
  sentry: Boolean(process.env.SENTRY_DSN),
});

const asyncHandler =
  (handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req as AuthenticatedRequest, res, next).catch(next);
  };

const sanitizeString = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

const sanitizeInput = (value: unknown, keyName?: string): unknown => {
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

const validateBody =
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

const uuidSchema = z.string().uuid();
const emailSchema = z.string().email().max(320);
const absoluteUrlSchema = z.string().url().max(2048);
const phoneSchema = z
  .string()
  .max(20)
  .regex(/^\+?\d+$/)
  .or(z.literal(''))
  .nullable()
  .optional();

const stripeCheckoutSchema = z
  .object({
    rentPaymentId: uuidSchema,
    successUrl: absoluteUrlSchema.optional(),
    cancelUrl: absoluteUrlSchema.optional(),
  })
  .strict();

const pesapalCheckoutSchema = stripeCheckoutSchema;

const waitlistSignupSchema = z
  .object({
    email: z.string().email().max(320),
    source: z.string().max(80).optional().default('landing-page'),
  })
  .strict();

const waitlistUnsubscribeSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    token: uuidSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.email || value.token), {
    message: 'Email or unsubscribe token is required',
  });

const mpesaRentSchema = z
  .object({
    rentPaymentId: uuidSchema,
    phone: phoneSchema.optional(),
  })
  .strict();

const mpesaCallbackSchema = z
  .object({
    Body: z
      .object({
        stkCallback: z
          .object({
            MerchantRequestID: z.string().optional(),
            CheckoutRequestID: z.string().min(1),
            ResultCode: z.number(),
            ResultDesc: z.string().optional(),
            CallbackMetadata: z
              .object({
                Item: z.array(
                  z.object({
                    Name: z.string(),
                    Value: z.union([z.string(), z.number()]).optional(),
                  }),
                ),
              })
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const getClientKind = (req: Request): ClientKind => (req.baseUrl.includes('/mobile') ? 'mobile' : 'web');

const requireAuth = asyncHandler(async (req, res, next) => {
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
  profile = await syncSuperAdminFromEnv(profile, isSuperAdminEmail);

  req.authUser = {id: session.user.id, email: session.user.email};
  req.profile = profile;
  req.clientKind = getClientKind(req);
  Sentry.setUser({id: session.user.id, email: session.user.email});
  next();
});

const requireAdmin = asyncHandler(async (req, res, next) => {
  const profile = req.profile;
  if (!profile?.isSuperAdmin && !profile?.isAdmin && profile?.role !== 'admin') {
    res.status(403).json({error: 'Admin access required'});
    return;
  }
  next();
});

const requireSuperAdmin = asyncHandler(async (req, res, next) => {
  if (!req.profile?.isSuperAdmin) {
    res.status(403).json({error: 'Super admin access required'});
    return;
  }
  next();
});

const getValidatedBody = <T>(req: AuthenticatedRequest) => req.validatedBody as T;

const amountInMinorUnits = (amount: number | string) => Math.round(Number(amount) * 100);
const amountInKes = (amount: number | string) => Math.ceil(Number(amount));

const assertTenantCanPay = (profile: UserProfileRecord, payment: RentPaymentRecord) => {
  const tenant = String(payment.tenantId || '').toLowerCase();
  const userEmail = String(profile.email || '').toLowerCase();
  return tenant === userEmail || tenant === profile.uid;
};

const fetchPaymentContext = async (rentPaymentId: string, profile?: UserProfileRecord) => {
  const payment = await db.query.rentPayments.findFirst({
    where: eq(schema.rentPayments.id, rentPaymentId),
  });

  if (!payment) {
    const error = new Error('Rent payment not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  const rentPayment = payment as unknown as RentPaymentRecord;

  if (profile && !assertTenantCanPay(profile, rentPayment)) {
    const error = new Error('You can only pay rent assigned to your account.');
    (error as any).statusCode = 403;
    throw error;
  }

  if (rentPayment.status === 'paid') {
    const error = new Error('This rent payment is already marked paid.');
    (error as any).statusCode = 409;
    throw error;
  }

  const landlord = await db.query.users.findFirst({
    where: eq(schema.users.uid, payment.landlordId),
    columns: {uid: true, email: true, displayName: true, phone: true, stripeAccountId: true, mpesaSettlementPhone: true, mpesaSettlementShortCode: true},
  });

  if (!landlord) {
    const error = new Error('Landlord account not found.');
    (error as any).statusCode = 422;
    throw error;
  }

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, payment.propertyId),
    columns: {id: true, title: true, unitNumber: true, location: true},
  });

  return {
    payment: rentPayment,
    landlord: landlord as unknown as UserProfileRecord,
    property: property ?? null,
  };
};

/**
 * fallbackPayload is unused: it existed to retry against Supabase/PostgREST's schema
 * cache ("column not found") errors, which can't happen against our own Drizzle
 * schema. Kept as a parameter only so the many call sites don't need to change.
 */
const updateRentPayment = async (
  rentPaymentId: string,
  payload: Record<string, unknown>,
  _fallbackPayload: Record<string, unknown> = {},
) => {
  await db
    .update(schema.rentPayments)
    .set(payload as Partial<typeof schema.rentPayments.$inferInsert>)
    .where(eq(schema.rentPayments.id, rentPaymentId));
};

const sendPushNotification = async (targetUserId: string, title: string, message: string) => {
  const ONE_SIGNAL_APP_ID = "16fe44a9-e285-4d7d-85f0-8b82014b9a71";
  const ONE_SIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY; 
  if (!ONE_SIGNAL_REST_API_KEY) return null;

  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Basic ${ONE_SIGNAL_REST_API_KEY}`
    },
    body: JSON.stringify({
      app_id: ONE_SIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: {
        external_id: [targetUserId]
      },
      headings: { en: title },
      contents: { en: message }
    })
  });

  return response.json();
};

const insertNotification = async (payload: {
  recipientEmail: string;
  platformId?: string | null;
  type?: string | null;
  title: string;
  message?: string | null;
  propertyId?: string | null;
  read?: boolean;
}) => {
  await db.insert(schema.notifications).values(payload);

  const user = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${payload.recipientEmail.toLowerCase()}`,
    columns: {uid: true},
  });

  if (user?.uid) {
    const title = String(payload.title || 'New Notification');
    const message = String(payload.message || 'You have a new update.');
    await sendPushNotification(user.uid, title, message).catch(err => {
      console.error('[OneSignal] Failed to send push:', err);
    });
  }
};

const sendEmail = async ({to, subject, text}: {to?: string | null; subject: string; text: string}) => {
  if (!to || !emailTransporter) return;

  await emailTransporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
};

const notifyRentPaymentSuccess = async ({
  payment,
  tenant,
  landlord,
  property,
  providerReference,
}: {
  payment: RentPaymentRecord;
  tenant?: UserProfileRecord | null;
  landlord: UserProfileRecord;
  property?: {title?: string; unitNumber?: string; location?: string} | null;
  providerReference?: string | null;
}) => {
  const amount = Number(payment.amount).toLocaleString('en-KE');
  const propertyLabel = property?.title || property?.unitNumber || 'your unit';
  const tenantEmail = tenant?.email || payment.tenantId;
  const platformId = payment.platformId || tenant?.platformId || landlord.platformId || null;

  await Promise.all([
    insertNotification({
      recipientEmail: tenantEmail.toLowerCase(),
      platformId,
      type: 'receipt',
      title: 'Rent Cleared',
      message: `Your rent payment of KES ${amount} for ${propertyLabel} has been successfully processed.`,
      propertyId: payment.propertyId,
      read: false,
    }),
    insertNotification({
      recipientEmail: landlord.email.toLowerCase(),
      platformId,
      type: 'receipt',
      title: 'Rent Received',
      message: `${tenant?.displayName || tenantEmail} paid KES ${amount} for ${propertyLabel}.`,
      propertyId: payment.propertyId,
      read: false,
    }),
    sendEmail({
      to: tenantEmail,
      subject: 'MyBoma rent receipt',
      text: `Your rent payment of KES ${amount} for ${propertyLabel} was successful.${
        providerReference ? ` Reference: ${providerReference}.` : ''
      }`,
    }),
    sendEmail({
      to: landlord.email,
      subject: 'MyBoma rent received',
      text: `${tenant?.displayName || tenantEmail} paid KES ${amount} for ${propertyLabel}.${
        providerReference ? ` Reference: ${providerReference}.` : ''
      }`,
    }),
  ]);
};

const markRentPaid = async ({
  payment,
  landlord,
  tenant,
  property,
  provider,
  providerReference,
  metadata,
}: {
  payment: RentPaymentRecord;
  landlord: UserProfileRecord;
  tenant?: UserProfileRecord | null;
  property?: {title?: string; unitNumber?: string; location?: string} | null;
  provider: 'stripe' | 'mpesa' | 'manual' | 'pesapal';
  providerReference?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  if (payment.status === 'paid') return;

  await updateRentPayment(
    payment.id,
    {
      status: 'paid',
      paidAt: new Date().toISOString(),
      paymentProvider: provider,
      providerReference,
      paymentMetadata: metadata ?? {},
    },
    {
      status: 'paid',
      paidAt: new Date().toISOString(),
    },
  );

  // Notifications are important but should not fail the payment flow
  notifyRentPaymentSuccess({payment, tenant, landlord, property, providerReference}).catch((err) => {
    console.error('[Notification Error] Failed to send payment notifications:', err);
    Sentry.captureException(err);
  });
};

const getTenantProfileForPayment = async (payment: RentPaymentRecord) => {
  const tenantId = String(payment.tenantId);
  const columns = {uid: true, email: true, displayName: true, phone: true, platformId: true} as const;
  const tenant = tenantId.includes('@')
    ? await db.query.users.findFirst({where: ilike(schema.users.email, tenantId), columns})
    : await db.query.users.findFirst({where: eq(schema.users.uid, tenantId), columns});
  return (tenant as unknown as UserProfileRecord) ?? null;
};

const createStripeCheckout = asyncHandler(async (req, res) => {
  if (!stripe) {
    res.status(503).json({error: 'Stripe is not configured'});
    return;
  }

  const {rentPaymentId, successUrl, cancelUrl} = getValidatedBody<z.infer<typeof stripeCheckoutSchema>>(req);
  assertAllowedRedirectUrl(successUrl, allowedRedirectOrigins);
  assertAllowedRedirectUrl(cancelUrl, allowedRedirectOrigins);
  const {payment, landlord, property} = await fetchPaymentContext(rentPaymentId, req.profile);

  if (!landlord.stripeAccountId) {
    res.status(422).json({
      error: 'The landlord does not have a Stripe Connect account configured.',
    });
    return;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl || `${appBaseUrl}/?rent_payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${appBaseUrl}/?rent_payment=cancelled`,
    customer_email: req.profile?.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (process.env.STRIPE_CURRENCY || 'kes').toLowerCase(),
          unit_amount: amountInMinorUnits(payment.amount),
          product_data: {
            name: `Rent payment${property?.title ? ` - ${property.title}` : ''}`,
            description: `MyBoma rent payment ${payment.id}`,
          },
        },
      },
    ],
    metadata: {
      rentPaymentId: payment.id,
      tenantUserId: req.profile?.uid || '',
      landlordUserId: landlord.uid,
      clientKind: req.clientKind || 'web',
    },
    payment_intent_data: {
      metadata: {
        rentPaymentId: payment.id,
        landlordUserId: landlord.uid,
      },
      transfer_data: {
        destination: landlord.stripeAccountId,
      },
    },
  });

  await updateRentPayment(
    payment.id,
    {
      paymentProvider: 'stripe',
      providerCheckoutRequestId: session.id,
      paymentMetadata: {
        checkoutSessionId: session.id,
        clientKind: req.clientKind,
      },
    },
    {},
  ).catch((error) => {
    Sentry.captureException(error);
  });

  res.json({
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
  });
});

const fulfillStripeCheckout = async (sessionId: string) => {
  if (!stripe) throw new Error('Stripe is not configured');

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return;
  }

  const subscriptionPaymentId = session.metadata?.subscriptionPaymentId;
  if (subscriptionPaymentId) {
    const subRow = await db.query.landlordSubscriptionPayments.findFirst({
      where: eq(schema.landlordSubscriptionPayments.id, subscriptionPaymentId),
      columns: {id: true, landlordId: true, plan: true, amount: true, status: true},
    });

    if (!subRow || subRow.status === 'confirmed') return;

    const parsed = parseSubscriptionPlan(subRow.plan);
    if (!parsed) throw new Error(`Invalid subscription plan key: ${subRow.plan}`);

    const landlord = await db.query.users.findFirst({
      where: eq(schema.users.uid, subRow.landlordId),
      columns: {uid: true, email: true, displayName: true},
    });

    if (!landlord) throw new Error('Landlord profile not found for subscription payment');

    await activateLandlordSubscription(
      {sendEmail, insertNotification},
      {
        subscriptionPaymentId: subRow.id,
        landlordId: subRow.landlordId,
        landlordEmail: landlord.email,
        landlordName: landlord.displayName || landlord.email,
        tier: parsed.tier,
        billing: parsed.billing,
        amount: Number(subRow.amount),
        paymentChannel: 'Card (Stripe)',
        paymentReference:
          typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
      },
    );
    return;
  }

  const rentPaymentId = session.metadata?.rentPaymentId;
  if (!rentPaymentId) throw new Error(`Stripe session ${sessionId} missing rentPaymentId metadata`);

  const {payment, landlord, property} = await fetchPaymentContext(rentPaymentId);
  if (payment.status === 'paid') return;

  const tenant = await getTenantProfileForPayment(payment);
  await markRentPaid({
    payment,
    tenant,
    landlord,
    property,
    provider: 'stripe',
    providerReference: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
    metadata: {
      checkoutSessionId: session.id,
      paymentIntent: session.payment_intent,
      amountTotal: session.amount_total,
      currency: session.currency,
    },
  });
};

type PesapalSubmitOrderResponse = {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string;
  error?: {message?: string} | number | null;
  message?: string;
  status?: string;
};

type PesapalTransactionStatus = {
  payment_method?: string;
  amount?: number;
  created_date?: string;
  confirmation_code?: string;
  payment_status_description?: string;
  description?: string;
  message?: string;
  payment_account?: string;
  status_code?: number | string;
  merchant_reference?: string;
  currency?: string;
  error?: {message?: string; code?: string | null} | null;
  status?: string;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const pesapalBaseUrl = () =>
  process.env.PESAPAL_ENV === 'production'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';

const getPesapalCallbackUrl = () =>
  process.env.PESAPAL_CALLBACK_URL || `${trimTrailingSlash(appBaseUrl)}/api/payments/pesapal/callback`;

const getPesapalIpnUrl = () =>
  process.env.PESAPAL_IPN_URL || `${trimTrailingSlash(appBaseUrl)}/api/webhooks/pesapal/ipn`;

const getPesapalAccessToken = async () => {
  const key = process.env.PESAPAL_CONSUMER_KEY;
  const secret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('Pesapal consumer credentials are not configured.');

  if (pesapalTokenCache && pesapalTokenCache.expiresAt > Date.now() + 30_000) {
    return pesapalTokenCache.token;
  }

  const response = await fetch(`${pesapalBaseUrl()}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      consumer_key: key,
      consumer_secret: secret,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {token?: string; message?: string; error?: {message?: string}};
  if (!response.ok || !body.token) {
    console.error('[Pesapal Auth Failed]', {status: response.status, body});
    throw new Error(body.error?.message || body.message || `Pesapal authentication failed with status ${response.status}`);
  }

  pesapalTokenCache = {
    token: body.token,
    expiresAt: Date.now() + 4 * 60 * 1000,
  };

  return body.token;
};

const pesapalApiFetch = async <T>(path: string, init: RequestInit = {}) => {
  const token = await getPesapalAccessToken();
  const response = await fetch(`${pesapalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const body = (await response.json().catch(() => ({}))) as T & {
    error?: {message?: string} | number | null;
    message?: string;
  };
  const errorMessage =
    typeof body.error === 'object' && body.error ? body.error.message : undefined;

  if (!response.ok || errorMessage) {
    throw new Error(errorMessage || body.message || `Pesapal request failed with status ${response.status}`);
  }

  return body as T;
};

const getPesapalNotificationId = async () => {
  if (process.env.PESAPAL_NOTIFICATION_ID) return process.env.PESAPAL_NOTIFICATION_ID;

  const ipnUrl = getPesapalIpnUrl();
  const registered = await pesapalApiFetch<Array<{url?: string; ipn_id?: string}>>('/api/URLSetup/GetIpnList');
  const existing = registered.find((item) => item.url === ipnUrl && item.ipn_id);
  if (existing?.ipn_id) return existing.ipn_id;

  if (process.env.PESAPAL_AUTO_REGISTER_IPN !== 'true') {
    throw new Error('Pesapal notification ID is not configured. Register the IPN URL and set PESAPAL_NOTIFICATION_ID.');
  }

  const notificationType = (process.env.PESAPAL_IPN_METHOD || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  const created = await pesapalApiFetch<{ipn_id?: string; message?: string}>('/api/URLSetup/RegisterIPN', {
    method: 'POST',
    body: JSON.stringify({
      url: ipnUrl,
      ipn_notification_type: notificationType,
    }),
  });

  if (!created.ipn_id) {
    throw new Error(created.message || 'Pesapal IPN registration did not return an IPN ID.');
  }

  return created.ipn_id;
};

const buildPesapalReference = (prefix: 'RENT' | 'SUB', id: string) => {
  const compactId = id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${compactId}-${stamp}`.slice(0, 50);
};

const splitCustomerName = (name?: string | null, email?: string | null) => {
  const fallback = email?.split('@')[0] || 'MyBoma';
  const parts = sanitizeString(name || '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {firstName: fallback, lastName: 'Customer'};
  if (parts.length === 1) return {firstName: parts[0], lastName: fallback};
  return {firstName: parts[0], lastName: parts.slice(1).join(' ')};
};

const buildPesapalBillingAddress = (customer: UserProfileRecord | null | undefined) => {
  const email = customer?.email || 'payments@myboma.app';
  const {firstName, lastName} = splitCustomerName(customer?.displayName, email);
  return {
    email_address: email,
    phone_number: String(customer?.phone || '').replace(/[^\d+]/g, ''),
    country_code: process.env.PESAPAL_COUNTRY_CODE || 'KE',
    first_name: firstName,
    middle_name: '',
    last_name: lastName,
    line_1: 'MyBoma',
    line_2: '',
    city: '',
    state: '',
    postal_code: '',
    zip_code: '',
  };
};

const submitPesapalOrder = async (input: {
  merchantReference: string;
  amount: number | string;
  description: string;
  customer?: UserProfileRecord | null;
  cancellationUrl?: string;
}) => {
  const notificationId = await getPesapalNotificationId();
  const body = await pesapalApiFetch<PesapalSubmitOrderResponse>('/api/Transactions/SubmitOrderRequest', {
    method: 'POST',
    body: JSON.stringify({
      id: input.merchantReference,
      currency: (process.env.PESAPAL_CURRENCY || 'KES').toUpperCase(),
      amount: Number(input.amount),
      description: sanitizeString(input.description).slice(0, 100),
      redirect_mode: 'TOP_WINDOW',
      callback_url: getPesapalCallbackUrl(),
      cancellation_url: input.cancellationUrl,
      notification_id: notificationId,
      branch: process.env.PESAPAL_BRANCH || 'MyBoma',
      billing_address: buildPesapalBillingAddress(input.customer),
    }),
  });

  if (!body.order_tracking_id || !body.redirect_url) {
    throw new Error(body.message || 'Pesapal did not return a payment redirect URL.');
  }

  return body;
};

const getPesapalTransactionStatus = async (orderTrackingId: string) =>
  pesapalApiFetch<PesapalTransactionStatus>(
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
  );

const findSubscriptionPaymentByPesapalReference = async (
  orderTrackingId: string,
  merchantReference?: string,
) => {
  const columns = {id: true, landlordId: true, plan: true, amount: true, status: true, paymentReference: true} as const;
  const byCheckoutId = await db.query.landlordSubscriptionPayments.findFirst({
    where: eq(schema.landlordSubscriptionPayments.providerCheckoutRequestId, orderTrackingId),
    columns,
  });
  if (byCheckoutId || !merchantReference) return byCheckoutId ?? null;

  const byMerchantRef = await db.query.landlordSubscriptionPayments.findFirst({
    where: eq(schema.landlordSubscriptionPayments.paymentReference, merchantReference),
    columns,
  });
  return byMerchantRef ?? null;
};

const findRentPaymentByPesapalReference = async (orderTrackingId: string, merchantReference?: string) => {
  const byCheckoutId = await db.query.rentPayments.findFirst({
    where: eq(schema.rentPayments.providerCheckoutRequestId, orderTrackingId),
  });
  if (byCheckoutId || !merchantReference) return byCheckoutId ?? null;

  const byMerchantRef = await db.query.rentPayments.findFirst({
    where: eq(schema.rentPayments.providerMerchantRequestId, merchantReference),
  });
  return byMerchantRef ?? null;
};

const pesapalStatusFlags = (status: PesapalTransactionStatus) => {
  const statusCode = Number(status.status_code);
  const statusDescription = String(status.payment_status_description || '').toUpperCase();
  return {
    completed: statusCode === 1 || statusDescription === 'COMPLETED',
    rejected: [0, 2, 3].includes(statusCode) || ['INVALID', 'FAILED', 'REVERSED'].includes(statusDescription),
    statusDescription,
  };
};

const processPesapalTransaction = async (orderTrackingId: string, merchantReference?: string) => {
  const status = await getPesapalTransactionStatus(orderTrackingId);
  const resolvedMerchantReference = merchantReference || status.merchant_reference;
  const {completed, rejected, statusDescription} = pesapalStatusFlags(status);
  const providerReference = status.confirmation_code || orderTrackingId;

  const subPayment = await findSubscriptionPaymentByPesapalReference(
    orderTrackingId,
    resolvedMerchantReference,
  );

  if (subPayment) {
    if (completed && subPayment.status !== 'confirmed') {
      const parsed = parseSubscriptionPlan(subPayment.plan);
      if (!parsed) throw new Error(`Invalid subscription plan key: ${subPayment.plan}`);

      const landlord = await db.query.users.findFirst({
        where: eq(schema.users.uid, subPayment.landlordId),
        columns: {uid: true, email: true, displayName: true},
      });
      if (!landlord) throw new Error('Landlord profile not found for subscription payment');

      await activateLandlordSubscription(
        {sendEmail, insertNotification},
        {
          subscriptionPaymentId: subPayment.id,
          landlordId: subPayment.landlordId,
          landlordEmail: landlord.email,
          landlordName: landlord.displayName || landlord.email,
          tier: parsed.tier,
          billing: parsed.billing,
          amount: Number(subPayment.amount),
          paymentChannel: 'Pesapal',
          paymentReference: providerReference,
        },
      );
    } else if (rejected && subPayment.status !== 'confirmed') {
      await db
        .update(schema.landlordSubscriptionPayments)
        .set({
          status: 'rejected',
          paymentProvider: 'pesapal',
          paymentReference: status.description || statusDescription || 'failed',
        })
        .where(eq(schema.landlordSubscriptionPayments.id, subPayment.id));
    }

    return {kind: 'subscription' as const, completed, rejected, status};
  }

  const payment = await findRentPaymentByPesapalReference(orderTrackingId, resolvedMerchantReference);
  if (!payment) return {kind: 'unknown' as const, completed, rejected, status};

  const rentPayment = payment as RentPaymentRecord;
  if (completed && rentPayment.status !== 'paid') {
    const {landlord, property} = await fetchPaymentContext(rentPayment.id);
    const tenant = await getTenantProfileForPayment(rentPayment);
    await markRentPaid({
      payment: rentPayment,
      tenant,
      landlord,
      property,
      provider: 'pesapal',
      providerReference,
      metadata: {
        orderTrackingId,
        merchantReference: resolvedMerchantReference,
        paymentMethod: status.payment_method,
        paymentAccount: status.payment_account,
        statusCode: status.status_code,
        statusDescription: status.payment_status_description,
      },
    });
  } else if (rejected) {
    await updateRentPayment(
      rentPayment.id,
      {
        paymentProvider: 'pesapal',
        providerReference,
        paymentMetadata: {
          orderTrackingId,
          merchantReference: resolvedMerchantReference,
          statusCode: status.status_code,
          statusDescription: status.payment_status_description,
          description: status.description,
        },
      },
      {},
    ).catch((updateError) => {
      Sentry.captureException(updateError);
    });
  }

  return {kind: 'rent' as const, completed, rejected, status};
};

const notificationParam = (source: Record<string, unknown>, name: string) => {
  const value = source[name] ?? source[name.charAt(0).toLowerCase() + name.slice(1)];
  if (Array.isArray(value)) return notificationParam({value: value[0]}, 'value');
  return value == null ? '' : String(value);
};

const pesapalNotificationFromRequest = (req: Request) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const query = req.query as Record<string, unknown>;
  const source = {...query, ...body};
  return {
    orderTrackingId: notificationParam(source, 'OrderTrackingId'),
    orderMerchantReference: notificationParam(source, 'OrderMerchantReference'),
    orderNotificationType: notificationParam(source, 'OrderNotificationType') || 'IPNCHANGE',
  };
};

const handlePesapalIpn = asyncHandler(async (req, res) => {
  const notification = pesapalNotificationFromRequest(req);
  if (!notification.orderTrackingId) {
    res.status(400).json({
      orderNotificationType: notification.orderNotificationType,
      orderTrackingId: notification.orderTrackingId,
      orderMerchantReference: notification.orderMerchantReference,
      status: 500,
    });
    return;
  }

  try {
    await processPesapalTransaction(notification.orderTrackingId, notification.orderMerchantReference);
    res.json({
      orderNotificationType: notification.orderNotificationType,
      orderTrackingId: notification.orderTrackingId,
      orderMerchantReference: notification.orderMerchantReference,
      status: 200,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      orderNotificationType: notification.orderNotificationType,
      orderTrackingId: notification.orderTrackingId,
      orderMerchantReference: notification.orderMerchantReference,
      status: 500,
    });
  }
});

const handlePesapalCallback = asyncHandler(async (req, res) => {
  const notification = pesapalNotificationFromRequest(req);
  const params = new URLSearchParams();
  params.set('provider', 'pesapal');

  try {
    if (!notification.orderTrackingId) throw new Error('Missing Pesapal order tracking ID');

    const result = await processPesapalTransaction(notification.orderTrackingId, notification.orderMerchantReference);
    const queryKey = result.kind === 'subscription' ? 'subscription_payment' : 'rent_payment';
    params.set(queryKey, result.completed ? 'success' : result.rejected ? 'cancelled' : 'processing');
    params.set('orderTrackingId', notification.orderTrackingId);
  } catch (error) {
    Sentry.captureException(error);
    params.set('pesapal_payment', 'processing');
  }

  res.redirect(303, `${trimTrailingSlash(appBaseUrl)}/?${params.toString()}`);
});

const createPesapalRentCheckout = asyncHandler(async (req, res) => {
  const {rentPaymentId, cancelUrl} = getValidatedBody<z.infer<typeof pesapalCheckoutSchema>>(req);
  assertAllowedRedirectUrl(cancelUrl, allowedRedirectOrigins);
  const {payment, property} = await fetchPaymentContext(rentPaymentId, req.profile);
  const merchantReference = buildPesapalReference('RENT', payment.id);

  const order = await submitPesapalOrder({
    merchantReference,
    amount: payment.amount,
    description: `Rent payment${property?.title ? ` for ${property.title}` : ''}`,
    customer: req.profile,
    cancellationUrl: cancelUrl || `${trimTrailingSlash(appBaseUrl)}/?rent_payment=cancelled&provider=pesapal`,
  });

  await updateRentPayment(
    payment.id,
    {
      paymentProvider: 'pesapal',
      providerCheckoutRequestId: order.order_tracking_id,
      providerMerchantRequestId: order.merchant_reference || merchantReference,
      paymentMetadata: {
        clientKind: req.clientKind,
        redirectUrl: order.redirect_url,
      },
    },
    {},
  ).catch((error) => {
    Sentry.captureException(error);
  });

  res.json({
    status: 'redirect',
    checkoutUrl: order.redirect_url,
    orderTrackingId: order.order_tracking_id,
  });
});

const normalizeSafaricomPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};

const mpesaBaseUrl = () =>
  process.env.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

const getMpesaAccessToken = async () => {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('M-Pesa consumer credentials are not configured.');

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const response = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`M-Pesa OAuth failed with status ${response.status}`);
  }

  const data = (await response.json()) as {access_token?: string};
  if (!data.access_token) throw new Error('M-Pesa OAuth response did not include access_token.');
  return data.access_token;
};

const mpesaTimestamp = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
};

const initiateMpesaRent = asyncHandler(async (req, res) => {
  const shortcode = process.env.MPESA_BUSINESS_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    res.status(503).json({error: 'M-Pesa STK Push is not configured'});
    return;
  }

  const {rentPaymentId, phone} = getValidatedBody<z.infer<typeof mpesaRentSchema>>(req);
  const {payment, property} = await fetchPaymentContext(rentPaymentId, req.profile);
  const payerPhone = normalizeSafaricomPhone(phone || req.profile?.phone || '');

  if (!payerPhone) {
    res.status(400).json({error: 'A valid tenant phone number is required for M-Pesa'});
    return;
  }

  const accessToken = await getMpesaAccessToken();
  const timestamp = mpesaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const response = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
      Amount: amountInKes(payment.amount),
      PartyA: payerPhone,
      PartyB: shortcode,
      PhoneNumber: payerPhone,
      CallBackURL: callbackUrl,
      AccountReference: `RENT-${payment.id.slice(0, 8)}`,
      TransactionDesc: `Rent payment${property?.title ? ` for ${property.title}` : ''}`,
    }),
  });

  const body = (await response.json()) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    errorMessage?: string;
  };

  if (!response.ok || body.ResponseCode !== '0') {
    res.status(502).json({
      error: 'M-Pesa STK Push failed',
      message: body.errorMessage || body.ResponseDescription || 'Payment request was not accepted',
    });
    return;
  }

  await updateRentPayment(
    payment.id,
    {
      paymentProvider: 'mpesa',
      providerCheckoutRequestId: body.CheckoutRequestID,
      providerMerchantRequestId: body.MerchantRequestID,
      paymentMetadata: {
        payerPhone,
        clientKind: req.clientKind,
        customerMessage: body.CustomerMessage,
      },
    },
    {},
  ).catch((error) => {
    Sentry.captureException(error);
  });

  res.json({
    status: 'initiated',
    checkoutRequestId: body.CheckoutRequestID,
    customerMessage: body.CustomerMessage,
  });
});

const callbackMetadataValue = (items: Array<{Name: string; Value?: string | number}> | undefined, name: string) =>
  items?.find((item) => item.Name === name)?.Value;

const handleMpesaCallback = asyncHandler(async (req, res) => {
  const parsed = mpesaCallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ResultCode: 1, ResultDesc: 'Invalid callback'});
    return;
  }

  const callback = parsed.data.Body.stkCallback;
  const checkoutRequestId = callback.CheckoutRequestID;
  const metadataItems = callback.CallbackMetadata?.Item;
  const receiptNumber = callbackMetadataValue(metadataItems, 'MpesaReceiptNumber');

  const subPayment = await db.query.landlordSubscriptionPayments.findFirst({
    where: eq(schema.landlordSubscriptionPayments.providerCheckoutRequestId, checkoutRequestId),
    columns: {id: true, landlordId: true, plan: true, amount: true, status: true},
  });

  if (subPayment) {
    if (callback.ResultCode === 0 && subPayment.status !== 'confirmed') {
      const parsed = parseSubscriptionPlan(subPayment.plan);
      if (parsed) {
        const landlord = await db.query.users.findFirst({
          where: eq(schema.users.uid, subPayment.landlordId),
          columns: {uid: true, email: true, displayName: true},
        });

        if (landlord) {
          await activateLandlordSubscription(
            {sendEmail, insertNotification},
            {
              subscriptionPaymentId: subPayment.id,
              landlordId: subPayment.landlordId,
              landlordEmail: landlord.email,
              landlordName: landlord.displayName || landlord.email,
              tier: parsed.tier,
              billing: parsed.billing,
              amount: Number(subPayment.amount),
              paymentChannel: 'M-Pesa',
              paymentReference: receiptNumber ? String(receiptNumber) : checkoutRequestId,
            },
          );
        }
      }
    } else if (callback.ResultCode !== 0) {
      await db
        .update(schema.landlordSubscriptionPayments)
        .set({status: 'rejected', paymentReference: callback.ResultDesc || 'failed'})
        .where(eq(schema.landlordSubscriptionPayments.id, subPayment.id));
    }

    res.json({ResultCode: 0, ResultDesc: 'Accepted'});
    return;
  }

  const payment = await db.query.rentPayments.findFirst({
    where: eq(schema.rentPayments.providerCheckoutRequestId, checkoutRequestId),
  });

  if (!payment) {
    res.json({ResultCode: 0, ResultDesc: 'Accepted'});
    return;
  }

  const rentPayment = payment as unknown as RentPaymentRecord;
  const {landlord, property} = await fetchPaymentContext(rentPayment.id);
  const tenant = await getTenantProfileForPayment(rentPayment);

  if (callback.ResultCode === 0 && rentPayment.status !== 'paid') {
    await markRentPaid({
      payment: rentPayment,
      tenant,
      landlord,
      property,
      provider: 'mpesa',
      providerReference: receiptNumber ? String(receiptNumber) : checkoutRequestId,
      metadata: {
        checkoutRequestId,
        merchantRequestId: callback.MerchantRequestID,
        mpesaReceiptNumber: receiptNumber,
        transactionDate: callbackMetadataValue(metadataItems, 'TransactionDate'),
        phoneNumber: callbackMetadataValue(metadataItems, 'PhoneNumber'),
      },
    });

    settleMpesaToLandlord({payment: rentPayment, landlord}).catch((settlementError) => {
      Sentry.captureException(settlementError);
    });
  } else {
    await updateRentPayment(
      rentPayment.id,
      {
        paymentProvider: 'mpesa',
        paymentMetadata: {
          checkoutRequestId,
          merchantRequestId: callback.MerchantRequestID,
          resultCode: callback.ResultCode,
          resultDesc: callback.ResultDesc,
        },
      },
      {},
    ).catch((updateError) => {
      Sentry.captureException(updateError);
    });
  }

  res.json({ResultCode: 0, ResultDesc: 'Accepted'});
});

const settleMpesaToLandlord = async ({payment, landlord}: {payment: RentPaymentRecord; landlord: UserProfileRecord}) => {
  if (process.env.MPESA_ENABLE_B2C_SETTLEMENT !== 'true') return;
  if (!landlord.mpesaSettlementPhone) return;

  const shortcode = process.env.MPESA_B2C_SHORTCODE;
  const initiatorName = process.env.MPESA_B2C_INITIATOR_NAME;
  const securityCredential = process.env.MPESA_B2C_SECURITY_CREDENTIAL;
  const resultUrl = process.env.MPESA_B2C_RESULT_URL;
  const timeoutUrl = process.env.MPESA_B2C_TIMEOUT_URL || resultUrl;

  if (!shortcode || !initiatorName || !securityCredential || !resultUrl || !timeoutUrl) {
    throw new Error('M-Pesa B2C settlement is enabled but credentials/URLs are incomplete.');
  }

  const accessToken = await getMpesaAccessToken();
  const response = await fetch(`${mpesaBaseUrl()}/mpesa/b2c/v3/paymentrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      OriginatorConversationID: `rent-${payment.id}`,
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: process.env.MPESA_B2C_COMMAND_ID || 'BusinessPayment',
      Amount: amountInKes(payment.amount),
      PartyA: shortcode,
      PartyB: normalizeSafaricomPhone(landlord.mpesaSettlementPhone),
      Remarks: `MyBoma rent settlement ${payment.id}`,
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: 'Rent settlement',
    }),
  });

  const body = (await response.json()) as {ConversationID?: string; OriginatorConversationID?: string};
  await updateRentPayment(
    payment.id,
    {
      settlementStatus: response.ok ? 'initiated' : 'failed',
      settlementReference: body.ConversationID || body.OriginatorConversationID || null,
      paymentMetadata: {
        settlementResponse: body,
      },
    },
    {},
  );
};

const stripeWebhookHandler = asyncHandler(async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(503).send('Stripe webhook is not configured');
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (!signature || Array.isArray(signature)) {
    res.status(400).send('Missing Stripe signature');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error: any) {
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    await fulfillStripeCheckout(session.id);
  }

  res.json({received: true});
});

const healthHandler = (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MyBoma API Gateway',
    config: nonSecretConfigStatus(),
  });
};

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many requests, please try again later.'},
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'API rate limit exceeded, please try again later.'},
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many payment attempts. Please wait and try again.'},
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Webhook rate limit exceeded.'},
});

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many waitlist requests. Please wait and try again.'},
});

const allowedOrigins = deploymentOrigins;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        connectSrc: [
          "'self'",
          requiredEnv.supabaseUrl || '',
          'https://*.supabase.co',
          'wss://*.supabase.co',
          'https://*.sentry.io',
          'https://checkout.stripe.com',
          'https://api.stripe.com',
          'https://sandbox.safaricom.co.ke',
          'https://api.safaricom.co.ke',
          'https://cybqa.pesapal.com',
          'https://pay.pesapal.com',
        ].filter(Boolean),
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Stripe-Signature', 'sentry-trace', 'baggage'],
  }),
);

// Better-Auth parses its own request body, so it's mounted before express.json() too.
app.all('/api/auth/*', toNodeHandler(auth));

// Stripe requires the raw body for signature verification, so this route stays before express.json().
app.post('/api/webhooks/stripe', webhookLimiter, express.raw({type: 'application/json'}), stripeWebhookHandler);

app.use(express.json({limit: '256kb'}));
app.use('/api', publicLimiter);

app.get('/api/health', healthHandler);
app.get('/api/legal', (_req, res) => res.json(LEGAL_DOCUMENTS));

/** Public listings — matches the old "Authenticated users read available properties"
 * RLS policy's `status = 'available'` branch, which was open to anyone (see db/authz.ts
 * canViewProperty). Logged-out hunters browse this same feed. */
app.get('/api/public/properties/available', publicLimiter, asyncHandler(async (_req, res) => {
  const rows = await db.query.properties.findMany({
    where: eq(schema.properties.status, 'available'),
    orderBy: desc(schema.properties.createdAt),
  });
  res.json(rows.map((p) => ({...p, price: Number(p.price)})));
}));

/** Public file serving — mirrors the old Supabase bucket, which had public=true and a
 * "Property images are public" SELECT policy on storage.objects with no auth required. */
app.get('/api/files/*', publicLimiter, asyncHandler(async (req, res) => {
  const key = (req.params as unknown as string[])[0];
  if (!key) {
    res.status(400).json({error: 'Missing file key'});
    return;
  }
  try {
    const object = await getObjectStream(key);
    if (object.ContentType) res.setHeader('Content-Type', object.ContentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    const body = object.Body as NodeJS.ReadableStream | undefined;
    if (!body) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    body.pipe(res);
  } catch (err: any) {
    if (err?.name === 'NoSuchKey') {
      res.status(404).json({error: 'Not found'});
      return;
    }
    throw err;
  }
}));

app.post(
  '/api/waitlist',
  waitlistLimiter,
  validateBody(waitlistSignupSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof waitlistSignupSchema>>(req);
    const email = body.email.toLowerCase();
    const unsubscribeToken = randomUUID();
    const now = new Date();
    const values = {
      email,
      source: body.source,
      status: 'subscribed' as const,
      unsubscribeToken,
      consentAt: now,
      unsubscribedAt: null,
      updatedAt: now,
    };
    const [data] = await db
      .insert(schema.waitlistSignups)
      .values(values)
      .onConflictDoUpdate({target: schema.waitlistSignups.email, set: values})
      .returning({email: schema.waitlistSignups.email, unsubscribeToken: schema.waitlistSignups.unsubscribeToken});

    const unsubscribeUrl = `${appBaseUrl}/?unsubscribe=${data.unsubscribeToken}`;
    try {
      await sendEmail({
        to: data.email,
        subject: 'You are on the MyBoma waitlist',
        text: [
          'Thanks for joining the MyBoma waitlist.',
          '',
          'We will email you about launch updates and important product news.',
          `Unsubscribe any time: ${unsubscribeUrl}`,
        ].join('\n'),
      });
    } catch (error) {
      console.error(`[Waitlist] Confirmation email failed for ${email}:`, error);
    }

    res.status(201).json({status: 'subscribed'});
  }),
);
app.post(
  '/api/waitlist/unsubscribe',
  waitlistLimiter,
  validateBody(waitlistUnsubscribeSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof waitlistUnsubscribeSchema>>(req);
    const now = new Date();
    const where = body.token
      ? eq(schema.waitlistSignups.unsubscribeToken, body.token)
      : eq(schema.waitlistSignups.email, body.email!.toLowerCase());

    await db.update(schema.waitlistSignups).set({status: 'unsubscribed', unsubscribedAt: now, updatedAt: now}).where(where);

    res.json({status: 'unsubscribed'});
  }),
);
app.post(
  '/api/webhooks/mpesa/stk',
  webhookLimiter,
  verifyMpesaCallback(isProduction),
  handleMpesaCallback,
);
app.get('/api/payments/pesapal/callback', webhookLimiter, handlePesapalCallback);
app.get('/api/webhooks/pesapal/ipn', webhookLimiter, handlePesapalIpn);
app.post('/api/webhooks/pesapal/ipn', webhookLimiter, handlePesapalIpn);

const bffRouter = express.Router();
bffRouter.use(authLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 10 * 1024 * 1024},
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are allowed'));
      return;
    }
    cb(null, true);
  },
});

/** Replaces supabase.storage.from('properties').upload(...) — every upload lands
 * under the caller's own uid folder, matching the old bucket's storage RLS policy. */
bffRouter.post(
  '/uploads',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as unknown as {file?: Express.Multer.File}).file;
    if (!file) {
      res.status(400).json({error: 'No file provided'});
      return;
    }
    const subpath = typeof req.body?.subpath === 'string' ? req.body.subpath.replace(/^\/+|\/+$/g, '') : undefined;
    const key = buildObjectKey(req.profile!.uid, file.originalname, subpath);
    await uploadObject(key, file.buffer, file.mimetype);
    res.status(201).json({url: `${appBaseUrl}/api/files/${key}`});
  }),
);

bffRouter.get('/session', requireAuth, asyncHandler(async (req, res) => {
  res.json({
    client: req.clientKind,
    user: {
      id: req.authUser?.id,
      email: req.authUser?.email,
    },
    profile: req.profile,
  });
}));

// canViewNotification (db/authz.ts) just checks recipientEmail === actor's email,
// so this is naturally scoped to the caller's own notifications.
bffRouter.get('/notifications/unread-count', requireAuth, asyncHandler(async (req, res) => {
  const email = req.profile!.email.toLowerCase();
  const rows = await db
    .select({id: schema.notifications.id})
    .from(schema.notifications)
    .where(and(sql`lower(${schema.notifications.recipientEmail}) = ${email}`, eq(schema.notifications.read, false)));
  res.json({count: rows.length});
}));

/**
 * Self-service profile update, shared by every role's "edit profile" form. Deliberately
 * excludes role/isAdmin/isSuperAdmin/email/platformId — canWriteUser (db/authz.ts) would
 * reject a self-escalation attempt anyway, but this schema keeps such fields from ever
 * reaching that check in the first place.
 */
const selfProfileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    phone: z.string().max(20).nullable().optional(),
    address: z.string().max(280).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    bankName: z.string().max(120).nullable().optional(),
    bankAccountNumber: z.string().max(40).nullable().optional(),
    bankAccountName: z.string().max(120).nullable().optional(),
    rentPayoutMethod: z.enum(['cash', 'mpesa', 'bank']).nullable().optional(),
    cashPayoutNotes: z.string().max(280).nullable().optional(),
    mpesaSettlementPhone: z.string().max(20).nullable().optional(),
    mpesaSettlementShortCode: z.string().max(20).nullable().optional(),
  })
  .strict();

bffRouter.patch(
  '/me',
  requireAuth,
  validateBody(selfProfileUpdateSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof selfProfileUpdateSchema>>(req);
    await db.update(schema.users).set(body).where(eq(schema.users.uid, req.profile!.uid));
    res.json({updated: true});
  }),
);

bffRouter.patch(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const notification = await db.query.notifications.findFirst({
      where: eq(schema.notifications.id, req.params.id),
      columns: {id: true, recipientEmail: true},
    });
    if (!notification) {
      res.status(404).json({error: 'Notification not found'});
      return;
    }
    if (!canUpdateNotification(actor, notification)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    await db.update(schema.notifications).set({read: true}).where(eq(schema.notifications.id, req.params.id));
    res.json({updated: true});
  }),
);

/**
 * Consolidates the tenant dashboard's old property + landlord + maintenanceRequests +
 * rentPayments + notifications fetches (and their four Realtime channels) into one
 * polled endpoint. tenantId columns historically hold either the tenant's email or uid
 * (see db/authz.ts), so both are matched, exactly like the old tenantRentOrFilter.
 */
bffRouter.get(
  '/tenant/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.profile!.uid;
    const email = req.profile!.email.toLowerCase();
    const tenantMatch = (column: typeof schema.properties.tenantId | typeof schema.rentPayments.tenantId) =>
      or(eq(column, email), eq(column, uid));

    const property = (await db.query.properties.findFirst({where: tenantMatch(schema.properties.tenantId)})) ?? null;

    let landlord = null;
    if (property) {
      const landlordRow = await db.query.users.findFirst({
        where: eq(schema.users.uid, property.landlordId),
        columns: {
          uid: true, displayName: true, email: true, phone: true, bankName: true,
          bankAccountNumber: true, bankAccountName: true, rentRecipientId: true,
          rentPayoutMethod: true, mpesaSettlementPhone: true,
        },
      });
      if (landlordRow?.rentRecipientId && landlordRow.rentRecipientId !== landlordRow.uid) {
        landlord = (await db.query.users.findFirst({
          where: eq(schema.users.uid, landlordRow.rentRecipientId),
          columns: {
            uid: true, displayName: true, email: true, phone: true, bankName: true,
            bankAccountNumber: true, bankAccountName: true, rentPayoutMethod: true, mpesaSettlementPhone: true,
          },
        })) ?? landlordRow;
      } else {
        landlord = landlordRow ?? null;
      }
    }

    const requests = await db.query.maintenanceRequests.findMany({where: eq(schema.maintenanceRequests.tenantId, uid)});

    const payments = await db.query.rentPayments.findMany({
      where: tenantMatch(schema.rentPayments.tenantId),
      orderBy: desc(schema.rentPayments.dueDate),
    });

    const notifications = await db.query.notifications.findMany({
      where: sql`lower(${schema.notifications.recipientEmail}) = ${email}`,
      orderBy: desc(schema.notifications.createdAt),
    });

    res.json({property, landlord, requests, payments, notifications});
  }),
);

const createMaintenanceRequestSchema = z
  .object({
    propertyId: z.string().uuid(),
    landlordId: z.string().uuid(),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(2000),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
  })
  .strict();

bffRouter.post(
  '/tenant/maintenance-requests',
  requireAuth,
  validateBody(createMaintenanceRequestSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof createMaintenanceRequestSchema>>(req);
    const actor = toActor(req.profile!);

    if (!canCreateMaintenanceRequest(actor, actor.id)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const [request] = await db
      .insert(schema.maintenanceRequests)
      .values({
        tenantId: actor.id,
        propertyId: body.propertyId,
        landlordId: body.landlordId,
        title: body.title,
        description: body.description,
        priority: body.priority,
        status: 'pending',
      })
      .returning();

    res.status(201).json(request);
  }),
);

/** Only returns contact info if the landlord owns at least one available property —
 * matches the "users" SELECT policy's property-relationship clause (db/authz.ts). */
bffRouter.get(
  '/landlords/:uid/public-contact',
  requireAuth,
  asyncHandler(async (req, res) => {
    const hasAvailableProperty = await db.query.properties.findFirst({
      where: and(eq(schema.properties.landlordId, req.params.uid), eq(schema.properties.status, 'available')),
      columns: {id: true},
    });
    if (!hasAvailableProperty) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    const landlord = await db.query.users.findFirst({
      where: eq(schema.users.uid, req.params.uid),
      columns: {uid: true, displayName: true, phone: true, email: true},
    });
    if (!landlord) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    res.json(landlord);
  }),
);

const createBookingSchema = z
  .object({
    propertyId: z.string().uuid(),
    landlordId: z.string().uuid(),
    platformId: z.string().uuid().nullable().optional(),
    startDate: z.string(),
    endDate: z.string(),
    totalPrice: z.number().min(0),
  })
  .strict();

bffRouter.post(
  '/hunter/bookings',
  requireAuth,
  validateBody(createBookingSchema),
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const body = getValidatedBody<z.infer<typeof createBookingSchema>>(req);

    if (!canCreateBooking(actor, actor.id)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const [booking] = await db
      .insert(schema.bookings)
      .values({...body, hunterId: actor.id, totalPrice: String(body.totalPrice), status: 'pending'})
      .returning();

    const property = await db.query.properties.findFirst({where: eq(schema.properties.id, body.propertyId), columns: {title: true}});
    const landlord = await db.query.users.findFirst({where: eq(schema.users.uid, body.landlordId), columns: {email: true}});
    if (landlord?.email) {
      await insertNotification({
        recipientEmail: landlord.email.toLowerCase(),
        platformId: body.platformId ?? null,
        type: 'booking',
        title: 'New booking request',
        message: `${req.profile!.displayName || req.profile!.email} requested ${property?.title ?? 'a property'}. Total KES ${body.totalPrice.toLocaleString()}. Confirm after payment.`,
        propertyId: body.propertyId,
        read: false,
      });
    }

    res.status(201).json({...booking, totalPrice: Number(booking.totalPrice)});
  }),
);

/**
 * Resolves the property/building ids a landlord's account can reach: rows they own
 * directly, plus rows for properties they've been added as a manager on. The old
 * client fetched these tables unfiltered and relied on Postgres RLS to narrow the
 * result set to exactly this — see db/authz.ts for the ported policy logic.
 */
async function landlordReach(actorId: string) {
  const managed = await db
    .select({propertyId: schema.propertyManagers.propertyId})
    .from(schema.propertyManagers)
    .where(eq(schema.propertyManagers.userId, actorId));
  const managedPropertyIds = managed.map((m) => m.propertyId);

  let managedBuildingIds: string[] = [];
  if (managedPropertyIds.length > 0) {
    const rows = await db
      .select({buildingId: schema.properties.buildingId})
      .from(schema.properties)
      .where(inArray(schema.properties.id, managedPropertyIds));
    managedBuildingIds = rows.map((r) => r.buildingId).filter((id): id is string => Boolean(id));
  }

  return {managedPropertyIds, managedBuildingIds};
}

/**
 * Consolidates the landlord dashboard's old buildings + properties + maintenanceRequests
 * + rentPayments + bookings + expenses + invitations + notifications fetches (and their
 * seven Realtime channels) into one polled endpoint, plus the automatic rent-invoice sync
 * that used to run client-side (see server/rentInvoiceSync.ts).
 */
bffRouter.get(
  '/landlord/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const {managedPropertyIds, managedBuildingIds} = await landlordReach(actor.id);
    const propertyReach = or(eq(schema.properties.landlordId, actor.id), inArray(schema.properties.id, managedPropertyIds));

    const buildings = await db
      .select()
      .from(schema.buildings)
      .where(or(eq(schema.buildings.landlordId, actor.id), inArray(schema.buildings.id, managedBuildingIds)));

    const properties = await db.select().from(schema.properties).where(propertyReach);
    const propertyIds = properties.map((p) => p.id);

    const requests = propertyIds.length
      ? await db.query.maintenanceRequests.findMany({
          where: or(eq(schema.maintenanceRequests.landlordId, actor.id), inArray(schema.maintenanceRequests.propertyId, propertyIds)),
        })
      : await db.query.maintenanceRequests.findMany({where: eq(schema.maintenanceRequests.landlordId, actor.id)});

    const paymentsWhere = propertyIds.length
      ? or(eq(schema.rentPayments.landlordId, actor.id), inArray(schema.rentPayments.propertyId, propertyIds))
      : eq(schema.rentPayments.landlordId, actor.id);

    let rentPaymentRows = await db.query.rentPayments.findMany({where: paymentsWhere, orderBy: desc(schema.rentPayments.dueDate)});

    if (actor.role !== 'admin') {
      await syncAutomaticRentInvoices(properties as any, rentPaymentRows as any, actor.id, actor.platformId);
      rentPaymentRows = await db.query.rentPayments.findMany({where: paymentsWhere, orderBy: desc(schema.rentPayments.dueDate)});
    }
    const payments = rentPaymentRows.map((p) => ({...p, amount: Number(p.amount)}));

    const bookings = await db.query.bookings.findMany({
      where: propertyIds.length
        ? or(eq(schema.bookings.landlordId, actor.id), inArray(schema.bookings.propertyId, propertyIds))
        : eq(schema.bookings.landlordId, actor.id),
      orderBy: desc(schema.bookings.startDate),
    });

    const expenses = await db.query.expenses.findMany({
      where: propertyIds.length
        ? or(eq(schema.expenses.landlordId, actor.id), inArray(schema.expenses.propertyId, propertyIds))
        : eq(schema.expenses.landlordId, actor.id),
      orderBy: desc(schema.expenses.expenseDate),
    });

    const invitations =
      actor.role === 'admin'
        ? await db.query.invitations.findMany({where: eq(schema.invitations.platformId, actor.platformId ?? '')})
        : await db.query.invitations.findMany({where: eq(schema.invitations.landlordId, actor.id)});

    const notifications = await db.query.notifications.findMany({
      where: sql`lower(${schema.notifications.recipientEmail}) = ${actor.email.toLowerCase()}`,
      orderBy: desc(schema.notifications.createdAt),
    });

    res.json({buildings, properties, requests, payments, bookings, expenses, invitations, notifications});
  }),
);

bffRouter.post(
  '/landlord/rent-invoices/sync',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const {managedPropertyIds} = await landlordReach(actor.id);
    const properties = await db
      .select()
      .from(schema.properties)
      .where(or(eq(schema.properties.landlordId, actor.id), inArray(schema.properties.id, managedPropertyIds)));
    const payments = await db.query.rentPayments.findMany({where: eq(schema.rentPayments.landlordId, actor.id)});
    const result = await syncAutomaticRentInvoices(properties as any, payments as any, actor.id, actor.platformId);
    res.json(result);
  }),
);

const buildingSchema = z.object({name: z.string().min(1).max(160), address: z.string().max(280).optional()}).strict();
const buildingCreateSchema = buildingSchema.extend({
  landlordId: z.string().uuid().optional(),
  platformId: z.string().uuid().nullable().optional(),
}).strict();

/** Landlords create buildings for themselves; an admin may pass an explicit landlordId
 * (and platformId) to create one on a managed landlord's behalf — mirrors AdminDashboard's
 * "add asset group" flow, which always specifies the target landlord. */
bffRouter.post(
  '/landlord/buildings',
  requireAuth,
  validateBody(buildingCreateSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof buildingCreateSchema>>(req);
    const actor = toActor(req.profile!);
    const landlordId = body.landlordId ?? actor.id;
    const platformId = body.landlordId ? (body.platformId ?? null) : (actor.platformId ?? null);

    if (landlordId !== actor.id && !isAdminInPlatform(actor, platformId)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const [building] = await db
      .insert(schema.buildings)
      .values({name: body.name, address: body.address ?? null, landlordId, platformId})
      .returning();
    res.status(201).json(building);
  }),
);

bffRouter.patch(
  '/landlord/buildings/:id',
  requireAuth,
  validateBody(buildingSchema.partial()),
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const building = await db.query.buildings.findFirst({where: eq(schema.buildings.id, req.params.id)});
    if (!building) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (!(await canManageBuilding(actor, building))) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const body = getValidatedBody<z.infer<typeof buildingSchema>>(req);
    const [updated] = await db.update(schema.buildings).set(body).where(eq(schema.buildings.id, req.params.id)).returning();
    res.json(updated);
  }),
);

bffRouter.delete(
  '/landlord/buildings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const building = await db.query.buildings.findFirst({where: eq(schema.buildings.id, req.params.id)});
    if (!building) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (!(await canManageBuilding(actor, building))) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    await db.delete(schema.buildings).where(eq(schema.buildings.id, req.params.id));
    res.json({deleted: true});
  }),
);

const propertyInputSchema = z.object({
  buildingId: z.string().uuid().nullable().optional(),
  unitNumber: z.string().max(60).nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  type: z.enum(['residential', 'commercial', 'bnb']),
  price: z.number().min(0),
  location: z.string().min(1).max(280),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
});

const propertyCreateBatchSchema = z
  .object({
    properties: z.array(propertyInputSchema).min(1).max(200),
    landlordId: z.string().uuid().optional(),
    platformId: z.string().uuid().nullable().optional(),
  })
  .strict();

/** Landlords create properties for themselves; an admin may pass an explicit landlordId
 * (and platformId) to create on a managed landlord's behalf — mirrors AdminDashboard's
 * "add property"/"bulk add" flows, which always specify the target landlord. */
bffRouter.post(
  '/landlord/properties',
  requireAuth,
  validateBody(propertyCreateBatchSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof propertyCreateBatchSchema>>(req);
    const actor = toActor(req.profile!);
    const landlordId = body.landlordId ?? actor.id;
    const platformId = body.landlordId ? (body.platformId ?? null) : (actor.platformId ?? null);

    if (landlordId !== actor.id && !isAdminInPlatform(actor, platformId)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const inserted = await db
      .insert(schema.properties)
      .values(
        body.properties.map((p) => ({
          ...p,
          landlordId,
          platformId,
          status: 'available' as const,
          price: String(p.price),
        })),
      )
      .returning();
    res.status(201).json(inserted);
  }),
);

const propertyUpdateSchema = propertyInputSchema
  .partial()
  .extend({
    status: z.enum(['available', 'rented', 'booked']).optional(),
    tenantId: z.string().max(320).nullable().optional(),
    landlordId: z.string().uuid().optional(),
    price: z.number().min(0).optional(),
  })
  .strict();

bffRouter.patch(
  '/landlord/properties/:id',
  requireAuth,
  validateBody(propertyUpdateSchema),
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const property = await db.query.properties.findFirst({where: eq(schema.properties.id, req.params.id)});
    if (!property) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (!(await canManageProperty(actor, property))) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const body = getValidatedBody<z.infer<typeof propertyUpdateSchema>>(req);
    const [updated] = await db
      .update(schema.properties)
      .set({...body, price: body.price !== undefined ? String(body.price) : undefined})
      .where(eq(schema.properties.id, req.params.id))
      .returning();

    if (updated.status === 'rented' && updated.tenantId) {
      const payments = await db.query.rentPayments.findMany({where: eq(schema.rentPayments.landlordId, actor.id)});
      await ensureRentInvoiceForProperty(updated as any, updated.tenantId, actor.id, actor.platformId, payments as any);
    }

    res.json(updated);
  }),
);

bffRouter.delete(
  '/landlord/properties/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const property = await db.query.properties.findFirst({where: eq(schema.properties.id, req.params.id)});
    if (!property) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (!(await canManageProperty(actor, property))) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    await db.delete(schema.properties).where(eq(schema.properties.id, req.params.id));
    res.json({deleted: true});
  }),
);

const addManagerSchema = z.object({email: emailSchema, role: z.enum(['manager', 'co-owner']).default('manager')}).strict();

/** Ports the add_property_manager Postgres RPC (supabase-setup.sql) — only the actual
 * landlord who owns the property may add managers to it, matching the RPC's own check. */
bffRouter.post(
  '/landlord/properties/:id/managers',
  requireAuth,
  validateBody(addManagerSchema),
  asyncHandler(async (req, res) => {
    const actor = req.profile!;
    const body = getValidatedBody<z.infer<typeof addManagerSchema>>(req);
    const property = await db.query.properties.findFirst({where: eq(schema.properties.id, req.params.id)});
    if (!property) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (property.landlordId !== actor.uid && !actor.isSuperAdmin) {
      res.status(403).json({error: 'You do not have permission to add managers to this property.'});
      return;
    }
    const targetUser = await db.query.users.findFirst({where: ilike(schema.users.email, body.email)});
    if (!targetUser) {
      res.status(404).json({error: 'No user found with that email address.'});
      return;
    }
    await db
      .insert(schema.propertyManagers)
      .values({propertyId: property.id, userId: targetUser.uid, landlordId: property.landlordId, role: body.role})
      .onConflictDoNothing();
    res.status(201).json({added: true});
  }),
);

const assignTenantSchema = z.object({propertyId: z.string().uuid(), email: emailSchema}).strict();

bffRouter.post(
  '/landlord/tenants/assign',
  requireAuth,
  validateBody(assignTenantSchema),
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const body = getValidatedBody<z.infer<typeof assignTenantSchema>>(req);
    const property = await db.query.properties.findFirst({where: eq(schema.properties.id, body.propertyId)});
    if (!property) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (!(await canManageProperty(actor, property))) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const tenantEmail = body.email.toLowerCase();
    const [updated] = await db
      .update(schema.properties)
      .set({tenantId: tenantEmail, status: 'rented'})
      .where(eq(schema.properties.id, body.propertyId))
      .returning();

    const payments = await db.query.rentPayments.findMany({where: eq(schema.rentPayments.landlordId, actor.id)});
    await ensureRentInvoiceForProperty(updated as any, tenantEmail, actor.id, actor.platformId, payments as any, true);

    res.json({assigned: true, property: updated});
  }),
);

const tenantEmailParamSchema = z.object({email: emailSchema}).strict();

/** Unassigns a tenant from every property matching this landlord's account and cancels
 * their unpaid invoices, without deleting the invitation (tenant registry entry). */
bffRouter.post(
  '/landlord/tenants/:email/unassign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = tenantEmailParamSchema.safeParse({email: req.params.email});
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid email'});
      return;
    }
    const actor = req.profile!;
    const email = parsed.data.email.toLowerCase();

    await db
      .update(schema.properties)
      .set({tenantId: null, status: 'available'})
      .where(and(ilike(schema.properties.tenantId, email), eq(schema.properties.landlordId, actor.uid)));
    await db
      .delete(schema.rentPayments)
      .where(and(ilike(schema.rentPayments.tenantId, email), eq(schema.rentPayments.landlordId, actor.uid), ne(schema.rentPayments.status, 'paid')));

    res.json({unassigned: true});
  }),
);

bffRouter.delete(
  '/landlord/tenants/:email',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = tenantEmailParamSchema.safeParse({email: req.params.email});
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid email'});
      return;
    }
    const actor = req.profile!;
    const email = parsed.data.email.toLowerCase();

    await db.delete(schema.invitations).where(and(ilike(schema.invitations.email, email), eq(schema.invitations.landlordId, actor.uid)));
    await db
      .update(schema.properties)
      .set({tenantId: null, status: 'available'})
      .where(and(ilike(schema.properties.tenantId, email), eq(schema.properties.landlordId, actor.uid)));
    await db
      .delete(schema.rentPayments)
      .where(and(ilike(schema.rentPayments.tenantId, email), eq(schema.rentPayments.landlordId, actor.uid), ne(schema.rentPayments.status, 'paid')));

    res.json({deleted: true});
  }),
);

bffRouter.patch(
  '/landlord/maintenance-requests/:id',
  requireAuth,
  validateBody(z.object({status: z.enum(['pending', 'in-progress', 'resolved'])}).strict()),
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const request = await db.query.maintenanceRequests.findFirst({where: eq(schema.maintenanceRequests.id, req.params.id)});
    if (!request) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (!(await canUpdateMaintenanceRequest(actor, request))) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const {status} = getValidatedBody<{status: 'pending' | 'in-progress' | 'resolved'}>(req);
    const [updated] = await db
      .update(schema.maintenanceRequests)
      .set({status})
      .where(eq(schema.maintenanceRequests.id, req.params.id))
      .returning();
    res.json(updated);
  }),
);

const expenseInputSchema = z
  .object({
    propertyId: z.string().uuid().nullable().optional(),
    category: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    amount: z.number().min(0),
    expenseDate: z.string(),
    receiptUrl: z.string().url().nullable().optional(),
  })
  .strict();

bffRouter.post(
  '/landlord/expenses',
  requireAuth,
  validateBody(expenseInputSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof expenseInputSchema>>(req);
    const actor = req.profile!;
    const [expense] = await db
      .insert(schema.expenses)
      .values({...body, amount: String(body.amount), landlordId: actor.uid, platformId: actor.platformId ?? null})
      .returning();
    res.status(201).json(expense);
  }),
);

bffRouter.post(
  '/notifications/mark-all-read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const email = req.profile!.email.toLowerCase();
    await db
      .update(schema.notifications)
      .set({read: true})
      .where(and(sql`lower(${schema.notifications.recipientEmail}) = ${email}`, eq(schema.notifications.read, false)));
    res.json({updated: true});
  }),
);

/** supabase-setup.sql never granted a DELETE policy on notifications to anyone but the
 * service role — not even the recipient — so this preserves that: nobody but a super
 * admin can delete one. The old client-side delete button always failed under RLS. */
bffRouter.delete(
  '/notifications/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.profile!.isSuperAdmin) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    await db.delete(schema.notifications).where(eq(schema.notifications.id, req.params.id));
    res.json({deleted: true});
  }),
);

/**
 * Consolidates the admin dashboard's old users + properties + invitations + rentPayments
 * + buildings (+ platforms, for super admins) fetches and their five-table Realtime
 * channel into one polled endpoint. Filtering mirrors the old client exactly, including
 * its narrower-than-RLS choice for plain admins (see comments below).
 */
bffRouter.get(
  '/admin/dashboard',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const listLimit = 200;
    const platformIdParam = typeof req.query.platformId === 'string' ? req.query.platformId : undefined;

    // Super admins may pick any platform (or 'all'); plain admins are always pinned to
    // their own platform ('none' meaning "no platform assigned").
    const filterId = isSuperAdmin(actor) ? (platformIdParam && platformIdParam !== 'all' ? platformIdParam : null) : actor.platformId || 'none';

    // Loosely typed on purpose: this closes over columns from five different tables
    // (users/properties/invitations/rentPayments/buildings) that all happen to share
    // the same platformId/landlordId column shape.
    const platformWhere = (col: any) => (filterId === null ? undefined : filterId === 'none' ? isNull(col) : eq(col, filterId));
    const withLandlordScope = (col: any, base: any) => (isSuperAdmin(actor) ? base : and(base, eq(col, actor.id)));

    let users = await db.query.users.findMany({
      where: platformWhere(schema.users.platformId),
      orderBy: desc(schema.users.createdAt),
      limit: listLimit,
    });

    // Plain admins only see users they've personally invited (as "landlordId" on the
    // invitation), plus themselves — narrower than what RLS would have allowed, but
    // this replicates the old client's own (more restrictive) query exactly.
    if (!isSuperAdmin(actor)) {
      const myInvites = await db.query.invitations.findMany({
        where: eq(schema.invitations.landlordId, actor.id),
        columns: {email: true},
      });
      const allowedEmails = new Set(myInvites.map((i) => i.email.toLowerCase()));
      allowedEmails.add(actor.email.toLowerCase());
      users = users.filter((u) => allowedEmails.has(u.email.toLowerCase()));
    }

    const properties = await db.query.properties.findMany({
      where: withLandlordScope(schema.properties.landlordId, platformWhere(schema.properties.platformId)),
      orderBy: desc(schema.properties.createdAt),
      limit: listLimit,
    });

    const invitationRows = await db.query.invitations.findMany({
      where: withLandlordScope(schema.invitations.landlordId, platformWhere(schema.invitations.platformId)),
      orderBy: desc(schema.invitations.createdAt),
      limit: listLimit,
    });
    const registeredEmails = new Set(users.map((u) => u.email.toLowerCase()));
    const invitations = invitationRows.filter((inv) => !registeredEmails.has(inv.email.toLowerCase()));

    const paymentRows = await db.query.rentPayments.findMany({
      where: withLandlordScope(schema.rentPayments.landlordId, platformWhere(schema.rentPayments.platformId)),
      orderBy: desc(schema.rentPayments.dueDate),
      limit: listLimit,
    });
    const payments = paymentRows.map((p) => ({...p, amount: Number(p.amount)}));

    const buildings = await db.query.buildings.findMany({
      where: withLandlordScope(schema.buildings.landlordId, platformWhere(schema.buildings.platformId)),
      orderBy: desc(schema.buildings.createdAt),
      limit: listLimit,
    });

    const platforms = isSuperAdmin(actor) ? await db.query.platforms.findMany() : [];

    res.json({users, properties, invitations, payments, buildings, platforms});
  }),
);

bffRouter.get(
  '/admin/audit-logs',
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const rows = await db.query.auditLogs.findMany({
      where: userId && userId !== 'all' ? eq(schema.auditLogs.userId, userId) : undefined,
      orderBy: desc(schema.auditLogs.createdAt),
      limit: 200,
    });
    res.json(rows);
  }),
);

const updateRoleSchema = z.object({role: z.enum(['landlord', 'tenant', 'hunter', 'admin', 'superadmin'])}).strict();

bffRouter.patch(
  '/admin/users/:uid/role',
  requireAuth,
  requireAdmin,
  validateBody(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const {role} = getValidatedBody<z.infer<typeof updateRoleSchema>>(req);
    const target = await db.query.users.findFirst({where: eq(schema.users.uid, req.params.uid)});
    if (!target) {
      res.status(404).json({error: 'Not found'});
      return;
    }

    const isSuper = role === 'superadmin';
    const roleValue = isSuper ? 'admin' : role;
    const nextIsAdmin = roleValue === 'admin' || isSuper;

    if (!canWriteUser(actor, {uid: target.uid, platformId: target.platformId, isAdmin: nextIsAdmin, isSuperAdmin: isSuper, role: roleValue})) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const [updated] = await db
      .update(schema.users)
      .set({role: roleValue, isAdmin: nextIsAdmin, isSuperAdmin: isSuper})
      .where(eq(schema.users.uid, req.params.uid))
      .returning();
    res.json(updated);
  }),
);

/** Admin-only cascading delete: unlike the landlord version (which just unassigns
 * units), this also deletes every property in the building and the accounts of any
 * tenants assigned to them — matches AdminDashboard's more destructive confirmation. */
bffRouter.delete(
  '/admin/buildings/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    const building = await db.query.buildings.findFirst({where: eq(schema.buildings.id, req.params.id)});
    if (!building) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    if (!(await canManageBuilding(actor, building))) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const props = await db.query.properties.findMany({
      where: eq(schema.properties.buildingId, req.params.id),
      columns: {id: true, tenantId: true},
    });

    const tenantEmails = props.map((p) => p.tenantId).filter((t): t is string => Boolean(t) && t!.includes('@'));
    if (tenantEmails.length > 0) {
      const tenantUsers = await db.query.users.findMany({
        where: inArray(schema.users.email, tenantEmails),
        columns: {uid: true},
      });
      for (const u of tenantUsers) {
        await db.delete(schema.authUser).where(eq(schema.authUser.id, u.uid));
      }
    }

    if (props.length > 0) {
      await db.delete(schema.properties).where(inArray(schema.properties.id, props.map((p) => p.id)));
    }
    await db.delete(schema.buildings).where(eq(schema.buildings.id, req.params.id));

    res.json({deleted: true});
  }),
);

const createPlatformSchema = z
  .object({name: z.string().min(1).max(160), slug: z.string().min(1).max(80), ownerEmail: emailSchema})
  .strict();

bffRouter.post(
  '/admin/platforms',
  requireAuth,
  requireSuperAdmin,
  validateBody(createPlatformSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof createPlatformSchema>>(req);
    const ownerEmail = body.ownerEmail.toLowerCase();

    const [platform] = await db
      .insert(schema.platforms)
      .values({name: body.name, slug: body.slug, ownerEmail})
      .returning();

    await db
      .insert(schema.invitations)
      .values({email: ownerEmail, displayName: `${body.name} Owner`, role: 'admin', platformId: platform.id})
      .onConflictDoUpdate({
        target: schema.invitations.email,
        set: {displayName: `${body.name} Owner`, role: 'admin', platformId: platform.id},
      });

    res.status(201).json(platform);
  }),
);

bffRouter.patch(
  '/admin/platforms/:id/status',
  requireAuth,
  requireSuperAdmin,
  validateBody(z.object({status: z.enum(['active', 'suspended'])}).strict()),
  asyncHandler(async (req, res) => {
    const {status} = getValidatedBody<{status: 'active' | 'suspended'}>(req);
    const [updated] = await db
      .update(schema.platforms)
      .set({status})
      .where(eq(schema.platforms.id, req.params.id))
      .returning();
    if (!updated) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    res.json(updated);
  }),
);

const auditLogSchema = z
  .object({
    action: z.string().min(1).max(60),
    resource: z.string().max(60).nullable().optional(),
    resourceId: z.string().max(200).nullable().optional(),
    metadata: z.record(z.string(), z.any()).nullable().optional(),
  })
  .strict();

/** canInsertAuditLog (db/authz.ts) requires userId === actor.id, so this is always a
 * self-insert — matches the original "Users insert own audit logs" RLS policy exactly. */
bffRouter.post(
  '/audit-logs',
  requireAuth,
  validateBody(auditLogSchema),
  asyncHandler(async (req, res) => {
    const body = getValidatedBody<z.infer<typeof auditLogSchema>>(req);
    const actor = req.profile!;
    await db.insert(schema.auditLogs).values({
      userId: actor.uid,
      userEmail: actor.email,
      platformId: actor.platformId ?? null,
      action: body.action,
      resource: body.resource ?? null,
      resourceId: body.resourceId ?? null,
      metadata: body.metadata ?? null,
    });
    res.status(201).json({logged: true});
  }),
);

/** Non-sensitive branding fields only — see canReadPlatformBranding (db/authz.ts) for
 * why this is deliberately more permissive than the platforms table's own RLS policy. */
bffRouter.get(
  '/platforms/:id/branding',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = toActor(req.profile!);
    if (!canReadPlatformBranding(actor, req.params.id)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const platform = await db.query.platforms.findFirst({
      where: eq(schema.platforms.id, req.params.id),
      columns: {name: true, brandLogoUrl: true, brandPrimaryColor: true, brandSecondaryColor: true},
    });
    if (!platform) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    res.json(platform);
  }),
);

const passwordResetCompleteSchema = z.object({newPassword: z.string().min(8).max(128)}).strict();

/**
 * Forced first-login password change (see users.mustChangePassword, set by
 * server/adminHandlers.ts when an admin/landlord provisions an account with a
 * temp password). Uses Better-Auth's setPassword — unlike changePassword, it
 * doesn't require the caller to already know a current password, matching the
 * old Supabase `auth.updateUser({ password })` behavior this replaces.
 */
bffRouter.post(
  '/me/password-reset-complete',
  requireAuth,
  validateBody(passwordResetCompleteSchema),
  asyncHandler(async (req, res) => {
    const {newPassword} = getValidatedBody<z.infer<typeof passwordResetCompleteSchema>>(req);
    await auth.api.setPassword({body: {newPassword}, headers: fromNodeHeaders(req.headers)});
    await db.update(schema.users).set({mustChangePassword: false}).where(eq(schema.users.uid, req.profile!.uid));
    res.json({updated: true});
  }),
);
bffRouter.post(
  '/payments/stripe/checkout-session',
  paymentLimiter,
  requireAuth,
  validateBody(stripeCheckoutSchema),
  createStripeCheckout,
);
bffRouter.post('/payments/mpesa/rent', paymentLimiter, requireAuth, validateBody(mpesaRentSchema), initiateMpesaRent);
bffRouter.post(
  '/payments/pesapal/rent',
  paymentLimiter,
  requireAuth,
  validateBody(pesapalCheckoutSchema),
  createPesapalRentCheckout,
);

bffRouter.post(
  '/users/provision',
  requireAuth,
  validateBody(provisionUserSchema),
  asyncHandler(handleProvisionUser),
);

bffRouter.patch(
  '/users/:uid/status',
  requireAuth,
  requireAdmin,
  validateBody(suspendUserSchema),
  asyncHandler(handleSuspendUser),
);

bffRouter.delete('/users/:uid', requireAuth, requireAdmin, asyncHandler(handleDeleteUser));

bffRouter.put(
  '/platforms/:id/branding',
  requireAuth,
  requireAdmin,
  validateBody(updatePlatformBrandingSchema),
  asyncHandler(async (req, res) => {
    const actor = req.profile!;
    const platformId = req.params.id;
    if (!actor.isSuperAdmin && actor.platformId !== platformId) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const body = req.validatedBody as z.infer<typeof updatePlatformBrandingSchema>;
    await db.update(schema.platforms).set(body).where(eq(schema.platforms.id, platformId));
    res.json({updated: true});
  }),
);

const initiateLandlordSubscriptionCheckout = asyncHandler(async (req, res) => {
  const body = getValidatedBody<z.infer<typeof landlordSubscriptionCheckoutSchema>>(req);
  const actor = req.profile!;
  const amount = getSubscriptionAmount(body.tier as SubscriptionTier, body.billing as BillingPeriod);

  await saveLandlordPayoutProfile(actor.uid, body);

  const pending = await createPendingSubscriptionPayment({
    landlordId: actor.uid,
    tier: body.tier as SubscriptionTier,
    billing: body.billing as BillingPeriod,
    amount,
    paymentChannel: body.paymentMethod,
  });

  if (body.paymentMethod === 'stripe') {
    if (!stripe) {
      res.status(503).json({error: 'Card payments are not configured. Use M-Pesa instead.'});
      return;
    }

    assertAllowedRedirectUrl(body.successUrl, allowedRedirectOrigins);
    assertAllowedRedirectUrl(body.cancelUrl, allowedRedirectOrigins);

    const label = `${SUBSCRIPTION_TIERS[body.tier as SubscriptionTier].label} plan`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url:
        body.successUrl ||
        `${appBaseUrl}/?subscription_payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.cancelUrl || `${appBaseUrl}/?subscription_payment=cancelled`,
      customer_email: actor.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (process.env.STRIPE_CURRENCY || 'kes').toLowerCase(),
            unit_amount: amountInMinorUnits(amount),
            product_data: {
              name: `MyBoma ${label}`,
              description: `Landlord subscription (${body.billing})`,
            },
          },
        },
      ],
      metadata: {
        subscriptionPaymentId: pending.id,
        landlordUserId: actor.uid,
        tier: body.tier,
        billing: body.billing,
        clientKind: req.clientKind || 'web',
      },
    });

    await db
      .update(schema.landlordSubscriptionPayments)
      .set({
        paymentProvider: 'stripe',
        providerCheckoutRequestId: session.id,
      })
      .where(eq(schema.landlordSubscriptionPayments.id, pending.id));

    res.json({
      status: 'redirect',
      checkoutUrl: session.url,
      subscriptionPaymentId: pending.id,
    });
    return;
  }

  if (body.paymentMethod === 'pesapal') {
    assertAllowedRedirectUrl(body.successUrl, allowedRedirectOrigins);
    assertAllowedRedirectUrl(body.cancelUrl, allowedRedirectOrigins);

    const merchantReference = buildPesapalReference('SUB', pending.id);
    const order = await submitPesapalOrder({
      merchantReference,
      amount,
      description: `MyBoma ${body.tier} subscription`,
      customer: actor,
      cancellationUrl: body.cancelUrl || `${trimTrailingSlash(appBaseUrl)}/?subscription_payment=cancelled&provider=pesapal`,
    }).catch(err => {
      console.error('[Pesapal Order Failed]', err);
      throw err;
    });

    await db
      .update(schema.landlordSubscriptionPayments)
      .set({
        paymentProvider: 'pesapal',
        providerCheckoutRequestId: order.order_tracking_id,
        paymentReference: order.merchant_reference || merchantReference,
      })
      .where(eq(schema.landlordSubscriptionPayments.id, pending.id));

    res.json({
      status: 'redirect',
      checkoutUrl: order.redirect_url,
      subscriptionPaymentId: pending.id,
      orderTrackingId: order.order_tracking_id,
    });
    return;
  }

  const shortcode = process.env.MPESA_BUSINESS_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    res.status(503).json({error: 'M-Pesa STK Push is not configured'});
    return;
  }

  const payerPhone = normalizeSafaricomPhone(body.phone || actor.phone || '');
  if (!payerPhone) {
    res.status(400).json({error: 'A valid phone number is required for M-Pesa STK Push'});
    return;
  }

  const accessToken = await getMpesaAccessToken();
  const timestamp = mpesaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const stkResponse = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
      Amount: amountInKes(amount),
      PartyA: payerPhone,
      PartyB: shortcode,
      PhoneNumber: payerPhone,
      CallBackURL: callbackUrl,
      AccountReference: `SUB-${pending.id.slice(0, 8)}`,
      TransactionDesc: `MyBoma ${body.tier} subscription`,
    }),
  });

  const stkBody = (await stkResponse.json()) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    CheckoutRequestID?: string;
    errorMessage?: string;
  };

  if (!stkResponse.ok || stkBody.ResponseCode !== '0') {
    res.status(502).json({
      error: 'M-Pesa STK Push failed',
      message: stkBody.errorMessage || stkBody.ResponseDescription || 'Payment request was not accepted',
    });
    return;
  }

  await db
    .update(schema.landlordSubscriptionPayments)
    .set({
      paymentProvider: 'mpesa',
      providerCheckoutRequestId: stkBody.CheckoutRequestID,
    })
    .where(eq(schema.landlordSubscriptionPayments.id, pending.id));

  res.json({
    status: 'initiated',
    subscriptionPaymentId: pending.id,
    checkoutRequestId: stkBody.CheckoutRequestID,
    customerMessage: stkBody.CustomerMessage,
  });
});

bffRouter.post(
  '/landlord/subscription/checkout',
  requireAuth,
  paymentLimiter,
  validateBody(landlordSubscriptionCheckoutSchema),
  initiateLandlordSubscriptionCheckout,
);

bffRouter.post(
  '/rent-payments/:paymentId/mark-manual',
  requireAuth,
  validateBody(manualRentPaidSchema),
  asyncHandler(async (req, res) => {
    const paymentId = req.params.paymentId;
    const {note} = getValidatedBody<z.infer<typeof manualRentPaidSchema>>(req);
    const actor = req.profile!;

    console.log(`[Manual Payment] Attempt by ${actor.email} for payment ${paymentId}`);

    const payment = await db.query.rentPayments.findFirst({where: eq(schema.rentPayments.id, paymentId)});

    if (!payment) {
      console.warn(`[Manual Payment] Payment ${paymentId} not found.`);
      res.status(404).json({error: 'Rent payment not found'});
      return;
    }

    const rentPayment = payment as unknown as RentPaymentRecord;
    const isOwner = rentPayment.landlordId === actor.uid;
    const isTenant = rentPayment.tenantId === actor.uid;
    const isPlatformAdmin =
      (actor.isAdmin || actor.isSuperAdmin) &&
      (!actor.platformId || rentPayment.platformId === actor.platformId);

    if (!isOwner && !isTenant && !actor.isSuperAdmin && !isPlatformAdmin) {
      console.warn(`[Manual Payment] Unauthorized attempt by ${actor.email} to mark payment ${paymentId} as paid.`);
      res.status(403).json({error: 'You cannot access this payment'});
      return;
    }

    if (isTenant && !isOwner && !actor.isSuperAdmin && !isPlatformAdmin) {
      // Tenant is submitting receipt for verification
      const existingMeta = (payment.paymentMetadata as Record<string, unknown>) || {};
      await db
        .update(schema.rentPayments)
        .set({
          status: 'verifying',
          paymentMetadata: {
            ...existingMeta,
            submittedReceipt: note ?? null,
            submittedAt: new Date().toISOString(),
          },
        })
        .where(eq(schema.rentPayments.id, paymentId));

      console.log(`[Manual Payment] Tenant ${actor.email} submitted payment ${paymentId} for verification`);
      res.json({status: 'verifying', paymentId: rentPayment.id});
      return;
    }

    const {landlord, property} = await fetchPaymentContext(rentPayment.id);
    const tenant = await getTenantProfileForPayment(rentPayment);

    await markRentPaid({
      payment: rentPayment,
      tenant,
      landlord,
      property,
      provider: 'manual',
      providerReference: `MANUAL-${Date.now()}`,
      metadata: {markedBy: actor.uid, note: note ?? null},
    });

    console.log(`[Manual Payment] Successfully marked payment ${paymentId} as paid by ${actor.email}`);
    res.json({status: 'paid', paymentId: rentPayment.id});
  }),
);

bffRouter.post(
  '/notifications/remind-rent',
  requireAuth,
  validateBody(z.object({ rentPaymentId: uuidSchema })),
  asyncHandler(async (req, res) => {
    await handleSendRentReminder(req, res, { sendEmail, insertNotification });
  }),
);

bffRouter.post(
  '/admin/init-platform',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = req.profile!;

    if (actor.role !== 'admin') {
      res.status(403).json({error: 'Only admins can init platform'});
      return;
    }

    if (actor.platformId) {
      res.json({status: 'exists', platformId: actor.platformId});
      return;
    }

    // slug is unique+required; derive one from the admin's name plus a uid fragment
    // so it can't collide (platforms.slug has no default, unlike supabase-setup.sql
    // implied — this insert would have violated NOT NULL there too).
    const slugBase = actor.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'platform';
    const slug = `${slugBase}-${actor.uid.slice(0, 8)}`;

    const [platform] = await db
      .insert(schema.platforms)
      .values({name: `${actor.displayName}'s Platform`, slug, status: 'active'})
      .returning({id: schema.platforms.id});

    await db.update(schema.users).set({platformId: platform.id}).where(eq(schema.users.uid, actor.uid));

    res.json({status: 'created', platformId: platform.id});
  }),
);


app.use('/api/web', bffRouter);
app.use('/api/mobile', bffRouter);

if (enableSupabaseProxy && requiredEnv.supabaseUrl) {
  app.use(
    '/api/v1',
    authLimiter,
    createProxyMiddleware({
      target: requiredEnv.supabaseUrl,
      changeOrigin: true,
      pathRewrite: {
        '^/api/v1': '',
      },
    }),
  );
}

if (process.env.VERCEL !== '1') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath, {maxAge: isProduction ? '1h' : 0}));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({error: 'API route not found'});
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // On Vercel, just return 404 for unmatched API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({error: 'API route not found'});
    }
    next();
  });
}

Sentry.setupExpressErrorHandler(app);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = Number(error.statusCode || error.status || 500);
  if (status >= 500) {
    Sentry.captureException(error);
    console.error(`[Server Error] ${status}: ${error.message}`, error);
  }

  res.status(status).json({
    error: (status >= 500 && isProduction) ? 'Internal server error' : error.message,
  });
};

app.use(errorHandler);

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`
    MyBoma API Gateway active
    Port: ${PORT}
    Web BFF: /api/web
    Mobile BFF: /api/mobile
    Public endpoints and webhooks are rate limited
    Configured services: ${JSON.stringify(nonSecretConfigStatus())}
    `);
  });
}

// Scheduled Tasks
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Running automated rent reminders...');
  try {
    await processAutomatedRentReminders({ sendEmail, insertNotification });
    console.log('[Cron] Automated rent reminders processed.');
  } catch (err) {
    console.error('[Cron] Error processing automated rent reminders:', err);
  }
});

export default app;

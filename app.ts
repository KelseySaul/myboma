import * as Sentry from '@sentry/node';
import {createClient, type User} from '@supabase/supabase-js';
import cors from 'cors';
import {randomUUID} from 'node:crypto';
import dotenv from 'dotenv';
import express, {type ErrorRequestHandler, type NextFunction, type Request, type Response} from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {createProxyMiddleware} from 'http-proxy-middleware';
import nodemailer from 'nodemailer';
import path from 'path';
import {fileURLToPath} from 'url';
import {z, type ZodSchema} from 'zod';
import Stripe from 'stripe';
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

dotenv.config();

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

const supabase =
  requiredEnv.supabaseUrl && requiredEnv.supabaseServiceRoleKey
    ? createClient(requiredEnv.supabaseUrl, requiredEnv.supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

const supabaseAuth =
  requiredEnv.supabaseUrl && requiredEnv.supabaseAnonKey
    ? createClient(requiredEnv.supabaseUrl, requiredEnv.supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

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

const getBearerToken = (req: Request) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
};

const requireSupabase = () => {
  if (!supabase || !supabaseAuth) {
    const missing = [];
    if (!requiredEnv.supabaseUrl) missing.push('VITE_SUPABASE_URL');
    if (!requiredEnv.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
    if (!requiredEnv.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    
    const msg = `Supabase server credentials are not configured. Missing: ${missing.join(', ')}`;
    console.error(`[Config Error] ${msg}`);
    const error = new Error(msg);
    (error as any).statusCode = 503;
    throw error;
  }

  return {supabase, supabaseAuth};
};

const requireAuth = asyncHandler(async (req, res, next) => {
  const {supabase, supabaseAuth} = requireSupabase();
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({error: 'Missing bearer token'});
    return;
  }

  const {
    data: {user},
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({error: 'Invalid or expired token'});
    return;
  }

  const {data: profileRow, error: profileError} = await supabase
    .from('users')
    .select(
      'uid,email,displayName,role,platformId,phone,isAdmin,isSuperAdmin,stripeAccountId,mpesaSettlementPhone,mpesaSettlementShortCode',
    )
    .eq('uid', user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profileRow) {
    res.status(403).json({error: 'User profile is not provisioned'});
    return;
  }

  let profile = profileRow as UserProfileRecord;
  profile = await syncSuperAdminFromEnv(supabase, profile, isSuperAdminEmail);

  req.authUser = user;
  req.profile = profile;
  req.clientKind = getClientKind(req);
  Sentry.setUser({id: user.id, email: user.email ?? undefined});
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
  const {supabase} = requireSupabase();

  const {data: payment, error: paymentError} = await supabase
    .from('rentPayments')
    .select('*')
    .eq('id', rentPaymentId)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment) {
    const error = new Error('Rent payment not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  const rentPayment = payment as RentPaymentRecord;

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

  const {data: landlord, error: landlordError} = await supabase
    .from('users')
    .select('uid,email,displayName,phone,stripeAccountId,mpesaSettlementPhone,mpesaSettlementShortCode')
    .eq('uid', rentPayment.landlordId)
    .maybeSingle();

  if (landlordError) throw landlordError;
  if (!landlord) {
    const error = new Error('Landlord account not found.');
    (error as any).statusCode = 422;
    throw error;
  }

  const {data: property} = await supabase
    .from('properties')
    .select('id,title,unitNumber,location')
    .eq('id', rentPayment.propertyId)
    .maybeSingle();

  return {
    payment: rentPayment,
    landlord: landlord as UserProfileRecord,
    property: property as {id: string; title?: string; unitNumber?: string; location?: string} | null,
  };
};

const updateRentPayment = async (
  rentPaymentId: string,
  payload: Record<string, unknown>,
  fallbackPayload: Record<string, unknown> = {},
) => {
  const {supabase} = requireSupabase();
  const {error} = await supabase.from('rentPayments').update(payload).eq('id', rentPaymentId);
  if (!error) return;

  if (error.code === 'PGRST204' && Object.keys(fallbackPayload).length > 0) {
    const {error: fallbackError} = await supabase.from('rentPayments').update(fallbackPayload).eq('id', rentPaymentId);
    if (fallbackError) throw fallbackError;
    return;
  }

  throw error;
};

const insertNotification = async (payload: Record<string, unknown>) => {
  const {supabase} = requireSupabase();
  const {error} = await supabase.from('notifications').insert([payload]);
  if (error) throw error;
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
  const {supabase} = requireSupabase();
  const tenantId = String(payment.tenantId);
  const query = tenantId.includes('@')
    ? supabase.from('users').select('uid,email,displayName,phone,platformId').ilike('email', tenantId).maybeSingle()
    : supabase.from('users').select('uid,email,displayName,phone,platformId').eq('uid', tenantId).maybeSingle();

  const {data, error} = await query;
  if (error) throw error;
  return data as UserProfileRecord | null;
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
    const {supabase} = requireSupabase();
    const {data: subRow, error: subError} = await supabase
      .from('landlordSubscriptionPayments')
      .select('id,landlordId,plan,amount,status')
      .eq('id', subscriptionPaymentId)
      .maybeSingle();

    if (subError) throw subError;
    if (!subRow || subRow.status === 'confirmed') return;

    const parsed = parseSubscriptionPlan(subRow.plan);
    if (!parsed) throw new Error(`Invalid subscription plan key: ${subRow.plan}`);

    const {data: landlord} = await supabase
      .from('users')
      .select('uid,email,displayName')
      .eq('uid', subRow.landlordId)
      .maybeSingle();

    if (!landlord) throw new Error('Landlord profile not found for subscription payment');

    await activateLandlordSubscription(
      supabase,
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
  sb: NonNullable<typeof supabase>,
  orderTrackingId: string,
  merchantReference?: string,
) => {
  const select = 'id,landlordId,plan,amount,status,paymentReference';
  const {data, error} = await sb
    .from('landlordSubscriptionPayments')
    .select(select)
    .eq('providerCheckoutRequestId', orderTrackingId)
    .maybeSingle();
  if (error) throw error;
  if (data || !merchantReference) return data;

  const fallback = await sb
    .from('landlordSubscriptionPayments')
    .select(select)
    .eq('paymentReference', merchantReference)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data;
};

const findRentPaymentByPesapalReference = async (
  sb: NonNullable<typeof supabase>,
  orderTrackingId: string,
  merchantReference?: string,
) => {
  const {data, error} = await sb
    .from('rentPayments')
    .select('*')
    .eq('providerCheckoutRequestId', orderTrackingId)
    .maybeSingle();
  if (error) throw error;
  if (data || !merchantReference) return data;

  const fallback = await sb
    .from('rentPayments')
    .select('*')
    .eq('providerMerchantRequestId', merchantReference)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data;
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
  const {supabase} = requireSupabase();
  const status = await getPesapalTransactionStatus(orderTrackingId);
  const resolvedMerchantReference = merchantReference || status.merchant_reference;
  const {completed, rejected, statusDescription} = pesapalStatusFlags(status);
  const providerReference = status.confirmation_code || orderTrackingId;

  const subPayment = await findSubscriptionPaymentByPesapalReference(
    supabase,
    orderTrackingId,
    resolvedMerchantReference,
  );

  if (subPayment) {
    if (completed && subPayment.status !== 'confirmed') {
      const parsed = parseSubscriptionPlan(subPayment.plan);
      if (!parsed) throw new Error(`Invalid subscription plan key: ${subPayment.plan}`);

      const {data: landlord, error: landlordError} = await supabase
        .from('users')
        .select('uid,email,displayName')
        .eq('uid', subPayment.landlordId)
        .maybeSingle();
      if (landlordError) throw landlordError;
      if (!landlord) throw new Error('Landlord profile not found for subscription payment');

      await activateLandlordSubscription(
        supabase,
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
      await supabase
        .from('landlordSubscriptionPayments')
        .update({
          status: 'rejected',
          paymentProvider: 'pesapal',
          paymentReference: status.description || statusDescription || 'failed',
        })
        .eq('id', subPayment.id);
    }

    return {kind: 'subscription' as const, completed, rejected, status};
  }

  const payment = await findRentPaymentByPesapalReference(supabase, orderTrackingId, resolvedMerchantReference);
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

  const {supabase} = requireSupabase();
  const {data: subPayment, error: subError} = await supabase
    .from('landlordSubscriptionPayments')
    .select('id,landlordId,plan,amount,status')
    .eq('providerCheckoutRequestId', checkoutRequestId)
    .maybeSingle();

  if (subError) throw subError;

  if (subPayment) {
    if (callback.ResultCode === 0 && subPayment.status !== 'confirmed') {
      const parsed = parseSubscriptionPlan(subPayment.plan);
      if (parsed) {
        const {data: landlord} = await supabase
          .from('users')
          .select('uid,email,displayName')
          .eq('uid', subPayment.landlordId)
          .maybeSingle();

        if (landlord) {
          await activateLandlordSubscription(
            supabase,
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
      await supabase
        .from('landlordSubscriptionPayments')
        .update({status: 'rejected', paymentReference: callback.ResultDesc || 'failed'})
        .eq('id', subPayment.id);
    }

    res.json({ResultCode: 0, ResultDesc: 'Accepted'});
    return;
  }

  const {data: payment, error} = await supabase
    .from('rentPayments')
    .select('*')
    .eq('providerCheckoutRequestId', checkoutRequestId)
    .maybeSingle();

  if (error) throw error;
  if (!payment) {
    res.json({ResultCode: 0, ResultDesc: 'Accepted'});
    return;
  }

  const rentPayment = payment as RentPaymentRecord;
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

// Stripe requires the raw body for signature verification, so this route stays before express.json().
app.post('/api/webhooks/stripe', webhookLimiter, express.raw({type: 'application/json'}), stripeWebhookHandler);

app.use(express.json({limit: '256kb'}));
app.use('/api', publicLimiter);

app.get('/api/health', healthHandler);
app.get('/api/legal', (_req, res) => res.json(LEGAL_DOCUMENTS));
app.post(
  '/api/waitlist',
  waitlistLimiter,
  validateBody(waitlistSignupSchema),
  asyncHandler(async (req, res) => {
    const {supabase: sb} = requireSupabase();
    const body = getValidatedBody<z.infer<typeof waitlistSignupSchema>>(req);
    const email = body.email.toLowerCase();
    const unsubscribeToken = randomUUID();
    const now = new Date().toISOString();
    const {data, error} = await sb
      .from('waitlistSignups')
      .upsert(
        {
          email,
          source: body.source,
          status: 'subscribed',
          unsubscribeToken,
          consentAt: now,
          unsubscribedAt: null,
          updatedAt: now,
        },
        {onConflict: 'email'},
      )
      .select('email,unsubscribeToken')
      .single();

    if (error) throw error;

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
    const {supabase: sb} = requireSupabase();
    const body = getValidatedBody<z.infer<typeof waitlistUnsubscribeSchema>>(req);
    const now = new Date().toISOString();
    let query = sb.from('waitlistSignups').update({
      status: 'unsubscribed',
      unsubscribedAt: now,
      updatedAt: now,
    });

    query = body.token
      ? query.eq('unsubscribeToken', body.token)
      : query.eq('email', body.email!.toLowerCase());

    const {error} = await query;
    if (error) throw error;

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
  asyncHandler(async (req, res) => {
    const {supabase: sb} = requireSupabase();
    await handleProvisionUser(sb)(req, res);
  }),
);

bffRouter.patch(
  '/users/:uid/status',
  requireAuth,
  requireAdmin,
  validateBody(suspendUserSchema),
  asyncHandler(async (req, res) => {
    const {supabase: sb} = requireSupabase();
    await handleSuspendUser(sb)(req, res);
  }),
);

bffRouter.delete(
  '/users/:uid',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {supabase: sb} = requireSupabase();
    await handleDeleteUser(sb)(req, res);
  }),
);

const initiateLandlordSubscriptionCheckout = asyncHandler(async (req, res) => {
  const body = getValidatedBody<z.infer<typeof landlordSubscriptionCheckoutSchema>>(req);
  const actor = req.profile!;
  const amount = getSubscriptionAmount(body.tier as SubscriptionTier, body.billing as BillingPeriod);
  const {supabase: sb} = requireSupabase();

  await saveLandlordPayoutProfile(sb, actor.uid, body);

  const pending = await createPendingSubscriptionPayment(sb, {
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

    await sb
      .from('landlordSubscriptionPayments')
      .update({
        paymentProvider: 'stripe',
        providerCheckoutRequestId: session.id,
      })
      .eq('id', pending.id);

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

    await sb
      .from('landlordSubscriptionPayments')
      .update({
        paymentProvider: 'pesapal',
        providerCheckoutRequestId: order.order_tracking_id,
        paymentReference: order.merchant_reference || merchantReference,
      })
      .eq('id', pending.id);

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

  await sb
    .from('landlordSubscriptionPayments')
    .update({
      paymentProvider: 'mpesa',
      providerCheckoutRequestId: stkBody.CheckoutRequestID,
    })
    .eq('id', pending.id);

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
    const {supabase: sb} = requireSupabase();
    const paymentId = req.params.paymentId;
    const {note} = getValidatedBody<z.infer<typeof manualRentPaidSchema>>(req);
    const actor = req.profile!;

    console.log(`[Manual Payment] Attempt by ${actor.email} for payment ${paymentId}`);

    const {data: payment, error: paymentError} = await sb
      .from('rentPayments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (paymentError) {
      console.error(`[Manual Payment] Database error fetching payment ${paymentId}:`, paymentError);
      throw paymentError;
    }
    if (!payment) {
      console.warn(`[Manual Payment] Payment ${paymentId} not found.`);
      res.status(404).json({error: 'Rent payment not found'});
      return;
    }

    const rentPayment = payment as RentPaymentRecord;
    const isOwner = rentPayment.landlordId === actor.uid;
    const isPlatformAdmin =
      (actor.isAdmin || actor.isSuperAdmin) &&
      (!actor.platformId || rentPayment.platformId === actor.platformId);

    if (!isOwner && !actor.isSuperAdmin && !isPlatformAdmin) {
      console.warn(`[Manual Payment] Unauthorized attempt by ${actor.email} to mark payment ${paymentId} as paid.`);
      res.status(403).json({error: 'You cannot mark this payment as paid'});
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

export default app;

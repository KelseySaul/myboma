import * as Sentry from '@sentry/node';
import {and, eq, isNull, ne, or, sql} from 'drizzle-orm';
import {type Request} from 'express';
import Stripe from 'stripe';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {assertAllowedRedirectUrl} from '../helpers.ts';
import {
  activateLandlordSubscription,
  createPendingSubscriptionPayment,
  landlordSubscriptionCheckoutSchema,
  saveLandlordPayoutProfile,
} from '../landlordSubscriptionHandlers.ts';
import {
  getSubscriptionAmount,
  parseSubscriptionPlan,
  SUBSCRIPTION_TIERS,
  type BillingPeriod,
  type SubscriptionTier,
} from '../../src/lib/landlordSubscription.ts';
import type {RentPaymentRecord, UserProfileRecord} from '../types.ts';
import {allowedRedirectOrigins, appBaseUrl} from '../http/config.ts';
import {asyncHandler, getValidatedBody, recordAudit, sanitizeString} from '../http/middleware.ts';
import {absoluteUrlSchema, phoneSchema, uuidSchema} from '../http/schemas.ts';
import {insertNotification, notifyRentPaymentSuccess, sendEmail} from './notify.ts';

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
let pesapalTokenCache: {token: string; expiresAt: number} | null = null;

export const stripeCheckoutSchema = z
  .object({
    rentPaymentId: uuidSchema,
    successUrl: absoluteUrlSchema.optional(),
    cancelUrl: absoluteUrlSchema.optional(),
  })
  .strict();

export const pesapalCheckoutSchema = stripeCheckoutSchema;

export const mpesaRentSchema = z
  .object({
    rentPaymentId: uuidSchema,
    phone: phoneSchema.optional(),
  })
  .strict();

export const mpesaCallbackSchema = z
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

export const amountInMinorUnits = (amount: number | string) => Math.round(Number(amount) * 100);
export const amountInKes = (amount: number | string) => Math.ceil(Number(amount));

export const assertTenantCanPay = (profile: UserProfileRecord, payment: RentPaymentRecord) => {
  const tenant = String(payment.tenantId || '').toLowerCase();
  const userEmail = String(profile.email || '').toLowerCase();
  return tenant === userEmail || tenant === profile.uid;
};

export const fetchPaymentContext = async (rentPaymentId: string, profile?: UserProfileRecord) => {
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
export const updateRentPayment = async (
  rentPaymentId: string,
  payload: Record<string, unknown>,
  _fallbackPayload: Record<string, unknown> = {},
) => {
  // paymentMetadata is MERGED (jsonb ||), never replaced: each provider attempt adds its
  // evidence instead of erasing the previous attempt's reconciliation trail.
  const {paymentMetadata, ...rest} = payload;
  const set: Record<string, unknown> = {...rest};
  if (paymentMetadata && typeof paymentMetadata === 'object') {
    set.paymentMetadata = sql`coalesce(${schema.rentPayments.paymentMetadata}, '{}'::jsonb) || ${JSON.stringify(paymentMetadata)}::jsonb`;
  }
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.rentPayments)
    .set(set as Partial<typeof schema.rentPayments.$inferInsert>)
    .where(eq(schema.rentPayments.id, rentPaymentId));
};

/** Records a provider checkout attempt in the ledger (idempotent per provider reference). */
export const recordPaymentAttempt = async (input: {
  rentPaymentId: string;
  provider: 'stripe' | 'mpesa' | 'pesapal';
  providerReference?: string | null;
  merchantReference?: string | null;
  amount: number | string;
}) => {
  if (!input.providerReference) return;
  // Savepoint so a failure can't abort (and silently roll back) the surrounding request.
  await db
    .transaction((tx) =>
      tx
        .insert(schema.paymentAttempts)
        .values({
          rentPaymentId: input.rentPaymentId,
          provider: input.provider,
          providerReference: input.providerReference!,
          merchantReference: input.merchantReference ?? null,
          amount: String(input.amount),
        })
        .onConflictDoNothing(),
    )
    .catch((error) => Sentry.captureException(error));
};

/** Resolves an invoice from any of its checkout attempts, falling back to the legacy columns. */
export const findRentPaymentByProviderReference = async (providerReference: string, merchantReference?: string) => {
  const attempt = await db.query.paymentAttempts.findFirst({
    where: merchantReference
      ? or(eq(schema.paymentAttempts.providerReference, providerReference), eq(schema.paymentAttempts.merchantReference, merchantReference))
      : eq(schema.paymentAttempts.providerReference, providerReference),
    columns: {rentPaymentId: true},
  });
  if (attempt?.rentPaymentId) {
    const payment = await db.query.rentPayments.findFirst({where: eq(schema.rentPayments.id, attempt.rentPaymentId)});
    if (payment) return payment;
  }
  const byCheckoutId = await db.query.rentPayments.findFirst({
    where: eq(schema.rentPayments.providerCheckoutRequestId, providerReference),
  });
  if (byCheckoutId || !merchantReference) return byCheckoutId ?? null;
  return (await db.query.rentPayments.findFirst({where: eq(schema.rentPayments.providerMerchantRequestId, merchantReference)})) ?? null;
};

export const markPaymentAttempt = async (providerReference: string, status: 'succeeded' | 'failed') => {
  await db
    .transaction((tx) =>
      tx.update(schema.paymentAttempts).set({status}).where(eq(schema.paymentAttempts.providerReference, providerReference)),
    )
    .catch((error) => Sentry.captureException(error));
};

export const markRentPaid = async ({
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
  if (payment.status === 'paid') return false;

  // Conditional update: only the first caller to flip the row wins. Provider retries
  // and concurrent IPN/callback deliveries get zero rows back and stop here, so
  // notifications and settlements can never run twice for one invoice.
  const transitioned = await db
    .update(schema.rentPayments)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paymentProvider: provider,
      providerReference,
      paymentMetadata: sql`coalesce(${schema.rentPayments.paymentMetadata}, '{}'::jsonb) || ${JSON.stringify(metadata ?? {})}::jsonb`,
    })
    .where(and(eq(schema.rentPayments.id, payment.id), ne(schema.rentPayments.status, 'paid')))
    .returning({id: schema.rentPayments.id});

  if (transitioned.length === 0) return false;

  // Awaited (not fire-and-forget): serverless runtimes may freeze the function as soon
  // as the response is sent. Failures are still swallowed so they never fail the payment.
  await notifyRentPaymentSuccess({payment, tenant, landlord, property, providerReference}).catch((err) => {
    console.error('[Notification Error] Failed to send payment notifications:', err);
    Sentry.captureException(err);
  });
  return true;
};

export const getTenantProfileForPayment = async (payment: RentPaymentRecord) => {
  const tenantId = String(payment.tenantId);
  const columns = {uid: true, email: true, displayName: true, phone: true, platformId: true} as const;
  const tenant = tenantId.includes('@')
    ? await db.query.users.findFirst({where: sql`lower(${schema.users.email}) = ${tenantId.toLowerCase()}`, columns})
    : await db.query.users.findFirst({where: eq(schema.users.uid, tenantId), columns});
  return (tenant as unknown as UserProfileRecord) ?? null;
};

export const createStripeCheckout = asyncHandler(async (req, res) => {
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

  await recordPaymentAttempt({rentPaymentId: payment.id, provider: 'stripe', providerReference: session.id, amount: payment.amount});
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

export const fulfillStripeCheckout = async (sessionId: string) => {
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

  // fetchPaymentContext throws 409 for paid invoices; a webhook retry for an already
  // fulfilled session must be acknowledged, not errored (Stripe would keep retrying).
  const current = await db.query.rentPayments.findFirst({
    where: eq(schema.rentPayments.id, rentPaymentId),
    columns: {status: true},
  });
  if (!current || current.status === 'paid') return;

  const {payment, landlord, property} = await fetchPaymentContext(rentPaymentId);

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

export type PesapalSubmitOrderResponse = {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string;
  error?: {message?: string} | number | null;
  message?: string;
  status?: string;
};

export type PesapalTransactionStatus = {
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

export const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const pesapalBaseUrl = () =>
  process.env.PESAPAL_ENV === 'production'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';

export const getPesapalCallbackUrl = () =>
  process.env.PESAPAL_CALLBACK_URL || `${trimTrailingSlash(appBaseUrl)}/api/payments/pesapal/callback`;

export const getPesapalIpnUrl = () =>
  process.env.PESAPAL_IPN_URL || `${trimTrailingSlash(appBaseUrl)}/api/webhooks/pesapal/ipn`;

export const getPesapalAccessToken = async () => {
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

export const pesapalApiFetch = async <T>(path: string, init: RequestInit = {}) => {
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

export const getPesapalNotificationId = async () => {
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

export const buildPesapalReference = (prefix: 'RENT' | 'SUB', id: string) => {
  const compactId = id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${compactId}-${stamp}`.slice(0, 50);
};

export const splitCustomerName = (name?: string | null, email?: string | null) => {
  const fallback = email?.split('@')[0] || 'MyBoma';
  const parts = sanitizeString(name || '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {firstName: fallback, lastName: 'Customer'};
  if (parts.length === 1) return {firstName: parts[0], lastName: fallback};
  return {firstName: parts[0], lastName: parts.slice(1).join(' ')};
};

export const buildPesapalBillingAddress = (customer: UserProfileRecord | null | undefined) => {
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

export const submitPesapalOrder = async (input: {
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

export const getPesapalTransactionStatus = async (orderTrackingId: string) =>
  pesapalApiFetch<PesapalTransactionStatus>(
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
  );

export const findSubscriptionPaymentByPesapalReference = async (
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

export const findRentPaymentByPesapalReference = (orderTrackingId: string, merchantReference?: string) =>
  findRentPaymentByProviderReference(orderTrackingId, merchantReference);

export const pesapalStatusFlags = (status: PesapalTransactionStatus) => {
  const statusCode = Number(status.status_code);
  const statusDescription = String(status.payment_status_description || '').toUpperCase();
  return {
    completed: statusCode === 1 || statusDescription === 'COMPLETED',
    rejected: [0, 2, 3].includes(statusCode) || ['INVALID', 'FAILED', 'REVERSED'].includes(statusDescription),
    statusDescription,
  };
};

export const processPesapalTransaction = async (orderTrackingId: string, merchantReference?: string) => {
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
  const paidAmount = Number(status.amount);
  // Fails closed: a status response without an amount is treated as a mismatch.
  const amountCovered = Number.isFinite(paidAmount) && paidAmount + 0.5 >= Number(rentPayment.amount);
  if (completed && rentPayment.status !== 'paid' && !amountCovered) {
    Sentry.captureMessage(`Pesapal amount ${status.amount} below invoice ${rentPayment.amount} for ${rentPayment.id}`);
    await updateRentPayment(rentPayment.id, {
      paymentMetadata: {orderTrackingId, flagged: 'amount_mismatch', paidAmount: status.amount},
    });
    return {kind: 'rent' as const, completed: false, rejected: false, status};
  }
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

export const notificationParam = (source: Record<string, unknown>, name: string) => {
  const value = source[name] ?? source[name.charAt(0).toLowerCase() + name.slice(1)];
  if (Array.isArray(value)) return notificationParam({value: value[0]}, 'value');
  return value == null ? '' : String(value);
};

export const pesapalNotificationFromRequest = (req: Request) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const query = req.query as Record<string, unknown>;
  const source = {...query, ...body};
  return {
    orderTrackingId: notificationParam(source, 'OrderTrackingId'),
    orderMerchantReference: notificationParam(source, 'OrderMerchantReference'),
    orderNotificationType: notificationParam(source, 'OrderNotificationType') || 'IPNCHANGE',
  };
};

export const handlePesapalIpn = asyncHandler(async (req, res) => {
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

export const handlePesapalCallback = asyncHandler(async (req, res) => {
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

export const createPesapalRentCheckout = asyncHandler(async (req, res) => {
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

  await recordPaymentAttempt({
    rentPaymentId: payment.id,
    provider: 'pesapal',
    providerReference: order.order_tracking_id,
    merchantReference: order.merchant_reference || merchantReference,
    amount: payment.amount,
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

export const normalizeSafaricomPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};

export const mpesaBaseUrl = () =>
  process.env.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

let mpesaTokenCache: {token: string; expiresAt: number} | null = null;

/** Daraja requires the callback secret in the URL itself (Safaricom cannot send custom headers). */
export const mpesaCallbackUrlWithSecret = (callbackUrl: string) => {
  const secret = process.env.MPESA_CALLBACK_SECRET;
  if (!secret) return callbackUrl;
  const url = new URL(callbackUrl);
  if (!url.searchParams.has('secret')) url.searchParams.set('secret', secret);
  return url.toString();
};

export const getMpesaAccessToken = async () => {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('M-Pesa consumer credentials are not configured.');
  if (mpesaTokenCache && mpesaTokenCache.expiresAt > Date.now()) return mpesaTokenCache.token;

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const response = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`M-Pesa OAuth failed with status ${response.status}`);
  }

  const data = (await response.json()) as {access_token?: string; expires_in?: string | number};
  if (!data.access_token) throw new Error('M-Pesa OAuth response did not include access_token.');
  // Tokens live ~3600s; refresh a minute early.
  const ttlSeconds = Number(data.expires_in) || 3599;
  mpesaTokenCache = {token: data.access_token, expiresAt: Date.now() + (ttlSeconds - 60) * 1000};
  return data.access_token;
};

export const mpesaTimestamp = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
};

export const initiateMpesaRent = asyncHandler(async (req, res) => {
  const shortcode = process.env.MPESA_BUSINESS_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    res.status(503).json({error: 'M-Pesa STK Push is not configured'});
    return;
  }

  const {rentPaymentId, phone} = getValidatedBody<z.infer<typeof mpesaRentSchema>>(req);
  const {payment, property} = await fetchPaymentContext(rentPaymentId, req.profile);

  // One live STK prompt per invoice: a second tap within 2 minutes would push a second
  // PIN prompt to the tenant's phone and risk paying twice.
  const lastStk = Date.parse(String((payment.paymentMetadata as Record<string, unknown> | undefined)?.stkInitiatedAt ?? ''));
  if (Number.isFinite(lastStk) && Date.now() - lastStk < 120_000) {
    res.status(409).json({error: 'An M-Pesa prompt was already sent for this invoice. Check your phone or try again in 2 minutes.'});
    return;
  }
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
      CallBackURL: mpesaCallbackUrlWithSecret(callbackUrl),
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

  await recordPaymentAttempt({
    rentPaymentId: payment.id,
    provider: 'mpesa',
    providerReference: body.CheckoutRequestID,
    merchantReference: body.MerchantRequestID,
    amount: payment.amount,
  });
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
        stkInitiatedAt: new Date().toISOString(),
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

export const callbackMetadataValue = (items: Array<{Name: string; Value?: string | number}> | undefined, name: string) =>
  items?.find((item) => item.Name === name)?.Value;

export const handleMpesaCallback = asyncHandler(async (req, res) => {
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
    const paidAmount = Number(callbackMetadataValue(metadataItems, 'Amount'));
    const subscriptionCovered = Number.isFinite(paidAmount) && paidAmount >= amountInKes(subPayment.amount);
    if (callback.ResultCode === 0 && subPayment.status !== 'confirmed' && !subscriptionCovered) {
      Sentry.captureMessage(`M-Pesa subscription amount ${paidAmount} below ${subPayment.amount} for ${subPayment.id}`);
    } else if (callback.ResultCode === 0 && subPayment.status !== 'confirmed') {
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

  const payment = await findRentPaymentByProviderReference(checkoutRequestId);
  await markPaymentAttempt(checkoutRequestId, callback.ResultCode === 0 ? 'succeeded' : 'failed');

  if (!payment) {
    res.json({ResultCode: 0, ResultDesc: 'Accepted'});
    return;
  }

  const rentPayment = payment as unknown as RentPaymentRecord;
  // Safaricom retries callbacks; an invoice that is already paid is simply acknowledged.
  if (rentPayment.status === 'paid') {
    // A successful payment on a different attempt than the one that settled the invoice is
    // real money taken twice — flag it for refund instead of silently dropping it.
    const settledByThisAttempt = (rentPayment.paymentMetadata as Record<string, unknown> | null)?.checkoutRequestId === checkoutRequestId;
    if (callback.ResultCode === 0 && !settledByThisAttempt) {
      Sentry.captureMessage(`Duplicate M-Pesa payment ${checkoutRequestId} on already-paid invoice ${rentPayment.id}`);
      await recordAudit(null, 'DUPLICATE_PAYMENT_NEEDS_REFUND', 'rentPayment', rentPayment.id, {
        checkoutRequestId,
        mpesaReceiptNumber: receiptNumber ?? null,
      });
    }
    res.json({ResultCode: 0, ResultDesc: 'Accepted'});
    return;
  }

  const {landlord, property} = await fetchPaymentContext(rentPayment.id);
  const tenant = await getTenantProfileForPayment(rentPayment);
  const callbackAmount = Number(callbackMetadataValue(metadataItems, 'Amount'));
  const amountCovered = Number.isFinite(callbackAmount) && callbackAmount >= amountInKes(rentPayment.amount);

  if (callback.ResultCode === 0 && !amountCovered) {
    Sentry.captureMessage(`M-Pesa callback amount ${callbackAmount} below invoice ${rentPayment.amount} for ${rentPayment.id}`);
    await updateRentPayment(rentPayment.id, {
      paymentMetadata: {checkoutRequestId, flagged: 'amount_mismatch', callbackAmount, mpesaReceiptNumber: receiptNumber},
    });
  } else if (callback.ResultCode === 0) {
    const transitioned = await markRentPaid({
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

    if (transitioned) {
      await settleMpesaToLandlord({payment: rentPayment, landlord}).catch((settlementError) => {
        Sentry.captureException(settlementError);
      });
    }
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

export const settleMpesaToLandlord = async ({payment, landlord}: {payment: RentPaymentRecord; landlord: UserProfileRecord}) => {
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

  // Claim the settlement atomically so a payout can only ever be requested once per invoice.
  const claimed = await db
    .update(schema.rentPayments)
    .set({settlementStatus: 'pending'})
    .where(and(eq(schema.rentPayments.id, payment.id), isNull(schema.rentPayments.settlementStatus)))
    .returning({id: schema.rentPayments.id});
  if (claimed.length === 0) return;

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
      QueueTimeOutURL: mpesaCallbackUrlWithSecret(timeoutUrl),
      ResultURL: mpesaCallbackUrlWithSecret(resultUrl),
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

/**
 * Daraja B2C ResultURL / QueueTimeOutURL. Without these, settlements stayed 'initiated'
 * forever and failed payouts to landlords went unnoticed.
 */
export const handleMpesaB2cResult = (kind: 'result' | 'timeout') =>
  asyncHandler(async (req, res) => {
    const result = (req.body?.Result ?? {}) as {
      ResultCode?: number | string;
      ResultDesc?: string;
      OriginatorConversationID?: string;
      ConversationID?: string;
      TransactionID?: string;
    };
    const originator = String(result.OriginatorConversationID ?? '');
    const conversationId = String(result.ConversationID ?? '');
    const paymentId = originator.startsWith('rent-') ? originator.slice(5) : null;

    const payment = paymentId && uuidSchema.safeParse(paymentId).success
      ? await db.query.rentPayments.findFirst({where: eq(schema.rentPayments.id, paymentId)})
      : conversationId
        ? await db.query.rentPayments.findFirst({where: eq(schema.rentPayments.settlementReference, conversationId)})
        : null;

    if (payment) {
      const succeeded = kind === 'result' && Number(result.ResultCode) === 0;
      await updateRentPayment(payment.id, {
        settlementStatus: succeeded ? 'settled' : 'failed',
        settledAt: succeeded ? new Date() : null,
        settlementReference: result.TransactionID || conversationId || payment.settlementReference,
        paymentMetadata: {settlementResult: {kind, code: result.ResultCode ?? null, desc: result.ResultDesc ?? null}},
      });
      if (!succeeded) {
        Sentry.captureMessage(`M-Pesa B2C settlement ${kind} failure for rent payment ${payment.id}: ${result.ResultDesc ?? 'timeout'}`);
        await recordAudit(null, 'SETTLEMENT_FAILED', 'rentPayment', payment.id, {kind, desc: result.ResultDesc ?? null});
      }
    }

    res.json({ResultCode: 0, ResultDesc: 'Accepted'});
  });

export const stripeWebhookHandler = asyncHandler(async (req, res) => {
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

export const initiateLandlordSubscriptionCheckout = asyncHandler(async (req, res) => {
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
      CallBackURL: mpesaCallbackUrlWithSecret(callbackUrl),
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

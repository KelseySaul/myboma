import {randomUUID} from 'crypto';
import {and, eq, gte, inArray, isNotNull, ne, sql} from 'drizzle-orm';
import type {Response} from 'express';
import {z} from 'zod';
import {db, schema} from '../db/client.ts';
import {isSuperAdminEmail, SUPER_ADMIN_EMAILS} from '../config/superAdmin.ts';
import {billingToday, daysUntilDueDate} from '../../shared/rentInvoices.ts';
import {appBaseUrl} from './http/config.ts';
import type {SendEmailInput} from './services/email.ts';
import type {AuthenticatedRequest} from './types.ts';
import {
  BILLING_PERIODS,
  PLAN_SLUG_RE,
  SUBSCRIPTION_TIERS,
  buildSubscriptionReceiptText,
  encodeSubscriptionPlan,
  getBillingMonths,
  getSubscriptionAmount,
  isFreePlan,
  FREE_PLAN,
  type BillingPeriod,
  type BuiltInSubscriptionTier,
  type RentPayoutMethod,
  type SubscriptionTier,
} from '../../shared/landlordSubscription.ts';
import {getSubscriptionPlanById} from './services/subscriptionPlans.ts';
import {
  buildSubscriptionReminderContent,
  classifySubscriptionReminderMilestone,
  formatSubscriptionPlanLabel,
  subscriberAccountType,
  type SubscriptionReminderMilestone,
} from './subscriptionReminderPolicy.ts';

export {
  buildSubscriptionReminderContent,
  classifySubscriptionReminderMilestone,
  formatSubscriptionPlanLabel,
  subscriberAccountType,
  type SubscriptionReminderMilestone,
};

const tierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(PLAN_SLUG_RE, 'Invalid plan tier')
  .refine((t) => t !== 'free', {message: 'Use free plan activation for the free tier.'});
const billingSchema = z.enum(['monthly', 'quarterly', 'yearly']);
const paymentMethodSchema = z.enum(['stripe', 'mpesa', 'pesapal']);
const rentPayoutMethodSchema = z.enum(['cash', 'mpesa', 'bank']);

const rentPayoutFields = {
  rentPayoutMethod: rentPayoutMethodSchema,
  mpesaSettlementPhone: z.string().max(20).optional(),
  bankName: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  bankAccountName: z.string().max(120).optional(),
  cashPayoutNotes: z.string().max(280).optional(),
};

type RentPayoutInput = {
  rentPayoutMethod: RentPayoutMethod;
  mpesaSettlementPhone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  cashPayoutNotes?: string;
};

const refineRentPayout = (body: RentPayoutInput, ctx: z.RefinementCtx) => {
  if (body.rentPayoutMethod === 'mpesa' && !body.mpesaSettlementPhone?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'M-Pesa phone is required to receive rent via M-Pesa.',
      path: ['mpesaSettlementPhone'],
    });
  }
  if (body.rentPayoutMethod === 'bank') {
    if (!body.bankName?.trim()) {
      ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Bank name is required.', path: ['bankName']});
    }
    if (!body.bankAccountNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bank account number is required.',
        path: ['bankAccountNumber'],
      });
    }
    if (!body.bankAccountName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Account holder name is required.',
        path: ['bankAccountName'],
      });
    }
  }
};

export const landlordSubscriptionCheckoutSchema = z
  .object({
    tier: tierSchema,
    billing: billingSchema,
    paymentMethod: paymentMethodSchema,
    phone: z.string().max(20).optional(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
    ...rentPayoutFields,
  })
  .superRefine(refineRentPayout);

/** The free plan only records how the landlord receives rent; there is nothing to pay. */
export const landlordFreePlanSchema = z.object(rentPayoutFields).superRefine(refineRentPayout);

const buildReceiptNumber = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MB-SUB-${stamp}-${rand}`;
};

const planLabel = (tier: SubscriptionTier, billing: BillingPeriod, customLabel?: string | null) => {
  const tierLabel = customLabel || SUBSCRIPTION_TIERS[tier as BuiltInSubscriptionTier]?.label || tier;
  const billingLabel = BILLING_PERIODS.find((b) => b.id === billing)?.label ?? billing;
  return `${tierLabel} (${billingLabel})`;
};

export type SubscriptionActivationDeps = {
  sendEmail: (input: SendEmailInput) => Promise<void>;
  insertNotification: (payload: Record<string, unknown>) => Promise<void>;
};

export const activateLandlordSubscription = async (
  deps: SubscriptionActivationDeps,
  input: {
    subscriptionPaymentId: string;
    landlordId: string;
    landlordEmail: string;
    landlordName: string;
    tier: SubscriptionTier;
    billing: BillingPeriod;
    amount: number;
    paymentChannel: string;
    paymentReference: string;
  },
) => {
  const current = await db.query.users.findFirst({
    where: eq(schema.users.uid, input.landlordId),
    columns: {role: true, isAdmin: true, isSuperAdmin: true, subscriptionStatus: true, subscriptionExpiresAt: true},
  });
  // Early renewals extend from the current expiry instead of discarding the paid remainder.
  const now = new Date();
  const currentExpiry = current?.subscriptionExpiresAt ? new Date(current.subscriptionExpiresAt) : null;
  const periodStart =
    current?.subscriptionStatus === 'active' && currentExpiry && currentExpiry > now ? currentExpiry : now;
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + getBillingMonths(input.billing));

  const receiptNumber = buildReceiptNumber();
  const dbPlan = await getSubscriptionPlanById(input.tier);
  const label = planLabel(input.tier, input.billing, dbPlan?.label);
  const landlordReceipt = buildSubscriptionReceiptText({
    receiptNumber,
    landlordName: input.landlordName,
    landlordEmail: input.landlordEmail,
    planLabel: label,
    amount: input.amount,
    paymentChannel: input.paymentChannel,
    paymentReference: input.paymentReference,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    audience: 'landlord',
  });

  const adminReceipt = buildSubscriptionReceiptText({
    receiptNumber,
    landlordName: input.landlordName,
    landlordEmail: input.landlordEmail,
    planLabel: label,
    amount: input.amount,
    paymentChannel: input.paymentChannel,
    paymentReference: input.paymentReference,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    audience: 'admin',
  });

  const existing = await db.query.landlordSubscriptionPayments.findFirst({
    where: eq(schema.landlordSubscriptionPayments.id, input.subscriptionPaymentId),
    columns: {id: true, status: true},
  });

  if (!existing) throw new Error('Subscription payment record not found');
  if (existing.status === 'confirmed') return {alreadyActive: true, receiptNumber, receiptText: landlordReceipt};

  // Claim the payment and grant the plan atomically: concurrent callback + IPN deliveries
  // activate exactly once, and a failure can't leave a confirmed payment without a plan.
  const activated = await db.transaction(async (tx) => {
    // Conditional update so concurrent callback + IPN deliveries activate exactly once.
    const claimed = await tx
      .update(schema.landlordSubscriptionPayments)
      .set({
        status: 'confirmed',
        receiptNumber,
        receiptText: landlordReceipt,
        paymentReference: input.paymentReference,
        periodStart,
        periodEnd,
      })
      .where(
        and(
          eq(schema.landlordSubscriptionPayments.id, input.subscriptionPaymentId),
          ne(schema.landlordSubscriptionPayments.status, 'confirmed'),
        ),
      )
      .returning({id: schema.landlordSubscriptionPayments.id});

    if (claimed.length === 0) return false;

    // Agency / Property Manager plans (Pro Plus or any custom plan with agencyAccess) grant
    // the scoped agency-admin role (`role: 'admin'`, never `isAdmin`). Platform admins keep their role.
    const isPlatformAdmin = Boolean(current?.isAdmin || current?.isSuperAdmin);
    const grantsAgency = Boolean(dbPlan?.agencyAccess || input.tier === 'proplus');
    const nextRole = isPlatformAdmin ? (current?.role ?? 'admin') : grantsAgency ? 'admin' : 'landlord';

    await tx
      .update(schema.users)
      .set({
        role: nextRole,
        subscriptionPlan: encodeSubscriptionPlan(input.tier, input.billing),
        subscriptionStatus: 'active',
        subscriptionExpiresAt: periodEnd,
      })
      .where(eq(schema.users.uid, input.landlordId));

    // Sync the subscription to any landlords managed by this admin
    await tx
      .update(schema.users)
      .set({
        subscriptionStatus: 'active',
        subscriptionExpiresAt: periodEnd,
      })
      .where(eq(schema.users.managedByAdminId, input.landlordId));
    return true;
  });
  if (!activated) return {alreadyActive: true, receiptNumber, receiptText: landlordReceipt};

  const summary = `${input.landlordName} subscribed to ${label} (${input.paymentReference}).`;
  await deps.insertNotification({
    recipientEmail: input.landlordEmail.toLowerCase(),
    type: 'receipt',
    title: 'Subscription receipt',
    message: `Your ${label} plan is active until ${periodEnd.toLocaleDateString('en-KE')}. Receipt ${receiptNumber}.`,
    read: false,
  });

  const formattedAmount = `KES ${Number(input.amount).toLocaleString('en-KE')}`;
  const expiresFormatted = periodEnd.toLocaleDateString('en-KE', {day: 'numeric', month: 'long', year: 'numeric'});

  for (const adminEmail of SUPER_ADMIN_EMAILS) {
    await deps.insertNotification({
      recipientEmail: adminEmail,
      type: 'receipt',
      title: 'New landlord subscription',
      message: summary,
      read: false,
    });
    await deps.sendEmail({
      to: adminEmail,
      subject: `Landlord subscription: ${receiptNumber}`,
      text: adminReceipt,
      template: {
        preheader: `${input.landlordName} paid ${formattedAmount} for ${label}.`,
        heading: 'New landlord subscription',
        paragraphs: [`${input.landlordName} (${input.landlordEmail}) paid for ${label}.`],
        details: [
          ['Receipt', receiptNumber],
          ['Landlord', input.landlordName],
          ['Email', input.landlordEmail],
          ['Plan', label],
          ['Amount', formattedAmount],
          ['Method', input.paymentChannel],
          ['Reference', input.paymentReference],
          ['Active until', expiresFormatted],
        ],
        button: {label: 'Open dashboard', url: appBaseUrl},
        footerNote: 'Sent to MyBoma administrators.',
      },
    });
  }

  if (!isSuperAdminEmail(input.landlordEmail)) {
    await deps.sendEmail({
      to: input.landlordEmail,
      subject: `MyBoma subscription receipt — ${receiptNumber}`,
      text: landlordReceipt,
      template: {
        preheader: `Your ${label} plan is active until ${expiresFormatted}.`,
        heading: 'Subscription receipt',
        paragraphs: [`Your ${label} plan is now active until ${expiresFormatted}. Keep this email as your receipt.`],
        details: [
          ['Receipt', receiptNumber],
          ['Plan', label],
          ['Amount', formattedAmount],
          ['Method', input.paymentChannel],
          ['Reference', input.paymentReference],
          ['Active until', expiresFormatted],
        ],
        button: {label: 'Open MyBoma', url: appBaseUrl},
        footerNote: 'Sent because you paid for a MyBoma subscription.',
      },
    });
  }

  return {
    alreadyActive: false,
    receiptNumber,
    receiptText: landlordReceipt,
    subscriptionExpiresAt: periodEnd.toISOString(),
  };
};

export const saveLandlordPayoutProfile = async (landlordId: string, body: RentPayoutInput) => {
  await db
    .update(schema.users)
    // Never touches `role` or an already-active subscription: entitlements are granted
    // only by activateLandlordSubscription once the payment is confirmed.
    .set({
      // A renewal must not knock a currently active landlord out while they pay.
      subscriptionStatus: sql`CASE WHEN ${schema.users.subscriptionStatus} = 'active' THEN 'active'::subscription_status ELSE 'pending'::subscription_status END`,
      rentPayoutMethod: body.rentPayoutMethod,
      cashPayoutNotes: body.cashPayoutNotes?.trim() || null,
      mpesaSettlementPhone:
        body.rentPayoutMethod === 'mpesa' ? (body.mpesaSettlementPhone?.trim() ?? null) : null,
      bankName: body.rentPayoutMethod === 'bank' ? (body.bankName?.trim() ?? null) : null,
      bankAccountNumber: body.rentPayoutMethod === 'bank' ? (body.bankAccountNumber?.trim() ?? null) : null,
      bankAccountName: body.rentPayoutMethod === 'bank' ? (body.bankAccountName?.trim() ?? null) : null,
    })
    .where(eq(schema.users.uid, landlordId));
};

/**
 * Puts a landlord on the free plan (1 house unit, no buildings, no expiry) without a payment.
 * Only ever grants 'free': a landlord with an active paid plan keeps it untouched, so this
 * can never be used to downgrade or to obtain a paid tier. Platform admins keep their role.
 */
export const activateFreeLandlordPlan = async (landlordId: string, payout: RentPayoutInput) => {
  const current = await db.query.users.findFirst({
    where: eq(schema.users.uid, landlordId),
    columns: {role: true, isAdmin: true, isSuperAdmin: true, subscriptionPlan: true, subscriptionStatus: true, subscriptionExpiresAt: true},
  });
  if (!current) throw new Error('Landlord profile not found');

  const hasActivePaidPlan =
    current.subscriptionStatus === 'active' &&
    current.subscriptionPlan !== FREE_PLAN &&
    (!current.subscriptionExpiresAt || new Date(current.subscriptionExpiresAt).getTime() > Date.now());
  if (hasActivePaidPlan) return {activated: false as const, reason: 'paid_plan_active' as const};

  // Tenant accounts belong to a landlord's lease; switching them to 'landlord' would strand
  // their tenancy. They need a separate account to list property.
  const isPlatformAdminAccount = Boolean(current.isAdmin || current.isSuperAdmin);
  if (current.role === 'tenant' && !isPlatformAdminAccount) {
    return {activated: false as const, reason: 'tenant_account' as const};
  }

  const isPlatformAdmin = Boolean(current.isAdmin || current.isSuperAdmin);
  await db
    .update(schema.users)
    .set({
      role: isPlatformAdmin ? current.role : 'landlord',
      subscriptionPlan: FREE_PLAN,
      subscriptionStatus: 'active',
      subscriptionExpiresAt: null,
      rentPayoutMethod: payout.rentPayoutMethod,
      cashPayoutNotes: payout.cashPayoutNotes?.trim() || null,
      mpesaSettlementPhone: payout.rentPayoutMethod === 'mpesa' ? (payout.mpesaSettlementPhone?.trim() ?? null) : null,
      bankName: payout.rentPayoutMethod === 'bank' ? (payout.bankName?.trim() ?? null) : null,
      bankAccountNumber: payout.rentPayoutMethod === 'bank' ? (payout.bankAccountNumber?.trim() ?? null) : null,
      bankAccountName: payout.rentPayoutMethod === 'bank' ? (payout.bankAccountName?.trim() ?? null) : null,
    })
    .where(eq(schema.users.uid, landlordId));
  return {activated: true as const};
};

export const createPendingSubscriptionPayment = async (input: {
  landlordId: string;
  tier: SubscriptionTier;
  billing: BillingPeriod;
  amount: number;
  paymentChannel: 'stripe' | 'mpesa' | 'pesapal';
}) => {
  const planKey = encodeSubscriptionPlan(input.tier, input.billing);
  const now = new Date();
  const [row] = await db
    .insert(schema.landlordSubscriptionPayments)
    .values({
      landlordId: input.landlordId,
      plan: planKey,
      amount: String(input.amount),
      paymentChannel: input.paymentChannel,
      paymentReference: 'pending',
      status: 'pending',
      receiptNumber: `PEND-${randomUUID().slice(0, 12).toUpperCase()}`,
      periodStart: now,
      periodEnd: now,
    })
    .returning({id: schema.landlordSubscriptionPayments.id, plan: schema.landlordSubscriptionPayments.plan, amount: schema.landlordSubscriptionPayments.amount});

  return {id: row.id, plan: row.plan, amount: Number(row.amount)};
};

/**
 * Daily job: lapsed subscriptions become 'expired', and a lapsed Pro Plus agency loses the
 * plan-backed admin role. Platform admins (isAdmin/isSuperAdmin) are never demoted here.
 */
export const expireLapsedSubscriptions = async () => {
  const expired = await db
    .update(schema.users)
    .set({
      subscriptionStatus: 'expired',
      role: sql`CASE WHEN ${schema.users.role} = 'admin' AND NOT ${schema.users.isAdmin} AND NOT ${schema.users.isSuperAdmin} THEN 'landlord'::user_role ELSE ${schema.users.role} END`,
    })
    .where(and(eq(schema.users.subscriptionStatus, 'active'), sql`${schema.users.subscriptionExpiresAt} < now()`))
    .returning({uid: schema.users.uid});
  return expired.length;
};

/** Sends a single subscription renewal reminder (in-app + push + email) on demand. */
export const sendSubscriptionRenewalReminder = async (
  userId: string,
  deps: SubscriptionActivationDeps,
): Promise<{ok: true; email: string; title: string} | {ok: false; status: number; error: string}> => {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.uid, userId),
    columns: {
      uid: true,
      email: true,
      displayName: true,
      role: true,
      isAdmin: true,
      isSuperAdmin: true,
      status: true,
      platformId: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
    },
  });
  if (!user) return {ok: false, status: 404, error: 'Account not found.'};
  if (user.isSuperAdmin) return {ok: false, status: 400, error: 'Super admin accounts do not require subscription reminders.'};
  if (!user.subscriptionPlan || isFreePlan(user.subscriptionPlan)) {
    return {ok: false, status: 400, error: 'This account is on the free plan or has no paid plan yet.'};
  }
  if (!user.subscriptionExpiresAt) {
    return {ok: false, status: 400, error: 'This subscription does not have an expiry date set.'};
  }

  const todayIso = billingToday(new Date());
  const expiryDate = new Date(user.subscriptionExpiresAt);
  const expiryIso = billingToday(expiryDate);
  const daysLeft = daysUntilDueDate(expiryIso, todayIso);
  const content = buildSubscriptionReminderContent({
    displayName: user.displayName || user.email,
    accountType: subscriberAccountType(user),
    planKey: user.subscriptionPlan,
    expiryDate,
    daysLeft,
    portalUrl: appBaseUrl,
  });

  await Promise.allSettled([
    deps.insertNotification({
      recipientEmail: user.email.toLowerCase(),
      platformId: user.platformId ?? null,
      type: 'subscription_reminder',
      title: content.title,
      message: content.message,
      read: false,
    }),
    deps.sendEmail({
      to: user.email,
      subject: content.subject,
      template: content.template,
    }),
  ]);

  return {ok: true, email: user.email, title: content.title};
};

/**
 * Daily job: notifies Landlords and Property Managers via email + in-app + push when their
 * prepaid subscription is due in 7 days, 2 days, today, or recently expired (1, 3, 7 days).
 */
export const processAutomatedSubscriptionReminders = async (deps: SubscriptionActivationDeps) => {
  const now = new Date();
  const todayIso = billingToday(now);
  const candidates = await db
    .select({
      uid: schema.users.uid,
      email: schema.users.email,
      displayName: schema.users.displayName,
      role: schema.users.role,
      isAdmin: schema.users.isAdmin,
      isSuperAdmin: schema.users.isSuperAdmin,
      status: schema.users.status,
      platformId: schema.users.platformId,
      subscriptionPlan: schema.users.subscriptionPlan,
      subscriptionStatus: schema.users.subscriptionStatus,
      subscriptionExpiresAt: schema.users.subscriptionExpiresAt,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.status, 'active'),
        eq(schema.users.isSuperAdmin, false),
        inArray(schema.users.subscriptionStatus, ['active', 'expired']),
        isNotNull(schema.users.subscriptionExpiresAt),
        isNotNull(schema.users.subscriptionPlan),
      ),
    );

  let sent = 0;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const user of candidates) {
    if (!user.subscriptionPlan || isFreePlan(user.subscriptionPlan) || !user.subscriptionExpiresAt) continue;
    const expiryDate = new Date(user.subscriptionExpiresAt);
    const expiryIso = billingToday(expiryDate);
    const daysLeft = daysUntilDueDate(expiryIso, todayIso);
    const milestone = classifySubscriptionReminderMilestone(daysLeft);
    if (!milestone) continue;

    const content = buildSubscriptionReminderContent({
      displayName: user.displayName || user.email,
      accountType: subscriberAccountType(user),
      planKey: user.subscriptionPlan,
      expiryDate,
      daysLeft,
    });

    const recent = await db
      .select({id: schema.notifications.id})
      .from(schema.notifications)
      .where(
        and(
          sql`lower(${schema.notifications.recipientEmail}) = ${user.email.toLowerCase()}`,
          eq(schema.notifications.title, content.title),
          gte(schema.notifications.createdAt, since),
        ),
      )
      .limit(1);
    if (recent.length > 0) continue;

    await Promise.allSettled([
      deps.insertNotification({
        recipientEmail: user.email.toLowerCase(),
        platformId: user.platformId ?? null,
        type: 'subscription_reminder',
        title: content.title,
        message: content.message,
        read: false,
      }),
      deps.sendEmail({
        to: user.email,
        subject: content.subject,
        template: content.template,
      }),
    ]);
    sent += 1;
  }

  return {checked: candidates.length, sent};
};

/** Re-sends the receipt email + in-app alert for a confirmed landlord/PM subscription payment. */
export const resendSubscriptionReceipt = async (
  paymentId: string,
  deps: SubscriptionActivationDeps,
): Promise<{ok: true; email: string; receiptNumber: string} | {ok: false; status: number; error: string}> => {
  const payment = await db.query.landlordSubscriptionPayments.findFirst({
    where: eq(schema.landlordSubscriptionPayments.id, paymentId),
  });
  if (!payment) return {ok: false, status: 404, error: 'Subscription payment not found.'};
  if (payment.status !== 'confirmed') {
    return {ok: false, status: 400, error: 'Receipts can only be sent for confirmed payments.'};
  }
  const user = await db.query.users.findFirst({
    where: eq(schema.users.uid, payment.landlordId),
    columns: {uid: true, email: true, displayName: true, platformId: true},
  });
  if (!user) return {ok: false, status: 404, error: 'Subscriber account not found.'};

  const label = formatSubscriptionPlanLabel(payment.plan);
  const formattedAmount = `KES ${Number(payment.amount).toLocaleString('en-KE')}`;
  const expiresFormatted = new Date(payment.periodEnd).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const receiptText =
    payment.receiptText ||
    buildSubscriptionReceiptText({
      receiptNumber: payment.receiptNumber,
      landlordName: user.displayName || user.email,
      landlordEmail: user.email,
      planLabel: label,
      amount: Number(payment.amount),
      paymentChannel: payment.paymentChannel,
      paymentReference: payment.paymentReference,
      periodStart: new Date(payment.periodStart).toISOString(),
      periodEnd: new Date(payment.periodEnd).toISOString(),
      audience: 'landlord',
    });

  await Promise.allSettled([
    deps.insertNotification({
      recipientEmail: user.email.toLowerCase(),
      platformId: user.platformId ?? null,
      type: 'receipt',
      title: `Subscription receipt (${payment.receiptNumber})`,
      message: `Receipt for ${label} (${formattedAmount}), active until ${expiresFormatted}.`,
      read: false,
    }),
    deps.sendEmail({
      to: user.email,
      subject: `MyBoma subscription receipt — ${payment.receiptNumber}`,
      text: receiptText,
      template: {
        preheader: `Receipt ${payment.receiptNumber} for ${label} (${formattedAmount}).`,
        heading: 'Subscription receipt',
        paragraphs: [`Here is your receipt for ${label}, active until ${expiresFormatted}.`],
        details: [
          ['Receipt', payment.receiptNumber],
          ['Plan', label],
          ['Amount', formattedAmount],
          ['Method', payment.paymentChannel],
          ['Reference', payment.paymentReference],
          ['Active until', expiresFormatted],
        ],
        button: {label: 'Open MyBoma', url: appBaseUrl},
        footerNote: 'Sent because you paid for a MyBoma subscription.',
      },
    }),
  ]);

  return {ok: true, email: user.email, receiptNumber: payment.receiptNumber};
};

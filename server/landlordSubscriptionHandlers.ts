import {randomUUID} from 'crypto';
import {eq} from 'drizzle-orm';
import type {Response} from 'express';
import {z} from 'zod';
import {db, schema} from '../db/client.ts';
import {isSuperAdminEmail, SUPER_ADMIN_EMAILS} from '../config/superAdmin.ts';
import type {AuthenticatedRequest} from './types.ts';
import {
  BILLING_PERIODS,
  SUBSCRIPTION_TIERS,
  buildSubscriptionReceiptText,
  encodeSubscriptionPlan,
  getBillingMonths,
  getSubscriptionAmount,
  type BillingPeriod,
  type SubscriptionTier,
} from '../src/lib/landlordSubscription.ts';

const tierSchema = z.enum(['basic', 'starter', 'growth', 'pro', 'proplus']);
const billingSchema = z.enum(['monthly', 'quarterly', 'yearly']);
const paymentMethodSchema = z.enum(['stripe', 'mpesa', 'pesapal']);
const rentPayoutMethodSchema = z.enum(['cash', 'mpesa', 'bank']);

export const landlordSubscriptionCheckoutSchema = z
  .object({
    tier: tierSchema,
    billing: billingSchema,
    paymentMethod: paymentMethodSchema,
    phone: z.string().max(20).optional(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
    rentPayoutMethod: rentPayoutMethodSchema,
    mpesaSettlementPhone: z.string().max(20).optional(),
    bankName: z.string().max(120).optional(),
    bankAccountNumber: z.string().max(40).optional(),
    bankAccountName: z.string().max(120).optional(),
    cashPayoutNotes: z.string().max(280).optional(),
  })
  .superRefine((body, ctx) => {
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
  });

const buildReceiptNumber = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MB-SUB-${stamp}-${rand}`;
};

const planLabel = (tier: SubscriptionTier, billing: BillingPeriod) => {
  const tierLabel = SUBSCRIPTION_TIERS[tier].label;
  const billingLabel = BILLING_PERIODS.find((b) => b.id === billing)?.label ?? billing;
  return `${tierLabel} (${billingLabel})`;
};

export type SubscriptionActivationDeps = {
  sendEmail: (input: {to?: string | null; subject: string; text: string}) => Promise<void>;
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
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + getBillingMonths(input.billing));

  const receiptNumber = buildReceiptNumber();
  const label = planLabel(input.tier, input.billing);
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

  await db
    .update(schema.landlordSubscriptionPayments)
    .set({
      status: 'confirmed',
      receiptNumber,
      receiptText: landlordReceipt,
      paymentReference: input.paymentReference,
      periodStart,
      periodEnd,
    })
    .where(eq(schema.landlordSubscriptionPayments.id, input.subscriptionPaymentId));

  await db
    .update(schema.users)
    .set({
      role: input.tier === 'proplus' ? 'admin' : 'landlord',
      subscriptionPlan: encodeSubscriptionPlan(input.tier, input.billing),
      subscriptionStatus: 'active',
      subscriptionExpiresAt: periodEnd,
    })
    .where(eq(schema.users.uid, input.landlordId));

  // Sync the subscription to any landlords managed by this admin
  await db
    .update(schema.users)
    .set({
      subscriptionStatus: 'active',
      subscriptionExpiresAt: periodEnd,
    })
    .where(eq(schema.users.managedByAdminId, input.landlordId));

  const summary = `${input.landlordName} subscribed to ${label} (${input.paymentReference}).`;
  await deps.insertNotification({
    recipientEmail: input.landlordEmail.toLowerCase(),
    type: 'receipt',
    title: 'Subscription receipt',
    message: `Your ${label} plan is active until ${periodEnd.toLocaleDateString('en-KE')}. Receipt ${receiptNumber}.`,
    read: false,
  });

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
      subject: `MyBoma landlord subscription — ${receiptNumber}`,
      text: adminReceipt,
    });
  }

  if (!isSuperAdminEmail(input.landlordEmail)) {
    await deps.sendEmail({
      to: input.landlordEmail,
      subject: `MyBoma subscription receipt — ${receiptNumber}`,
      text: landlordReceipt,
    });
  }

  return {
    alreadyActive: false,
    receiptNumber,
    receiptText: landlordReceipt,
    subscriptionExpiresAt: periodEnd.toISOString(),
  };
};

export const saveLandlordPayoutProfile = async (
  landlordId: string,
  body: z.infer<typeof landlordSubscriptionCheckoutSchema>,
) => {
  await db
    .update(schema.users)
    .set({
      role: body.tier === 'proplus' ? 'admin' : 'landlord',
      rentPayoutMethod: body.rentPayoutMethod,
      subscriptionStatus: 'pending',
      cashPayoutNotes: body.cashPayoutNotes?.trim() || null,
      mpesaSettlementPhone:
        body.rentPayoutMethod === 'mpesa' ? (body.mpesaSettlementPhone?.trim() ?? null) : null,
      bankName: body.rentPayoutMethod === 'bank' ? (body.bankName?.trim() ?? null) : null,
      bankAccountNumber: body.rentPayoutMethod === 'bank' ? (body.bankAccountNumber?.trim() ?? null) : null,
      bankAccountName: body.rentPayoutMethod === 'bank' ? (body.bankAccountName?.trim() ?? null) : null,
    })
    .where(eq(schema.users.uid, landlordId));
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

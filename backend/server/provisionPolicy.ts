import {z} from 'zod';
import type {UserProfileRecord} from './types.ts';

const emailSchema = z.string().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const phoneSchema = z
  .string()
  .max(20)
  .regex(/^\+?\d+$/)
  .or(z.literal(''))
  .nullable()
  .optional();

export const provisionUserSchema = z
  .object({
    email: emailSchema,
    // Ignored: invitees choose their own password from the emailed link. Still accepted so
    // older app versions that send one keep working.
    password: passwordSchema.optional(),
    displayName: z.string().min(1).max(120),
    phone: phoneSchema,
    role: z.enum(['tenant', 'landlord', 'hunter', 'admin', 'caretaker']),
    platformId: z.string().uuid().nullable().optional(),
    landlordId: z.string().uuid().optional(),
    mustChangePassword: z.boolean().optional(),
    rentRouting: z.enum(['direct', 'admin']).optional(),
    rentPayoutMethod: z.enum(['cash', 'mpesa', 'bank']).optional(),
    mpesaSettlementPhone: phoneSchema,
    mpesaSettlementShortCode: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankAccountName: z.string().optional(),
    /** Super admin option when creating a landlord: assign an explicit subscription tier & cycle. */
    subscriptionTier: z.enum(['free', 'basic', 'starter', 'pro', 'proplus']).optional(),
    subscriptionBilling: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    /** Optional units assigned to a caretaker upon invitation acceptance. */
    propertyIds: z.array(z.string().uuid()).max(200).optional(),
  })
  .strict();

const forbidden = (message: string) => {
  const error = new Error(message);
  (error as any).statusCode = 403;
  return error;
};

/**
 * Who may create which accounts:
 * - super admin: anything, including other admins.
 * - platform admin (isAdmin): tenants/landlords/hunters/caretakers inside their own platform only.
 * - Pro Plus agency admin / landlord: tenants and caretakers for themselves; agencies may also add
 *   managed landlords. Nobody but a super admin can mint an admin.
 */
export const assertCanProvision = (
  actor: UserProfileRecord,
  body: z.infer<typeof provisionUserSchema>,
  isAgencyAdmin = false,
) => {
  if (actor.isSuperAdmin) return;
  if (body.role === 'admin') throw forbidden('Only a super admin can create admin accounts.');

  if (actor.isAdmin) {
    if (actor.platformId && body.platformId && body.platformId !== actor.platformId) {
      throw forbidden('Cannot provision users outside your platform.');
    }
    return;
  }

  if (body.platformId && body.platformId !== (actor.platformId ?? null)) {
    throw forbidden('Cannot provision users outside your platform.');
  }

  if (body.role === 'tenant' || body.role === 'caretaker') {
    if (body.landlordId && body.landlordId !== actor.uid) {
      throw forbidden(`You can only provision ${body.role}s for your own account.`);
    }
    if (actor.role === 'landlord' || isAgencyAdmin) return;
  }

  if (body.role === 'landlord' && isAgencyAdmin) return;

  throw forbidden('You are not allowed to provision this user type.');
};

/** Computes subscription profile fields when a super admin picks a plan for a newly invited landlord. */
export const resolveProvisionedLandlordSubscription = (
  tier?: 'free' | 'basic' | 'starter' | 'pro' | 'proplus',
  billing: 'monthly' | 'quarterly' | 'yearly' = 'monthly',
  now = new Date(),
) => {
  if (!tier) {
    return {
      subscriptionPlan: 'proplus:yearly',
      subscriptionStatus: 'active' as const,
      subscriptionExpiresAt: '2099-12-31T23:59:59Z',
    };
  }
  if (tier === 'free') {
    return {
      subscriptionPlan: 'free',
      subscriptionStatus: 'active' as const,
      subscriptionExpiresAt: null,
    };
  }
  const days = billing === 'yearly' ? 365 : billing === 'quarterly' ? 90 : 30;
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return {
    subscriptionPlan: `${tier}:${billing}`,
    subscriptionStatus: 'active' as const,
    subscriptionExpiresAt: expiresAt,
  };
};

export type SubscriptionTier = 'free' | 'basic' | 'starter' | 'pro' | 'proplus';
/** Tiers bought through checkout. 'free' is activated without payment and never expires. */
export type PaidSubscriptionTier = Exclude<SubscriptionTier, 'free'>;
export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionPaymentMethod = 'stripe' | 'mpesa' | 'pesapal';
export type RentPayoutMethod = 'cash' | 'mpesa' | 'bank';

export type SubscriptionFeatures = {
  maxListings: number | null;
  maxBuildings: number | null;
  maintenanceHub: boolean;
  caretakerAccess: boolean;
  agencyAccess: boolean;
  label: string;
};

export interface SubscriptionTierConfig {
  id: SubscriptionTier;
  label: string;
  badge?: string;
  limitSummary: string;
  tagline: string;
  audience: string;
  monthlyBaseKes: number;
  yearlyKes?: number;
  features: SubscriptionFeatures;
  highlights: string[];
}

export const VISIBLE_PLAN_ORDER: SubscriptionTier[] = ['free', 'starter', 'pro', 'proplus'];

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, SubscriptionTierConfig> = {
  free: {
    id: 'free',
    label: 'Free',
    limitSummary: 'Up to 2 Units (1 Building)',
    tagline: 'Up to 2 units · 1 building',
    audience: 'Individual landlords testing the platform with 1–2 SQs/units.',
    monthlyBaseKes: 0,
    yearlyKes: 0,
    features: {
      maxListings: 2,
      maxBuildings: 1,
      maintenanceHub: false,
      caretakerAccess: false,
      agencyAccess: false,
      label: 'Free',
    },
    highlights: [
      'Digital tenant & rent ledger',
      'Manual payment logging & basic receipts',
      'Expense tracking',
    ],
  },
  basic: {
    id: 'basic',
    label: 'Basic (Legacy)',
    limitSummary: 'Up to 2 Units (1 Building)',
    tagline: 'Legacy basic plan',
    audience: 'Legacy plan kept for existing accounts.',
    monthlyBaseKes: 100,
    yearlyKes: 1000,
    features: {
      maxListings: 2,
      maxBuildings: 1,
      maintenanceHub: false,
      caretakerAccess: false,
      agencyAccess: false,
      label: 'Basic',
    },
    highlights: ['Up to 2 units (1 building)', 'Tenant & rent ledger'],
  },
  starter: {
    id: 'starter',
    label: 'Starter',
    limitSummary: 'Up to 10 Units (Up to 2 Buildings)',
    tagline: 'Up to 10 units · up to 2 buildings',
    audience: 'Small plot/court owners (e.g., 6–10 bedsitters or 1BR units).',
    monthlyBaseKes: 750,
    yearlyKes: 7500,
    features: {
      maxListings: 10,
      maxBuildings: 2,
      maintenanceHub: true,
      caretakerAccess: false,
      agencyAccess: false,
      label: 'Starter',
    },
    highlights: [
      'Everything in Free',
      'Automated SMS & Email rent reminders',
      'Auto-generated PDF rent receipts',
      'Maintenance & repair ticket hub',
    ],
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    badge: 'Most Popular',
    limitSummary: 'Up to 20 Units (Up to 5 Buildings)',
    tagline: 'Up to 20 units · up to 5 buildings',
    audience: 'Standard residential apartment block owners (15–40 units).',
    monthlyBaseKes: 2000,
    yearlyKes: 20000,
    features: {
      maxListings: 20,
      maxBuildings: 5,
      maintenanceHub: true,
      caretakerAccess: true,
      agencyAccess: false,
      label: 'Pro',
    },
    highlights: [
      'Everything in Starter',
      'Automated M-Pesa Paybill / Till reconciliation',
      'Tenant self-service portal & arrears aging reports',
      'Caretaker / staff role access',
    ],
  },
  proplus: {
    id: 'proplus',
    label: 'Agency / Enterprise',
    limitSummary: 'Unlimited Units & Buildings',
    tagline: 'Unlimited units & buildings',
    audience: 'Real estate management agencies & large estate developers.',
    monthlyBaseKes: 10000,
    yearlyKes: 100000,
    features: {
      maxListings: null,
      maxBuildings: null,
      maintenanceHub: true,
      caretakerAccess: true,
      agencyAccess: true,
      label: 'Agency / Enterprise',
    },
    highlights: [
      'Everything in Pro',
      'Multi-user admin & accountant permissions',
      'Whitelabel branding (custom domain & logo)',
      'Bulk water/electricity meter billing & API',
    ],
  },
};

export const BILLING_PERIODS: { id: BillingPeriod; label: string; months: number; multiplier: number }[] = [
  { id: 'monthly', label: 'Monthly (Prepaid)', months: 1, multiplier: 1 },
  { id: 'quarterly', label: 'Quarterly (Prepaid)', months: 3, multiplier: 2.7 },
  { id: 'yearly', label: 'Yearly (Prepaid)', months: 12, multiplier: 10 },
];

export const encodeSubscriptionPlan = (tier: SubscriptionTier, billing: BillingPeriod) => `${tier}:${billing}`;

export const parseSubscriptionPlan = (plan?: string | null): { tier: SubscriptionTier; billing: BillingPeriod } | null => {
  if (!plan) return null;
  if (plan === 'free') return { tier: 'free', billing: 'monthly' };
  if (!plan.includes(':')) return null;
  const [tier, billing] = plan.split(':') as [SubscriptionTier, BillingPeriod];
  if (!SUBSCRIPTION_TIERS[tier] || !BILLING_PERIODS.some((b) => b.id === billing)) return null;
  return { tier, billing };
};

export const getSubscriptionAmount = (tier: SubscriptionTier, billing: BillingPeriod) => {
  const cfg = SUBSCRIPTION_TIERS[tier];
  if (billing === 'yearly' && typeof cfg.yearlyKes === 'number') return cfg.yearlyKes;
  const period = BILLING_PERIODS.find((b) => b.id === billing)!;
  return Math.round(cfg.monthlyBaseKes * period.multiplier);
};

export const getBillingMonths = (billing: BillingPeriod) =>
  BILLING_PERIODS.find((b) => b.id === billing)?.months ?? 1;

export const formatPlanPrice = (amount: number) => `KES ${amount.toLocaleString('en-KE')}`;

export const getSubscriptionFeatures = (profile: {
  subscriptionPlan?: string | null;
  role?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}): SubscriptionFeatures => {
  if (profile.isSuperAdmin || profile.isAdmin) {
    return SUBSCRIPTION_TIERS.proplus.features;
  }
  const parsed = parseSubscriptionPlan(profile.subscriptionPlan);
  if (profile.role === 'admin' && parsed?.tier === 'proplus') {
    return SUBSCRIPTION_TIERS.proplus.features;
  }
  if (profile.role === 'admin') {
    return SUBSCRIPTION_TIERS.pro.features;
  }
  if (!parsed) {
    return { ...SUBSCRIPTION_TIERS.free.features, label: 'Free' };
  }
  return SUBSCRIPTION_TIERS[parsed.tier].features;
};

export const FREE_PLAN = encodeSubscriptionPlan('free', 'monthly');

export const isFreePlan = (plan?: string | null) => parseSubscriptionPlan(plan)?.tier === 'free';

export const PENDING_LANDLORD_SUBSCRIPTION_KEY = 'myboma_pending_landlord_subscription';

export type PendingLandlordSubscription = {
  tier: SubscriptionTier;
  billing: BillingPeriod;
  rentPayoutMethod: RentPayoutMethod;
  mpesaSettlementPhone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  cashPayoutNotes?: string;
};

export const isLandlordSubscriptionActive = (profile: {
  role?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: string | null;
}) => {
  // Platform staff admins and super admins always have full access
  if (profile.isSuperAdmin || profile.isAdmin) return true;
  // Tenants and caretakers don't need a landlord subscription
  if (profile.role === 'tenant' || profile.role === 'caretaker') return true;
  // Hunters are not active landlords
  if (profile.role === 'hunter') return false;

  // Landlords and self-service Property Managers (role === 'admin', isAdmin === false)
  // must have an active free or unexpired paid plan before entering the app.
  if (profile.subscriptionStatus !== 'active') return false;
  // The free plan has no expiry date.
  if (isFreePlan(profile.subscriptionPlan)) return true;
  if (!profile.subscriptionExpiresAt) return false;

  const expiry = new Date(profile.subscriptionExpiresAt).getTime();
  return expiry > Date.now();
};

export const buildSubscriptionReceiptText = (input: {
  receiptNumber: string;
  landlordName: string;
  landlordEmail: string;
  planLabel: string;
  amount: number;
  paymentChannel: string;
  paymentReference: string;
  periodStart: string;
  periodEnd: string;
  audience: 'landlord' | 'admin';
}) => {
  const lines = [
    'MYBOMA — LANDLORD SUBSCRIPTION RECEIPT',
    `Receipt No: ${input.receiptNumber}`,
    `Issued: ${new Date().toISOString()}`,
    '',
    input.audience === 'admin' ? 'Platform copy (admin)' : 'Your copy',
    `Landlord: ${input.landlordName}`,
    `Email: ${input.landlordEmail}`,
    `Plan: ${input.planLabel}`,
    `Amount: ${formatPlanPrice(input.amount)}`,
    `Paid via: ${input.paymentChannel}`,
    `Reference: ${input.paymentReference}`,
    `Coverage: ${input.periodStart} → ${input.periodEnd}`,
    '',
    'Thank you for subscribing to MyBoma Property OS.',
  ];
  return lines.join('\n');
};

export const getReceiptDownloadUrl = (text: string) =>
  `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;

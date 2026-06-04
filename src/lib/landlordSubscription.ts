export type SubscriptionTier = 'test' | 'starter' | 'growth' | 'pro';
export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionPaymentMethod = 'stripe' | 'mpesa' | 'pesapal';
export type RentPayoutMethod = 'cash' | 'mpesa' | 'bank';

export type SubscriptionFeatures = {
  maxListings: number | null;
  maintenanceHub: boolean;
  label: string;
};

export const SUBSCRIPTION_TIERS: Record<
  SubscriptionTier,
  {
    id: SubscriptionTier;
    label: string;
    tagline: string;
    monthlyBaseKes: number;
    features: SubscriptionFeatures;
    highlights: string[];
  }
> = {
  test: {
    id: 'test',
    label: 'Test',
    tagline: 'Internal testing only',
    monthlyBaseKes: 100,
    features: {maxListings: 1, maintenanceHub: true, label: 'Test'},
    highlights: ['Testing only', '1 Unit', 'Maintenance included'],
  },
  starter: {
    id: 'starter',
    label: 'Starter',
    tagline: 'Solo landlords getting started',
    monthlyBaseKes: 999,
    features: { maxListings: 3, maintenanceHub: false, label: 'Starter' },
    highlights: ['Up to 3 listings', 'Tenant & rent ledger', 'No maintenance hub'],
  },
  growth: {
    id: 'growth',
    label: 'Growth',
    tagline: 'Active property managers',
    monthlyBaseKes: 1500,
    features: { maxListings: 20, maintenanceHub: true, label: 'Growth' },
    highlights: ['Up to 20 listings', 'Full maintenance hub', 'Notifications & automations'],
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    tagline: 'Portfolios at scale',
    monthlyBaseKes: 2999,
    features: { maxListings: null, maintenanceHub: true, label: 'Pro' },
    highlights: ['Unlimited listings', 'Maintenance hub', 'Priority support'],
  },
};

export const BILLING_PERIODS: { id: BillingPeriod; label: string; months: number; multiplier: number }[] = [
  { id: 'monthly', label: 'Monthly (Prepaid)', months: 1, multiplier: 1 },
  { id: 'quarterly', label: 'Quarterly (Prepaid)', months: 3, multiplier: 2.7 },
  { id: 'yearly', label: 'Yearly (Prepaid)', months: 12, multiplier: 9.6 },
];

export const encodeSubscriptionPlan = (tier: SubscriptionTier, billing: BillingPeriod) => `${tier}:${billing}`;

export const parseSubscriptionPlan = (plan?: string | null): { tier: SubscriptionTier; billing: BillingPeriod } | null => {
  if (!plan || !plan.includes(':')) return null;
  const [tier, billing] = plan.split(':') as [SubscriptionTier, BillingPeriod];
  if (!SUBSCRIPTION_TIERS[tier] || !BILLING_PERIODS.some((b) => b.id === billing)) return null;
  return { tier, billing };
};

export const getSubscriptionAmount = (tier: SubscriptionTier, billing: BillingPeriod) => {
  const base = SUBSCRIPTION_TIERS[tier].monthlyBaseKes;
  const period = BILLING_PERIODS.find((b) => b.id === billing)!;
  return Math.round(base * period.multiplier);
};

export const getBillingMonths = (billing: BillingPeriod) =>
  BILLING_PERIODS.find((b) => b.id === billing)?.months ?? 1;

export const formatPlanPrice = (amount: number) => `KES ${amount.toLocaleString('en-KE')}`;

export const getSubscriptionFeatures = (profile: {
  subscriptionPlan?: string | null;
  role?: string;
}): SubscriptionFeatures => {
  if (profile.role !== 'landlord') {
    return SUBSCRIPTION_TIERS.pro.features;
  }
  const parsed = parseSubscriptionPlan(profile.subscriptionPlan);
  if (!parsed) {
    return { maxListings: null, maintenanceHub: true, label: 'Legacy' };
  }
  return SUBSCRIPTION_TIERS[parsed.tier].features;
};

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
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: string | null;
}) => {
  if (profile.role !== 'landlord') return true;
  if (profile.subscriptionStatus !== 'active') return false;
  if (!profile.subscriptionExpiresAt) return false;
  return new Date(profile.subscriptionExpiresAt).getTime() > Date.now();
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

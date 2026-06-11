export type SubscriptionTier = 'test' | 'starter' | 'growth' | 'pro' | 'pro_plus';
export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionPaymentMethod = 'stripe' | 'mpesa' | 'pesapal';
export type RentPayoutMethod = 'cash' | 'mpesa' | 'bank';

export type SubscriptionFeatures = {
  maxListings: number | null;
  maintenanceHub: boolean;
  customBranding?: boolean;
  adminAccount?: boolean;
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
  pro_plus: {
    id: 'pro_plus',
    label: 'Pro Plus',
    tagline: 'White-label & admin control',
    monthlyBaseKes: 5000,
    features: { maxListings: null, maintenanceHub: true, customBranding: true, adminAccount: true, label: 'Pro Plus' },
    highlights: ['Unlimited listings', 'White-label customization', 'Rent out as your own app', 'Full admin account access', 'Priority support'],
  },
};

export const BILLING_PERIODS: { id: BillingPeriod; label: string; months: number; multiplier: number }[] = [
  { id: 'monthly', label: 'Monthly (Prepaid)', months: 1, multiplier: 1 },
  { id: 'quarterly', label: 'Quarterly (Prepaid)', months: 3, multiplier: 3 },
  { id: 'yearly', label: 'Yearly (Prepaid)', months: 12, multiplier: 12 },
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
  // Admins get pro_plus features
  if (profile.role === 'admin') {
    return SUBSCRIPTION_TIERS.pro_plus.features;
  }
  
  // Everyone else must have a plan
  const parsed = parseSubscriptionPlan(profile.subscriptionPlan);
  if (!parsed) {
    // Hunters or new landlords with no plan yet get starter features restricted to 1 unit
    return { ...SUBSCRIPTION_TIERS.starter.features, maxListings: 1, label: 'Free Tier' };
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
  // Admins always have full access
  if (profile.role === 'admin') return true;
  
  // Tenants don't need a landlord subscription to see their tenant dashboard
  if (profile.role === 'tenant') return true;
  
  // If you are a hunter and not an admin/tenant, you are NOT an active landlord
  if (profile.role === 'hunter') return false;
  
  // For landlords, check status and expiry
  if (profile.subscriptionStatus !== 'active') return false;
  if (!profile.subscriptionExpiresAt) return false;
  
  const expiry = new Date(profile.subscriptionExpiresAt).getTime();
  const now = Date.now();
  
  return expiry > now;
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

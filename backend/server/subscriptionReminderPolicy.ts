import {
  BILLING_PERIODS,
  SUBSCRIPTION_TIERS,
  getSubscriptionAmount,
  isFreePlan,
  parseSubscriptionPlan,
  type BillingPeriod,
  type BuiltInSubscriptionTier,
  type DynamicSubscriptionPlan,
} from '../../shared/landlordSubscription.ts';
import type {EmailContent} from './services/email.ts';

export type SubscriptionReminderMilestone = '7_days' | '2_days' | 'due_today' | 'expired';

/** Pure milestone selector for automated daily renewal reminders. */
export const classifySubscriptionReminderMilestone = (daysLeft: number): SubscriptionReminderMilestone | null => {
  if (daysLeft === 7) return '7_days';
  if (daysLeft === 2) return '2_days';
  if (daysLeft === 0) return 'due_today';
  if (daysLeft === -1 || daysLeft === -3 || daysLeft === -7) return 'expired';
  return null;
};

/** Classifies whether a paying subscriber is a Property Manager (Pro Plus / agency) or Landlord. */
export const subscriberAccountType = (user: {
  role?: string | null;
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
  subscriptionPlan?: string | null;
}): 'property_manager' | 'landlord' => {
  const parsed = parseSubscriptionPlan(user.subscriptionPlan ?? null);
  if (parsed?.tier === 'proplus' || (user.role === 'admin' && !user.isSuperAdmin)) {
    return 'property_manager';
  }
  return 'landlord';
};

export const formatSubscriptionPlanLabel = (
  planKey?: string | null,
  plans?: DynamicSubscriptionPlan[],
): string => {
  if (!planKey) return 'No plan';
  if (isFreePlan(planKey)) return 'Free';
  const parsed = parseSubscriptionPlan(planKey);
  if (!parsed) return planKey;
  const customLabel = plans?.find((p) => p.id === parsed.tier)?.label;
  const tierLabel = customLabel || SUBSCRIPTION_TIERS[parsed.tier as BuiltInSubscriptionTier]?.label || parsed.tier;
  const billingLabel = BILLING_PERIODS.find((b) => b.id === (parsed.billing as BillingPeriod))?.label ?? parsed.billing;
  return `${tierLabel} (${billingLabel})`;
};

export const buildSubscriptionReminderContent = (input: {
  displayName: string;
  accountType: 'property_manager' | 'landlord';
  planKey: string;
  expiryDate: Date;
  daysLeft: number;
  portalUrl?: string;
}): {title: string; subject: string; message: string; template: EmailContent} => {
  const parsed = parseSubscriptionPlan(input.planKey);
  const label = formatSubscriptionPlanLabel(input.planKey);
  const renewalAmount = parsed ? getSubscriptionAmount(parsed.tier, parsed.billing) : null;
  const formattedAmount = renewalAmount ? `KES ${renewalAmount.toLocaleString('en-KE')}` : null;
  const expiryStr = input.expiryDate.toLocaleDateString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
  const roleTitle = input.accountType === 'property_manager' ? 'Property Manager' : 'Landlord';

  let title: string;
  let paragraph: string;
  if (input.daysLeft < 0) {
    title = 'MyBoma subscription expired';
    paragraph = `Your ${label} (${roleTitle}) plan expired on ${expiryStr}. Renew your subscription on MyBoma to restore full access to your units, tenants, and automated reminders.`;
  } else if (input.daysLeft === 0) {
    title = 'MyBoma subscription expires today';
    paragraph = `Your ${label} (${roleTitle}) plan expires today (${expiryStr}). Renew now so your portfolio tools and rent tracking stay uninterrupted.`;
  } else if (input.daysLeft === 1) {
    title = 'MyBoma subscription expires tomorrow';
    paragraph = `Friendly reminder: your ${label} (${roleTitle}) plan expires tomorrow (${expiryStr}). Renew before then to avoid any interruption.`;
  } else {
    title = `MyBoma subscription due in ${input.daysLeft} days`;
    paragraph = `Friendly reminder: your ${label} (${roleTitle}) plan is due for renewal in ${input.daysLeft} days (${expiryStr}). Plans are prepaid and never auto-charge.`;
  }

  const details: Array<[string, string]> = [
    ['Account', `${input.displayName} (${roleTitle})`],
    ['Plan', label],
    ...(formattedAmount ? [['Renewal amount', formattedAmount] as [string, string]] : []),
    [input.daysLeft < 0 ? 'Expired on' : 'Expires on', expiryStr],
  ];

  return {
    title,
    subject: `${title} — ${label}`,
    message: formattedAmount ? `${paragraph} Renewal amount: ${formattedAmount}.` : paragraph,
    template: {
      preheader: `${label} ${input.daysLeft < 0 ? 'expired' : 'expires'} ${expiryStr}.`,
      heading: title,
      paragraphs: [paragraph],
      details,
      button: {label: 'Renew subscription', url: input.portalUrl || 'https://myboma.org'},
      footerNote: 'Sent because you have a MyBoma landlord or property manager subscription.',
    },
  };
};

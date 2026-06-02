import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faCheck, faCreditCard, faMobileAlt } from '@fortawesome/free-solid-svg-icons';
import {
  SUBSCRIPTION_TIERS,
  BILLING_PERIODS,
  getSubscriptionAmount,
  formatPlanPrice,
  type SubscriptionTier,
  type BillingPeriod,
} from '../lib/landlordSubscription';
import { useState } from 'react';

interface LandlordPricingSectionProps {
  onGetStarted?: (tier: SubscriptionTier, billing: BillingPeriod) => void;
}

export default function LandlordPricingSection({ onGetStarted }: LandlordPricingSectionProps) {
  const [billing, setBilling] = useState<BillingPeriod>('monthly');

  return (
    <section
      id="landlord-plans"
      className="relative overflow-hidden border-y border-indigo-100 bg-gradient-to-b from-indigo-50/80 via-white to-white py-14 sm:py-20"
    >
      <div className="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-purple-200/30 blur-3xl" />
      <div className="container relative mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-600/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">
            <FontAwesomeIcon icon={faBuilding} className="h-3 w-3" />
            Landlords &amp; Property Managers
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-zinc-900 sm:text-4xl">
            Plans that scale with your portfolio
          </h2>
          <p className="mt-3 text-sm font-medium text-zinc-600 sm:text-base">
            Pay securely by card or M-Pesa STK push. Your bank and M-Pesa settlement details stay private — only used
            for rent you receive from tenants.
          </p>
          <div className="mt-4 inline-flex rounded-full border border-zinc-200 bg-white p-1">
            {BILLING_PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setBilling(period.id)}
                className={`rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${
                  billing === period.id ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]).map((tierId) => {
            const tier = SUBSCRIPTION_TIERS[tierId];
            const amount = getSubscriptionAmount(tierId, billing);
            const isFeatured = tierId === 'growth';

            return (
              <article
                key={tierId}
                className={`relative flex flex-col rounded-3xl border bg-white p-6 shadow-[0_12px_40px_rgba(79,70,229,0.06)] ${
                  isFeatured ? 'border-indigo-300 ring-2 ring-indigo-500/15' : 'border-zinc-100'
                }`}
              >
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                    Most popular
                  </span>
                )}
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">{tier.label}</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-zinc-900">{formatPlanPrice(amount)}</p>
                <p className="text-xs font-bold text-zinc-500">{tier.tagline}</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {tier.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs font-medium text-zinc-600">
                      <FontAwesomeIcon icon={faCheck} className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onGetStarted?.(tierId, billing)}
                  className={`mt-6 w-full rounded-2xl py-3 text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
                    isFeatured
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500'
                      : 'bg-zinc-900 text-white hover:bg-zinc-800'
                  }`}
                >
                  Get {tier.label}
                </button>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-7 max-w-2xl rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-center text-[11px] font-medium leading-5 text-indigo-900">
          Clear billing: plans are prepaid for the selected coverage period and do not auto-renew. You will not be
          charged again unless you actively authorize a new payment. Stop at any time by not renewing.
        </p>

        <div className="mx-auto mt-8 flex max-w-md flex-wrap items-center justify-center gap-4 text-[11px] font-bold text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <FontAwesomeIcon icon={faCreditCard} className="text-indigo-500" />
            Visa / Mastercard
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FontAwesomeIcon icon={faMobileAlt} className="text-emerald-600" />
            M-Pesa STK Push
          </span>
        </div>
      </div>
    </section>
  );
}

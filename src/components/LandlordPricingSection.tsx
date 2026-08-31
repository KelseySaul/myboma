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
      className="relative overflow-hidden border-y border-slate-200 bg-slate-50/60 py-14 sm:py-20"
    >
      <div className="container relative mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">
            <FontAwesomeIcon icon={faBuilding} className="h-3 w-3" />
            Landlords &amp; Property Managers
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Plans that scale with your portfolio
          </h2>
          <p className="mt-3 text-sm font-normal text-slate-600 sm:text-base">
            Pay securely by card or M-Pesa STK push. Your bank and M-Pesa settlement details stay private — only used
            for rent you receive from tenants.
          </p>
          <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            {BILLING_PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setBilling(period.id)}
                className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                  billing === period.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]).map((tierId) => {
            const tier = SUBSCRIPTION_TIERS[tierId];
            const amount = getSubscriptionAmount(tierId, billing);
            const isFeatured = tierId === 'pro';
            const isProPlus = tierId === 'proplus';

            return (
              <article
                key={tierId}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                  isFeatured ? 'border-indigo-500/50 bg-white ring-2 ring-indigo-500/15 shadow-md' : 
                  isProPlus ? 'border-slate-800 bg-slate-900 text-white shadow-xl' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-xs">
                    Most popular
                  </span>
                )}
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isProPlus ? 'text-slate-300' : 'text-slate-500'}`}>{tier.label}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <p className={`text-3xl font-black tabular-nums ${isProPlus ? 'text-white' : 'text-slate-900'}`}>{formatPlanPrice(amount)}</p>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${isProPlus ? 'text-indigo-200 bg-indigo-950/80' : 'text-indigo-700 bg-indigo-50'}`}>Prepaid</span>
                </div>
                <p className={`text-xs font-medium mt-1 ${isProPlus ? 'text-slate-400' : 'text-slate-500'}`}>{tier.tagline}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {tier.highlights.map((item) => (
                    <li key={item} className={`flex items-start gap-2 text-xs font-normal ${isProPlus ? 'text-slate-300' : 'text-slate-600'}`}>
                      <FontAwesomeIcon icon={faCheck} className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onGetStarted?.(tierId, billing)}
                  className={`mt-6 w-full rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer ${
                    isFeatured
                      ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500'
                      : isProPlus
                      ? 'bg-white text-slate-950 hover:bg-slate-100 shadow-sm'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  Get {tier.label}
                </button>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-7 max-w-2xl rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-center text-[11px] font-normal leading-5 text-indigo-900">
          Clear billing: plans are prepaid for the selected coverage period and do not auto-renew. You will not be
          charged again unless you actively authorize a new payment. Stop at any time by not renewing.
        </p>

        <div className="mx-auto mt-8 flex max-w-md flex-wrap items-center justify-center gap-5 text-xs font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <FontAwesomeIcon icon={faCreditCard} className="text-indigo-600" />
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

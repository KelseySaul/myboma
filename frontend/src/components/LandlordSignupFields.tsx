import { Banknote, Building, Check, Smartphone } from 'lucide-react';
import {
  SUBSCRIPTION_TIERS,
  BILLING_PERIODS,
  getSubscriptionAmount,
  formatPlanPrice,
  type PendingLandlordSubscription,
  type RentPayoutMethod,
  type SubscriptionTier,
  type BillingPeriod,
} from '../../../shared/landlordSubscription';
import { Field, inputClass } from './auth/fields';

export type LandlordSignupFormState = PendingLandlordSubscription;

interface LandlordSignupFieldsProps {
  value: LandlordSignupFormState;
  onChange: (next: LandlordSignupFormState) => void;
  showPayment?: boolean;
  paymentSlot?: React.ReactNode;
}

export const defaultLandlordSignupState = (): LandlordSignupFormState => ({
  tier: 'free',
  billing: 'monthly',
  rentPayoutMethod: 'cash',
  mpesaSettlementPhone: '',
  bankName: '',
  bankAccountNumber: '',
  bankAccountName: '',
  cashPayoutNotes: '',
});

const PERIOD_SHORT: Record<BillingPeriod, string> = { monthly: 'month', quarterly: '3 months', yearly: 'year' };
const BILLING_LABELS: Record<BillingPeriod, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

const PAYOUT_METHODS: { id: RentPayoutMethod; label: string; icon: typeof Banknote }[] = [
  { id: 'mpesa', label: 'M-Pesa', icon: Smartphone },
  { id: 'bank', label: 'Bank', icon: Building },
  { id: 'cash', label: 'Cash', icon: Banknote },
];

/** Plan choice and rent payout details, used in sign-up and on the subscription screen. */
export default function LandlordSignupFields({ value, onChange, showPayment = false, paymentSlot }: LandlordSignupFieldsProps) {
  const patch = (partial: Partial<LandlordSignupFormState>) => onChange({ ...value, ...partial });
  const isFree = value.tier === 'free';
  const tiers = (Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]).filter((id) => id !== 'basic');

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-950 dark:text-white">Plan</legend>
        <p className="mt-0.5 text-xs text-zinc-500">You can change plans later.</p>

        <div role="radiogroup" aria-label="Plan" className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700">
          {tiers.map((tierId, index) => {
            const tier = SUBSCRIPTION_TIERS[tierId];
            const selected = value.tier === tierId;
            const price = tierId === 'free' ? 'Free' : `${formatPlanPrice(getSubscriptionAmount(tierId, value.billing))}`;
            return (
              <button
                key={tierId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => patch({ tier: tierId })}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${index ? 'border-t border-zinc-200 dark:border-zinc-700' : ''} ${
                  selected ? 'bg-zinc-50 dark:bg-zinc-800' : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-800/60'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-zinc-950 bg-zinc-950 dark:border-white dark:bg-white' : 'border-zinc-300'
                  }`}
                >
                  {selected && <Check className="h-3 w-3 text-white dark:text-zinc-950" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-zinc-950 dark:text-white">{tier.label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                      {price}
                      {tierId !== 'free' && <span className="font-normal text-zinc-500"> / {PERIOD_SHORT[value.billing]}</span>}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{tier.highlights.join(' · ')}</span>
                </span>
              </button>
            );
          })}
        </div>

        {isFree ? (
          <p className="mt-3 text-xs text-zinc-500">No payment needed. One house unit, free for as long as you use it.</p>
        ) : (
          <div className="mt-3">
            <div role="radiogroup" aria-label="Billing period" className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
              {BILLING_PERIODS.map((period) => {
                const selected = value.billing === period.id;
                return (
                  <button
                    key={period.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patch({ billing: period.id })}
                    className={`h-9 rounded-lg text-xs font-semibold transition ${
                      selected ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 hover:text-zinc-950'
                    }`}
                  >
                    {BILLING_LABELS[period.id]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Prepaid, {formatPlanPrice(getSubscriptionAmount(value.tier, value.billing))} for {PERIOD_SHORT[value.billing]}. It does not renew
              automatically. You pay by card or M-Pesa after creating your account.
            </p>
          </div>
        )}
      </fieldset>

      {showPayment && paymentSlot}

      <fieldset>
        <legend className="text-sm font-semibold text-zinc-950 dark:text-white">How do you receive rent?</legend>
        <p className="mt-0.5 text-xs text-zinc-500">Only used to send you your tenants' rent. Never shown to tenants.</p>

        <div role="radiogroup" aria-label="Rent payout method" className="mt-3 grid grid-cols-3 gap-2">
          {PAYOUT_METHODS.map(({ id, label, icon: Icon }) => {
            const selected = value.rentPayoutMethod === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => patch({ rentPayoutMethod: id })}
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition ${
                  selected
                    ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                    : 'border-zinc-200 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        {value.rentPayoutMethod === 'mpesa' && (
          <div className="mt-4">
            <Field id="mpesaSettlementPhone" label="M-Pesa number">
              <input
                id="mpesaSettlementPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={value.mpesaSettlementPhone || ''}
                onChange={(e) => patch({ mpesaSettlementPhone: e.target.value })}
                placeholder="07XX XXX XXX"
                className={inputClass()}
                required
              />
            </Field>
          </div>
        )}

        {value.rentPayoutMethod === 'bank' && (
          <div className="mt-4 grid gap-3">
            <Field id="bankName" label="Bank">
              <input id="bankName" value={value.bankName || ''} onChange={(e) => patch({ bankName: e.target.value })} placeholder="e.g. Equity Bank" className={inputClass()} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="bankAccountNumber" label="Account number">
                <input
                  id="bankAccountNumber"
                  inputMode="numeric"
                  value={value.bankAccountNumber || ''}
                  onChange={(e) => patch({ bankAccountNumber: e.target.value })}
                  className={inputClass()}
                  required
                />
              </Field>
              <Field id="bankAccountName" label="Account name">
                <input id="bankAccountName" value={value.bankAccountName || ''} onChange={(e) => patch({ bankAccountName: e.target.value })} className={inputClass()} required />
              </Field>
            </div>
          </div>
        )}

        {value.rentPayoutMethod === 'cash' && (
          <div className="mt-4">
            <Field id="cashPayoutNotes" label="Where do tenants pay?" hint="Optional">
              <input
                id="cashPayoutNotes"
                value={value.cashPayoutNotes || ''}
                onChange={(e) => patch({ cashPayoutNotes: e.target.value })}
                placeholder="e.g. At the site office"
                className={inputClass()}
              />
            </Field>
          </div>
        )}
      </fieldset>
    </div>
  );
}

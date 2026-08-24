import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMobileAlt, faUniversity, faMoneyBillWave } from '@fortawesome/free-solid-svg-icons';
import {
  SUBSCRIPTION_TIERS,
  BILLING_PERIODS,
  getSubscriptionAmount,
  formatPlanPrice,
  type PendingLandlordSubscription,
  type RentPayoutMethod,
  type SubscriptionTier,
  type BillingPeriod,
} from '../lib/landlordSubscription';

export type LandlordSignupFormState = PendingLandlordSubscription;

interface LandlordSignupFieldsProps {
  value: LandlordSignupFormState;
  onChange: (next: LandlordSignupFormState) => void;
  showPayment?: boolean;
  paymentSlot?: React.ReactNode;
}

export const defaultLandlordSignupState = (): LandlordSignupFormState => ({
  tier: 'starter',
  billing: 'monthly',
  rentPayoutMethod: 'cash',
  mpesaSettlementPhone: '',
  bankName: '',
  bankAccountNumber: '',
  bankAccountName: '',
  cashPayoutNotes: '',
});

export default function LandlordSignupFields({
  value,
  onChange,
  showPayment = false,
  paymentSlot,
}: LandlordSignupFieldsProps) {
  const patch = (partial: Partial<LandlordSignupFormState>) => onChange({ ...value, ...partial });
  const amount = getSubscriptionAmount(value.tier, value.billing);
  const tierMeta = SUBSCRIPTION_TIERS[value.tier];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
        <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
          Choose your plan
        </Label>
        <div className="mt-3 grid gap-2">
          {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[])
            .filter((tierId) => tierId !== 'basic')
            .map((tierId) => {
            const tier = SUBSCRIPTION_TIERS[tierId];
            const tierAmount = getSubscriptionAmount(tierId, value.billing);
            const periodLabel = value.billing === 'monthly' ? 'mo' : value.billing === 'quarterly' ? '3 mos' : 'yr';
            const isProPlus = tierId === 'proplus';
            const isSelected = value.tier === tierId;

            let stateClasses = '';
            if (isProPlus) {
              stateClasses = isSelected
                ? 'border-amber-400 bg-zinc-900 shadow-sm'
                : 'border-transparent bg-zinc-800 hover:border-amber-400/50';
            } else {
              stateClasses = isSelected
                ? 'border-indigo-500 bg-white shadow-sm'
                : 'border-transparent bg-white/60 hover:border-indigo-200';
            }

            return (
              <button
                key={tierId}
                type="button"
                onClick={() => patch({ tier: tierId })}
                className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${stateClasses}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-black ${isProPlus ? 'text-white' : 'text-zinc-900'}`}>{tier.label}</span>
                  <span className={`text-[10px] font-black ${isProPlus ? 'text-amber-400' : 'text-indigo-600'}`}>
                    {formatPlanPrice(tierAmount)}/{periodLabel}
                  </span>
                </div>
                <p className={`mt-0.5 text-[10px] font-medium ${isProPlus ? 'text-zinc-400' : 'text-zinc-500'}`}>{tier.tagline}</p>
                <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  {tier.highlights.map((h) => (
                    <li key={h} className={`text-[9px] font-bold ${isProPlus ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      · {h}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          {BILLING_PERIODS.map((period) => (
            <button
              key={period.id}
              type="button"
              onClick={() => patch({ billing: period.id as BillingPeriod })}
              className={`flex-1 rounded-lg border-2 py-2 text-center transition-all ${
                value.billing === period.id
                  ? 'border-indigo-500 bg-white'
                  : 'border-transparent bg-white/50'
              }`}
            >
              <p className="text-[9px] font-black uppercase text-zinc-500">{period.label}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-sm font-black text-zinc-900">
          Total due: {formatPlanPrice(amount)}
        </p>
      </div>

      {showPayment && paymentSlot}

      <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">
          How should tenants pay you rent?
        </Label>
        <RadioGroup
          value={value.rentPayoutMethod}
          onValueChange={(v) => patch({ rentPayoutMethod: v as RentPayoutMethod })}
          className="mt-3 grid grid-cols-3 gap-2"
        >
          {(
            [
              { id: 'cash', label: 'Cash', icon: faMoneyBillWave },
              { id: 'mpesa', label: 'M-Pesa', icon: faMobileAlt },
              { id: 'bank', label: 'Bank', icon: faUniversity },
            ] as const
          ).map((method) => (
            <div key={method.id}>
              <RadioGroupItem value={method.id} id={`rent-${method.id}`} className="sr-only" />
              <Label
                htmlFor={`rent-${method.id}`}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-2 ${
                  value.rentPayoutMethod === method.id
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-zinc-200'
                }`}
              >
                <FontAwesomeIcon icon={method.icon} className="h-3.5 w-3.5 text-zinc-600" />
                <span className="text-[9px] font-black uppercase">{method.label}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        {value.rentPayoutMethod === 'mpesa' && (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="mpesaSettlementPhone" className="text-xs font-bold">
              Your M-Pesa number (tenants pay you here)
            </Label>
            <Input
              id="mpesaSettlementPhone"
              value={value.mpesaSettlementPhone || ''}
              onChange={(e) => patch({ mpesaSettlementPhone: e.target.value })}
              placeholder="07XX XXX XXX"
              className="h-10 rounded-xl text-sm"
              required
            />
          </div>
        )}

        {value.rentPayoutMethod === 'bank' && (
          <div className="mt-3 grid gap-2">
            <Input
              value={value.bankName || ''}
              onChange={(e) => patch({ bankName: e.target.value })}
              placeholder="Bank name"
              className="h-10 rounded-xl text-sm"
              required
            />
            <Input
              value={value.bankAccountNumber || ''}
              onChange={(e) => patch({ bankAccountNumber: e.target.value })}
              placeholder="Account number"
              className="h-10 rounded-xl text-sm"
              required
            />
            <Input
              value={value.bankAccountName || ''}
              onChange={(e) => patch({ bankAccountName: e.target.value })}
              placeholder="Account holder name"
              className="h-10 rounded-xl text-sm"
              required
            />
          </div>
        )}

        {value.rentPayoutMethod === 'cash' && (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="cashPayoutNotes" className="text-xs font-bold">
              Cash collection notes (optional)
            </Label>
            <Input
              id="cashPayoutNotes"
              value={value.cashPayoutNotes || ''}
              onChange={(e) => patch({ cashPayoutNotes: e.target.value })}
              placeholder="e.g. Collect at site office"
              className="h-10 rounded-xl text-sm"
            />
          </div>
        )}
      </div>

      {!tierMeta.features.maintenanceHub && (
        <p className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
          {tierMeta.label} does not include the maintenance hub. Upgrade to Growth or Pro later for maintenance
          tickets.
        </p>
      )}
    </div>
  );
}

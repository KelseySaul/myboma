import { useState } from 'react';
import LandlordPricingSection from './LandlordPricingSection';
import LandlordSignupFields, { defaultLandlordSignupState } from './LandlordSignupFields';
import LandlordSubscriptionPay from './LandlordSubscriptionPay';
import {
  PENDING_LANDLORD_SUBSCRIPTION_KEY,
  type PendingLandlordSubscription,
  type SubscriptionTier,
  type BillingPeriod,
} from '../lib/landlordSubscription';

interface LandlordSubscriptionGateProps {
  email: string;
  phone?: string;
  onActivated: () => void;
}

export default function LandlordSubscriptionGate({ email, phone, onActivated }: LandlordSubscriptionGateProps) {
  const [form, setForm] = useState<PendingLandlordSubscription>(() => {
    try {
      const raw = localStorage.getItem(PENDING_LANDLORD_SUBSCRIPTION_KEY);
      if (raw) return { ...defaultLandlordSignupState(), ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return { ...defaultLandlordSignupState(), tier: 'test' };
  });

  return (
    <div className="min-h-[60vh] bg-[#f8f9fa]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
          <h2 className="text-xl font-black text-zinc-900">Complete your subscription</h2>
          <p className="mt-2 text-sm font-medium text-zinc-600">
            Signed in as <span className="font-bold text-zinc-900">{email}</span>. Choose a plan and pay with card or
            M-Pesa to unlock your dashboard.
          </p>
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
          <LandlordSignupFields
            value={form}
            onChange={setForm}
            showPayment
            paymentSlot={
              <LandlordSubscriptionPay payload={form} phone={phone} onSuccess={onActivated} />
            }
          />
        </div>
      </div>

      <LandlordPricingSection
        onGetStarted={(tier: SubscriptionTier, billing: BillingPeriod) => {
          setForm((prev) => ({ ...prev, tier, billing }));
          document.getElementById('landlord-plans')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
    </div>
  );
}

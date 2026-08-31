import { useState } from 'react';
import { toast } from 'sonner';
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
  onActivated: () => Promise<void> | void;
}

export default function LandlordSubscriptionGate({ email, phone, onActivated }: LandlordSubscriptionGateProps) {
  const params = new URLSearchParams(window.location.search);
  const isProcessing = params.get('subscription_payment') === 'success' || params.get('subscription_payment') === 'processing';
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onActivated();
      toast.success('Profile synced with server');
    } catch (err) {
      toast.error('Failed to sync profile');
    } finally {
      setTimeout(() => setIsSyncing(false), 1000);
    }
  };

  const [form, setForm] = useState<PendingLandlordSubscription>(() => {
    try {
      const raw = localStorage.getItem(PENDING_LANDLORD_SUBSCRIPTION_KEY);
      if (raw) return { ...defaultLandlordSignupState(), ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return { ...defaultLandlordSignupState(), tier: 'starter', mpesaSettlementPhone: phone || '' };
  });

  if (isProcessing) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4 px-6">
          <div className="h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold uppercase tracking-wider text-slate-900">Activating your plan...</p>
          <p className="text-xs font-normal text-slate-500">We've received your payment. One moment please.</p>
          
          <div className="pt-4">
             <button 
               onClick={handleSync}
               disabled={isSyncing}
               className="text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-500 underline underline-offset-4 disabled:opacity-50 cursor-pointer"
             >
               {isSyncing ? 'Syncing...' : 'Refresh status manually'}
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-center shadow-xs">
          <h2 className="text-xl font-bold text-slate-900">Complete your subscription</h2>
          <p className="mt-2 text-sm font-normal text-slate-600">
            Signed in as <span className="font-semibold text-slate-900">{email}</span>. Choose a plan and pay with card or
            M-Pesa to unlock your dashboard.
          </p>
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSyncing ? 'Syncing profile...' : 'Already paid? Tap here to sync'}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
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
    </div>
  );
}

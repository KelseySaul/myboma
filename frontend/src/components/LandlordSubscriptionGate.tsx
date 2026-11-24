import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import LandlordSignupFields, { defaultLandlordSignupState } from './LandlordSignupFields';
import LandlordSubscriptionPay from './LandlordSubscriptionPay';
import { activateFreeLandlordPlan } from '../lib/api';
import {
  PENDING_LANDLORD_SUBSCRIPTION_KEY,
  type PendingLandlordSubscription,
  type SubscriptionTier,
  type BillingPeriod,
} from '../../../shared/landlordSubscription';

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
    return { ...defaultLandlordSignupState(), mpesaSettlementPhone: phone || '' };
  });
  const [activatingFree, setActivatingFree] = useState(false);

  const handleActivateFree = async () => {
    setActivatingFree(true);
    try {
      const result = await activateFreeLandlordPlan({
        rentPayoutMethod: form.rentPayoutMethod,
        mpesaSettlementPhone: form.mpesaSettlementPhone,
        bankName: form.bankName,
        bankAccountNumber: form.bankAccountNumber,
        bankAccountName: form.bankAccountName,
        cashPayoutNotes: form.cashPayoutNotes,
      });
      localStorage.removeItem(PENDING_LANDLORD_SUBSCRIPTION_KEY);
      if (result.activated) toast.success('Your free plan is active.');
      else if (result.reason === 'tenant_account') toast.error('Tenant accounts cannot list property. Sign up with a separate email to become a landlord.');
      else toast.success('You already have an active plan.');
      await onActivated();
    } catch (err: any) {
      toast.error(err.message || 'Could not activate the free plan.');
    } finally {
      setActivatingFree(false);
    }
  };

  if (isProcessing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-950" />
          <h2 className="mt-5 text-lg font-semibold text-zinc-950">Activating your plan</h2>
          <p className="mt-1 text-sm text-zinc-500">We've received your payment. This usually takes a few seconds.</p>
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="mt-5 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 disabled:opacity-50"
          >
            {isSyncing ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">Choose a plan to start</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Signed in as <span className="font-medium text-zinc-950">{email}</span>. Start free with one house, or pick a paid plan
          for more units. Paid plans are prepaid and don't renew automatically.
        </p>

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-5 sm:p-7">
          <LandlordSignupFields
            value={form}
            onChange={setForm}
            showPayment
            paymentSlot={
              form.tier === 'free' ? (
                <button
                  type="button"
                  onClick={handleActivateFree}
                  disabled={activatingFree}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 text-[15px] font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
                >
                  {activatingFree && <Loader2 className="h-4 w-4 animate-spin" />}
                  Start with the free plan
                </button>
              ) : (
                <LandlordSubscriptionPay payload={form} phone={phone} onSuccess={onActivated} />
              )
            }
          />
        </div>

        <p className="mt-5 text-center text-sm text-zinc-500">
          Already paid?{' '}
          <button type="button" onClick={handleSync} disabled={isSyncing} className="font-medium text-zinc-950 underline underline-offset-4 disabled:opacity-50">
            {isSyncing ? 'Checking…' : 'Check payment status'}
          </button>
        </p>
      </div>
    </div>
  );
}

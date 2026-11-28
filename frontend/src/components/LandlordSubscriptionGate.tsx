import { useState } from 'react';
import { Loader2, Lock, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import LandlordSignupFields, { defaultLandlordSignupState } from './LandlordSignupFields';
import LandlordSubscriptionPay from './LandlordSubscriptionPay';
import { activateFreeLandlordPlan } from '../lib/api';
import { tenantConfig } from '../config/tenant';
import { signOut } from './AccountMenu';
import {
  PENDING_LANDLORD_SUBSCRIPTION_KEY,
  type PendingLandlordSubscription,
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
    } catch {
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
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const validatePayout = (): string | null => {
    if (form.rentPayoutMethod === 'mpesa' && !form.mpesaSettlementPhone?.trim()) {
      return 'Enter the M-Pesa phone number where you receive rent.';
    }
    if (
      form.rentPayoutMethod === 'bank' &&
      (!form.bankName?.trim() || !form.bankAccountNumber?.trim() || !form.bankAccountName?.trim())
    ) {
      return 'Complete your bank name, account number, and account holder name.';
    }
    return null;
  };

  const handleActivateFree = async () => {
    const errMsg = validatePayout();
    setPayoutError(errMsg);
    if (errMsg) return;
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
      if (result.activated) toast.success('Your free plan is active. Welcome to MyBoma.');
      else if (result.reason === 'tenant_account') toast.error('Tenant accounts cannot list property. Sign up with a separate email to become a landlord.');
      else toast.success('You already have an active plan.');
      await onActivated();
    } catch (err: any) {
      toast.error(err.message || 'Could not activate the free plan.');
    } finally {
      setActivatingFree(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F3F8] dark:bg-[#0F1016] flex flex-col">
      {/* Standalone top bar — no sidebar, tabs, or app navigation until a plan is completed */}
      <header className="w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#14151C]/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={tenantConfig.logoUrl} alt="" width="28" height="28" className="h-7 w-7 object-contain" />
            <span className="font-brand text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              {tenantConfig.appName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline">{email}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:py-12">
        {isProcessing ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="max-w-sm rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-950 dark:text-white" />
              <h2 className="mt-5 text-lg font-semibold text-zinc-950 dark:text-white">Activating your plan</h2>
              <p className="mt-1 text-sm text-zinc-500">We&apos;ve received your payment. Your dashboard will unlock in a few seconds.</p>
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="mt-5 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 disabled:opacity-50 dark:text-zinc-300"
              >
                {isSyncing ? 'Checking…' : 'Check again'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200">
              <Lock className="h-3 w-3" />
              Step 2 of 2 · Complete your plan to enter MyBoma
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
              Choose a plan to unlock your workspace
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Signed in as <span className="font-medium text-zinc-950 dark:text-white">{email}</span>. Activate the Free tier (up to 2 units, 1 building) or complete payment for a paid or Property Manager plan before accessing the app.
            </p>

            <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
              <LandlordSignupFields
                value={form}
                onChange={(next) => {
                  setPayoutError(null);
                  setForm(next);
                }}
                showPayment
                paymentSlot={
                  <div className="space-y-2">
                    {payoutError && (
                      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                        {payoutError}
                      </p>
                    )}
                    {form.tier === 'free' ? (
                      <button
                        type="button"
                        onClick={handleActivateFree}
                        disabled={activatingFree}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 text-[15px] font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        {activatingFree && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirm &amp; start free plan
                      </button>
                    ) : (
                      <LandlordSubscriptionPay payload={form} phone={phone} onSuccess={onActivated} />
                    )}
                  </div>
                }
              />
            </div>

            <p className="mt-5 text-center text-sm text-zinc-500">
              Already paid?{' '}
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="font-medium text-zinc-950 underline underline-offset-4 disabled:opacity-50 dark:text-white"
              >
                {isSyncing ? 'Checking…' : 'Check payment status'}
              </button>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

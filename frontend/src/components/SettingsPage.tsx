import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Bell, Camera, Check, Download, Eye, EyeOff, Loader2, LogOut, Receipt } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import {
  getMySubscriptionReceipts,
  getPlatformBranding,
  initPlatform,
  updateMyProfile,
  updatePlatformBranding,
  uploadFile,
  type MySubscriptionReceipt,
} from '../lib/api';
import { resolveMediaUrl } from '../lib/fileUrl';
import { clearQueryCache } from '../lib/queryClient';
import { promptForPush, type UserProfile } from '../App';
import {
  BILLING_PERIODS,
  formatPlanPrice,
  getSubscriptionAmount,
  parseSubscriptionPlan,
  SUBSCRIPTION_TIERS,
  type BillingPeriod,
  type PaidSubscriptionTier,
  type RentPayoutMethod,
} from '../../../shared/landlordSubscription';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LandlordSubscriptionPay from './LandlordSubscriptionPay';
import PhotoCaptureControl from './PhotoCaptureControl';

/** Profile columns the API returns that the shared UserProfile type doesn't list. */
type SettingsProfile = UserProfile & {
  mpesaSettlementPhone?: string | null;
  subscriptionPlan?: string | null;
};

const PHONE = /^\+?[\d\s]{9,16}$/;
const PAID_TIERS: PaidSubscriptionTier[] = ['basic', 'starter', 'pro', 'proplus'];

/* Shared bits ------------------------------------------------------------ */

function Section({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 sm:px-6">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
      </div>
      <div className="space-y-4 p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function SaveButton({ saving, saved, disabled, onClick, children }: { saving: boolean; saved?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button onClick={onClick} disabled={saving || disabled} className="h-10 px-5">
      {saving ? <Loader2 className="animate-spin" /> : saved ? <Check /> : null}
      {saving ? 'Saving…' : saved ? 'Saved' : children}
    </Button>
  );
}

function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2500);
  };
  return [saved, flash] as const;
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className="h-11 pr-11" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* Page ------------------------------------------------------------------- */

export default function SettingsPage({ profile: baseProfile }: { profile: UserProfile }) {
  const profile = baseProfile as SettingsProfile;
  const isLandlord = profile.role === 'landlord';
  const isPropertyManager = profile.role === 'admin' && !profile.isSuperAdmin && !profile.isAdmin;
  const hasSubscriptionPlan = isLandlord || isPropertyManager;
  const isPlatformAdmin = profile.role === 'admin';
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut({});
      clearQueryCache();
      toast.success('Signed out');
    } catch (error: any) {
      toast.error(error.message || 'Could not sign out.');
      setSigningOut(false);
    }
  };

  return (
    <div className="db w-full min-w-0 pb-24 animate-in fade-in duration-300 sm:pb-10">
      <header className="border-b border-[#221844]/[0.08] bg-white px-4 py-5 dark:border-white/[0.08] dark:bg-[#181922] sm:px-6 md:px-8">
        <h1 className="text-xl font-bold tracking-tight text-[#161426] dark:text-white sm:text-2xl md:text-3xl">Settings</h1>
        <p className="mt-1 text-xs text-[#5D5A73] dark:text-slate-400 sm:text-sm">Your profile, password and account preferences.</p>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-5 sm:px-6 md:px-8 lg:grid-cols-2 lg:items-start">
        <ProfileSection profile={profile} />
        <PasswordSection />
        {hasSubscriptionPlan && <PayoutSection profile={profile} />}
        {hasSubscriptionPlan && <PlanSection profile={profile} />}
        <PreferencesSection profile={profile} />
        {isPlatformAdmin && <BrandingSection profile={profile} />}

        <Section title="Sign out" description={`Signed in as ${profile.email}`} className="lg:col-span-2">
          <Button variant="outline" onClick={signOut} disabled={signingOut} className="h-10">
            {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out
          </Button>
        </Section>
      </div>
    </div>
  );
}

/* Profile ---------------------------------------------------------------- */

function ProfileSection({ profile }: { profile: SettingsProfile }) {
  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    phone: profile.phone || '',
    address: profile.address || '',
    avatarUrl: profile.avatarUrl || '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, flash] = useSavedFlash();

  const nameError = form.displayName.trim().length < 2 ? 'Enter your name.' : '';
  const phoneError = form.phone.trim() && !PHONE.test(form.phone.trim()) ? 'Use digits only, e.g. 0712 345 678.' : '';
  const initials = (form.displayName || profile.email).trim().slice(0, 1).toUpperCase();

  const uploadAvatarFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('That image is too large. Choose one under 8 MB.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadFile(file, file.name, 'avatar');
      await updateMyProfile({ avatarUrl: url });
      setForm((prev) => ({ ...prev, avatarUrl: url }));
      toast.success('Photo updated');
    } catch (error: any) {
      toast.error(error.message || 'Could not upload the photo.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (nameError || phoneError) return;
    setSaving(true);
    try {
      await updateMyProfile({
        displayName: form.displayName.trim(),
        phone: form.phone.replace(/\s/g, '') || null,
        address: form.address.trim() || null,
      });
      flash();
      toast.success('Profile saved');
    } catch (error: any) {
      toast.error(error.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Profile" description="How you appear to landlords, tenants and our team.">
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-violet-50 ring-1 ring-violet-200/70 dark:bg-violet-500/15 dark:ring-violet-500/20">
          {form.avatarUrl ? (
            <img src={resolveMediaUrl(form.avatarUrl)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl font-bold text-violet-700 dark:text-violet-300">{initials}</span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <PhotoCaptureControl
            defaultFacingMode="user"
            uploading={uploading}
            uploadLabel={form.avatarUrl ? 'Upload photo' : 'Upload photo'}
            captureLabel="Take photo"
            onFiles={uploadAvatarFile}
          />
          <p className="mt-1.5 text-xs text-zinc-500">JPG, PNG or WebP, up to 8 MB.</p>
        </div>
      </div>

      <Field label="Full name" htmlFor="settings-name" error={nameError}>
        <Input id="settings-name" value={form.displayName} maxLength={120} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} className="h-11" />
      </Field>
      <Field label="Email" htmlFor="settings-email" hint="Contact support to change the email you sign in with.">
        <Input id="settings-email" value={profile.email} disabled className="h-11" />
      </Field>
      <Field label="Phone number" htmlFor="settings-phone" error={phoneError}>
        <Input
          id="settings-phone"
          inputMode="tel"
          value={form.phone}
          maxLength={20}
          placeholder="0712 345 678"
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          className="h-11"
        />
      </Field>
      <Field label="Address" htmlFor="settings-address">
        <Textarea
          id="settings-address"
          value={form.address}
          maxLength={280}
          rows={2}
          placeholder="Building, street, town"
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
        />
      </Field>
      <SaveButton saving={saving} saved={saved} disabled={Boolean(nameError || phoneError)} onClick={save}>
        Save profile
      </SaveButton>
    </Section>
  );
}

/* Password --------------------------------------------------------------- */

function PasswordSection() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [saved, flash] = useSavedFlash();

  const tooShort = form.next.length > 0 && form.next.length < 8;
  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const ready = form.current && form.next.length >= 8 && form.next === form.confirm;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      const { error } = await authClient.changePassword({ currentPassword: form.current, newPassword: form.next });
      if (error) throw new Error(error.message || 'Your current password is not correct.');
      setForm({ current: '', next: '', confirm: '' });
      flash();
      toast.success('Password changed');
    } catch (error: any) {
      toast.error(error.message || 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Password" description="Use at least 8 characters.">
      <Field label="Current password" htmlFor="pw-current">
        <PasswordInput id="pw-current" value={form.current} autoComplete="current-password" onChange={(v) => setForm((p) => ({ ...p, current: v }))} />
      </Field>
      <Field label="New password" htmlFor="pw-new" error={tooShort ? 'At least 8 characters.' : undefined}>
        <PasswordInput id="pw-new" value={form.next} autoComplete="new-password" onChange={(v) => setForm((p) => ({ ...p, next: v }))} />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-confirm" error={mismatch ? 'The passwords do not match.' : undefined}>
        <PasswordInput id="pw-confirm" value={form.confirm} autoComplete="new-password" onChange={(v) => setForm((p) => ({ ...p, confirm: v }))} />
      </Field>
      <SaveButton saving={saving} saved={saved} disabled={!ready} onClick={save}>
        Change password
      </SaveButton>
    </Section>
  );
}

/* Landlord payout -------------------------------------------------------- */

function PayoutSection({ profile }: { profile: SettingsProfile }) {
  const [method, setMethod] = useState<RentPayoutMethod>(profile.rentPayoutMethod || 'mpesa');
  const [form, setForm] = useState({
    mpesaSettlementPhone: profile.mpesaSettlementPhone || '',
    bankName: profile.bankName || '',
    bankAccountName: profile.bankAccountName || '',
    bankAccountNumber: profile.bankAccountNumber || '',
    cashPayoutNotes: profile.cashPayoutNotes || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, flash] = useSavedFlash();

  const error =
    method === 'mpesa' && !PHONE.test(form.mpesaSettlementPhone.trim())
      ? 'Enter the M-Pesa number that receives rent.'
      : method === 'bank' && (!form.bankName.trim() || !form.bankAccountName.trim() || !form.bankAccountNumber.trim())
        ? 'Fill in the bank name, account name and account number.'
        : '';

  const save = async () => {
    if (error) return;
    setSaving(true);
    try {
      await updateMyProfile({
        rentPayoutMethod: method,
        mpesaSettlementPhone: method === 'mpesa' ? form.mpesaSettlementPhone.replace(/\s/g, '') : null,
        bankName: method === 'bank' ? form.bankName.trim() : null,
        bankAccountName: method === 'bank' ? form.bankAccountName.trim() : null,
        bankAccountNumber: method === 'bank' ? form.bankAccountNumber.trim() : null,
        cashPayoutNotes: method === 'cash' ? form.cashPayoutNotes.trim() || null : null,
      });
      flash();
      toast.success('Rent payout details saved');
    } catch (err: any) {
      toast.error(err.message || 'Could not save payout details.');
    } finally {
      setSaving(false);
    }
  };

  const options: { id: RentPayoutMethod; label: string; hint: string }[] = [
    { id: 'mpesa', label: 'M-Pesa', hint: 'Tenants send rent to your number' },
    { id: 'bank', label: 'Bank', hint: 'Tenants pay into your account' },
    { id: 'cash', label: 'Cash', hint: 'You collect and record it' },
  ];

  return (
    <Section title="How you receive rent" description="Tenants see these details when they pay. They are never shown publicly.">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payout method">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={method === option.id}
            onClick={() => setMethod(option.id)}
            className={`rounded-xl border p-3 text-left transition ${
              method === option.id
                ? 'border-transparent bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-600 text-white shadow-sm shadow-violet-700/20'
                : 'border-zinc-200 hover:border-violet-300 dark:border-zinc-700'
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className={`mt-0.5 block text-xs leading-4 ${method === option.id ? 'opacity-80' : 'text-zinc-500'}`}>{option.hint}</span>
          </button>
        ))}
      </div>

      {method === 'mpesa' && (
        <Field label="M-Pesa number" htmlFor="payout-mpesa">
          <Input id="payout-mpesa" inputMode="tel" value={form.mpesaSettlementPhone} placeholder="0712 345 678" onChange={(e) => setForm((p) => ({ ...p, mpesaSettlementPhone: e.target.value }))} className="h-11" />
        </Field>
      )}
      {method === 'bank' && (
        <>
          <Field label="Bank" htmlFor="payout-bank">
            <Input id="payout-bank" value={form.bankName} placeholder="e.g. KCB" onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} className="h-11" />
          </Field>
          <Field label="Account name" htmlFor="payout-account-name">
            <Input id="payout-account-name" value={form.bankAccountName} onChange={(e) => setForm((p) => ({ ...p, bankAccountName: e.target.value }))} className="h-11" />
          </Field>
          <Field label="Account number" htmlFor="payout-account-number">
            <Input id="payout-account-number" inputMode="numeric" value={form.bankAccountNumber} onChange={(e) => setForm((p) => ({ ...p, bankAccountNumber: e.target.value }))} className="h-11" />
          </Field>
        </>
      )}
      {method === 'cash' && (
        <Field label="Notes for tenants (optional)" htmlFor="payout-cash" hint="e.g. where and when to bring rent.">
          <Textarea id="payout-cash" value={form.cashPayoutNotes} maxLength={280} rows={2} onChange={(e) => setForm((p) => ({ ...p, cashPayoutNotes: e.target.value }))} />
        </Field>
      )}
      {error && <p className="text-xs text-zinc-500">{error}</p>}
      <SaveButton saving={saving} saved={saved} disabled={Boolean(error)} onClick={save}>
        Save payout details
      </SaveButton>
    </Section>
  );
}

/* Landlord plan ---------------------------------------------------------- */

function PlanSection({ profile }: { profile: SettingsProfile }) {
  const plan = parseSubscriptionPlan(profile.subscriptionPlan ?? null);
  const tier = plan ? SUBSCRIPTION_TIERS[plan.tier] : null;
  const active = profile.subscriptionStatus === 'active';
  const expires = profile.subscriptionExpiresAt ? new Date(profile.subscriptionExpiresAt) : null;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<{ tier: PaidSubscriptionTier; billing: BillingPeriod }>({
    tier: plan && plan.tier !== 'free' ? plan.tier : profile.role === 'admin' ? 'proplus' : 'starter',
    billing: 'monthly',
  });
  const [receipts, setReceipts] = useState<MySubscriptionReceipt[]>([]);

  useEffect(() => {
    let activeFetch = true;
    getMySubscriptionReceipts()
      .then((rows) => {
        if (activeFetch) setReceipts(rows);
      })
      .catch(() => undefined);
    return () => {
      activeFetch = false;
    };
  }, [profile.uid]);

  const downloadReceipt = (r: MySubscriptionReceipt) => {
    const content =
      r.receiptText ||
      [
        'MYBOMA SUBSCRIPTION RECEIPT',
        `Receipt: ${r.receiptNumber}`,
        `Plan: ${r.planLabel}`,
        `Amount: KES ${Math.round(r.amount).toLocaleString('en-KE')}`,
        `Channel: ${r.paymentChannel}`,
        `Reference: ${r.paymentReference}`,
        `Period: ${new Date(r.periodStart).toLocaleDateString('en-KE')} to ${new Date(r.periodEnd).toLocaleDateString('en-KE')}`,
      ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.receiptNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusText = !tier
    ? 'No plan yet'
    : !active
      ? profile.subscriptionStatus === 'pending'
        ? 'Payment pending'
        : 'Expired'
      : plan?.tier === 'free'
        ? 'Free, never expires'
        : expires
          ? `Active until ${expires.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : 'Active';

  return (
    <Section title="Your plan" description="Plans are prepaid and never renew automatically.">
      <div className="flex items-start justify-between gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
        <div>
          <p className="text-lg font-bold text-zinc-950 dark:text-white">{tier?.label ?? 'No plan'}</p>
          <p className="text-sm text-zinc-500">{statusText}</p>
        </div>
        {tier && <p className="text-right text-xs text-zinc-500">{tier.highlights.join(' · ')}</p>}
      </div>
      <Button onClick={() => setOpen(true)} className="h-10">
        {plan?.tier === 'free' || !tier ? 'Upgrade plan' : active ? 'Change or renew plan' : 'Renew plan'}
      </Button>

      {receipts.length > 0 && (
        <div className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            <Receipt className="h-3.5 w-3.5 text-zinc-500" />
            Payment receipts ({receipts.length})
          </div>
          <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 dark:divide-zinc-800 dark:border-zinc-800">
            {receipts.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-950 dark:text-white">
                    {r.planLabel} · KES {Math.round(r.amount).toLocaleString('en-KE')}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {r.receiptNumber} · {new Date(r.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => downloadReceipt(r)} className="h-7 shrink-0 gap-1 px-2.5 text-[11px]">
                  <Download className="h-3 w-3" /> Receipt
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a plan</DialogTitle>
            <DialogDescription>Pay once for the period you pick. Nothing renews automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {PAID_TIERS.map((id) => {
              const t = SUBSCRIPTION_TIERS[id];
              const selected = choice.tier === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChoice((c) => ({ ...c, tier: id }))}
                  aria-pressed={selected}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected ? 'border-zinc-950 ring-1 ring-zinc-950 dark:border-white dark:ring-white' : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-zinc-950 dark:text-white">{t.label}</span>
                    <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{formatPlanPrice(t.monthlyBaseKes)}/mo</span>
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">{t.highlights.join(' · ')}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {BILLING_PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setChoice((c) => ({ ...c, billing: period.id }))}
                aria-pressed={choice.billing === period.id}
                className={`rounded-xl border px-2 py-2 text-sm font-medium transition ${
                  choice.billing === period.id
                    ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                    : 'border-zinc-200 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200'
                }`}
              >
                {period.months === 1 ? '1 month' : `${period.months} months`}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            Total: <strong className="tabular-nums">{formatPlanPrice(getSubscriptionAmount(choice.tier, choice.billing))}</strong>
          </p>
          <LandlordSubscriptionPay
            payload={{
              tier: choice.tier,
              billing: choice.billing,
              rentPayoutMethod: profile.rentPayoutMethod || 'cash',
              mpesaSettlementPhone: profile.mpesaSettlementPhone || undefined,
              bankName: profile.bankName || undefined,
              bankAccountName: profile.bankAccountName || undefined,
              bankAccountNumber: profile.bankAccountNumber || undefined,
              cashPayoutNotes: profile.cashPayoutNotes || undefined,
            }}
            phone={profile.phone}
          />
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* Preferences ------------------------------------------------------------ */

function startPageOptions(profile: SettingsProfile) {
  const options = [{ id: 'dashboard', label: 'Home' }];
  if (profile.role === 'admin') {
    options.push(
      { id: 'registered', label: 'Users' },
      { id: 'properties', label: 'Properties' },
      { id: 'finances', label: 'Finances' },
      { id: 'tenants', label: 'Tenants' },
    );
  } else if (profile.role === 'landlord') {
    options.push({ id: 'properties', label: 'Properties' }, { id: 'tenants', label: 'Tenants' }, { id: 'finances', label: 'Finances' });
  } else if (profile.role === 'tenant') {
    options.push({ id: 'finances', label: 'Payments' }, { id: 'maintenance', label: 'Repairs' }, { id: 'notices', label: 'Notices' });
  } else if (profile.role === 'caretaker') {
    options.push({ id: 'repairs', label: 'Repairs & issues' }, { id: 'reports', label: 'Reports to landlord' }, { id: 'automations', label: 'Notifications' });
  }
  return options;
}

function PreferencesSection({ profile }: { profile: SettingsProfile }) {
  const storageKey = `myboma_default_page_${profile.uid}`;
  const [startPage, setStartPage] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [pushState, setPushState] = useState<'idle' | 'asking'>('idle');
  const options = startPageOptions(profile);
  const pushSupported = typeof window !== 'undefined' && 'Notification' in window;
  const pushPermission = pushSupported ? Notification.permission : 'default';

  const changeStartPage = (value: string) => {
    setStartPage(value);
    try {
      localStorage.setItem(storageKey, value);
      toast.success('Start page saved');
    } catch {
      toast.error('Could not save this preference on this device.');
    }
  };

  const enablePush = async () => {
    setPushState('asking');
    try {
      await promptForPush();
    } finally {
      setPushState('idle');
    }
  };

  return (
    <Section title="Preferences">
      <Field label="Open this page after signing in" htmlFor="pref-start">
        <select
          id="pref-start"
          value={startPage}
          onChange={(e) => changeStartPage(e.target.value)}
          className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <div>
          <p className="text-sm font-medium text-zinc-950 dark:text-white">Phone and browser alerts</p>
          <p className="text-xs text-zinc-500">
            {pushPermission === 'granted'
              ? 'On for this device.'
              : pushPermission === 'denied'
                ? 'Blocked. Allow notifications for this site in your browser settings.'
                : 'Get rent reminders and repair updates as alerts.'}
          </p>
        </div>
        {pushPermission !== 'granted' && pushPermission !== 'denied' && (
          <Button variant="outline" onClick={enablePush} disabled={pushState === 'asking'}>
            {pushState === 'asking' ? <Loader2 className="animate-spin" /> : <Bell />} Turn on
          </Button>
        )}
      </div>
      <p className="text-xs text-zinc-500">Email reminders are always on so you never miss a rent date.</p>
    </Section>
  );
}

/* Branding (platform admins) --------------------------------------------- */

function BrandingSection({ profile }: { profile: SettingsProfile }) {
  const [name, setName] = useState('');
  const [form, setForm] = useState({ brandLogoUrl: '', brandPrimaryColor: '', brandSecondaryColor: '' });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, flash] = useSavedFlash();

  useEffect(() => {
    if (profile.platformId) {
      getPlatformBranding(profile.platformId)
        .then((data) => {
          setName(data.name || '');
          setForm({
            brandLogoUrl: data.brandLogoUrl || '',
            brandPrimaryColor: data.brandPrimaryColor || '',
            brandSecondaryColor: data.brandSecondaryColor || '',
          });
        })
        .catch(() => toast.error('Could not load your branding.'))
        .finally(() => setLoading(false));
    } else {
      // Admins without a platform get one created the first time they open settings.
      initPlatform()
        .then((data) => {
          if (data.status === 'created') {
            toast.success('Your platform has been set up.');
            window.location.reload();
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [profile.platformId]);

  const hexError = (value: string) => (value && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? 'Use a colour code like #111111.' : '');

  const uploadLogoFile = async (files: File[]) => {
    const file = files[0];
    if (!file || !profile.platformId) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file, file.name, `platforms/${profile.platformId}`);
      setForm((prev) => ({ ...prev, brandLogoUrl: url }));
      toast.success('Logo uploaded. Save to apply it.');
    } catch (error: any) {
      toast.error(error.message || 'Could not upload the logo.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!profile.platformId || hexError(form.brandPrimaryColor) || hexError(form.brandSecondaryColor)) return;
    setSaving(true);
    try {
      await updatePlatformBranding(profile.platformId, { ...form, name });
      flash();
      toast.success('Branding saved. Reload the page to see it everywhere.');
    } catch (error: any) {
      toast.error(error.message || 'Could not save branding.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile.platformId) return null;

  return (
    <Section title="Branding" description="Your platform name, logo and colours." className="lg:col-span-2">
      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform name" htmlFor="brand-name">
              <Input id="brand-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-11" />
            </Field>
            <Field label="Logo" htmlFor="brand-logo">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> : form.brandLogoUrl ? <img src={resolveMediaUrl(form.brandLogoUrl)} alt="" className="h-full w-full object-contain p-1" /> : <Camera className="h-4 w-4 text-zinc-400" />}
                </span>
                <PhotoCaptureControl
                  defaultFacingMode="environment"
                  uploading={uploading}
                  uploadLabel="Upload logo"
                  captureLabel="Take photo"
                  onFiles={uploadLogoFile}
                />
              </div>
            </Field>
            {(['brandPrimaryColor', 'brandSecondaryColor'] as const).map((key) => (
              <Field key={key} label={key === 'brandPrimaryColor' ? 'Main colour' : 'Second colour'} htmlFor={key} error={hexError(form[key])}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${key === 'brandPrimaryColor' ? 'Main' : 'Second'} colour picker`}
                    value={/^#[0-9a-f]{6}$/i.test(form[key]) ? form[key] : '#111111'}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    className="h-11 w-12 cursor-pointer rounded-xl border border-zinc-200 p-1 dark:border-zinc-700"
                  />
                  <Input id={key} value={form[key]} placeholder="#111111" onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} className="h-11 font-mono" />
                </div>
              </Field>
            ))}
          </div>
          <SaveButton saving={saving} saved={saved} disabled={uploading} onClick={save}>
            Save branding
          </SaveButton>
        </>
      )}
    </Section>
  );
}

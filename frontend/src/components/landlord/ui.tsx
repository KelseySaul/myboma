import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { PropertyStatus, RentPayment } from './types';

export const kes = (amount: number) => `KES ${Math.round(Number(amount) || 0).toLocaleString('en-KE')}`;

export const shortDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const daysLate = (dueDate: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000));

/** An invoice is late when it is marked overdue, or still unpaid after its due date. */
export const isLate = (payment: RentPayment) =>
  payment.status === 'overdue' || (payment.status === 'pending' && daysLate(payment.dueDate) > 0);

/**
 * Runs an async action once at a time: the returned `busy` flag disables the button and
 * repeated clicks while it is running are ignored, so nothing is submitted twice.
 */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };
  return { busy, run, isBusy: (key: string) => busy === key };
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500 shadow-2xs',
  secondary: 'border border-[#D0D5DD] bg-white text-[#1C2B33] hover:bg-[#F7F8FA] dark:border-white/12 dark:bg-[#1A1D21] dark:text-slate-100 dark:hover:bg-white/5 shadow-2xs',
  ghost: 'text-[#5F6C7B] hover:bg-[#1C2B33]/[0.05] hover:text-[#1C2B33] dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white',
  danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-[#1A1D21] dark:text-rose-400',
};

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export function ActionButton({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...props }: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'h-8.5 px-3 text-xs' : 'h-10 px-4 text-sm'
      } ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Panel({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[#1C2B33]/[0.09] bg-white shadow-[0_1px_2px_rgba(28,43,51,0.05)] dark:border-white/[0.08] dark:bg-[#1A1D21] ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-[#1C2B33]/[0.07] px-5 py-3.5 dark:border-white/[0.07]">
          <h2 className="text-sm font-semibold text-[#1C2B33] dark:text-white">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const PILL_STYLES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
  rented: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/15 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20',
  resolved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
  booked: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20',
  available: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
  pending: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300/60 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10',
  invited: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300/60 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10',
  verifying: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20',
  'in-progress': 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/15 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20',
  'no-unit': 'bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400',
  overdue: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20',
  urgent: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20',
  high: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20',
};

const PILL_DOT: Record<string, string> = {
  paid: 'bg-emerald-500',
  active: 'bg-emerald-500',
  available: 'bg-emerald-500',
  resolved: 'bg-emerald-500',
  rented: 'bg-sky-500',
  'in-progress': 'bg-sky-500',
  booked: 'bg-amber-500',
  verifying: 'bg-amber-500',
  high: 'bg-amber-500',
  overdue: 'bg-rose-500',
  urgent: 'bg-rose-500',
};

const PILL_LABELS: Record<string, string> = {
  available: 'Vacant',
  rented: 'Occupied',
  booked: 'Booked',
  'in-progress': 'In progress',
  'no-unit': 'No unit yet',
  invited: 'Invite sent',
  verifying: 'Checking payment',
};

export function StatusPill({ status }: { status: PropertyStatus | string }) {
  const label = PILL_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  const dot = PILL_DOT[status] ?? 'bg-slate-400';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${PILL_STYLES[status] ?? PILL_STYLES.pending}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function EmptyBlock({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F2F5] text-[#5F6C7B] dark:bg-white/8 dark:text-slate-300">{icon}</span>}
      <h3 className="mt-4 text-sm font-semibold text-[#1C2B33] dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-[#5F6C7B] dark:text-slate-400">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9.5 w-full rounded-lg border border-[#D0D5DD] bg-white px-3.5 text-sm text-[#1C2B33] placeholder:text-[#8A94A6] focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none dark:border-white/12 dark:bg-[#16191D] dark:text-white sm:max-w-xs"
    />
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: { id: NoInfer<T>; label: string; count?: number }[]; value: T; onChange: (value: NoInfer<T>) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`h-8.5 rounded-lg px-3 text-xs font-semibold transition ${
            value === option.id
              ? 'bg-emerald-700/[0.10] text-emerald-800 ring-1 ring-emerald-700/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25'
              : 'border border-[#1C2B33]/[0.09] bg-white text-[#5F6C7B] hover:bg-[#F7F8FA] hover:text-[#1C2B33] dark:border-white/[0.08] dark:bg-[#1A1D21] dark:text-slate-300'
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800 ${className}`} />;
}

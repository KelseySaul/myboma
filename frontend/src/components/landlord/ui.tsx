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
  primary: 'bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 text-white hover:from-violet-800 hover:via-purple-700 hover:to-fuchsia-700 shadow-xs shadow-violet-700/20',
  secondary: 'border border-[#D5D2E3] bg-white text-[#161426] hover:border-violet-300 hover:bg-[#F8F7FC] dark:border-white/12 dark:bg-[#181922] dark:text-slate-100 dark:hover:bg-white/5 shadow-2xs',
  ghost: 'text-[#5D5A73] hover:bg-violet-600/[0.06] hover:text-[#161426] dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white',
  danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-[#181922] dark:text-rose-400',
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
  paid: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25',
  active: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25',
  rented: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25',
  resolved: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25',
  booked: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20',
  available: 'bg-purple-50 text-purple-700 ring-1 ring-purple-600/20 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-400/25',
  pending: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300/60 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10',
  'due-soon': 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25',
  invited: 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-600/15 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-400/25',
  verifying: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25',
  'in-progress': 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/15 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20',
  'no-unit': 'bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400',
  overdue: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
  urgent: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
  high: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20',
};

const PILL_DOT: Record<string, string> = {
  paid: 'bg-violet-600',
  active: 'bg-violet-600',
  available: 'bg-purple-500',
  resolved: 'bg-violet-600',
  rented: 'bg-indigo-500',
  'in-progress': 'bg-sky-500',
  'due-soon': 'bg-amber-500',
  invited: 'bg-fuchsia-500',
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
  'due-soon': 'Due soon',
  'in-progress': 'In progress',
  'no-unit': 'No unit yet',
  invited: 'Invite sent',
  verifying: 'Confirm payment',
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
      className="h-10 w-full rounded-xl border border-[#D5D2E3] bg-white px-3.5 text-sm text-[#161426] placeholder:text-[#8A86A1] focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15 focus:outline-none dark:border-white/12 dark:bg-[#161722] dark:text-white sm:h-9.5 sm:max-w-xs sm:rounded-lg"
    />
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: { id: NoInfer<T>; label: string; count?: number }[]; value: T; onChange: (value: NoInfer<T>) => void }) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition sm:h-8.5 ${
            value === option.id
              ? 'bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 text-white shadow-xs shadow-violet-700/20'
              : 'border border-[#221844]/[0.09] bg-white text-[#5D5A73] hover:border-violet-300 hover:bg-[#F8F7FC] hover:text-[#161426] dark:border-white/[0.08] dark:bg-[#181922] dark:text-slate-300'
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className={`ml-1.5 tabular-nums ${value === option.id ? 'opacity-85' : 'opacity-70'}`}>{option.count}</span>}
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

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
  primary: 'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
  secondary: 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400',
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'h-9 px-3 text-xs' : 'h-11 px-4 text-sm'
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
    <section className={`rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const PILL_STYLES: Record<string, string> = {
  paid: 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
  active: 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
  rented: 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
  resolved: 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
  booked: 'bg-zinc-700 text-white',
  available: 'border border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300',
  pending: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  invited: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  verifying: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  'in-progress': 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white',
  'no-unit': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  urgent: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  high: 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white',
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
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL_STYLES[status] ?? PILL_STYLES.pending}`}>
      {label}
    </span>
  );
}

export function EmptyBlock({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800">{icon}</span>}
      <h3 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{body}</p>
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
      className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white sm:max-w-xs"
    />
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: { id: NoInfer<T>; label: string; count?: number }[]; value: T; onChange: (value: NoInfer<T>) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`h-9 rounded-full px-3.5 text-sm font-medium transition ${
            value === option.id
              ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
              : 'border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1.5 tabular-nums opacity-60">{option.count}</span>}
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

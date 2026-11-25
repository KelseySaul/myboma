import { useMemo, useState } from 'react';
import { Banknote, BellRing, Building2, Home, Plus, UserPlus, Wrench } from 'lucide-react';
import type { LandlordTab, MaintenanceRequest, Property, RentPayment } from './types';
import { ActionButton, EmptyBlock, Panel, Skeleton, StatusPill, daysLate, isLate, kes } from './ui';

interface OverviewTabProps {
  firstName: string;
  loading: boolean;
  properties: Property[];
  payments: RentPayment[];
  requests: MaintenanceRequest[];
  tenantName: (emailOrId: string) => string;
  propertyName: (id: string) => string;
  maintenanceEnabled: boolean;
  planLabel: string;
  unitLimit: number | null;
  onFreePlan: boolean;
  isBusy: (key: string) => boolean;
  onOpenTab: (tab: LandlordTab) => void;
  onRemind: (payment: RentPayment) => void;
  onRecordCash: (payment: RentPayment) => void;
  onAddProperty: () => void;
  onInviteTenant: () => void;
  onUpgrade: () => void;
}

const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;

export default function OverviewTab(props: OverviewTabProps) {
  const { properties, payments, requests, loading } = props;

  const now = new Date();
  const thisMonth = monthKey(now);

  const month = useMemo(() => {
    const due = payments.filter((p) => monthKey(new Date(p.dueDate)) === thisMonth);
    const expected = due.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const collected = due.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return { expected, collected, count: due.length };
  }, [payments, thisMonth]);

  const late = useMemo(
    () => payments.filter(isLate).sort((a, b) => daysLate(b.dueDate) - daysLate(a.dueDate)),
    [payments],
  );
  const lateTotal = late.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const occupied = properties.filter((p) => p.status !== 'available').length;
  const vacant = properties.length - occupied;
  const openRepairs = requests.filter((r) => r.status !== 'resolved');

  // Rent actually received in each of the last six months (by payment date).
  const history = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return { key: monthKey(date), label: date.toLocaleDateString('en-KE', { month: 'short' }), total: 0, count: 0 };
    });
    for (const payment of payments) {
      if (payment.status !== 'paid') continue;
      const key = monthKey(new Date(payment.paidAt || payment.dueDate));
      const bucket = months.find((m) => m.key === key);
      if (bucket) {
        bucket.total += Number(payment.amount || 0);
        bucket.count += 1;
      }
    }
    return months;
  }, [payments]);

  const collectedPct = month.expected ? Math.round((month.collected / month.expected) * 100) : 0;
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <Panel>
        <EmptyBlock
          icon={<Home className="h-5 w-5" />}
          title={`${greeting}, ${props.firstName}. Let's add your first property.`}
          body="Add a house or unit with its rent. Then invite your tenant and MyBoma will send their invoices and reminders every month."
          action={<ActionButton icon={<Plus className="h-4 w-4" />} onClick={props.onAddProperty}>Add property</ActionButton>}
        />
      </Panel>
    );
  }

  const stats: { label: string; value: string; note: string; tab: LandlordTab; icon: typeof Home }[] = [
    {
      label: 'Collected this month',
      value: kes(month.collected),
      note: month.expected ? `${collectedPct}% of ${kes(month.expected)} due` : 'No rent due this month',
      tab: 'finances',
      icon: Banknote,
    },
    {
      label: 'Late rent',
      value: kes(lateTotal),
      note: late.length ? `${late.length} unpaid ${late.length === 1 ? 'invoice' : 'invoices'}` : 'Everyone is up to date',
      tab: 'finances',
      icon: BellRing,
    },
    {
      label: 'Occupied units',
      value: `${occupied} of ${properties.length}`,
      note: vacant ? `${vacant} vacant` : 'Fully occupied',
      tab: 'properties',
      icon: Building2,
    },
    {
      label: 'Open repairs',
      value: props.maintenanceEnabled ? String(openRepairs.length) : '—',
      note: props.maintenanceEnabled ? (openRepairs.length ? 'Waiting for you' : 'Nothing to fix') : 'Available on Pro plans',
      tab: 'maintenance',
      icon: Wrench,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
            {greeting}, {props.firstName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Here is how your rentals are doing in {now.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={props.onAddProperty}>Add property</ActionButton>
          <ActionButton size="sm" variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={props.onInviteTenant}>Invite tenant</ActionButton>
          <ActionButton size="sm" variant="secondary" icon={<Banknote className="h-4 w-4" />} onClick={() => props.onOpenTab('finances')}>Record payment</ActionButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, note, tab, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => (tab === 'maintenance' && !props.maintenanceEnabled ? props.onUpgrade() : props.onOpenTab(tab))}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-zinc-950 hover:shadow-lg hover:shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
              <Icon className="h-4 w-4 text-zinc-400 transition group-hover:text-zinc-950 dark:group-hover:text-white" />
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-zinc-950 dark:text-white">{value}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{note}</p>
            {label === 'Collected this month' && month.expected > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-zinc-950 transition-all duration-700 dark:bg-white" style={{ width: `${Math.min(collectedPct, 100)}%` }} />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Who needs to pay"
          action={late.length > 0 && <button type="button" onClick={() => props.onOpenTab('finances')} className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-white">See all</button>}
        >
          {late.length === 0 ? (
            <EmptyBlock icon={<Banknote className="h-5 w-5" />} title="No late rent" body="Every invoice that is due has been paid. Reminders go out automatically before the next due date." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {late.slice(0, 5).map((payment) => (
                <li key={payment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{props.tenantName(payment.tenantId)}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {props.propertyName(payment.propertyId)} · {kes(payment.amount)} ·{' '}
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {daysLate(payment.dueDate) === 0 ? 'due today' : `${daysLate(payment.dueDate)} days late`}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ActionButton size="sm" variant="secondary" loading={props.isBusy(`remind-${payment.id}`)} onClick={() => props.onRemind(payment)}>
                      Send reminder
                    </ActionButton>
                    <ActionButton size="sm" loading={props.isBusy(`cash-${payment.id}`)} onClick={() => props.onRecordCash(payment)}>
                      Record cash
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Rent received, last 6 months">
          <RentChart months={history} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Your plan">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-zinc-950 dark:text-white">{props.planLabel}</p>
              <p className="text-sm text-zinc-500">
                {properties.length} of {props.unitLimit ?? 'unlimited'} {props.unitLimit === 1 ? 'unit' : 'units'} used
                {props.onFreePlan && ' · no buildings'}
              </p>
            </div>
            {(props.onFreePlan || (props.unitLimit !== null && properties.length >= props.unitLimit)) && (
              <ActionButton size="sm" onClick={props.onUpgrade}>Upgrade plan</ActionButton>
            )}
          </div>
        </Panel>

        <Panel
          title="Repairs"
          action={props.maintenanceEnabled && openRepairs.length > 0 && <button type="button" onClick={() => props.onOpenTab('maintenance')} className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-white">See all</button>}
        >
          {!props.maintenanceEnabled ? (
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-500">Let tenants report repairs and track them until they are fixed. Included in Pro plans.</p>
              <ActionButton size="sm" variant="secondary" onClick={props.onUpgrade}>See plans</ActionButton>
            </div>
          ) : openRepairs.length === 0 ? (
            <p className="p-5 text-sm text-zinc-500">No open repair requests.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {openRepairs.slice(0, 4).map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">{request.title}</p>
                    <p className="truncate text-xs text-zinc-500">{props.propertyName(request.propertyId)}</p>
                  </div>
                  <StatusPill status={request.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function RentChart({ months }: { months: { label: string; total: number; count: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...months.map((m) => m.total), 1);
  const empty = months.every((m) => m.total === 0);

  return (
    <div className="p-5">
      {empty && <p className="mb-3 text-sm text-zinc-500">No rent has been received yet. Paid invoices will show here.</p>}
      <div className="flex h-48 items-end gap-2 sm:gap-3" role="list" aria-label="Rent received per month">
        {months.map((month, index) => {
          const height = month.total ? Math.max((month.total / max) * 100, 4) : 2;
          return (
            <div
              key={month.label + index}
              role="listitem"
              aria-label={`${month.label}: ${kes(month.total)}`}
              tabIndex={0}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              className="relative flex h-full flex-1 flex-col items-center justify-end outline-none"
            >
              {hovered === index && (
                <div className="absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-zinc-950 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-white dark:text-zinc-950">
                  <span className="font-semibold">{kes(month.total)}</span>
                  <span className="block opacity-70">{month.count} {month.count === 1 ? 'payment' : 'payments'}</span>
                </div>
              )}
              <div
                className={`w-full rounded-t-lg transition-all duration-500 ${
                  hovered === index ? 'bg-gradient-to-t from-teal-800 to-teal-500' : 'bg-teal-300/75 dark:bg-teal-800'
                } ${index === months.length - 1 && hovered === null ? '!bg-teal-600' : ''}`}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3">
        {months.map((month, index) => (
          <span key={month.label + index} className="flex-1 text-center text-xs text-zinc-500">{month.label}</span>
        ))}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Building2, Mail, Plus, UserPlus, Users, Wallet, Wrench } from 'lucide-react';
import { getAdminOverview, type AdminOverview as Overview } from '../../lib/api';
import { DASHBOARD_POLL_MS } from '../../lib/polling';

interface AdminOverviewProps {
  firstName: string;
  platformId: string;
  isSuperAdmin: boolean;
  onNavigate: (tab: string) => void;
  onInviteUser: () => void;
  onAddProperty: () => void;
}

const kes = (amount: number) => `KES ${Math.round(amount).toLocaleString('en-KE')}`;
const compactKes = (amount: number) =>
  amount >= 1_000_000 ? `KES ${(amount / 1_000_000).toFixed(1)}M` : amount >= 1_000 ? `KES ${Math.round(amount / 1_000)}k` : kes(amount);

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-KE', { month: 'short' });

const ACTION_LABELS: Record<string, string> = {
  LANDLORD_FREE_PLAN_ACTIVATED: 'Started the free plan',
  USER_PROVISION: 'Invited a user',
  USER_PROVISIONED: 'Invited a user',
  INVITE_RESENT: 'Resent an invitation',
  ADMIN_IMPERSONATE_START: 'Started viewing as another user',
  ADMIN_IMPERSONATE_END: 'Stopped viewing as another user',
  INVITE_SENT: 'Sent an invitation',
  INVITE_ACCEPTED: 'Accepted an invitation',
  PROPERTY_CREATED: 'Added a property',
  PROPERTY_UPDATED: 'Updated a property',
  PROPERTY_DELETED: 'Deleted a property',
  USER_SUSPENDED: 'Suspended a user',
  USER_DELETED: 'Deleted a user',
  ROLE_UPDATED: 'Changed a user role',
  RENT_MARKED_PAID: 'Recorded a rent payment',
};
const describeAction = (action: string) =>
  ACTION_LABELS[action] ?? action.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
};

export default function AdminOverview({ firstName, platformId, isSuperAdmin, onNavigate, onInviteUser, onAddProperty }: AdminOverviewProps) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'overview', platformId],
    queryFn: () => getAdminOverview(platformId),
    refetchInterval: DASHBOARD_POLL_MS,
  });

  if (isPending) return <OverviewSkeleton />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">We couldn't load the overview.</p>
        <button type="button" onClick={() => refetch()} className="mt-4 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950">
          Try again
        </button>
      </div>
    );
  }

  return <OverviewContent data={data} firstName={firstName} isSuperAdmin={isSuperAdmin} onNavigate={onNavigate} onInviteUser={onInviteUser} onAddProperty={onAddProperty} />;
}

function OverviewContent({
  data,
  firstName,
  isSuperAdmin,
  onNavigate,
  onInviteUser,
  onAddProperty,
}: Omit<AdminOverviewProps, 'platformId'> & { data: Overview }) {
  const totalUsers = Object.values(data.users).reduce((sum, n) => sum + n, 0);
  const totalProperties = data.properties.reduce((sum, p) => sum + p.count, 0);
  const available = data.properties.filter((p) => p.status === 'available').reduce((sum, p) => sum + p.count, 0);
  const openRepairs = (data.maintenance.pending ?? 0) + (data.maintenance['in-progress'] ?? 0);
  const { collectedThisMonth, collectedLastMonth } = data.rent;
  const change = collectedLastMonth > 0 ? Math.round(((collectedThisMonth - collectedLastMonth) / collectedLastMonth) * 100) : null;

  const summary = [
    data.rent.overdueCount > 0 ? `${data.rent.overdueCount} overdue ${data.rent.overdueCount === 1 ? 'invoice' : 'invoices'}` : 'no overdue rent',
    data.pendingInvites > 0 ? `${data.pendingInvites} pending ${data.pendingInvites === 1 ? 'invite' : 'invites'}` : null,
    openRepairs > 0 ? `${openRepairs} open ${openRepairs === 1 ? 'repair' : 'repairs'}` : null,
  ].filter(Boolean);

  const stats = [
    {
      label: 'Users',
      value: totalUsers.toLocaleString('en-KE'),
      hint: `${data.users.landlord ?? 0} landlords · ${data.users.tenant ?? 0} tenants`,
      icon: Users,
      tab: 'registered',
    },
    {
      label: 'Pending invites',
      value: data.pendingInvites.toLocaleString('en-KE'),
      hint: data.pendingInvites ? 'Waiting for sign-up' : 'Everyone has joined',
      icon: Mail,
      tab: 'pending',
    },
    {
      label: 'Properties',
      value: totalProperties.toLocaleString('en-KE'),
      hint: `${available} available to rent`,
      icon: Building2,
      tab: 'properties',
    },
    {
      label: 'Rent this month',
      value: compactKes(collectedThisMonth),
      hint: change === null ? `${compactKes(collectedLastMonth)} last month` : `${change >= 0 ? '+' : ''}${change}% vs last month`,
      icon: Wallet,
      tab: 'finances',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Today: {summary.join(', ')}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickAction icon={UserPlus} label="Invite user" onClick={onInviteUser} primary />
          <QuickAction icon={Plus} label="Add property" onClick={onAddProperty} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon, tab }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(tab)}
            className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md active:translate-y-0 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 sm:text-sm dark:text-zinc-400">{label}</span>
              <Icon className="h-4 w-4 text-zinc-400 transition group-hover:text-zinc-950 dark:group-hover:text-white" />
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-zinc-950 sm:text-3xl dark:text-white">{value}</p>
            <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
          </button>
        ))}
      </div>

      {data.rent.overdueCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('finances')}
          className="flex w-full items-center gap-3 rounded-2xl border border-zinc-950 bg-zinc-950 px-4 py-3 text-left text-white transition hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-sm">
            <strong>{kes(data.rent.overdueAmount)}</strong> overdue across {data.rent.overdueCount}{' '}
            {data.rent.overdueCount === 1 ? 'invoice' : 'invoices'}.
          </span>
          <span className="hidden items-center gap-1 text-sm font-semibold sm:flex">
            View overdue rent <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <TrendChart trend={data.trend} />
        <PropertyBreakdown properties={data.properties} onNavigate={onNavigate} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Recent activity</h2>
            {isSuperAdmin && (
              <button type="button" onClick={() => onNavigate('audit')} className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
                See all
              </button>
            )}
          </div>
          {data.activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Nothing yet. Invite a user or add a property to get started.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.activity.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{describeAction(item.action)}</p>
                    <p className="truncate text-xs text-zinc-500">{item.userEmail ?? 'System'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">{timeAgo(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Needs attention</h2>
          <ul className="mt-3 space-y-2">
            <AttentionRow icon={Wallet} label="Overdue invoices" value={data.rent.overdueCount} onClick={() => onNavigate('finances')} />
            <AttentionRow icon={Mail} label="Pending invites" value={data.pendingInvites} onClick={() => onNavigate('pending')} />
            <AttentionRow icon={Wrench} label="Open repairs" value={openRepairs} onClick={() => onNavigate('maintenance')} />
          </ul>
          <p className="mt-4 text-xs text-zinc-500">Rent due soon: {kes(data.rent.dueSoonAmount)}</p>
        </section>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, primary = false }: { icon: typeof Plus; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] ${
        primary
          ? 'bg-teal-800 text-white hover:bg-teal-900 dark:bg-teal-700 dark:text-white dark:hover:bg-teal-600'
          : 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function AttentionRow({ icon: Icon, label, value, onClick }: { icon: typeof Plus; label: string; value: number; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        <Icon className="h-4 w-4 text-zinc-400" />
        <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">{label}</span>
        <span
          className={`min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
            value > 0 ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
          }`}
        >
          {value}
        </span>
      </button>
    </li>
  );
}

function TrendChart({ trend }: { trend: Overview['trend'] }) {
  const [metric, setMetric] = useState<'collected' | 'signups'>('collected');
  const [hover, setHover] = useState<number | null>(null);
  const values = trend.map((t) => t[metric]);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, v) => sum + v, 0);
  const format = (v: number) => (metric === 'collected' ? kes(v) : `${v} ${v === 1 ? 'sign-up' : 'sign-ups'}`);
  const shown = hover ?? trend.length - 1;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Last 6 months</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {monthLabel(trend[shown].month)}: <span className="font-semibold text-zinc-950 dark:text-white">{format(trend[shown][metric])}</span>
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist" aria-label="Chart">
          {(['collected', 'signups'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                metric === m ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500'
              }`}
            >
              {m === 'collected' ? 'Rent collected' : 'Sign-ups'}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="flex h-44 items-center justify-center text-center text-sm text-zinc-500">
          {metric === 'collected' ? 'No rent collected yet. Payments appear here once tenants pay.' : 'No sign-ups in the last 6 months.'}
        </p>
      ) : (
        <div className="mt-6 flex h-44 items-end gap-2 sm:gap-3" onMouseLeave={() => setHover(null)}>
          {trend.map((point, index) => {
            const value = point[metric];
            const active = index === shown;
            return (
              <button
                key={point.month}
                type="button"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                onClick={() => setHover(index)}
                aria-label={`${monthLabel(point.month)}: ${format(value)}`}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <span className={`text-[11px] font-semibold tabular-nums transition ${active ? 'text-zinc-950 dark:text-white' : 'text-transparent'}`}>
                  {metric === 'collected' ? compactKes(value) : value}
                </span>
                <span
                  className={`w-full max-w-12 rounded-t-lg transition-all duration-500 ${active ? 'bg-gradient-to-t from-teal-800 to-teal-500' : 'bg-teal-300/70 group-hover:bg-teal-400 dark:bg-teal-800'}`}
                  style={{ height: `${Math.max((value / max) * 100, value > 0 ? 6 : 2)}%` }}
                />
                <span className="text-xs text-zinc-500">{monthLabel(point.month)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

const TYPE_LABELS: Record<string, string> = { residential: 'Homes', commercial: 'Commercial', bnb: 'Short stays' };

function PropertyBreakdown({ properties, onNavigate }: { properties: Overview['properties']; onNavigate: (tab: string) => void }) {
  const byType = useMemo(() => {
    const totals: Record<string, { total: number; available: number }> = {};
    for (const row of properties) {
      totals[row.type] ??= { total: 0, available: 0 };
      totals[row.type].total += row.count;
      if (row.status === 'available') totals[row.type].available += row.count;
    }
    return Object.entries(totals).sort((a, b) => b[1].total - a[1].total);
  }, [properties]);
  const grandTotal = byType.reduce((sum, [, t]) => sum + t.total, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const colors = ['#236b66', '#77aaa3', '#bdd5cf', '#95bdb2'];
  let offset = 0;
  const segments = byType.map(([type, value], index) => {
    const start = offset;
    offset += value.total / grandTotal * 100;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  });
  const selectedEntry = byType.find(([type]) => type === selected);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Properties</h2>
        <button type="button" onClick={() => onNavigate('properties')} className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
          View all
        </button>
      </div>
      {grandTotal === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">No properties yet. Add one to see it here.</p>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
          <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full" role="img"
            aria-label={`Property breakdown: ${byType.map(([type, t]) => `${TYPE_LABELS[type] ?? type}: ${t.total}`).join(', ')}`}
            style={{ background: `conic-gradient(${segments.join(', ')})` }}>
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white/90 text-center dark:bg-slate-900/90">
              <span className="text-xl font-bold text-zinc-950 dark:text-white">{selectedEntry ? selectedEntry[1].total : grandTotal}</span>
              <span className="text-xs text-zinc-500">{selectedEntry ? (TYPE_LABELS[selectedEntry[0]] ?? selectedEntry[0]) : 'properties'}</span>
            </div>
          </div>
          <ul className="w-full space-y-2">
          {byType.map(([type, t], index) => (
            <li key={type}>
              <button type="button" onClick={() => setSelected(selected === type ? null : type)} onMouseEnter={() => setSelected(type)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(type)} onBlur={() => setSelected(null)} aria-pressed={selected === type} className="w-full rounded-lg p-2 text-left transition hover:bg-teal-100/50 focus-visible:outline-2 focus-visible:outline-teal-700 dark:hover:bg-teal-900/30">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{backgroundColor: colors[index % colors.length]}} />
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{TYPE_LABELS[type] ?? type}</span>
                <span className="tabular-nums text-zinc-500">
                  {t.total} · {t.available} available
                </span>
              </div>
              </button>
            </li>
          ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading overview">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

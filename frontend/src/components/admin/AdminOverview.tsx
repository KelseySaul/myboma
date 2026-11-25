import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronRight,
  Mail,
  Plus,
  Shield,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { getAdminOverview, type AdminOverview as Overview } from '../../lib/api';
import { DASHBOARD_POLL_MS } from '../../lib/polling';

interface AdminOverviewProps {
  firstName: string;
  platformId: string;
  accountIds?: string[];
  isSuperAdmin: boolean;
  onNavigate: (tab: string) => void;
  onInviteUser: () => void;
  onAddProperty: () => void;
}

const kes = (amount: number) => `KES ${Math.round(amount).toLocaleString('en-KE')}`;
const compactKes = (amount: number) =>
  amount >= 1_000_000
    ? `KES ${(amount / 1_000_000).toFixed(1)}M`
    : amount >= 1_000
      ? `KES ${Math.round(amount / 1_000)}k`
      : kes(amount);

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
  USER_DELETE: 'Deleted a user',
  ROLE_UPDATED: 'Changed a user role',
  USER_ROLE_CHANGE: 'Changed a user role',
  RENT_MARKED_PAID: 'Recorded a rent payment',
};

const describeAction = (action: string) =>
  ACTION_LABELS[action] ?? action.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const actionMeta = (action: string) => {
  const key = action.toUpperCase();
  if (key.includes('DELETE') || key.includes('SUSPEND')) {
    return { icon: Trash2, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' };
  }
  if (key.includes('INVITE') || key.includes('PROVISION')) {
    return { icon: UserPlus, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' };
  }
  if (key.includes('PROPERTY') || key.includes('BUILDING')) {
    return { icon: Building2, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' };
  }
  if (key.includes('RENT') || key.includes('PAYMENT') || key.includes('PLAN')) {
    return { icon: Wallet, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' };
  }
  if (key.includes('ROLE') || key.includes('IMPERSONATE')) {
    return { icon: Shield, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' };
  }
  return { icon: Activity, tone: 'bg-[#F0F2F5] text-[#5F6C7B] dark:bg-white/8 dark:text-slate-300' };
};

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
};

export default function AdminOverview({
  firstName,
  platformId,
  accountIds,
  isSuperAdmin,
  onNavigate,
  onInviteUser,
  onAddProperty,
}: AdminOverviewProps) {
  const accountKey = accountIds === undefined ? 'self' : [...accountIds].sort().join(',');
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'overview', platformId, accountKey],
    queryFn: () => getAdminOverview(platformId, accountIds),
    refetchInterval: DASHBOARD_POLL_MS,
  });

  if (isPending) return <OverviewSkeleton />;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-[#1C2B33]/[0.09] bg-white p-8 text-center shadow-[0_1px_2px_rgba(28,43,51,0.05)] dark:border-white/[0.08] dark:bg-[#1A1D21]">
        <p className="text-sm text-[#5F6C7B] dark:text-slate-300">We couldn&apos;t load the overview.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <OverviewContent
      data={data}
      firstName={firstName}
      isSuperAdmin={isSuperAdmin}
      onNavigate={onNavigate}
      onInviteUser={onInviteUser}
      onAddProperty={onAddProperty}
    />
  );
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
  const change =
    collectedLastMonth > 0 ? Math.round(((collectedThisMonth - collectedLastMonth) / collectedLastMonth) * 100) : null;

  const summary = [
    data.rent.overdueCount > 0
      ? `${data.rent.overdueCount} overdue ${data.rent.overdueCount === 1 ? 'invoice' : 'invoices'}`
      : 'no overdue rent',
    data.pendingInvites > 0
      ? `${data.pendingInvites} pending ${data.pendingInvites === 1 ? 'invite' : 'invites'}`
      : null,
    openRepairs > 0 ? `${openRepairs} open ${openRepairs === 1 ? 'repair' : 'repairs'}` : null,
  ].filter(Boolean);

  const stats = [
    {
      label: 'Users',
      value: totalUsers.toLocaleString('en-KE'),
      hint: `${data.users.landlord ?? 0} landlords · ${data.users.tenant ?? 0} tenants`,
      icon: Users,
      iconTone: 'bg-[#F0F2F5] text-[#1C2B33] dark:bg-white/8 dark:text-slate-200',
      tab: 'registered',
      highlight: false,
      delta: null as number | null,
    },
    {
      label: 'Pending invites',
      value: data.pendingInvites.toLocaleString('en-KE'),
      hint: data.pendingInvites ? 'Waiting for sign-up' : 'Everyone has joined',
      icon: Mail,
      iconTone:
        data.pendingInvites > 0
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          : 'bg-[#F0F2F5] text-[#5F6C7B] dark:bg-white/8 dark:text-slate-300',
      tab: 'pending',
      highlight: false,
      delta: null as number | null,
    },
    {
      label: 'Properties',
      value: totalProperties.toLocaleString('en-KE'),
      hint: `${available} available to rent`,
      icon: Building2,
      iconTone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
      tab: 'properties',
      highlight: false,
      delta: null as number | null,
    },
    {
      label: 'Rent this month',
      value: compactKes(collectedThisMonth),
      hint: `${compactKes(collectedLastMonth)} last month`,
      icon: Wallet,
      iconTone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      tab: 'finances',
      highlight: true,
      delta: change,
    },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Executive Greeting Strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2B33] sm:text-2xl dark:text-white">
            {greeting()}, {firstName}
          </h2>
          <p className="mt-0.5 text-sm text-[#5F6C7B] dark:text-slate-400">Today: {summary.join(' · ')}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuickAction icon={Plus} label="Add property" onClick={onAddProperty} />
          <QuickAction icon={UserPlus} label="Invite user" onClick={onInviteUser} primary />
        </div>
      </div>

      {/* 4-Card Meta KPI Strip */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon, iconTone, tab, highlight, delta }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(tab)}
            className={`group rounded-xl border p-4 text-left transition sm:p-5 ${
              highlight ? 'finance-highlight' : 'stat-tint'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#5F6C7B] sm:text-[13px] dark:text-slate-400">{label}</span>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
                <Icon className="h-4 w-4" strokeWidth={1.85} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-2xl font-semibold tabular-nums tracking-[-0.03em] text-[#1C2B33] sm:text-[28px] dark:text-white">
                {value}
              </p>
              {delta !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                    delta >= 0
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  }`}
                >
                  {delta >= 0 ? '+' : ''}
                  {delta}%
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate text-xs text-[#5F6C7B] dark:text-slate-400">{hint}</p>
          </button>
        ))}
      </div>

      {/* Overdue Alert Banner */}
      {data.rent.overdueCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('finances')}
          className="flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-left text-rose-950 transition hover:bg-rose-100/80 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <span className="flex-1 text-sm">
            <strong className="tabular-nums font-semibold">{kes(data.rent.overdueAmount)}</strong> overdue across{' '}
            {data.rent.overdueCount} {data.rent.overdueCount === 1 ? 'invoice' : 'invoices'}.
          </span>
          <span className="hidden items-center gap-1 text-xs font-semibold text-rose-700 sm:flex dark:text-rose-300">
            Review overdue rent <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <TrendChart trend={data.trend} onOpenFinances={() => onNavigate('finances')} />
        <PropertyBreakdown properties={data.properties} onNavigate={onNavigate} />
      </div>

      {/* Activity + Attention Row */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-[#1C2B33]/[0.09] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1A1D21]">
          <div className="flex items-center justify-between pb-3 border-b border-[#1C2B33]/[0.06] dark:border-white/[0.06]">
            <h3 className="text-[15px] font-semibold text-[#1C2B33] dark:text-white">Recent activity</h3>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('audit')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                See all
              </button>
            )}
          </div>
          {data.activity.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#5F6C7B] dark:text-slate-400">
              Nothing yet. Invite a user or add a property to get started.
            </p>
          ) : (
            <ul className="divide-y divide-[#1C2B33]/[0.06] dark:divide-white/[0.06]">
              {data.activity.map((item) => {
                const { icon: ActionIcon, tone } = actionMeta(item.action);
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}>
                        <ActionIcon className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-[#1C2B33] dark:text-slate-100">
                          {describeAction(item.action)}
                        </p>
                        <p className="truncate text-xs text-[#5F6C7B] dark:text-slate-400">
                          {item.userEmail ?? 'System'}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-[#8A94A6] dark:text-slate-500">
                      {timeAgo(item.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col justify-between rounded-xl border border-[#1C2B33]/[0.09] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1A1D21]">
          <div>
            <div className="pb-3 border-b border-[#1C2B33]/[0.06] dark:border-white/[0.06]">
              <h3 className="text-[15px] font-semibold text-[#1C2B33] dark:text-white">Needs attention</h3>
            </div>
            <ul className="mt-2 space-y-1">
              <AttentionRow
                icon={Wallet}
                label="Overdue invoices"
                value={data.rent.overdueCount}
                urgent
                onClick={() => onNavigate('finances')}
              />
              <AttentionRow
                icon={Mail}
                label="Pending invites"
                value={data.pendingInvites}
                onClick={() => onNavigate('pending')}
              />
              <AttentionRow
                icon={Wrench}
                label="Open repairs"
                value={openRepairs}
                onClick={() => onNavigate('maintenance')}
              />
            </ul>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#1C2B33]/[0.06] pt-3.5 text-xs dark:border-white/[0.06]">
            <span className="text-[#5F6C7B] dark:text-slate-400">Rent due soon</span>
            <span className="font-semibold tabular-nums text-[#1C2B33] dark:text-white">
              {kes(data.rent.dueSoonAmount)}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  primary = false,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition active:scale-[0.985] ${
        primary
          ? 'bg-emerald-700 text-white shadow-2xs hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
          : 'border border-[#D0D5DD] bg-white text-[#1C2B33] shadow-2xs hover:bg-[#F7F8FA] dark:border-white/12 dark:bg-[#1A1D21] dark:text-slate-100 dark:hover:bg-white/5'
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {label}
    </button>
  );
}

function AttentionRow({
  icon: Icon,
  label,
  value,
  urgent = false,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  value: number;
  urgent?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-[#F7F8FA] dark:hover:bg-white/[0.04]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F0F2F5] text-[#5F6C7B] transition group-hover:text-[#1C2B33] dark:bg-white/8 dark:text-slate-400 dark:group-hover:text-white">
          <Icon className="h-4 w-4" strokeWidth={1.85} />
        </span>
        <span className="flex-1 text-[13.5px] font-medium text-[#1C2B33] dark:text-slate-200">{label}</span>
        <span
          className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
            value > 0
              ? urgent
                ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-500/15 dark:text-amber-300'
              : 'bg-[#F0F2F5] text-[#8A94A6] dark:bg-white/8 dark:text-slate-500'
          }`}
        >
          {value}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-[#8A94A6] opacity-0 transition group-hover:opacity-100" />
      </button>
    </li>
  );
}

function TrendChart({ trend, onOpenFinances }: { trend: Overview['trend']; onOpenFinances: () => void }) {
  const [metric, setMetric] = useState<'collected' | 'signups'>('collected');
  const [hover, setHover] = useState<number | null>(null);
  const values = trend.map((t) => t[metric]);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, v) => sum + v, 0);
  const format = (v: number) => (metric === 'collected' ? kes(v) : `${v} ${v === 1 ? 'sign-up' : 'sign-ups'}`);
  const shown = hover ?? trend.length - 1;

  return (
    <section className="rounded-xl border border-[#1C2B33]/[0.09] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1A1D21]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1C2B33] dark:text-white">Last 6 months</h3>
          <p className="mt-0.5 text-xs text-[#5F6C7B] dark:text-slate-400">
            {monthLabel(trend[shown].month)}:{' '}
            <span className="font-semibold tabular-nums text-[#1C2B33] dark:text-white">
              {format(trend[shown][metric])}
            </span>
          </p>
        </div>
        <div
          className="inline-flex rounded-lg bg-[#F0F2F5] p-0.5 dark:bg-white/[0.06]"
          role="tablist"
          aria-label="Chart metric"
        >
          {(['collected', 'signups'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                metric === m
                  ? 'bg-white text-[#1C2B33] shadow-2xs dark:bg-[#242830] dark:text-white'
                  : 'text-[#5F6C7B] hover:text-[#1C2B33] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {m === 'collected' ? 'Rent collected' : 'Sign-ups'}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="relative mt-5 h-44 overflow-hidden rounded-lg">
          {/* Ghosted axis & placeholder columns give structure instead of an empty void */}
          <div aria-hidden className="pointer-events-none flex h-full flex-col justify-between pb-6 opacity-55">
            <div className="border-b border-dashed border-[#1C2B33]/[0.08] dark:border-white/[0.08]" />
            <div className="border-b border-dashed border-[#1C2B33]/[0.08] dark:border-white/[0.08]" />
            <div className="border-b border-dashed border-[#1C2B33]/[0.08] dark:border-white/[0.08]" />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-full items-end gap-3 px-2">
            {trend.map((point, idx) => (
              <div key={point.month} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-10 rounded-t-md bg-[#F0F2F5] dark:bg-white/[0.05]"
                  style={{ height: `${[28, 42, 34, 52, 38, 46][idx % 6]}px` }}
                />
                <span className="text-[11px] font-medium text-[#8A94A6]">{monthLabel(point.month)}</span>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 px-4 text-center backdrop-blur-[1px] dark:bg-[#1A1D21]/80">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F0F2F5] text-[#5F6C7B] dark:bg-white/8 dark:text-slate-300">
              <TrendingUp className="h-4 w-4" />
            </span>
            <p className="mt-2.5 text-[13px] font-semibold text-[#1C2B33] dark:text-white">
              {metric === 'collected' ? 'No rent collected yet' : 'No sign-ups in the last 6 months'}
            </p>
            <p className="mt-0.5 max-w-xs text-xs text-[#5F6C7B] dark:text-slate-400">
              {metric === 'collected'
                ? 'Payments appear here automatically as tenants settle invoices.'
                : 'New landlord and tenant sign-ups will trend here.'}
            </p>
            {metric === 'collected' && (
              <button
                type="button"
                onClick={onOpenFinances}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
              >
                Open rent &amp; payments <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative mt-5 h-44">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 bottom-6 flex flex-col justify-between">
            <div className="border-b border-dashed border-[#1C2B33]/[0.07] dark:border-white/[0.07]" />
            <div className="border-b border-dashed border-[#1C2B33]/[0.07] dark:border-white/[0.07]" />
            <div className="border-b border-[#1C2B33]/[0.09] dark:border-white/[0.09]" />
          </div>
          <div className="relative flex h-full items-end gap-2 sm:gap-3" onMouseLeave={() => setHover(null)}>
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
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span
                    className={`text-[11px] font-semibold tabular-nums transition ${
                      active ? 'text-[#1C2B33] dark:text-white' : 'text-transparent'
                    }`}
                  >
                    {metric === 'collected' ? compactKes(value) : value}
                  </span>
                  <span
                    className={`w-full max-w-11 rounded-t-md transition-all duration-300 ${
                      active
                        ? 'bg-emerald-700 dark:bg-emerald-500'
                        : 'bg-emerald-700/20 group-hover:bg-emerald-700/40 dark:bg-emerald-500/25 dark:group-hover:bg-emerald-500/45'
                    }`}
                    style={{ height: `${Math.max((value / max) * 100, value > 0 ? 6 : 2)}%` }}
                  />
                  <span
                    className={`text-[11px] font-medium ${
                      active ? 'text-[#1C2B33] dark:text-white' : 'text-[#8A94A6]'
                    }`}
                  >
                    {monthLabel(point.month)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

const TYPE_LABELS: Record<string, string> = { residential: 'Homes', commercial: 'Commercial', bnb: 'Short stays' };

function PropertyBreakdown({
  properties,
  onNavigate,
}: {
  properties: Overview['properties'];
  onNavigate: (tab: string) => void;
}) {
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
  const colors = ['#047857', '#0D9488', '#64748B', '#CBD5E1'];
  let offset = 0;
  const segments = byType.map(([, value], index) => {
    const start = offset;
    offset += (value.total / grandTotal) * 100;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  });
  const selectedEntry = byType.find(([type]) => type === selected);

  return (
    <section className="rounded-xl border border-[#1C2B33]/[0.09] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1A1D21]">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[#1C2B33] dark:text-white">Properties</h3>
        <button
          type="button"
          onClick={() => onNavigate('properties')}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          View all
        </button>
      </div>
      {grandTotal === 0 ? (
        <p className="py-12 text-center text-sm text-[#5F6C7B] dark:text-slate-400">
          No properties yet. Add one to see it here.
        </p>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
          <div
            className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full"
            role="img"
            aria-label={`Property breakdown: ${byType.map(([type, t]) => `${TYPE_LABELS[type] ?? type}: ${t.total}`).join(', ')}`}
            style={{ background: `conic-gradient(${segments.join(', ')})` }}
          >
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center dark:bg-[#1A1D21]">
              <span className="text-xl font-semibold tabular-nums text-[#1C2B33] dark:text-white">
                {selectedEntry ? selectedEntry[1].total : grandTotal}
              </span>
              <span className="text-[11px] font-medium text-[#5F6C7B] dark:text-slate-400">
                {selectedEntry ? (TYPE_LABELS[selectedEntry[0]] ?? selectedEntry[0]) : 'properties'}
              </span>
            </div>
          </div>

          <ul className="w-full space-y-1">
            {byType.map(([type, t], index) => {
              const active = selected === type;
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => setSelected(active ? null : type)}
                    onMouseEnter={() => setSelected(type)}
                    onMouseLeave={() => setSelected(null)}
                    onFocus={() => setSelected(type)}
                    onBlur={() => setSelected(null)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                      active
                        ? 'bg-[#F0F2F5] dark:bg-white/[0.06]'
                        : 'hover:bg-[#F7F8FA] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      />
                      <span className="truncate text-[13px] font-medium text-[#1C2B33] dark:text-slate-100">
                        {TYPE_LABELS[type] ?? type}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-[#5F6C7B] dark:text-slate-400">
                      <strong className="font-semibold text-[#1C2B33] dark:text-white">{t.total}</strong> · {t.available}{' '}
                      available
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-7 w-52 animate-pulse rounded-lg bg-[#1C2B33]/[0.07] dark:bg-white/[0.07]" />
          <div className="h-4 w-40 animate-pulse rounded bg-[#1C2B33]/[0.05] dark:bg-white/[0.05]" />
        </div>
        <div className="hidden gap-2 sm:flex">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-white dark:bg-[#1A1D21]" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-white dark:bg-[#1A1D21]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
        <div className="h-64 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-56 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
        <div className="h-56 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
      </div>
    </div>
  );
}

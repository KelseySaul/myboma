import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Home,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Wrench,
} from 'lucide-react';
import type { UserProfile } from '../App';
import { markAllNotificationsRead, markNotificationRead } from '../lib/api';
import { queryKeys, useTenantDashboard } from '../lib/queries';
import { normalizeRentPayment } from '../../../shared/rentUtils';
import { Button } from '@/components/ui/button';
import { Pagination, usePagination } from '@/components/ui/pagination';
import PayRent from './tenant/PayRent';
import RepairDialog from './tenant/RepairDialog';
import {
  dueLabel,
  formatDate,
  formatMoney,
  isOverdue,
  parseDate,
  receiptDownload,
  REPAIR_STATUS_LABELS,
  PRIORITY_LABELS,
  rentState,
  STATUS_LABELS,
  type MaintenanceRequest,
  type RentPayment,
  type TenantLandlord,
  type TenantLease,
  type TenantNotification,
  type TenantProperty,
} from './tenant/helpers';

interface TenantDashboardProps {
  profile: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

/** Fields the tenant dashboard endpoint returns beyond the shared API type. */
type DashboardResponse = {
  property: TenantProperty | null;
  landlord: TenantLandlord | null;
  leases?: TenantLease[];
  requests: MaintenanceRequest[];
  payments: RentPayment[];
  notifications: TenantNotification[];
  repairsEnabled?: boolean;
};

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Home', subtitle: 'Your rent and your home at a glance.' },
  finances: { title: 'Payments', subtitle: 'Every rent invoice and receipt.' },
  maintenance: { title: 'Repairs', subtitle: 'Problems you have reported and their progress.' },
  notices: { title: 'Notices', subtitle: 'Reminders and messages from your landlord.' },
};

export default function TenantDashboard({ profile, activeTab, setActiveTab }: TenantDashboardProps) {
  const queryClient = useQueryClient();
  const { data, error, isPending } = useTenantDashboard(profile.uid);
  const dashboard = data as unknown as DashboardResponse | undefined;

  // Local copies so new repairs / read notices show instantly; the poll then confirms them.
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [repairOpen, setRepairOpen] = useState(false);

  useEffect(() => {
    if (!dashboard) return;
    setRequests(dashboard.requests ?? []);
    setNotifications(dashboard.notifications ?? []);
  }, [dashboard]);

  useEffect(() => {
    if (error) console.error('Tenant dashboard fetch failed:', error);
  }, [error]);

  const payments = useMemo(
    () =>
      (dashboard?.payments ?? [])
        .map((row) => normalizeRentPayment(row) as RentPayment)
        .sort((a, b) => parseDate(b.dueDate).getTime() - parseDate(a.dueDate).getTime()),
    [dashboard?.payments],
  );
  const property = dashboard?.property ?? null;
  const landlord = dashboard?.landlord ?? null;
  const lease = useMemo(() => {
    const leases = dashboard?.leases ?? [];
    return leases.find((l) => l.propertyId === property?.id && l.status === 'active') ?? leases.find((l) => l.propertyId === property?.id) ?? null;
  }, [dashboard?.leases, property?.id]);
  const repairsEnabled = Boolean(dashboard?.repairsEnabled);
  const state = rentState(payments);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.tenantDashboard(profile.uid) });

  const tab = PAGE_TITLES[activeTab] ? activeTab : 'dashboard';
  const heading = PAGE_TITLES[tab];

  if (isPending && !dashboard) return <DashboardSkeleton />;

  if (error && !dashboard) {
    return (
      <Shell title={heading.title} subtitle={heading.subtitle}>
        <EmptyState icon={AlertCircle} title="We couldn't load your home" body="Check your connection and try again.">
          <Button variant="outline" onClick={refresh}>
            Try again
          </Button>
        </EmptyState>
      </Shell>
    );
  }

  return (
    <Shell
      title={heading.title}
      subtitle={heading.subtitle}
      action={
        tab === 'maintenance' && property && repairsEnabled ? (
          <Button data-tour="tenant-report-repair" size="sm" onClick={() => setRepairOpen(true)}>
            <Plus /> Report a repair
          </Button>
        ) : undefined
      }
    >
      {tab === 'dashboard' && (
        <HomeTab
          profile={profile}
          property={property}
          landlord={landlord}
          lease={lease}
          payments={payments}
          state={state}
          repairsEnabled={repairsEnabled}
          openRepairs={requests.filter((r) => r.status !== 'resolved').length}
          onReportRepair={() => setRepairOpen(true)}
          onGoTo={setActiveTab}
          onPaid={refresh}
        />
      )}
      {tab === 'finances' && <PaymentsTab payments={payments} profile={profile} property={property} landlord={landlord} onPaid={refresh} />}
      {tab === 'maintenance' && (
        <RepairsTab requests={requests} repairsEnabled={repairsEnabled} hasHome={Boolean(property)} onReport={() => setRepairOpen(true)} />
      )}
      {tab === 'notices' && (
        <NoticesTab
          notifications={notifications}
          onRead={async (id) => {
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
            try {
              await markNotificationRead(id);
              void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCountAll() });
            } catch (err) {
              console.error('Mark notification read failed:', err);
            }
          }}
          onReadAll={async () => {
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
            try {
              await markAllNotificationsRead();
              void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCountAll() });
            } catch (err: any) {
              toast.error(err.message || 'Could not update notices.');
            }
          }}
        />
      )}

      {property && (
        <RepairDialog
          open={repairOpen}
          onOpenChange={setRepairOpen}
          property={property}
          onCreated={(request) => {
            setRequests((prev) => [request, ...prev]);
            refresh();
          }}
        />
      )}
    </Shell>
  );
}

/* Layout ---------------------------------------------------------------- */

function Shell({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="db w-full min-w-0 pb-20 animate-in fade-in duration-300 sm:pb-10">
      <header className="flex flex-row items-center justify-between gap-3 border-b border-zinc-200/80 bg-white px-3.5 py-3 dark:border-white/[0.08] dark:bg-[#181922] sm:px-6 sm:py-5 md:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">{title}</h1>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">{subtitle}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="mx-auto w-full max-w-6xl px-3 pt-3.5 sm:px-6 sm:pt-5 md:px-8">{children}</div>
    </div>
  );
}

function Card({ children, className = '', ...rest }: { children: React.ReactNode; className?: string; 'data-tour'?: string }) {
  return (
    <section
      {...rest}
      className={`rounded-xl border border-zinc-200/85 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-2xl sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon, title, body, children }: { icon: typeof Home; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-zinc-950 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

function DashboardSkeleton() {
  const block = 'animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800';
  return (
    <div className="w-full px-5 py-6 md:px-8" aria-busy="true" aria-label="Loading">
      <div className={`${block} h-8 w-40`} />
      <div className={`${block} mt-2 h-4 w-64`} />
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={`${block} h-64`} />
        <div className={`${block} h-64`} />
      </div>
      <div className={`${block} mt-4 h-40`} />
    </div>
  );
}

/* Home ------------------------------------------------------------------ */

function HomeTab({
  profile,
  property,
  landlord,
  lease,
  payments,
  state,
  repairsEnabled,
  openRepairs,
  onReportRepair,
  onGoTo,
  onPaid,
}: {
  profile: UserProfile;
  property: TenantProperty | null;
  landlord: TenantLandlord | null;
  lease: TenantLease | null;
  payments: RentPayment[];
  state: ReturnType<typeof rentState>;
  repairsEnabled: boolean;
  openRepairs: number;
  onReportRepair: () => void;
  onGoTo: (tab: string) => void;
  onPaid: () => void;
}) {
  if (!property) {
    return (
      <EmptyState
        icon={Home}
        title="No home linked yet"
        body={`When your landlord adds you to a lease using ${profile.email}, your home, rent and receipts appear here.`}
      />
    );
  }

  const recent = payments.slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <RentCard state={state} landlord={landlord} phone={profile.phone} onPaid={onPaid} />

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Your home</p>
          <h2 className="mt-2 text-xl font-bold text-zinc-950 dark:text-white">{property.title}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500">
            <MapPin className="h-4 w-4" /> {property.location}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-5 text-sm dark:border-zinc-800">
            <Detail label="Monthly rent" value={lease ? formatMoney(lease.rentAmount) : '—'} />
            <Detail label="Deposit" value={lease && Number(lease.depositAmount) > 0 ? formatMoney(lease.depositAmount ?? 0) : '—'} />
            <Detail label="Lease started" value={formatDate(lease?.startDate)} />
            <Detail label="Lease ends" value={lease?.endDate ? formatDate(lease.endDate) : 'No end date'} />
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Recent payments</h2>
            {payments.length > 0 && (
              <button type="button" onClick={() => onGoTo('finances')} className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
                See all
              </button>
            )}
          </div>
          {recent.length ? (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {recent.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} profile={profile} property={property} compact />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No invoices yet. Your first one appears when your landlord's billing starts.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Your landlord</h2>
          {landlord ? (
            <div className="mt-3 space-y-3 text-sm">
              <p className="font-medium text-zinc-950 dark:text-white">{landlord.displayName}</p>
              <div className="flex flex-wrap gap-2">
                {landlord.phone && (
                  <a href={`tel:${landlord.phone}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                )}
                {landlord.email && (
                  <a href={`mailto:${landlord.email}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800">
                    <Mail className="h-4 w-4" /> Email
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Landlord details are not available.</p>
          )}
          {repairsEnabled && (
            <div className="mt-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-950 dark:text-white">Something broken?</p>
                  <p className="text-xs text-zinc-500">
                    {openRepairs ? `${openRepairs} repair${openRepairs === 1 ? '' : 's'} in progress` : 'Report it and track the fix here.'}
                  </p>
                </div>
                <Button variant="outline" onClick={onReportRepair}>
                  <Wrench /> Report
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-zinc-950 dark:text-white">{value}</dd>
    </div>
  );
}

function RentCard({
  state,
  landlord,
  phone,
  onPaid,
}: {
  state: ReturnType<typeof rentState>;
  landlord: TenantLandlord | null;
  phone?: string;
  onPaid: () => void;
}) {
  if (state.kind === 'none') {
    return (
      <Card className="flex flex-col justify-center">
        <Receipt className="h-6 w-6 text-zinc-400" />
        <h2 className="mt-3 text-lg font-semibold text-zinc-950 dark:text-white">No rent invoices yet</h2>
        <p className="mt-1 text-sm text-zinc-500">Invoices are created each month once your lease billing starts. You will get a reminder before each one is due.</p>
      </Card>
    );
  }

  if (state.kind === 'paid' || state.kind === 'verifying') {
    return (
      <Card data-tour="tenant-rent-card" className="flex flex-col justify-center !border-zinc-800 !bg-[#14141A] text-white">
        <CheckCircle2 className="h-6 w-6 text-violet-300" />
        <h2 className="mt-2.5 text-xl font-bold sm:text-2xl">{state.kind === 'paid' ? 'You are all paid up' : 'Payment being checked'}</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-300 sm:text-sm">
          {state.kind === 'paid'
            ? 'Nothing is due right now. We will remind you before your next rent is due.'
            : `Your landlord is confirming your payment of ${formatMoney(state.payment.amount)}.`}
        </p>
      </Card>
    );
  }

  const overdue = state.kind === 'overdue';
  const amount = overdue ? state.total : state.payment.amount;
  return (
    <Card data-tour="tenant-rent-card" className={overdue ? 'border-rose-300 dark:border-rose-900' : ''}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{overdue ? 'Overdue rent' : 'Next rent'}</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-bold tabular-nums tracking-tight text-zinc-950 dark:text-white sm:mt-2 sm:text-4xl">
            {formatMoney(amount)}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            overdue
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
              : state.days <= 3
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
        >
          {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {overdue ? `${state.days} day${state.days === 1 ? '' : 's'} late` : dueLabel(state.days)}
        </span>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500 sm:mt-2 sm:text-sm">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
        {overdue
          ? `${state.count} unpaid invoice${state.count === 1 ? '' : 's'}, oldest due ${formatDate(state.payment.dueDate)}`
          : `Due ${formatDate(state.payment.dueDate)}`}
      </p>
      {overdue && state.count > 1 && (
        <p className="mt-1 text-xs text-zinc-500">Pay the oldest invoice first: {formatMoney(state.payment.amount)}.</p>
      )}
      <div className="mt-4 sm:mt-5">
        <PayRent payment={state.payment} landlord={landlord} defaultPhone={phone} onSubmitted={onPaid} />
      </div>
    </Card>
  );
}

/* Payments -------------------------------------------------------------- */

function PaymentRow({
  payment,
  profile,
  property,
  compact = false,
  action,
}: {
  payment: RentPayment;
  profile: UserProfile;
  property: TenantProperty | null;
  compact?: boolean;
  action?: React.ReactNode;
}) {
  const late = isOverdue(payment);
  const status = late && payment.status !== 'paid' ? 'Overdue' : STATUS_LABELS[payment.status];
  const receipt = payment.status === 'paid' ? receiptDownload(payment, profile.displayName || profile.email, profile.email, property?.title) : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-semibold tabular-nums text-zinc-950 dark:text-white">{formatMoney(payment.amount)}</p>
        <p className="text-xs text-zinc-500">
          Due {formatDate(payment.dueDate)}
          {payment.paidAt ? ` · Paid ${formatDate(payment.paidAt)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            payment.status === 'paid'
              ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-500/20 dark:text-violet-300'
              : late
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
        >
          {status}
        </span>
        {!compact && receipt && (
          <a
            href={receipt.href}
            download={receipt.fileName}
            target={receipt.fileName ? undefined : '_blank'}
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" /> Receipt
          </a>
        )}
        {action}
      </div>
    </li>
  );
}

function PaymentsTab({
  payments,
  profile,
  property,
  landlord,
  onPaid,
}: {
  payments: RentPayment[];
  profile: UserProfile;
  property: TenantProperty | null;
  landlord: TenantLandlord | null;
  onPaid: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [paying, setPaying] = useState<RentPayment | null>(null);
  const filtered = payments.filter((p) =>
    filter === 'all' ? true : filter === 'paid' ? p.status === 'paid' : p.status === 'pending' || p.status === 'overdue',
  );
  const { pageItems, ...pagination } = usePagination(filtered, 10);
  const paidTotal = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const unpaidTotal = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  if (!payments.length) {
    return <EmptyState icon={Receipt} title="No payments yet" body="Your rent invoices and receipts will be listed here." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-zinc-500">Paid so far</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-zinc-950 dark:text-white">{formatMoney(paidTotal)}</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-500">Still to pay</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${unpaidTotal > 0 ? 'text-rose-600' : 'text-zinc-950 dark:text-white'}`}>{formatMoney(unpaidTotal)}</p>
        </Card>
      </div>

      <Card>
        <div role="tablist" aria-label="Filter payments" className="inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          {(['all', 'unpaid', 'paid'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                filter === value ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {pageItems.length ? (
          <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            {pageItems.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                profile={profile}
                property={property}
                action={
                  payment.status === 'pending' || payment.status === 'overdue' ? (
                    <Button size="sm" onClick={() => setPaying(payment)}>
                      Pay
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">Nothing here.</p>
        )}
        <Pagination {...pagination} onPageChange={pagination.setPage} label="invoices" />
      </Card>

      {paying && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500">Paying invoice due {formatDate(paying.dueDate)}</p>
              <p className="text-xl font-bold tabular-nums text-zinc-950 dark:text-white">{formatMoney(paying.amount)}</p>
            </div>
            <button type="button" onClick={() => setPaying(null)} className="text-sm text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
              Close
            </button>
          </div>
          <div className="mt-4 max-w-md">
            <PayRent
              payment={paying}
              landlord={landlord}
              defaultPhone={profile.phone}
              onSubmitted={() => {
                setPaying(null);
                onPaid();
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

/* Repairs --------------------------------------------------------------- */

function RepairsTab({
  requests,
  repairsEnabled,
  hasHome,
  onReport,
}: {
  requests: MaintenanceRequest[];
  repairsEnabled: boolean;
  hasHome: boolean;
  onReport: () => void;
}) {
  const sorted = useMemo(() => [...requests].sort((a, b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime()), [requests]);
  const { pageItems, ...pagination } = usePagination(sorted, 8);

  if (!sorted.length) {
    return (
      <EmptyState
        icon={Wrench}
        title="No repairs reported"
        body={
          !hasHome
            ? 'Repairs can be reported once your landlord links you to a home.'
            : repairsEnabled
              ? 'If something in your home needs fixing, report it here and follow the progress.'
              : 'Your landlord takes repair requests directly. Call or email them from your Home page.'
        }
      >
        {hasHome && repairsEnabled && (
          <Button onClick={onReport}>
            <Plus /> Report a repair
          </Button>
        )}
      </EmptyState>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {pageItems.map((request) => (
          <li key={request.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold text-zinc-950 dark:text-white">{request.title}</h3>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  request.status === 'resolved'
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                }`}
              >
                {REPAIR_STATUS_LABELS[request.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{request.description}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Reported {formatDate(request.createdAt)} · {PRIORITY_LABELS[request.priority]}
            </p>
          </li>
        ))}
      </ul>
      <Pagination {...pagination} onPageChange={pagination.setPage} label="repairs" />
    </Card>
  );
}

/* Notices --------------------------------------------------------------- */

function NoticesTab({
  notifications,
  onRead,
  onReadAll,
}: {
  notifications: TenantNotification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
}) {
  const sorted = useMemo(
    () => [...notifications].sort((a, b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime()),
    [notifications],
  );
  const { pageItems, ...pagination } = usePagination(sorted, 10);
  const unread = notifications.filter((n) => !n.read).length;

  if (!sorted.length) {
    return <EmptyState icon={Bell} title="No notices" body="Rent reminders and messages from your landlord will show up here." />;
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{unread ? `${unread} unread` : 'All read'}</p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={onReadAll}>
            Mark all as read
          </Button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
        {pageItems.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => !note.read && onRead(note.id)}
              className="flex w-full items-start gap-3 py-4 text-left"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${note.read ? 'bg-transparent' : 'bg-zinc-950 dark:bg-white'}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${note.read ? 'text-zinc-700 dark:text-zinc-300' : 'font-semibold text-zinc-950 dark:text-white'}`}>{note.title}</span>
                <span className="mt-0.5 block text-sm text-zinc-500">{note.message}</span>
                <span className="mt-1 block text-xs text-zinc-400">{formatDate(note.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Pagination {...pagination} onPageChange={pagination.setPage} label="notices" />
    </Card>
  );
}

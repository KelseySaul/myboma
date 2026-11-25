import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Home,
  Send,
  Sparkles,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { Property, RentPayment } from './types';
import { ActionButton, EmptyBlock, Panel, SearchInput, StatusPill, daysLate, isLate, kes, shortDate } from './ui';

export type UnitRentFilter = 'all' | 'unpaid' | 'overdue' | 'due-soon' | 'verifying' | 'paid' | 'vacant';

interface UnitRentRow {
  property: Property;
  tenantLabel: string;
  tenantEmail: string;
  payment: RentPayment | null;
  status: 'paid' | 'overdue' | 'due-soon' | 'verifying' | 'unbilled' | 'vacant';
  amount: number;
  lateDays: number;
  daysUntilDue: number | null;
  submittedReceipt: string | null;
}

interface UnitRentBoardProps {
  properties: Property[];
  payments: RentPayment[];
  tenantName: (emailOrId: string) => string;
  isBusy: (key: string) => boolean;
  onRemind: (payment: RentPayment) => void;
  onRemindAll: (payments: RentPayment[]) => void;
  onRecordCash: (payment: RentPayment) => void;
  onAssign?: (property: Property) => void;
  onViewAll?: () => void;
  /** Compact overview mode shows the collection summary + top actionable/unit rows. */
  compact?: boolean;
}

const PROVIDERS: Record<string, string> = {
  mpesa: 'M-Pesa',
  pesapal: 'Card',
  stripe: 'Card',
  manual: 'Cash / Manual',
};

const toMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const paymentMonthKey = (payment: RentPayment) => {
  const source = payment.dueDate || payment.paidAt || payment.createdAt;
  const d = new Date(source);
  return Number.isNaN(d.getTime()) ? '' : toMonthKey(d);
};

const formatMonthOption = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
};

const daysUntil = (dueDate: string) => {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

const STATUS_SORT: Record<UnitRentRow['status'], number> = {
  overdue: 0,
  verifying: 1,
  'due-soon': 2,
  unbilled: 3,
  paid: 4,
  vacant: 5,
};

export default function UnitRentBoard({
  properties,
  payments,
  tenantName,
  isBusy,
  onRemind,
  onRemindAll,
  onRecordCash,
  onAssign,
  onViewAll,
  compact = false,
}: UnitRentBoardProps) {
  const now = new Date();
  const currentMonth = toMonthKey(now);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [filter, setFilter] = useState<UnitRentFilter>('all');
  const [search, setSearch] = useState('');

  const monthOptions = useMemo(() => {
    const set = new Set<string>([currentMonth]);
    for (let i = 1; i <= 5; i += 1) {
      set.add(toMonthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    for (const p of payments) {
      const k = paymentMonthKey(p);
      if (k) set.add(k);
    }
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  }, [payments, currentMonth]);

  const rows = useMemo<UnitRentRow[]>(() => {
    const byProperty = new Map<string, RentPayment[]>();
    for (const p of payments) {
      const list = byProperty.get(p.propertyId) ?? [];
      list.push(p);
      byProperty.set(p.propertyId, list);
    }

    return properties
      .map((property): UnitRentRow => {
        const unitPayments = byProperty.get(property.id) ?? [];
        const monthPayments = unitPayments.filter((p) => paymentMonthKey(p) === selectedMonth);
        // Pick the selected month's invoice; for current month also surface any older unpaid/overdue invoice
        const chosen =
          monthPayments.find((p) => p.status === 'paid') ??
          monthPayments.find((p) => p.status === 'verifying') ??
          monthPayments[0] ??
          (selectedMonth === currentMonth
            ? unitPayments.find((p) => p.status !== 'paid') ?? null
            : null);

        const isVacant = property.status === 'available' && !property.tenantId && !chosen;
        const tenantEmail = (chosen?.tenantId || property.tenantId || '').toLowerCase();
        const tenantLabel = tenantEmail ? tenantName(tenantEmail) : 'Vacant unit';
        const amount = Number(chosen?.amount ?? property.price ?? 0);
        const submittedReceipt =
          chosen && typeof (chosen as any).paymentMetadata?.submittedReceipt === 'string'
            ? String((chosen as any).paymentMetadata.submittedReceipt)
            : null;

        if (isVacant) {
          return {
            property,
            tenantLabel,
            tenantEmail,
            payment: null,
            status: 'vacant',
            amount: Number(property.price || 0),
            lateDays: 0,
            daysUntilDue: null,
            submittedReceipt: null,
          };
        }

        if (!chosen) {
          return {
            property,
            tenantLabel,
            tenantEmail,
            payment: null,
            status: 'unbilled',
            amount: Number(property.price || 0),
            lateDays: 0,
            daysUntilDue: null,
            submittedReceipt: null,
          };
        }

        if (chosen.status === 'paid') {
          return {
            property,
            tenantLabel,
            tenantEmail,
            payment: chosen,
            status: 'paid',
            amount,
            lateDays: 0,
            daysUntilDue: null,
            submittedReceipt,
          };
        }

        if (chosen.status === 'verifying') {
          return {
            property,
            tenantLabel,
            tenantEmail,
            payment: chosen,
            status: 'verifying',
            amount,
            lateDays: daysLate(chosen.dueDate),
            daysUntilDue: daysUntil(chosen.dueDate),
            submittedReceipt,
          };
        }

        const late = isLate(chosen);
        return {
          property,
          tenantLabel,
          tenantEmail,
          payment: chosen,
          status: late ? 'overdue' : 'due-soon',
          amount,
          lateDays: late ? daysLate(chosen.dueDate) : 0,
          daysUntilDue: daysUntil(chosen.dueDate),
          submittedReceipt,
        };
      })
      .sort(
        (a, b) =>
          STATUS_SORT[a.status] - STATUS_SORT[b.status] ||
          b.lateDays - a.lateDays ||
          a.property.title.localeCompare(b.property.title),
      );
  }, [properties, payments, selectedMonth, currentMonth, tenantName]);

  const occupiedRows = useMemo(() => rows.filter((r) => r.status !== 'vacant'), [rows]);
  const paidRows = useMemo(() => occupiedRows.filter((r) => r.status === 'paid'), [occupiedRows]);
  const overdueRows = useMemo(() => occupiedRows.filter((r) => r.status === 'overdue'), [occupiedRows]);
  const dueSoonRows = useMemo(() => occupiedRows.filter((r) => r.status === 'due-soon'), [occupiedRows]);
  const verifyingRows = useMemo(() => occupiedRows.filter((r) => r.status === 'verifying'), [occupiedRows]);
  const vacantRows = useMemo(() => rows.filter((r) => r.status === 'vacant'), [rows]);
  const unpaidRows = useMemo(
    () => occupiedRows.filter((r) => r.status === 'overdue' || r.status === 'due-soon' || r.status === 'verifying'),
    [occupiedRows],
  );
  const remindablePayments = useMemo(
    () =>
      occupiedRows
        .filter((r) => (r.status === 'overdue' || r.status === 'due-soon') && r.payment)
        .map((r) => r.payment!),
    [occupiedRows],
  );

  const totals = useMemo(() => {
    const expected = occupiedRows.reduce((sum, r) => sum + r.amount, 0);
    const collected = paidRows.reduce((sum, r) => sum + r.amount, 0);
    const overdue = overdueRows.reduce((sum, r) => sum + r.amount, 0);
    const dueSoon = dueSoonRows.reduce((sum, r) => sum + r.amount, 0);
    const pct = occupiedRows.length > 0 ? Math.round((paidRows.length / occupiedRows.length) * 100) : 0;
    const moneyPct = expected > 0 ? Math.round((collected / expected) * 100) : 0;
    return { expected, collected, overdue, dueSoon, pct, moneyPct };
  }, [occupiedRows, paidRows, overdueRows, dueSoonRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'all' && row.status === 'vacant') return false;
      if (filter === 'unpaid' && !['overdue', 'due-soon', 'verifying', 'unbilled'].includes(row.status)) return false;
      if (filter === 'overdue' && row.status !== 'overdue') return false;
      if (filter === 'due-soon' && row.status !== 'due-soon') return false;
      if (filter === 'verifying' && row.status !== 'verifying') return false;
      if (filter === 'paid' && row.status !== 'paid') return false;
      if (filter === 'vacant' && row.status !== 'vacant') return false;
      if (!q) return true;
      return [row.property.title, row.property.unitNumber, row.property.location, row.tenantLabel, row.tenantEmail].some(
        (v) => v?.toLowerCase().includes(q),
      );
    });
  }, [rows, filter, search]);

  const pager = usePagination(filtered, compact ? 6 : 12);
  const visibleRows = compact ? filtered.slice(0, 6) : pager.pageItems;

  return (
    <Panel className="overflow-hidden">
      {/* Header + Month Picker + Bulk Remind CTA */}
      <div className="border-b border-[#221844]/[0.07] bg-gradient-to-r from-violet-50/80 via-purple-50/40 to-white px-4 py-4 dark:border-white/[0.07] dark:from-violet-950/35 dark:via-purple-950/15 dark:to-[#181922] sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-600 text-white shadow-xs">
                <Wallet className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-base font-bold tracking-tight text-[#161426] dark:text-white">
                Rent status by unit
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#5D5A73] dark:text-slate-400">
              See which units have paid, who is overdue or due soon, and send reminders in one tap.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!compact && (
              <div className="relative flex items-center">
                <Calendar className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                <select
                  aria-label="Billing month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 cursor-pointer rounded-lg border border-[#D5D2E3] bg-white pl-8 pr-3 text-xs font-semibold text-[#161426] outline-none focus:border-violet-600 dark:border-white/12 dark:bg-[#161722] dark:text-white"
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthOption(m)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {remindablePayments.length > 0 && (
              <ActionButton
                size="sm"
                loading={isBusy('remind-bulk')}
                icon={<Bell className="h-3.5 w-3.5" />}
                onClick={() => onRemindAll(remindablePayments)}
              >
                Remind all unpaid ({remindablePayments.length})
              </ActionButton>
            )}

            {compact && onViewAll && (
              <button
                type="button"
                onClick={onViewAll}
                className="text-xs font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-400"
              >
                Full ledger →
              </button>
            )}
          </div>
        </div>

        {/* At-a-Glance Progress Bar & Status Breakdown */}
        {occupiedRows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-[#161426] dark:text-white">
                <span className="text-violet-700 dark:text-violet-300 tabular-nums">
                  {paidRows.length} of {occupiedRows.length}
                </span>{' '}
                occupied {occupiedRows.length === 1 ? 'unit' : 'units'} paid ({totals.moneyPct}%)
              </span>
              <span className="tabular-nums text-[#5D5A73] dark:text-slate-400">
                <strong className="text-[#161426] dark:text-white">{kes(totals.collected)}</strong> of {kes(totals.expected)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-violet-200/60 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-500 transition-all duration-500"
                style={{ width: `${Math.min(totals.moneyPct, 100)}%` }}
              />
            </div>

            {/* 4 Clickable Summary Tiles */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryTile
                active={filter === 'paid'}
                onClick={() => setFilter(filter === 'paid' ? 'all' : 'paid')}
                icon={CheckCircle2}
                tone="violet"
                label="Paid units"
                count={paidRows.length}
                amount={kes(totals.collected)}
              />
              <SummaryTile
                active={filter === 'overdue'}
                onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')}
                icon={AlertTriangle}
                tone="rose"
                label="Overdue"
                count={overdueRows.length}
                amount={kes(totals.overdue)}
              />
              <SummaryTile
                active={filter === 'due-soon'}
                onClick={() => setFilter(filter === 'due-soon' ? 'all' : 'due-soon')}
                icon={Clock}
                tone="amber"
                label="Due soon"
                count={dueSoonRows.length}
                amount={kes(totals.dueSoon)}
              />
              <SummaryTile
                active={filter === (verifyingRows.length > 0 ? 'verifying' : 'vacant')}
                onClick={() => {
                  const target: UnitRentFilter = verifyingRows.length > 0 ? 'verifying' : 'vacant';
                  setFilter(filter === target ? 'all' : target);
                }}
                icon={verifyingRows.length > 0 ? Sparkles : Home}
                tone={verifyingRows.length > 0 ? 'amber' : 'slate'}
                label={verifyingRows.length > 0 ? 'To confirm' : 'Vacant units'}
                count={verifyingRows.length > 0 ? verifyingRows.length : vacantRows.length}
                amount={verifyingRows.length > 0 ? 'M-Pesa codes' : 'Ready to let'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Filter Pills + Search */}
      <div className="flex flex-col gap-2.5 border-b border-[#221844]/[0.06] px-4 py-3 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Filter units by rent status">
          {(
            [
              { id: 'all', label: 'All occupied', count: occupiedRows.length },
              { id: 'unpaid', label: 'Not paid', count: unpaidRows.length },
              { id: 'overdue', label: 'Overdue', count: overdueRows.length },
              { id: 'due-soon', label: 'Due soon', count: dueSoonRows.length },
              ...(verifyingRows.length > 0 ? [{ id: 'verifying' as const, label: 'Confirm', count: verifyingRows.length }] : []),
              { id: 'paid', label: 'Paid', count: paidRows.length },
              { id: 'vacant', label: 'Vacant', count: vacantRows.length },
            ] as const
          ).map((chip) => {
            const active = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(chip.id)}
                className={`h-8 shrink-0 rounded-lg px-2.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 text-white shadow-2xs'
                    : 'border border-[#221844]/[0.09] bg-white text-[#5D5A73] hover:border-violet-300 hover:text-[#161426] dark:border-white/[0.08] dark:bg-[#181922] dark:text-slate-300'
                }`}
              >
                {chip.label}
                <span className={`ml-1 tabular-nums ${active ? 'opacity-85' : 'opacity-65'}`}>{chip.count}</span>
              </button>
            );
          })}
        </div>

        {!compact && <SearchInput value={search} onChange={setSearch} placeholder="Search unit or tenant…" />}
      </div>

      {/* Unit Rows */}
      {visibleRows.length === 0 ? (
        <EmptyBlock
          icon={<Building2 className="h-5 w-5" />}
          title={occupiedRows.length === 0 && filter !== 'vacant' ? 'No occupied units yet' : 'No units match this filter'}
          body={
            occupiedRows.length === 0 && filter !== 'vacant'
              ? 'Assign a tenant to any unit and MyBoma will generate monthly rent invoices and track payments here automatically.'
              : 'Switch tabs or clear your search to see other units.'
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-[#221844]/[0.06] dark:divide-white/[0.06]">
            {visibleRows.map((row) => {
              const p = row.payment;
              const isVerifying = row.status === 'verifying';
              return (
                <li
                  key={row.property.id}
                  className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-[#F8F7FC] dark:hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                        row.status === 'paid'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                          : row.status === 'overdue'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                            : row.status === 'verifying' || row.status === 'due-soon'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                      }`}
                    >
                      {row.property.unitNumber ? row.property.unitNumber.slice(0, 4) : <Home className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#161426] dark:text-white">
                          {row.property.title}
                          {row.property.unitNumber ? ` · Unit ${row.property.unitNumber}` : ''}
                        </p>
                        <StatusPill status={row.status === 'unbilled' ? 'pending' : row.status} />
                      </div>

                      <p className="mt-0.5 truncate text-xs text-[#5D5A73] dark:text-slate-400">
                        <span className="font-medium text-[#161426] dark:text-slate-200">{row.tenantLabel}</span>
                        {row.status === 'paid' && p && (
                          <>
                            {' · '}Paid {shortDate(p.paidAt || p.dueDate)}
                            {p.paymentProvider ? ` via ${PROVIDERS[p.paymentProvider] ?? p.paymentProvider}` : ''}
                          </>
                        )}
                        {row.status === 'overdue' && p && (
                          <>
                            {' · '}
                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                              {row.lateDays === 0 ? 'Due today' : `${row.lateDays} ${row.lateDays === 1 ? 'day' : 'days'} overdue`}
                            </span>
                            {' · '}Due {shortDate(p.dueDate)}
                          </>
                        )}
                        {row.status === 'due-soon' && p && (
                          <>
                            {' · '}
                            <span className="font-medium text-amber-700 dark:text-amber-300">
                              {row.daysUntilDue === 0
                                ? 'Due today'
                                : row.daysUntilDue && row.daysUntilDue > 0
                                  ? `Due in ${row.daysUntilDue} ${row.daysUntilDue === 1 ? 'day' : 'days'}`
                                  : `Due ${shortDate(p.dueDate)}`}
                            </span>
                            {' · '}
                            {shortDate(p.dueDate)}
                          </>
                        )}
                        {isVerifying && (
                          <>
                            {' · '}
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              {row.submittedReceipt || 'Tenant submitted receipt — review & confirm'}
                            </span>
                          </>
                        )}
                        {row.status === 'vacant' && <> · {row.property.location}</>}
                        {row.status === 'unbilled' && <> · Invoice will generate on next billing cycle</>}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#221844]/[0.05] pt-2.5 dark:border-white/[0.05] sm:shrink-0 sm:justify-end sm:border-0 sm:pt-0">
                    <span className="text-sm font-bold tabular-nums text-[#161426] dark:text-white">
                      {kes(row.amount)}
                      {row.status === 'vacant' && <span className="text-xs font-normal text-[#8A86A1]">/mo</span>}
                    </span>

                    {p && (row.status === 'overdue' || row.status === 'due-soon') && (
                      <div className="flex items-center gap-1.5">
                        <ActionButton
                          size="sm"
                          variant="secondary"
                          icon={<Send className="h-3.5 w-3.5" />}
                          loading={isBusy(`remind-${p.id}`)}
                          onClick={() => onRemind(p)}
                        >
                          Remind
                        </ActionButton>
                        <ActionButton
                          size="sm"
                          loading={isBusy(`cash-${p.id}`)}
                          onClick={() => onRecordCash(p)}
                        >
                          Mark paid
                        </ActionButton>
                      </div>
                    )}

                    {p && isVerifying && (
                      <ActionButton
                        size="sm"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        loading={isBusy(`cash-${p.id}`)}
                        onClick={() => onRecordCash(p)}
                      >
                        Confirm paid
                      </ActionButton>
                    )}

                    {row.status === 'vacant' && onAssign && (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        icon={<UserPlus className="h-3.5 w-3.5" />}
                        onClick={() => onAssign(row.property)}
                      >
                        Assign tenant
                      </ActionButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {compact && filtered.length > 6 && onViewAll && (
            <div className="border-t border-[#221844]/[0.06] px-4 py-3 text-center dark:border-white/[0.06]">
              <button
                type="button"
                onClick={onViewAll}
                className="text-xs font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-400"
              >
                View all {filtered.length} units in Rent &amp; payments →
              </button>
            </div>
          )}

          {!compact && (
            <div className="px-4 pb-4 sm:px-5">
              <Pagination {...pager} onPageChange={pager.setPage} label="units" />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function SummaryTile({
  active,
  onClick,
  icon: Icon,
  tone,
  label,
  count,
  amount,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CheckCircle2;
  tone: 'violet' | 'rose' | 'amber' | 'slate';
  label: string;
  count: number;
  amount: string;
}) {
  const toneStyles = {
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-2.5 text-left transition sm:p-3 ${
        active
          ? 'border-violet-600 bg-violet-50/70 ring-1 ring-violet-600/20 dark:border-violet-400 dark:bg-violet-500/15'
          : 'border-[#221844]/[0.08] bg-white hover:border-violet-300 dark:border-white/[0.08] dark:bg-[#181922]'
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-medium text-[#5D5A73] dark:text-slate-400">{label}</span>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${toneStyles}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums leading-none text-[#161426] dark:text-white">{count}</p>
      <p className="mt-1 truncate text-[11px] font-medium tabular-nums text-[#5D5A73] dark:text-slate-400">{amount}</p>
    </button>
  );
}

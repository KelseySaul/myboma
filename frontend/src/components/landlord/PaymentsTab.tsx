import { useMemo, useState } from 'react';
import { CheckCircle2, Download, Plus, Receipt, Send } from 'lucide-react';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { Booking, Expense, Property, RentPayment } from './types';
import { ActionButton, EmptyBlock, FilterChips, Panel, SearchInput, StatusPill, daysLate, isLate, kes, shortDate } from './ui';
import UnitRentBoard from './UnitRentBoard';

type Filter = 'all' | 'unpaid' | 'late' | 'verifying' | 'paid';

interface PaymentsTabProps {
  properties: Property[];
  payments: RentPayment[];
  expenses: Expense[];
  bookings: Booking[];
  tenantName: (emailOrId: string) => string;
  propertyName: (id: string) => string;
  isBusy: (key: string) => boolean;
  onRemind: (payment: RentPayment) => void;
  onRemindAll: (payments: RentPayment[]) => void;
  onRecordCash: (payment: RentPayment) => void;
  onAssignProperty: (property: Property) => void;
  onRecordExpense: () => void;
}

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const PROVIDERS: Record<string, string> = { mpesa: 'M-Pesa', pesapal: 'Card', stripe: 'Card', manual: 'Cash' };

export default function PaymentsTab(props: PaymentsTabProps) {
  const { properties, payments, expenses, bookings } = props;
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const now = new Date();
  const inThisMonth = (value?: string | null) => {
    if (!value) return false;
    const d = new Date(value);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const summary = useMemo(() => {
    const paidThisMonth = payments.filter((p) => p.status === 'paid' && inThisMonth(p.paidAt || p.dueDate));
    const unpaid = payments.filter((p) => p.status !== 'paid');
    return {
      received: paidThisMonth.reduce((s, p) => s + Number(p.amount || 0), 0),
      unpaid: unpaid.reduce((s, p) => s + Number(p.amount || 0), 0),
      late: payments.filter(isLate).reduce((s, p) => s + Number(p.amount || 0), 0),
      expenses: expenses.filter((e) => inThisMonth(e.expenseDate)).reduce((s, e) => s + Number(e.amount || 0), 0),
      shortStays: bookings.filter((b) => b.status === 'confirmed' && inThisMonth(b.startDate)).reduce((s, b) => s + Number(b.totalPrice || 0), 0),
    };
  }, [payments, expenses, bookings]);

  const verifyingCount = useMemo(() => payments.filter((p) => p.status === 'verifying').length, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (filter === 'paid' && p.status !== 'paid') return false;
      if (filter === 'unpaid' && p.status === 'paid') return false;
      if (filter === 'late' && !isLate(p)) return false;
      if (filter === 'verifying' && p.status !== 'verifying') return false;
      if (!q) return true;
      return [props.tenantName(p.tenantId), p.tenantId, props.propertyName(p.propertyId)].some((v) => v.toLowerCase().includes(q));
    });
  }, [payments, filter, search]);

  const { pageItems, ...pager } = usePagination(filtered, 10);
  const expensePager = usePagination(expenses, 8);

  const exportCsv = () => {
    const header = ['Tenant', 'Property', 'Amount (KES)', 'Due date', 'Status', 'Paid on', 'Paid by'];
    const rows = filtered.map((p) => [
      props.tenantName(p.tenantId), props.propertyName(p.propertyId), p.amount, p.dueDate, p.status,
      p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : '', p.paymentProvider ? PROVIDERS[p.paymentProvider] ?? p.paymentProvider : '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `myboma-rent-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: 'Received this month', value: summary.received },
    { label: 'Still unpaid', value: summary.unpaid },
    { label: 'Overdue', value: summary.late },
    { label: 'Expenses this month', value: summary.expenses },
    ...(bookings.length ? [{ label: 'Short-stay income', value: summary.shortStays }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#161426] dark:text-white sm:text-2xl">Rent &amp; payments</h1>
          <p className="text-xs text-[#5D5A73] dark:text-slate-400 sm:text-sm">
            Monthly invoices run automatically. M-Pesa and card payments reconcile in real time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {payments.length > 0 && <ActionButton size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Export CSV</ActionButton>}
          <ActionButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={props.onRecordExpense}>Record expense</ActionButton>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${cards.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border border-[#221844]/[0.09] bg-white p-3.5 dark:border-white/[0.08] dark:bg-[#181922] sm:p-5 ${card.label === 'Received this month' ? 'finance-highlight' : 'stat-tint'}`}>
            <p className="truncate text-xs text-[#5D5A73] dark:text-slate-400 sm:text-sm">{card.label}</p>
            <p className="mt-1.5 text-lg font-bold tabular-nums text-[#161426] dark:text-white sm:mt-2 sm:text-xl">{kes(card.value)}</p>
          </div>
        ))}
      </div>

      {/* Full Unit-by-Unit Rent Status Board with Month Picker + Bulk Reminders */}
      <UnitRentBoard
        properties={properties}
        payments={payments}
        tenantName={props.tenantName}
        isBusy={props.isBusy}
        onRemind={props.onRemind}
        onRemindAll={props.onRemindAll}
        onRecordCash={props.onRecordCash}
        onAssign={props.onAssignProperty}
      />

      {/* Full Invoice Ledger */}
      <Panel title="All rent invoices">
        <div className="flex flex-col gap-3 border-b border-[#221844]/[0.07] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between dark:border-white/[0.07] sm:px-5">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All', count: payments.length },
              { id: 'unpaid', label: 'Unpaid', count: payments.filter((p) => p.status !== 'paid').length },
              { id: 'late', label: 'Overdue', count: payments.filter(isLate).length },
              ...(verifyingCount > 0 ? [{ id: 'verifying' as const, label: 'Confirm', count: verifyingCount }] : []),
              { id: 'paid', label: 'Paid', count: payments.filter((p) => p.status === 'paid').length },
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Search tenant or property" />
        </div>

        {filtered.length === 0 ? (
          <EmptyBlock
            icon={<Receipt className="h-5 w-5" />}
            title={payments.length ? 'Nothing matches' : 'No invoices yet'}
            body={payments.length ? 'Try a different filter.' : 'Invoices appear here once a tenant is assigned to a unit.'}
          />
        ) : (
          <>
            <ul className="divide-y divide-[#221844]/[0.06] dark:divide-white/[0.06]">
              {pageItems.map((payment) => {
                const late = isLate(payment);
                const isVerifying = payment.status === 'verifying';
                const submittedReceipt =
                  typeof payment.paymentMetadata?.submittedReceipt === 'string'
                    ? payment.paymentMetadata.submittedReceipt
                    : null;
                return (
                  <li key={payment.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#161426] dark:text-white">{props.tenantName(payment.tenantId)}</p>
                        <StatusPill status={isVerifying ? 'verifying' : late ? 'overdue' : payment.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#5D5A73] dark:text-slate-400">
                        {props.propertyName(payment.propertyId)} · due {shortDate(payment.dueDate)}
                        {payment.status === 'paid'
                          ? ` · paid ${shortDate(payment.paidAt)}${payment.paymentProvider ? ` by ${PROVIDERS[payment.paymentProvider] ?? payment.paymentProvider}` : ''}`
                          : isVerifying && submittedReceipt
                            ? ` · ${submittedReceipt}`
                            : late
                              ? ` · ${daysLate(payment.dueDate)} days late`
                              : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2.5 sm:shrink-0 sm:justify-end">
                      <span className="text-sm font-semibold tabular-nums text-[#161426] dark:text-white">{kes(payment.amount)}</span>
                      {payment.status !== 'paid' && (
                        <div className="flex gap-2">
                          {!isVerifying && (
                            <ActionButton size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} loading={props.isBusy(`remind-${payment.id}`)} onClick={() => props.onRemind(payment)}>
                              Remind
                            </ActionButton>
                          )}
                          <ActionButton
                            size="sm"
                            icon={isVerifying ? <CheckCircle2 className="h-3.5 w-3.5" /> : undefined}
                            loading={props.isBusy(`cash-${payment.id}`)}
                            onClick={() => props.onRecordCash(payment)}
                          >
                            {isVerifying ? 'Confirm paid' : 'Mark paid'}
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 pb-4 sm:px-5"><Pagination {...pager} onPageChange={pager.setPage} label="invoices" /></div>
          </>
        )}
      </Panel>

      <Panel title="Expenses" action={<ActionButton size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={props.onRecordExpense}>Add</ActionButton>}>
        {expenses.length === 0 ? (
          <p className="p-5 text-sm text-[#5D5A73] dark:text-slate-400">Record repairs, utilities and other costs to see what you really earn.</p>
        ) : (
          <>
            <ul className="divide-y divide-[#221844]/[0.06] dark:divide-white/[0.06]">
              {expensePager.pageItems.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#161426] dark:text-white">{expense.description || expense.category}</p>
                    <p className="truncate text-xs capitalize text-[#5D5A73] dark:text-slate-400">
                      {expense.category} · {shortDate(expense.expenseDate)}{expense.propertyId ? ` · ${props.propertyName(expense.propertyId)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[#161426] dark:text-white">{kes(expense.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="px-4 pb-4 sm:px-5">
              <Pagination {...expensePager} onPageChange={expensePager.setPage} label="expenses" />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

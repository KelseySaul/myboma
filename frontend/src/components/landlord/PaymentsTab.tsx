import { useMemo, useState } from 'react';
import { Download, Plus, Receipt } from 'lucide-react';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { Booking, Expense, RentPayment } from './types';
import { ActionButton, EmptyBlock, FilterChips, Panel, SearchInput, StatusPill, daysLate, isLate, kes, shortDate } from './ui';

type Filter = 'all' | 'unpaid' | 'late' | 'paid';

interface PaymentsTabProps {
  payments: RentPayment[];
  expenses: Expense[];
  bookings: Booking[];
  tenantName: (emailOrId: string) => string;
  propertyName: (id: string) => string;
  isBusy: (key: string) => boolean;
  onRemind: (payment: RentPayment) => void;
  onRecordCash: (payment: RentPayment) => void;
  onRecordExpense: () => void;
}

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const PROVIDERS: Record<string, string> = { mpesa: 'M-Pesa', pesapal: 'Card', stripe: 'Card', manual: 'Cash' };

export default function PaymentsTab(props: PaymentsTabProps) {
  const { payments, expenses, bookings } = props;
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (filter === 'paid' && p.status !== 'paid') return false;
      if (filter === 'unpaid' && p.status === 'paid') return false;
      if (filter === 'late' && !isLate(p)) return false;
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
    { label: 'Late', value: summary.late },
    { label: 'Expenses this month', value: summary.expenses },
    ...(bookings.length ? [{ label: 'Short-stay income this month', value: summary.shortStays }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Payments</h1>
          <p className="text-sm text-zinc-500">Invoices are created every month. M-Pesa and card payments are recorded automatically.</p>
        </div>
        <div className="flex gap-2">
          {payments.length > 0 && <ActionButton variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Export</ActionButton>}
          <ActionButton icon={<Plus className="h-4 w-4" />} onClick={props.onRecordExpense}>Record expense</ActionButton>
        </div>
      </div>

      <div className={`grid gap-4 sm:grid-cols-2 ${cards.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">{card.label}</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-zinc-950 dark:text-white">{kes(card.value)}</p>
          </div>
        ))}
      </div>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All', count: payments.length },
              { id: 'unpaid', label: 'Unpaid', count: payments.filter((p) => p.status !== 'paid').length },
              { id: 'late', label: 'Late', count: payments.filter(isLate).length },
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
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pageItems.map((payment) => {
                const late = isLate(payment);
                return (
                  <li key={payment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{props.tenantName(payment.tenantId)}</p>
                        <StatusPill status={late ? 'overdue' : payment.status} />
                      </div>
                      <p className="truncate text-xs text-zinc-500">
                        {props.propertyName(payment.propertyId)} · due {shortDate(payment.dueDate)}
                        {payment.status === 'paid'
                          ? ` · paid ${shortDate(payment.paidAt)}${payment.paymentProvider ? ` by ${PROVIDERS[payment.paymentProvider] ?? payment.paymentProvider}` : ''}`
                          : late ? ` · ${daysLate(payment.dueDate)} days late` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">{kes(payment.amount)}</span>
                      {payment.status !== 'paid' && payment.status !== 'verifying' && (
                        <div className="flex gap-2">
                          <ActionButton size="sm" variant="secondary" loading={props.isBusy(`remind-${payment.id}`)} onClick={() => props.onRemind(payment)}>Remind</ActionButton>
                          <ActionButton size="sm" loading={props.isBusy(`cash-${payment.id}`)} onClick={() => props.onRecordCash(payment)}>Record cash</ActionButton>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 pb-4"><Pagination {...pager} onPageChange={pager.setPage} label="invoices" /></div>
          </>
        )}
      </Panel>

      <Panel title="Expenses" action={<ActionButton size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={props.onRecordExpense}>Add</ActionButton>}>
        {expenses.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">Record repairs, utilities and other costs to see what you really earn.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {expensePager.pageItems.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">{expense.description || expense.category}</p>
                    <p className="truncate text-xs capitalize text-zinc-500">
                      {expense.category} · {shortDate(expense.expenseDate)}{expense.propertyId ? ` · ${props.propertyName(expense.propertyId)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">{kes(expense.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="px-5 pb-4">
              <Pagination {...expensePager} onPageChange={expensePager.setPage} label="expenses" />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

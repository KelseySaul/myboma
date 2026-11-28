import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Mail,
  RefreshCw,
  Search,
  Send,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getSuperAdminRevenue,
  resendSubscriptionReceipt,
  sendSubscriptionReminder,
  type SuperAdminSubscriptionPayment,
  type SuperAdminRevenueUser,
} from '../../lib/api';

const formatKes = (value: number | null | undefined) =>
  `KES ${Math.round(Number(value) || 0).toLocaleString('en-KE')}`;

const formatDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const ACCOUNT_TYPE_LABELS: Record<SuperAdminRevenueUser['accountType'], string> = {
  superadmin: 'Super Admin',
  property_manager: 'Property Manager',
  landlord: 'Landlord',
  tenant: 'Tenant',
  caretaker: 'Caretaker',
  hunter: 'House Hunter',
};

const SOURCE_LABELS: Record<SuperAdminRevenueUser['source'], string> = {
  self_registered: 'Self-registered',
  created_by_me: 'Created by you',
  invited_by_other: 'Invited',
};

function downloadReceiptText(payment: SuperAdminSubscriptionPayment) {
  const text =
    payment.receiptText ||
    [
      'MYBOMA SUBSCRIPTION RECEIPT',
      `Receipt: ${payment.receiptNumber}`,
      `Subscriber: ${payment.userName} (${payment.userEmail})`,
      `Account type: ${payment.accountType === 'property_manager' ? 'Property Manager' : 'Landlord'}`,
      `Plan: ${payment.planLabel}`,
      `Amount: ${formatKes(payment.amount)}`,
      `Channel: ${payment.paymentChannel}`,
      `Reference: ${payment.paymentReference}`,
      `Period: ${formatDate(payment.periodStart)} to ${formatDate(payment.periodEnd)}`,
    ].join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${payment.receiptNumber}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SuperAdminRevenueView() {
  const [section, setSection] = useState<'users' | 'payments' | 'renewals'>('users');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'self_registered' | 'created_by_me' | 'invited_by_other'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'landlord' | 'property_manager' | 'tenant' | 'caretaker' | 'hunter'>('all');
  const [userSearch, setUserSearch] = useState('');

  const [paymentAudience, setPaymentAudience] = useState<'all' | 'landlord' | 'property_manager'>('all');
  const [paymentStatus, setPaymentStatus] = useState<'all' | 'confirmed' | 'pending' | 'rejected'>('confirmed');
  const [paymentSearch, setPaymentSearch] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<SuperAdminSubscriptionPayment | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['superadmin-revenue'],
    queryFn: getSuperAdminRevenue,
    staleTime: 30_000,
  });

  const filteredUsers = useMemo(() => {
    const list = (data?.users ?? []).filter((u) => u.accountType !== 'superadmin');
    const q = userSearch.trim().toLowerCase();
    return list.filter((u) => {
      if (sourceFilter !== 'all' && u.source !== sourceFilter) return false;
      if (roleFilter !== 'all' && u.accountType !== roleFilter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      );
    });
  }, [data?.users, sourceFilter, roleFilter, userSearch]);

  const filteredPayments = useMemo(() => {
    const list = data?.payments ?? [];
    const q = paymentSearch.trim().toLowerCase();
    return list.filter((p) => {
      if (paymentAudience !== 'all' && p.accountType !== paymentAudience) return false;
      if (paymentStatus !== 'all' && p.status !== paymentStatus) return false;
      if (!q) return true;
      return (
        p.userName.toLowerCase().includes(q) ||
        p.userEmail.toLowerCase().includes(q) ||
        p.receiptNumber.toLowerCase().includes(q) ||
        p.paymentReference.toLowerCase().includes(q)
      );
    });
  }, [data?.payments, paymentAudience, paymentStatus, paymentSearch]);

  const usersPager = usePagination(filteredUsers, 12);
  const paymentsPager = usePagination(filteredPayments, 12);

  const handleRemind = async (user: SuperAdminRevenueUser) => {
    setBusyId(`remind-${user.uid}`);
    try {
      const res = await sendSubscriptionReminder(user.uid);
      toast.success(res.message || `Reminder sent to ${user.email}`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not send reminder.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResendReceipt = async (payment: SuperAdminSubscriptionPayment) => {
    setBusyId(`receipt-${payment.id}`);
    try {
      const res = await resendSubscriptionReceipt(payment.id);
      toast.success(res.message || `Receipt resent to ${payment.userEmail}`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not resend receipt.');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white dark:bg-[#181922]" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-white dark:bg-[#181922]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Could not load revenue and accounts data.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { summary, dueAccounts } = data;

  return (
    <div className="space-y-5">
      {/* Top KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-zinc-200/80 dark:border-white/[0.08]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>Total earnings</span>
              <TrendingUp className="h-4 w-4 text-violet-600" />
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-zinc-950 dark:text-white sm:text-2xl">
              {formatKes(summary.totalRevenueKes)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatKes(summary.thisMonthKes)} this month · {summary.totalConfirmedPayments} receipts
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 dark:border-white/[0.08]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>From Landlords</span>
              <Wallet className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-zinc-950 dark:text-white sm:text-2xl">
              {formatKes(summary.landlordRevenueKes)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {summary.activePaidLandlords} active paid · {summary.roleCounts.landlord} total landlords
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 dark:border-white/[0.08]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>From Property Managers</span>
              <Building2 className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-zinc-950 dark:text-white sm:text-2xl">
              {formatKes(summary.propertyManagerRevenueKes)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {summary.activePaidPropertyManagers} active paid · {summary.roleCounts.property_manager} total managers
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 dark:border-white/[0.08]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>Accounts by origin</span>
              <UserPlus className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-zinc-950 dark:text-white sm:text-2xl">
              {summary.selfRegisteredCount} <span className="text-sm font-medium text-zinc-400">self</span> · {summary.createdByMeCount} <span className="text-sm font-medium text-zinc-400">yours</span>
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {summary.roleCounts.tenant} tenants · {summary.roleCounts.hunter} hunters · {summary.roleCounts.caretaker} caretakers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-navigation + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="inline-flex rounded-xl border border-zinc-200/80 bg-white p-1 dark:border-white/10 dark:bg-[#181922]">
          {(
            [
              { id: 'users', label: `All accounts (${summary.totalUsers - summary.roleCounts.superadmin})`, icon: Users },
              { id: 'payments', label: `Earnings & receipts (${summary.totalConfirmedPayments})`, icon: FileText },
              { id: 'renewals', label: `Renewals due (${dueAccounts.length})`, icon: Bell },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 gap-1.5 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* SECTION 1: ALL ACCOUNTS (SELF-REGISTERED VS CREATED BY ADMIN + ROLE FILTER) */}
      {section === 'users' && (
        <Card className="overflow-hidden py-0 gap-0">
          <CardHeader className="space-y-3 border-b border-zinc-100 p-4 dark:border-white/[0.07] sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Accounts &amp; registration origin</CardTitle>
                <CardDescription className="text-xs">
                  Filter self-registered users vs accounts you created, broken down by Landlord, Property Manager, Tenant, Caretaker, or House Hunter.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name, email, phone..."
                  className="h-9 pl-8 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'all', label: 'All origins' },
                    { id: 'self_registered', label: `Self-registered (${summary.selfRegisteredCount})` },
                    { id: 'created_by_me', label: `Created by you (${summary.createdByMeCount})` },
                    { id: 'invited_by_other', label: `Invited by others (${summary.invitedByOtherCount})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSourceFilter(item.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      sourceFilter === item.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <span className="hidden h-4 w-px bg-zinc-200 dark:bg-white/10 sm:inline-block" />

              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'all', label: 'All roles' },
                    { id: 'landlord', label: `Landlord (${summary.roleCounts.landlord})` },
                    { id: 'property_manager', label: `Property Manager (${summary.roleCounts.property_manager})` },
                    { id: 'tenant', label: `Tenant (${summary.roleCounts.tenant})` },
                    { id: 'caretaker', label: `Caretaker (${summary.roleCounts.caretaker})` },
                    { id: 'hunter', label: `Hunter (${summary.roleCounts.hunter})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRoleFilter(item.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      roleFilter === item.id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/80 dark:bg-white/[0.02]">
                    <TableHead className="px-4 py-3">User</TableHead>
                    <TableHead className="px-4 py-3">Role</TableHead>
                    <TableHead className="px-4 py-3">Origin</TableHead>
                    <TableHead className="hidden px-4 py-3 md:table-cell">Plan &amp; renewal</TableHead>
                    <TableHead className="px-4 py-3 text-right">Paid to you</TableHead>
                    <TableHead className="px-4 py-3 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersPager.pageItems.map((u) => {
                    const canRemind =
                      (u.accountType === 'landlord' || u.accountType === 'property_manager') &&
                      Boolean(u.subscriptionPlan && u.subscriptionPlan !== 'free' && u.subscriptionExpiresAt);
                    return (
                      <TableRow key={u.uid}>
                        <TableCell className="px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-zinc-950 dark:text-white">{u.displayName}</p>
                            <p className="truncate text-[11px] text-zinc-500">{u.email}</p>
                            {u.phone && <p className="text-[11px] text-zinc-400">{u.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge
                            variant={
                              u.accountType === 'property_manager'
                                ? 'warning'
                                : u.accountType === 'landlord'
                                  ? 'indigo'
                                  : u.accountType === 'tenant'
                                    ? 'success'
                                    : 'secondary'
                            }
                          >
                            {ACCOUNT_TYPE_LABELS[u.accountType]}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="space-y-0.5">
                            <Badge variant={u.source === 'created_by_me' ? 'purple' : 'outline'}>
                              {SOURCE_LABELS[u.source]}
                            </Badge>
                            {u.source === 'invited_by_other' && u.createdByName && (
                              <p className="text-[11px] text-zinc-400">by {u.createdByName}</p>
                            )}
                            <p className="text-[11px] text-zinc-400">Joined {formatDate(u.createdAt)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden px-4 py-3 md:table-cell">
                          {u.accountType === 'landlord' || u.accountType === 'property_manager' ? (
                            <div className="text-xs">
                              <p className="font-medium text-zinc-900 dark:text-zinc-100">{u.subscriptionPlanLabel}</p>
                              <p className="text-[11px] text-zinc-500">
                                {u.subscriptionStatus === 'expired' || (u.daysUntilExpiry !== null && u.daysUntilExpiry < 0)
                                  ? `Expired ${formatDate(u.subscriptionExpiresAt)}`
                                  : u.subscriptionExpiresAt
                                    ? `Due ${formatDate(u.subscriptionExpiresAt)}`
                                    : u.subscriptionStatus}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <p className="text-xs font-semibold tabular-nums text-zinc-950 dark:text-white">
                            {u.totalPaidKes > 0 ? formatKes(u.totalPaidKes) : '—'}
                          </p>
                          {u.paymentCount > 0 && (
                            <p className="text-[11px] text-zinc-400">
                              {u.paymentCount} {u.paymentCount === 1 ? 'receipt' : 'receipts'}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          {canRemind ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === `remind-${u.uid}`}
                              onClick={() => handleRemind(u)}
                              className="h-7 gap-1 text-[11px]"
                            >
                              <Send className="h-3 w-3" />
                              {busyId === `remind-${u.uid}` ? 'Sending…' : 'Remind'}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-zinc-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {usersPager.pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-xs text-zinc-400">
                        No accounts match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="border-t border-zinc-100 px-4 pb-3 dark:border-white/[0.07]">
              <Pagination
                page={usersPager.page}
                pageCount={usersPager.pageCount}
                total={usersPager.total}
                pageSize={usersPager.pageSize}
                onPageChange={usersPager.setPage}
                label="accounts"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 2: SUBSCRIPTION EARNINGS & RECEIPTS LEDGER */}
      {section === 'payments' && (
        <Card className="overflow-hidden py-0 gap-0">
          <CardHeader className="space-y-3 border-b border-zinc-100 p-4 dark:border-white/[0.07] sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Subscription payments &amp; receipts</CardTitle>
                <CardDescription className="text-xs">
                  Every payment made by Landlords and Property Managers. Receipts are emailed automatically on confirmation and can be downloaded or resent here.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  placeholder="Search receipt #, email, ref..."
                  className="h-9 pl-8 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'all', label: 'All payers' },
                    { id: 'landlord', label: `Landlords (${formatKes(summary.landlordRevenueKes)})` },
                    { id: 'property_manager', label: `Property Managers (${formatKes(summary.propertyManagerRevenueKes)})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPaymentAudience(item.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      paymentAudience === item.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="hidden h-4 w-px bg-zinc-200 dark:bg-white/10 sm:inline-block" />
              <div className="flex items-center gap-1">
                {(['confirmed', 'pending', 'rejected', 'all'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPaymentStatus(st)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition cursor-pointer ${
                      paymentStatus === st
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/80 dark:bg-white/[0.02]">
                    <TableHead className="px-4 py-3">Subscriber</TableHead>
                    <TableHead className="px-4 py-3">Plan &amp; period</TableHead>
                    <TableHead className="hidden px-4 py-3 sm:table-cell">Receipt &amp; method</TableHead>
                    <TableHead className="px-4 py-3 text-right">Amount</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3 text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsPager.pageItems.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4 py-3">
                        <p className="text-xs font-semibold text-zinc-950 dark:text-white">{p.userName}</p>
                        <p className="text-[11px] text-zinc-500">{p.userEmail}</p>
                        <Badge variant={p.accountType === 'property_manager' ? 'warning' : 'indigo'} className="mt-1">
                          {p.accountType === 'property_manager' ? 'Property Manager' : 'Landlord'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.planLabel}</p>
                        <p className="text-[11px] text-zinc-500">
                          {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                        </p>
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 sm:table-cell">
                        <p className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">{p.receiptNumber}</p>
                        <p className="text-[11px] uppercase text-zinc-400">
                          {p.paymentChannel} · {p.paymentReference}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right text-xs font-bold tabular-nums text-zinc-950 dark:text-white">
                        {formatKes(p.amount)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={p.status === 'confirmed' ? 'success' : p.status === 'pending' ? 'warning' : 'destructive'}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {p.status === 'confirmed' ? (
                          <div className="inline-flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setPreviewReceipt(p)} className="h-7 px-2 text-[11px]">
                              View
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => downloadReceiptText(p)} title="Download receipt" className="h-7 px-2">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === `receipt-${p.id}`}
                              onClick={() => handleResendReceipt(p)}
                              className="h-7 gap-1 px-2 text-[11px]"
                            >
                              <Mail className="h-3 w-3" />
                              {busyId === `receipt-${p.id}` ? '…' : 'Email'}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {paymentsPager.pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-xs text-zinc-400">
                        No subscription payments found for this filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="border-t border-zinc-100 px-4 pb-3 dark:border-white/[0.07]">
              <Pagination
                page={paymentsPager.page}
                pageCount={paymentsPager.pageCount}
                total={paymentsPager.total}
                pageSize={paymentsPager.pageSize}
                onPageChange={paymentsPager.setPage}
                label="receipts"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3: RENEWALS DUE & AUTOMATED REMINDERS */}
      {section === 'renewals' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 text-xs text-zinc-600 dark:border-white/10 dark:bg-[#181922] dark:text-zinc-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-zinc-950 dark:text-white">Automated renewal reminders &amp; receipts are active</p>
              <p className="mt-0.5">
                MyBoma automatically emails and pushes reminders to paid Landlords and Property Managers at <strong>7 days before</strong>, <strong>2 days before</strong>, <strong>on expiry day</strong>, and after expiry (days 1, 3, and 7). Confirmed payments automatically send an official receipt and save a downloadable copy in their Settings.
              </p>
            </div>
          </div>

          <Card className="overflow-hidden py-0 gap-0">
            <CardHeader className="border-b border-zinc-100 p-4 dark:border-white/[0.07] sm:px-5">
              <CardTitle className="text-base">Subscriptions expiring soon or overdue</CardTitle>
              <CardDescription className="text-xs">
                Paid Landlords and Property Managers due within 14 days or already expired. Send an immediate email + push reminder any time.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50/80 dark:bg-white/[0.02]">
                      <TableHead className="px-4 py-3">Account</TableHead>
                      <TableHead className="px-4 py-3">Type</TableHead>
                      <TableHead className="px-4 py-3">Plan</TableHead>
                      <TableHead className="px-4 py-3">Due status</TableHead>
                      <TableHead className="px-4 py-3 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dueAccounts.map((u) => {
                      const days = u.daysUntilExpiry ?? 0;
                      const expired = days < 0 || u.subscriptionStatus === 'expired';
                      return (
                        <TableRow key={u.uid}>
                          <TableCell className="px-4 py-3">
                            <p className="text-xs font-semibold text-zinc-950 dark:text-white">{u.displayName}</p>
                            <p className="text-[11px] text-zinc-500">{u.email}</p>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge variant={u.accountType === 'property_manager' ? 'warning' : 'indigo'}>
                              {ACCOUNT_TYPE_LABELS[u.accountType]}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {u.subscriptionPlanLabel}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Clock className={`h-3.5 w-3.5 ${expired ? 'text-rose-600' : 'text-amber-600'}`} />
                              <span className={`font-semibold ${expired ? 'text-rose-600' : 'text-amber-700 dark:text-amber-400'}`}>
                                {expired
                                  ? `Expired ${Math.abs(days)}d ago`
                                  : days === 0
                                    ? 'Expires today'
                                    : `Due in ${days}d`}
                              </span>
                              <span className="text-[11px] text-zinc-400">({formatDate(u.subscriptionExpiresAt)})</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              disabled={busyId === `remind-${u.uid}`}
                              onClick={() => handleRemind(u)}
                              className="h-8 gap-1.5 text-xs"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {busyId === `remind-${u.uid}` ? 'Sending…' : 'Send reminder'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {dueAccounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-28 text-center text-xs text-zinc-400">
                          All paid Landlords and Property Managers are up to date (none due within 14 days).
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Receipt preview dialog */}
      <Dialog open={Boolean(previewReceipt)} onOpenChange={(open) => !open && setPreviewReceipt(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Subscription receipt</DialogTitle>
            <DialogDescription>
              {previewReceipt?.receiptNumber} · {previewReceipt?.userName}
            </DialogDescription>
          </DialogHeader>
          {previewReceipt && (
            <div className="space-y-3 text-sm">
              <dl className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {[
                  ['Receipt #', previewReceipt.receiptNumber],
                  ['Subscriber', `${previewReceipt.userName} (${previewReceipt.userEmail})`],
                  ['Account type', previewReceipt.accountType === 'property_manager' ? 'Property Manager' : 'Landlord'],
                  ['Plan', previewReceipt.planLabel],
                  ['Amount paid', formatKes(previewReceipt.amount)],
                  ['Method', `${previewReceipt.paymentChannel.toUpperCase()} (${previewReceipt.paymentReference})`],
                  ['Period', `${formatDate(previewReceipt.periodStart)} to ${formatDate(previewReceipt.periodEnd)}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-xs">
                    <dt className="text-zinc-500">{label}</dt>
                    <dd className="text-right font-semibold text-zinc-950 dark:text-white">{val}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <DialogFooter>
            {previewReceipt && (
              <>
                <Button variant="outline" onClick={() => downloadReceiptText(previewReceipt)} className="gap-1.5">
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button
                  disabled={busyId === `receipt-${previewReceipt.id}`}
                  onClick={() => handleResendReceipt(previewReceipt)}
                  className="gap-1.5"
                >
                  <Mail className="h-4 w-4" /> Resend email
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Download, MoreVertical, Send, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { Tenant } from './types';
import { ActionButton, EmptyBlock, FilterChips, Panel, SearchInput, StatusPill, kes, shortDate } from './ui';

type Filter = 'all' | 'active' | 'invited' | 'overdue';

interface TenantsTabProps {
  tenants: Tenant[];
  isBusy: (key: string) => boolean;
  onInvite: () => void;
  onResend: (tenant: Tenant) => void;
  onAssign: (tenant: Tenant) => void;
  onUnassign: (tenant: Tenant) => void;
  onRemove: (tenant: Tenant) => void;
}

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export default function TenantsTab({ tenants, isBusy, onInvite, onResend, onAssign, onUnassign, onRemove }: TenantsTabProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (filter === 'invited' && t.hasAccount) return false;
      if (filter === 'active' && !(t.hasAccount && t.units.length)) return false;
      if (filter === 'overdue' && t.status !== 'overdue') return false;
      if (!q) return true;
      return [t.name, t.email, t.phone, ...t.units.map((u) => u.title)].some((v) => v?.toLowerCase().includes(q));
    });
  }, [tenants, search, filter]);

  const { pageItems, ...pager } = usePagination(filtered, 10);

  const exportCsv = () => {
    const header = ['Name', 'Email', 'Phone', 'Units', 'Lease start', 'Lease end', 'Monthly rent', 'Balance', 'Status'];
    const rows = filtered.map((t) => [
      t.name, t.email, t.phone, t.units.map((u) => u.title).join('; '),
      t.lease?.startDate ?? '', t.lease?.endDate ?? '', t.lease?.rentAmount ?? '', t.balance, t.hasAccount ? t.status : 'invite sent',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `myboma-tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = {
    all: tenants.length,
    active: tenants.filter((t) => t.hasAccount && t.units.length).length,
    invited: tenants.filter((t) => !t.hasAccount).length,
    overdue: tenants.filter((t) => t.status === 'overdue').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Tenants</h1>
          <p className="text-sm text-zinc-500">{counts.active} living in your units · {counts.invited} waiting to accept their invite</p>
        </div>
        <div className="flex gap-2">
          {tenants.length > 0 && <ActionButton variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Export</ActionButton>}
          <ActionButton icon={<UserPlus className="h-4 w-4" />} onClick={onInvite}>Invite tenant</ActionButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Living in a unit', count: counts.active },
            { id: 'invited', label: 'Invite sent', count: counts.invited },
            { id: 'overdue', label: 'Behind on rent', count: counts.overdue },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone or unit" />
      </div>

      <Panel>
        {filtered.length === 0 ? (
          tenants.length === 0 ? (
            <EmptyBlock
              icon={<Users className="h-5 w-5" />}
              title="No tenants yet"
              body="Invite a tenant by email. They get a secure link to set up their account, valid for 7 days, and can then pay rent from their phone."
              action={<ActionButton icon={<UserPlus className="h-4 w-4" />} onClick={onInvite}>Invite tenant</ActionButton>}
            />
          ) : (
            <EmptyBlock title="Nothing matches" body="Try a different search or filter." />
          )
        ) : (
          <>
            <div className="hidden grid-cols-[1.6fr_1.3fr_1.1fr_0.9fr_auto] gap-4 border-b border-zinc-100 px-5 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 md:grid dark:border-zinc-800">
              <span>Tenant</span><span>Unit</span><span>Lease</span><span className="text-right">Balance</span><span className="w-9" />
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pageItems.map((tenant) => (
                <li key={tenant.email} className="grid gap-3 px-5 py-4 md:grid-cols-[1.6fr_1.3fr_1.1fr_0.9fr_auto] md:items-center md:gap-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{tenant.name || tenant.email}</p>
                        {!tenant.hasAccount ? <StatusPill status="invited" /> : tenant.status === 'overdue' ? <StatusPill status="overdue" /> : null}
                      </div>
                      <p className="truncate text-xs text-zinc-500">{tenant.email}{tenant.phone && ` · ${tenant.phone}`}</p>
                    </div>
                    <TenantMenu tenant={tenant} onResend={onResend} onAssign={onAssign} onUnassign={onUnassign} onRemove={onRemove} className="md:hidden" />
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {tenant.units.length ? tenant.units.map((u) => u.title).join(', ') : <span className="text-zinc-400">No unit assigned</span>}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {tenant.lease ? (
                      <>
                        {shortDate(tenant.lease.startDate)} – {tenant.lease.endDate ? shortDate(tenant.lease.endDate) : 'ongoing'}
                        <span className="block text-xs text-zinc-500">Due on day {tenant.lease.dueDay}</span>
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </p>
                  <p className={`text-sm font-semibold tabular-nums md:text-right ${tenant.balance > 0 ? 'text-zinc-950 dark:text-white' : 'text-zinc-400'}`}>
                    {tenant.balance > 0 ? kes(tenant.balance) : 'Paid up'}
                  </p>
                  <div className="hidden items-center gap-1 md:flex">
                    {!tenant.hasAccount && (
                      <ActionButton size="sm" variant="ghost" loading={isBusy(`resend-${tenant.email}`)} icon={<Send className="h-4 w-4" />} onClick={() => onResend(tenant)} aria-label="Resend invite" />
                    )}
                    <TenantMenu tenant={tenant} onResend={onResend} onAssign={onAssign} onUnassign={onUnassign} onRemove={onRemove} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 pb-4"><Pagination {...pager} onPageChange={pager.setPage} label="tenants" /></div>
          </>
        )}
      </Panel>
    </div>
  );
}

function TenantMenu({ tenant, onResend, onAssign, onUnassign, onRemove, className = '' }: {
  tenant: Tenant;
  onResend: (t: Tenant) => void;
  onAssign: (t: Tenant) => void;
  onUnassign: (t: Tenant) => void;
  onRemove: (t: Tenant) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" aria-label={`Options for ${tenant.email}`} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${className}`}><MoreVertical className="h-4 w-4" /></button>} />
      <DropdownMenuContent align="end">
        {!tenant.hasAccount && <DropdownMenuItem onClick={() => onResend(tenant)}><Send className="h-4 w-4" /> Resend invite</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => onAssign(tenant)}><UserPlus className="h-4 w-4" /> Assign to a unit</DropdownMenuItem>
        {tenant.units.length > 0 && <DropdownMenuItem onClick={() => onUnassign(tenant)}><UserMinus className="h-4 w-4" /> Move out</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onRemove(tenant)} className="text-red-600"><Trash2 className="h-4 w-4" /> Remove tenant</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

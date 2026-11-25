import { useMemo, useState } from 'react';
import { Wrench } from 'lucide-react';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { MaintenanceRequest, RequestStatus } from './types';
import { ActionButton, EmptyBlock, FilterChips, Panel, SearchInput, StatusPill, shortDate } from './ui';

type Filter = 'open' | RequestStatus | 'all';

interface MaintenanceTabProps {
  enabled: boolean;
  requests: MaintenanceRequest[];
  propertyName: (id: string) => string;
  tenantName: (emailOrId: string) => string;
  isBusy: (key: string) => boolean;
  onStatusChange: (request: MaintenanceRequest, status: RequestStatus) => void;
  onUpgrade: () => void;
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

export default function MaintenanceTab({ enabled, requests, propertyName, tenantName, isBusy, onStatusChange, onUpgrade }: MaintenanceTabProps) {
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests
      .filter((r) => (filter === 'all' ? true : filter === 'open' ? r.status !== 'resolved' : r.status === filter))
      .filter((r) => !q || [r.title, r.description, propertyName(r.propertyId)].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, filter, search]);

  const { pageItems, ...pager } = usePagination(filtered, 10);

  if (!enabled) {
    return (
      <Panel>
        <EmptyBlock
          icon={<Wrench className="h-5 w-5" />}
          title="Repairs are part of the Pro plans"
          body="Tenants report problems from their phone with a description and urgency. You update the status and they are kept informed."
          action={<ActionButton onClick={onUpgrade}>See plans</ActionButton>}
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Repairs</h1>
        <p className="text-sm text-zinc-500">Requests from your tenants, most urgent first.</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'open', label: 'Open', count: requests.filter((r) => r.status !== 'resolved').length },
            { id: 'pending', label: 'New', count: requests.filter((r) => r.status === 'pending').length },
            { id: 'in-progress', label: 'In progress', count: requests.filter((r) => r.status === 'in-progress').length },
            { id: 'resolved', label: 'Fixed', count: requests.filter((r) => r.status === 'resolved').length },
            { id: 'all', label: 'All', count: requests.length },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search repairs" />
      </div>

      <Panel>
        {filtered.length === 0 ? (
          <EmptyBlock icon={<Wrench className="h-5 w-5" />} title={requests.length ? 'Nothing here' : 'No repair requests'} body={requests.length ? 'Try another filter.' : 'When a tenant reports a problem it shows up here.'} />
        ) : (
          <>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pageItems.map((request) => (
                <li key={request.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-950 dark:text-white">{request.title}</p>
                      <StatusPill status={request.status} />
                      {(request.priority === 'urgent' || request.priority === 'high') && <StatusPill status={request.priority} />}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{request.description}</p>
                    {request.resolutionNotes && (
                      <p className="mt-1.5 rounded-lg bg-violet-50/80 px-2.5 py-1.5 text-xs text-violet-900 dark:bg-violet-500/15 dark:text-violet-200">
                        <span className="font-semibold">Update note:</span> {request.resolutionNotes}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-500">
                      {propertyName(request.propertyId)} · {tenantName(request.tenantId)} · {shortDate(request.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {request.status === 'pending' && (
                      <ActionButton size="sm" variant="secondary" loading={isBusy(`req-${request.id}`)} onClick={() => onStatusChange(request, 'in-progress')}>
                        Start work
                      </ActionButton>
                    )}
                    {request.status !== 'resolved' ? (
                      <ActionButton size="sm" loading={isBusy(`req-${request.id}`)} onClick={() => onStatusChange(request, 'resolved')}>
                        Mark fixed
                      </ActionButton>
                    ) : (
                      <ActionButton size="sm" variant="ghost" loading={isBusy(`req-${request.id}`)} onClick={() => onStatusChange(request, 'in-progress')}>
                        Reopen
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 pb-4"><Pagination {...pager} onPageChange={pager.setPage} label="requests" /></div>
          </>
        )}
      </Panel>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Clock, Home, Mail, Send, Trash2, UserPlus } from 'lucide-react';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { Invitation, Property } from './types';
import { ActionButton, EmptyBlock, Panel, SearchInput, StatusPill, shortDate } from './ui';

interface PendingInvitesTabProps {
  invitations: Invitation[];
  properties: Property[];
  isBusy: (key: string) => boolean;
  onInvite: () => void;
  onResend: (invitation: Invitation) => void;
  onCancel: (invitation: Invitation) => void;
}

const timeAgo = (iso?: string) => {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return shortDate(iso);
};

export default function PendingInvitesTab({
  invitations,
  properties,
  isBusy,
  onInvite,
  onResend,
  onCancel,
}: PendingInvitesTabProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invitations;
    return invitations.filter((inv) => {
      const assignedUnits = properties
        .filter((p) => p.tenantId?.toLowerCase() === inv.email.toLowerCase())
        .map((p) => p.title);
      return [inv.displayName, inv.email, inv.phone, inv.role, ...assignedUnits].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [invitations, properties, search]);

  const { pageItems, ...pager } = usePagination(filtered, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2B33] sm:text-2xl dark:text-white">
            Pending invites
          </h1>
          <p className="mt-0.5 text-sm text-[#5F6C7B] dark:text-slate-400">
            {invitations.length === 0
              ? 'Everyone you invited has joined.'
              : `${invitations.length} ${invitations.length === 1 ? 'person' : 'people'} waiting to accept their 7-day setup link.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton icon={<UserPlus className="h-4 w-4" />} onClick={onInvite}>
            Invite tenant
          </ActionButton>
        </div>
      </div>

      {invitations.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search invitee name, email, phone or unit…"
          />
          <span className="hidden text-xs font-medium text-[#5F6C7B] tabular-nums sm:inline dark:text-slate-400">
            Showing {filtered.length} of {invitations.length}
          </span>
        </div>
      )}

      <Panel>
        {filtered.length === 0 ? (
          invitations.length === 0 ? (
            <EmptyBlock
              icon={<Mail className="h-5 w-5" />}
              title="No pending invites"
              body="Invite a tenant by email to send them a 7-day setup link. Unaccepted invitations appear here so you can resend or cancel them."
              action={
                <ActionButton icon={<UserPlus className="h-4 w-4" />} onClick={onInvite}>
                  Invite tenant
                </ActionButton>
              }
            />
          ) : (
            <EmptyBlock title="No matching invites" body="Try a different name, email, or phone number." />
          )
        ) : (
          <>
            <div className="hidden grid-cols-[1.6fr_1.1fr_0.9fr_0.8fr_auto] gap-4 border-b border-[#1C2B33]/[0.07] bg-[#F7F8FA] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5F6C7B] md:grid dark:border-white/[0.07] dark:bg-[#20242A] dark:text-slate-400">
              <span>Invitee</span>
              <span>Assigned unit</span>
              <span>Status</span>
              <span>Sent</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-[#1C2B33]/[0.06] dark:divide-white/[0.06]">
              {pageItems.map((inv) => {
                const emailLower = inv.email.toLowerCase();
                const assignedUnits = properties.filter((p) => p.tenantId?.toLowerCase() === emailLower);
                const resending = isBusy(`resend-${emailLower}`);
                const cancelling = isBusy(`cancel-invite-${emailLower}`);

                return (
                  <li
                    key={inv.email}
                    className="grid gap-3 px-5 py-3.5 transition-colors hover:bg-[#F7F8FA]/80 md:grid-cols-[1.6fr_1.1fr_0.9fr_0.8fr_auto] md:items-center md:gap-4 dark:hover:bg-white/[0.03]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600/15 to-fuchsia-600/15 text-xs font-semibold text-violet-800 dark:from-violet-500/25 dark:to-fuchsia-500/20 dark:text-violet-200">
                        {(inv.displayName || inv.email).charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-[#1C2B33] dark:text-white">
                          {inv.displayName || inv.email}
                        </p>
                        <p className="truncate text-xs text-[#5F6C7B] dark:text-slate-400">
                          {inv.email}
                          {inv.phone ? ` · ${inv.phone}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0 text-xs text-[#1C2B33] dark:text-slate-200">
                      {assignedUnits.length > 0 ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 truncate font-medium">
                          <Home className="h-3.5 w-3.5 shrink-0 text-[#8A94A6]" />
                          <span className="truncate">{assignedUnits.map((u) => u.title).join(', ')}</span>
                        </span>
                      ) : (
                        <span className="text-[#8A94A6]">Not assigned yet</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <StatusPill status="invited" />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs tabular-nums text-[#5F6C7B] dark:text-slate-400">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-[#8A94A6]" />
                      <span title={shortDate(inv.createdAt)}>{timeAgo(inv.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 md:justify-end">
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        loading={resending}
                        disabled={cancelling}
                        icon={<Send className="h-3.5 w-3.5" />}
                        onClick={() => onResend(inv)}
                      >
                        Resend
                      </ActionButton>
                      <button
                        type="button"
                        disabled={resending || cancelling}
                        onClick={() => onCancel(inv)}
                        title="Cancel invite"
                        aria-label={`Cancel invite for ${inv.email}`}
                        className="flex h-8.5 w-8.5 items-center justify-center rounded-lg text-[#8A94A6] transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 pb-4">
              <Pagination {...pager} onPageChange={pager.setPage} label="pending invites" />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

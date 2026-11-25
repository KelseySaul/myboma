import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Filter, Search, ShieldCheck, UserCheck, Users, X } from 'lucide-react';
import type { UserProfile } from '../../App';
import type { SuperAdminAccountOption } from '../../lib/api';
import { useSuperAdminAccounts } from '../../lib/queries';

interface SuperAdminAccountFilterBarProps {
  profile: UserProfile;
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  contextLabel?: string;
}

const ROLE_LABELS: Record<string, string> = {
  landlord: 'Landlord',
  admin: 'Admin',
  tenant: 'Tenant',
  hunter: 'Hunter',
};

/**
 * Meta Business Suite–style multi-account scope selector for Super Admins.
 * Supports picking a single account, multiple accounts, or quick-toggling "My account".
 */
export function SuperAdminAccountFilterBar({
  profile,
  selectedIds,
  onChange,
  contextLabel,
}: SuperAdminAccountFilterBarProps) {
  const { data: accounts = [], isPending } = useSuperAdminAccounts(profile.uid, Boolean(profile.isSuperAdmin));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [roleTab, setRoleTab] = useState<'all' | 'landlord' | 'admin' | 'other'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.uid, a])), [accounts]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const includesMe = selectedSet.has(profile.uid);
  const onlyMe = selectedIds.length === 1 && includesMe;

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (roleTab === 'landlord' && acc.role !== 'landlord') return false;
      if (roleTab === 'admin' && !(acc.role === 'admin' || acc.isAdmin || acc.isSuperAdmin)) return false;
      if (roleTab === 'other' && (acc.role === 'landlord' || acc.role === 'admin' || acc.isAdmin || acc.isSuperAdmin)) return false;
      if (!q) return true;
      return (
        acc.displayName.toLowerCase().includes(q) ||
        acc.email.toLowerCase().includes(q) ||
        acc.role.toLowerCase().includes(q)
      );
    });
  }, [accounts, search, roleTab]);

  const toggleId = (uid: string) => {
    if (selectedSet.has(uid)) {
      onChange(selectedIds.filter((id) => id !== uid));
    } else {
      onChange([...selectedIds, uid]);
    }
  };

  const toggleMyAccount = () => {
    if (onlyMe) {
      onChange([]);
    } else if (includesMe) {
      onChange(selectedIds.filter((id) => id !== profile.uid));
    } else {
      onChange([...selectedIds, profile.uid]);
    }
  };

  const labelFor = (uid: string) => {
    if (uid === profile.uid) return `${profile.displayName || 'My account'} (You)`;
    const acc = byId.get(uid);
    return acc ? acc.displayName || acc.email : 'Selected account';
  };

  return (
    <div data-tour="superadmin-filter" className="mb-3.5 rounded-xl border border-[#1C2B33]/[0.09] bg-white px-3 py-2.5 shadow-none sm:mb-5 sm:px-4 sm:py-3 sm:shadow-[0_1px_2px_rgba(28,43,51,0.04)] dark:border-white/[0.08] dark:bg-[#1A1D21]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5D5A73] dark:text-slate-400">
            <Filter className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400" />
            <span>Account filter</span>
            {contextLabel && <span className="hidden text-[#8A86A1] md:inline">· {contextLabel}</span>}
          </span>

          {/* Quick toggle for "My own account" */}
          <button
            type="button"
            onClick={toggleMyAccount}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
              includesMe
                ? 'bg-[#5B21B6] text-white hover:bg-[#4C1D95]'
                : 'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-white/12 dark:bg-[#181922] dark:text-slate-200 dark:hover:bg-white/5'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            My account
          </button>

          {/* Multi-account dropdown selector */}
          <div className="relative" ref={containerRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-2.5 text-xs font-semibold text-[#1C2B33] shadow-2xs transition hover:border-[#98A2B3] hover:bg-[#F7F8FA] dark:border-white/12 dark:bg-[#16191D] dark:text-slate-200 dark:hover:bg-white/5"
            >
              <Users className="h-3.5 w-3.5 text-[#5F6C7B]" />
              <span>
                {selectedIds.length === 0
                  ? 'Select accounts…'
                  : selectedIds.length === 1
                    ? labelFor(selectedIds[0])
                    : `${selectedIds.length} accounts selected`}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-[#8A94A6] transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="absolute left-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[#1C2B33]/[0.12] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] dark:border-white/[0.12] dark:bg-[#1A1D21]">
                <div className="border-b border-[#1C2B33]/[0.08] p-2.5 dark:border-white/[0.08]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A94A6]" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search accounts by name or email…"
                      autoFocus
                      className="h-8.5 w-full rounded-lg border border-[#D5D2E3] bg-[#F8F7FC] pl-8 pr-3 text-xs text-[#161426] placeholder:text-[#8A86A1] outline-none focus:border-violet-600 focus:bg-white dark:border-white/12 dark:bg-[#161722] dark:text-slate-100"
                    />
                  </div>
                  <div className="mt-2 flex gap-1">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'landlord', label: 'Landlords' },
                        { id: 'admin', label: 'Admins' },
                        { id: 'other', label: 'Other' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setRoleTab(t.id)}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                          roleTab === t.id
                            ? 'bg-violet-600/12 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300'
                            : 'text-[#5D5A73] hover:bg-[#F4F3F8] dark:text-slate-400 dark:hover:bg-white/5'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto p-1.5">
                  {isPending ? (
                    <p className="py-6 text-center text-xs text-[#8A86A1]">Loading accounts…</p>
                  ) : filteredAccounts.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[#8A86A1]">No matching accounts.</p>
                  ) : (
                    filteredAccounts.map((acc) => {
                      const checked = selectedSet.has(acc.uid);
                      const isSelf = acc.uid === profile.uid;
                      return (
                        <button
                          key={acc.uid}
                          type="button"
                          onClick={() => toggleId(acc.uid)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                            checked
                              ? 'bg-violet-600/[0.08] dark:bg-violet-500/15'
                              : 'hover:bg-[#F8F7FC] dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              checked
                                ? 'border-transparent bg-gradient-to-br from-violet-700 to-fuchsia-600 text-white'
                                : 'border-[#CBD5E1] bg-white dark:border-white/20 dark:bg-transparent'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" strokeWidth={2.5} />}
                          </span>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[11px] font-semibold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
                            {(acc.displayName || acc.email).charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-semibold text-[#161426] dark:text-white">
                                {acc.displayName || acc.email}
                              </span>
                              {isSelf && (
                                <span className="rounded bg-violet-100 px-1.5 py-0.2 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                                  You
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11px] text-[#5D5A73] dark:text-slate-400">
                              {acc.email} · {acc.isSuperAdmin ? 'Super admin' : (ROLE_LABELS[acc.role] ?? acc.role)}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[#221844]/[0.08] bg-[#F8F7FC] px-3 py-2 text-[11px] dark:border-white/[0.08] dark:bg-[#161722]">
                  <button
                    type="button"
                    onClick={() => onChange([profile.uid])}
                    className="font-semibold text-violet-700 hover:text-violet-800 dark:text-violet-400"
                  >
                    Only my account
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="font-medium text-[#5D5A73] hover:text-[#161426] dark:text-slate-400 dark:hover:text-white"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs font-medium text-[#5D5A73] transition hover:text-[#161426] dark:text-slate-400 dark:hover:text-white"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Selected account removable pills */}
      {selectedIds.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#221844]/[0.06] pt-2.5 dark:border-white/[0.06]">
          {selectedIds.map((uid) => (
            <span
              key={uid}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600/[0.10] py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-violet-900 dark:bg-violet-500/20 dark:text-violet-200"
            >
              <span className="max-w-[14rem] truncate">{labelFor(uid)}</span>
              <button
                type="button"
                onClick={() => toggleId(uid)}
                aria-label={`Remove ${labelFor(uid)}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-violet-700 transition hover:bg-violet-600/15 dark:text-violet-300"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface SuperAdminAccountGateProps {
  profile: UserProfile;
  pageLabel: string;
  onSelectIds: (ids: string[]) => void;
}

/**
 * Rendered on gated Super Admin pages when no account filter has been selected yet.
 * Keeps data hidden until the super admin picks their own account, a specific account,
 * or multiple accounts.
 */
export function SuperAdminAccountGate({ profile, pageLabel, onSelectIds }: SuperAdminAccountGateProps) {
  const { data: accounts = [] } = useSuperAdminAccounts(profile.uid, Boolean(profile.isSuperAdmin));

  const suggestedAccounts = useMemo<SuperAdminAccountOption[]>(() => {
    const others = accounts.filter((a) => a.uid !== profile.uid && (a.role === 'landlord' || a.role === 'admin'));
    return others.slice(0, 6);
  }, [accounts, profile.uid]);

  return (
    <div className="rounded-xl border border-[#221844]/[0.09] bg-white px-5 py-10 text-center shadow-[0_1px_2px_rgba(22,20,38,0.05)] dark:border-white/[0.08] dark:bg-[#181922] sm:px-6 sm:py-12">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/15 to-fuchsia-600/15 text-violet-700 dark:from-violet-500/25 dark:to-fuchsia-500/20 dark:text-violet-300">
        <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h2 className="mt-4 text-base font-semibold text-[#161426] dark:text-white">
        Select an account to view {pageLabel}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[#5D5A73] dark:text-slate-400">
        Super admin view stays clear until you choose a specific account, multiple accounts, or your own account in the filter bar above.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onSelectIds([profile.uid])}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#5B21B6] px-5 text-xs font-semibold text-white transition hover:bg-[#4C1D95]"
        >
          <UserCheck className="h-4 w-4" />
          View my own account
        </button>
      </div>

      {suggestedAccounts.length > 0 && (
        <div className="mx-auto mt-7 max-w-xl border-t border-[#221844]/[0.07] pt-5 dark:border-white/[0.07]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#8A86A1]">
            Or jump straight into an account
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {suggestedAccounts.map((acc) => (
              <button
                key={acc.uid}
                type="button"
                onClick={() => onSelectIds([acc.uid])}
                className="inline-flex items-center gap-2 rounded-lg border border-[#221844]/[0.09] bg-[#F8F7FC] px-3 py-1.5 text-xs font-medium text-[#161426] transition hover:border-violet-500/40 hover:bg-violet-50 hover:text-violet-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-violet-400/40"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-[#1C2B33] shadow-2xs dark:bg-white/10 dark:text-white">
                  {(acc.displayName || acc.email).charAt(0).toUpperCase()}
                </span>
                <span className="max-w-[10rem] truncate">{acc.displayName || acc.email}</span>
                <span className="text-[10px] text-[#8A94A6]">{ROLE_LABELS[acc.role] ?? acc.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

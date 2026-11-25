import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, ClipboardList, Phone, Send, Trash2, UserPlus, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { resolveMediaUrl } from '../../lib/fileUrl';
import type { Building, CaretakerMember, CaretakerReport, Invitation, Property } from './types';
import { ActionButton, EmptyBlock, Field, FilterChips, Panel, SearchInput, StatusPill, inputClass, shortDate } from './ui';

const CATEGORY_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  security: 'Security',
  cleanliness: 'Cleanliness',
  utility: 'Utility',
  tenant_issue: 'Tenant issue',
  inspection: 'Inspection',
  other: 'Other',
};

const REPORT_BADGE: Record<string, string> = {
  open: 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300',
  acknowledged: 'bg-violet-50 text-violet-800 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300',
  resolved: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950',
};

interface TeamTabProps {
  caretakers: CaretakerMember[];
  pendingCaretakerInvites: Invitation[];
  reports: CaretakerReport[];
  properties: Property[];
  buildings: Building[];
  isBusy: (key: string) => boolean;
  onInviteCaretaker: (values: { displayName: string; email: string; phone: string; propertyIds: string[] }) => Promise<void>;
  onResendInvite: (inv: Invitation) => void;
  onCancelInvite: (inv: Invitation) => void;
  onRemoveCaretaker: (caretaker: CaretakerMember) => void;
  onUpdateReport: (report: CaretakerReport, status: 'open' | 'acknowledged' | 'resolved', landlordNotes?: string) => void;
}

export default function TeamTab({
  caretakers,
  pendingCaretakerInvites,
  reports,
  properties,
  buildings,
  isBusy,
  onInviteCaretaker,
  onResendInvite,
  onCancelInvite,
  onRemoveCaretaker,
  onUpdateReport,
}: TeamTabProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', phone: '', propertyIds: [] as string[] });
  const [savingInvite, setSavingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [reportFilter, setReportFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [notesByReport, setNotesByReport] = useState<Record<string, string>>({});

  const propertyLabel = (id?: string | null) => {
    if (!id) return null;
    const p = properties.find((x) => x.id === id);
    return p ? `${p.title}${p.unitNumber ? ` (${p.unitNumber})` : ''}` : null;
  };
  const buildingLabel = (id?: string | null) => {
    if (!id) return null;
    return buildings.find((b) => b.id === id)?.name ?? null;
  };

  const filteredReports = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return reports.filter((r) => {
      if (reportFilter !== 'all' && r.status !== reportFilter) return false;
      if (!q) return true;
      return [r.title, r.description, r.caretakerName, r.caretakerEmail, r.category, propertyLabel(r.propertyId), buildingLabel(r.buildingId)].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [reports, reportFilter, reportSearch, properties, buildings]);

  const caretakerPager = usePagination(caretakers, 8);
  const reportPager = usePagination(filteredReports, 10);

  const toggleProperty = (id: string) => {
    setForm((prev) => ({
      ...prev,
      propertyIds: prev.propertyIds.includes(id)
        ? prev.propertyIds.filter((x) => x !== id)
        : [...prev.propertyIds, id],
    }));
  };

  const submitInvite = async () => {
    if (form.displayName.trim().length < 2) return setInviteError('Enter the caretaker’s full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setInviteError('Enter a valid email address.');
    setInviteError(null);
    setSavingInvite(true);
    try {
      await onInviteCaretaker({
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        propertyIds: form.propertyIds,
      });
      setInviteOpen(false);
      setForm({ displayName: '', email: '', phone: '', propertyIds: [] });
    } catch (err: any) {
      setInviteError(err.message || 'Could not invite caretaker.');
    } finally {
      setSavingInvite(false);
    }
  };

  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#161426] dark:text-white sm:text-2xl">
            Caretakers &amp; field reports
          </h1>
          <p className="mt-0.5 text-xs text-[#5D5A73] dark:text-slate-400 sm:text-sm">
            Add caretakers under your account to handle tenant repairs and submit property reports directly to you.
          </p>
        </div>
        <ActionButton icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
          Add caretaker
        </ActionButton>
      </div>

      {/* Caretakers Roster */}
      <Panel
        title={`Your caretakers (${caretakers.length})`}
        action={
          pendingCaretakerInvites.length > 0 ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              {pendingCaretakerInvites.length} pending invite{pendingCaretakerInvites.length === 1 ? '' : 's'}
            </span>
          ) : undefined
        }
      >
        {caretakers.length === 0 && pendingCaretakerInvites.length === 0 ? (
          <EmptyBlock
            icon={<Wrench className="h-5 w-5" />}
            title="No caretakers yet"
            body="Invite a caretaker or on-site manager. They can respond to tenant repair issues and send you inspection & incident reports with photos."
            action={
              <ActionButton icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
                Invite caretaker
              </ActionButton>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {caretakerPager.pageItems.map((ct) => (
                <li key={ct.uid} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-xs font-bold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
                      {ct.avatarUrl ? (
                        <img src={resolveMediaUrl(ct.avatarUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        ct.displayName?.charAt(0).toUpperCase() || 'C'
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{ct.displayName}</p>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                          Caretaker
                        </span>
                      </div>
                      <p className="truncate text-xs text-zinc-500">
                        {ct.email}
                        {ct.phone ? ` · ${ct.phone}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ct.phone && (
                      <a
                        href={`tel:${ct.phone}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"
                      >
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                    )}
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5 text-rose-600" />}
                      loading={isBusy(`remove-ct-${ct.uid}`)}
                      onClick={() => onRemoveCaretaker(ct)}
                    >
                      Remove
                    </ActionButton>
                  </div>
                </li>
              ))}

              {pendingCaretakerInvites.map((inv) => (
                <li key={inv.email} className="flex flex-col gap-3 bg-zinc-50/70 px-5 py-3.5 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{inv.displayName || inv.email}</p>
                      <StatusPill status="invited" />
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {inv.email}{inv.phone ? ` · ${inv.phone}` : ''} · Caretaker invite sent {shortDate(inv.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      icon={<Send className="h-3.5 w-3.5" />}
                      loading={isBusy(`resend-${inv.email.toLowerCase()}`)}
                      onClick={() => onResendInvite(inv)}
                    >
                      Resend
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5 text-rose-600" />}
                      onClick={() => onCancelInvite(inv)}
                    >
                      Cancel
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 pb-4">
              <Pagination {...caretakerPager} onPageChange={caretakerPager.setPage} label="caretakers" />
            </div>
          </>
        )}
      </Panel>

      {/* Caretaker Reports Inbox */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            value={reportFilter}
            onChange={setReportFilter}
            options={[
              { id: 'all', label: 'All reports', count: reports.length },
              { id: 'open', label: 'Open', count: openReportsCount },
              { id: 'acknowledged', label: 'Acknowledged', count: reports.filter((r) => r.status === 'acknowledged').length },
              { id: 'resolved', label: 'Resolved', count: reports.filter((r) => r.status === 'resolved').length },
            ]}
          />
          <SearchInput value={reportSearch} onChange={setReportSearch} placeholder="Search reports or caretaker…" />
        </div>

        <Panel title="Reports from caretakers">
          {filteredReports.length === 0 ? (
            <EmptyBlock
              icon={<ClipboardList className="h-5 w-5" />}
              title={reports.length ? 'No matching reports' : 'No caretaker reports yet'}
              body={
                reports.length
                  ? 'Try another filter or search term.'
                  : 'When your caretakers file maintenance, security, utility or inspection reports, they arrive here with photos.'
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {reportPager.pageItems.map((rep) => {
                  const noteVal = notesByReport[rep.id] ?? rep.landlordNotes ?? '';
                  return (
                    <li key={rep.id} className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-zinc-950 dark:text-white">{rep.title}</p>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${REPORT_BADGE[rep.status] ?? REPORT_BADGE.open}`}>
                              {rep.status}
                            </span>
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              {CATEGORY_LABELS[rep.category] ?? rep.category}
                            </span>
                            {(rep.priority === 'urgent' || rep.priority === 'high') && <StatusPill status={rep.priority} />}
                          </div>
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{rep.description}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span>By {rep.caretakerName || rep.caretakerEmail || 'Caretaker'}</span>
                            {(propertyLabel(rep.propertyId) || buildingLabel(rep.buildingId)) && (
                              <span className="inline-flex items-center gap-1">
                                · <Building2 className="h-3 w-3" />
                                {[propertyLabel(rep.propertyId), buildingLabel(rep.buildingId)].filter(Boolean).join(' · ')}
                              </span>
                            )}
                            <span>· {shortDate(rep.createdAt)}</span>
                          </p>
                        </div>
                      </div>

                      {Array.isArray(rep.images) && rep.images.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {rep.images.map((url, i) => (
                            <a
                              key={`${url}-${i}`}
                              href={resolveMediaUrl(url)}
                              target="_blank"
                              rel="noreferrer"
                              className="h-16 w-20 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700"
                            >
                              <img src={resolveMediaUrl(url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={noteVal}
                          onChange={(e) => setNotesByReport((prev) => ({ ...prev, [rep.id]: e.target.value }))}
                          placeholder="Reply or instruction for your caretaker…"
                          className="h-9 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 text-xs text-zinc-900 outline-none focus:border-violet-600 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        />
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {rep.status === 'open' && (
                            <ActionButton
                              size="sm"
                              variant="secondary"
                              loading={isBusy(`report-${rep.id}`)}
                              onClick={() => onUpdateReport(rep, 'acknowledged', noteVal)}
                            >
                              Acknowledge
                            </ActionButton>
                          )}
                          {rep.status !== 'resolved' ? (
                            <ActionButton
                              size="sm"
                              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                              loading={isBusy(`report-${rep.id}`)}
                              onClick={() => onUpdateReport(rep, 'resolved', noteVal)}
                            >
                              Resolve
                            </ActionButton>
                          ) : (
                            <ActionButton
                              size="sm"
                              variant="ghost"
                              loading={isBusy(`report-${rep.id}`)}
                              onClick={() => onUpdateReport(rep, 'open', noteVal)}
                            >
                              Reopen
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="px-5 pb-4">
                <Pagination {...reportPager} onPageChange={reportPager.setPage} label="reports" />
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Invite Caretaker Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(next) => !savingInvite && setInviteOpen(next)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Invite a caretaker</DialogTitle>
            <DialogDescription>
              They&apos;ll receive a 7-day setup link to access repair requests and file property reports to you.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Full name">
              <input
                className={inputClass}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="e.g. Peter Kamau"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email address">
                <input
                  className={inputClass}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="peter@example.com"
                />
              </Field>
              <Field label="Phone number (optional)">
                <input
                  className={inputClass}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="0712 345 678"
                />
              </Field>
            </div>

            {properties.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Assigned units <span className="font-normal text-zinc-400">(leave unchecked for all your properties)</span>
                </span>
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-700">
                  {properties.map((p) => {
                    const checked = form.propertyIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProperty(p.id)}
                          className="h-4 w-4 rounded border-zinc-300 accent-violet-700"
                        />
                        <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {p.title}{p.unitNumber ? ` · Unit ${p.unitNumber}` : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {inviteError && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {inviteError}
              </p>
            )}
          </div>

          <DialogFooter>
            <ActionButton variant="secondary" onClick={() => setInviteOpen(false)} disabled={savingInvite}>
              Cancel
            </ActionButton>
            <ActionButton onClick={submitInvite} loading={savingInvite}>
              Send caretaker invite
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

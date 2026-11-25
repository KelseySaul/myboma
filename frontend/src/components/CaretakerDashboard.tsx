import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Mail,
  Phone,
  Plus,
  Send,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { UserProfile } from '../App';
import {
  createCaretakerReport,
  markAllNotificationsRead,
  markNotificationRead,
  respondCaretakerMaintenance,
  uploadFile,
} from '../lib/api';
import { resolveMediaUrl } from '../lib/fileUrl';
import { queryKeys, useCaretakerDashboard } from '../lib/queries';
import PhotoCaptureControl from './PhotoCaptureControl';
import { ActionButton, EmptyBlock, Field, FilterChips, Panel, SearchInput, StatusPill, inputClass, shortDate, useBusy } from './landlord/ui';

type ReportCategory = 'maintenance' | 'security' | 'cleanliness' | 'utility' | 'tenant_issue' | 'inspection' | 'other';
type Priority = 'low' | 'medium' | 'high' | 'urgent';

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  maintenance: 'Maintenance / repair',
  security: 'Security',
  cleanliness: 'Cleanliness',
  utility: 'Water / power / utility',
  tenant_issue: 'Tenant issue',
  inspection: 'Routine inspection',
  other: 'Other',
};

const REPORT_STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300',
  acknowledged: 'bg-violet-50 text-violet-800 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300',
  resolved: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950',
};

interface CaretakerDashboardProps {
  profile: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function CaretakerDashboard({ profile, activeTab, setActiveTab }: CaretakerDashboardProps) {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useCaretakerDashboard(profile.uid);
  const { run, isBusy } = useBusy();

  const landlord = data?.landlord ?? null;
  const buildings = data?.buildings ?? [];
  const properties = data?.properties ?? [];
  const requests = data?.requests ?? [];
  const reports = data?.reports ?? [];
  const notifications = data?.notifications ?? [];

  const [repairFilter, setRepairFilter] = useState<'open' | 'pending' | 'in-progress' | 'resolved' | 'all'>('open');
  const [repairSearch, setRepairSearch] = useState('');
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});

  const [reportFilter, setReportFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportForm, setReportForm] = useState<{
    title: string;
    category: ReportCategory;
    priority: Priority;
    propertyId: string;
    buildingId: string;
    description: string;
    images: string[];
  }>({
    title: '',
    category: 'maintenance',
    priority: 'medium',
    propertyId: 'none',
    buildingId: 'none',
    description: '',
    images: [],
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.caretakerDashboard(profile.uid) });

  const propertyLabel = (id?: string | null) => {
    if (!id) return null;
    const p = properties.find((x: any) => x.id === id);
    return p ? `${p.title}${p.unitNumber ? ` (${p.unitNumber})` : ''}` : 'Unit';
  };

  const buildingLabel = (id?: string | null) => {
    if (!id) return null;
    return buildings.find((b: any) => b.id === id)?.name ?? null;
  };

  const openRequests = useMemo(() => requests.filter((r: any) => r.status !== 'resolved'), [requests]);
  const urgentCount = useMemo(
    () => openRequests.filter((r: any) => r.priority === 'urgent' || r.priority === 'high').length,
    [openRequests],
  );

  const filteredRequests = useMemo(() => {
    const q = repairSearch.trim().toLowerCase();
    return requests.filter((r: any) => {
      if (repairFilter === 'open' && r.status === 'resolved') return false;
      if (repairFilter !== 'all' && repairFilter !== 'open' && r.status !== repairFilter) return false;
      if (!q) return true;
      return [r.title, r.description, propertyLabel(r.propertyId), r.tenantName, r.tenantEmail].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [requests, repairFilter, repairSearch, properties]);

  const filteredReports = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return reports.filter((rep: any) => {
      if (reportFilter !== 'all' && rep.status !== reportFilter) return false;
      if (!q) return true;
      return [rep.title, rep.description, rep.category, propertyLabel(rep.propertyId), buildingLabel(rep.buildingId)].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [reports, reportFilter, reportSearch, properties, buildings]);

  const repairPager = usePagination(filteredRequests, 10);
  const reportPager = usePagination(filteredReports, 10);
  const notifPager = usePagination(notifications, 12);
  const unitPager = usePagination(properties, 8);

  const handleRespond = (request: any, status: 'pending' | 'in-progress' | 'resolved') =>
    run(`req-${request.id}`, async () => {
      try {
        const note = notesByRequest[request.id] ?? request.resolutionNotes ?? '';
        await respondCaretakerMaintenance(request.id, {
          status,
          resolutionNotes: note.trim() || null,
        });
        await refresh();
        toast.success(
          status === 'resolved'
            ? 'Repair marked resolved. Tenant and landlord notified.'
            : status === 'in-progress'
              ? 'Repair marked in progress.'
              : 'Repair reopened.',
        );
      } catch (err: any) {
        toast.error(err.message || 'Could not update repair status');
      }
    });

  const handleReportPhotos = async (files: File[]) => {
    if (!files.length) return;
    setUploadingPhoto(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, 6)) {
        if (!file.type.startsWith('image/')) continue;
        const { url } = await uploadFile(file, file.name, 'reports');
        urls.push(url);
      }
      if (urls.length) {
        setReportForm((f) => ({ ...f, images: [...f.images, ...urls].slice(0, 6) }));
        toast.success(urls.length === 1 ? 'Photo attached' : `${urls.length} photos attached`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmitReport = async () => {
    if (reportForm.title.trim().length < 2) {
      toast.error('Enter a clear title for your report.');
      return;
    }
    if (reportForm.description.trim().length < 5) {
      toast.error('Describe the issue or observation.');
      return;
    }
    setSubmittingReport(true);
    try {
      await createCaretakerReport({
        title: reportForm.title.trim(),
        category: reportForm.category,
        priority: reportForm.priority,
        propertyId: reportForm.propertyId !== 'none' ? reportForm.propertyId : null,
        buildingId: reportForm.buildingId !== 'none' ? reportForm.buildingId : null,
        description: reportForm.description.trim(),
        images: reportForm.images,
      });
      await refresh();
      setReportDialogOpen(false);
      setReportForm({
        title: '',
        category: 'maintenance',
        priority: 'medium',
        propertyId: 'none',
        buildingId: 'none',
        description: '',
        images: [],
      });
      toast.success('Report sent to your landlord.');
      setActiveTab('reports');
    } catch (err: any) {
      toast.error(err.message || 'Could not submit report');
    } finally {
      setSubmittingReport(false);
    }
  };

  const tab = (['repairs', 'reports', 'automations'] as const).includes(activeTab as any) ? activeTab : 'dashboard';
  const firstName = profile.displayName?.split(' ')[0] || 'Caretaker';

  if (isPending && !data) {
    return (
      <div className="space-y-5 p-4 sm:p-6 md:p-8">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white dark:bg-zinc-900" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 px-4 pb-24 pt-6 sm:px-6 sm:pb-10 lg:px-8 animate-in fade-in duration-300">
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not load your caretaker workspace. Please refresh.
        </div>
      )}

      {tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#161426] dark:text-white sm:text-2xl">
                Hi {firstName}
              </h1>
              <p className="mt-0.5 text-xs text-[#5D5A73] dark:text-slate-400 sm:text-sm">
                Respond to tenant repair issues and file property reports directly to your landlord.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={<Plus className="h-4 w-4" />} onClick={() => setReportDialogOpen(true)}>
                File report to landlord
              </ActionButton>
              <ActionButton variant="secondary" icon={<Wrench className="h-4 w-4" />} onClick={() => setActiveTab('repairs')}>
                Open repairs ({openRequests.length})
              </ActionButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Open repairs" value={openRequests.length} accent={openRequests.length > 0 ? 'amber' : 'violet'} />
            <StatCard label="High / urgent" value={urgentCount} accent={urgentCount > 0 ? 'rose' : 'neutral'} />
            <StatCard label="Reports filed" value={reports.length} accent="violet" />
            <StatCard label="Assigned units" value={properties.length} accent="neutral" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Panel
              title="Active tenant issues"
              action={
                <button
                  type="button"
                  onClick={() => setActiveTab('repairs')}
                  className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-400"
                >
                  View all →
                </button>
              }
            >
              {openRequests.length === 0 ? (
                <EmptyBlock
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  title="All caught up"
                  body="No open tenant repair requests right now."
                />
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {openRequests.slice(0, 5).map((req: any) => (
                    <li key={req.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-950 dark:text-white">{req.title}</p>
                          <StatusPill status={req.status} />
                          {(req.priority === 'urgent' || req.priority === 'high') && <StatusPill status={req.priority} />}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{req.description}</p>
                        <p className="mt-1 text-[11px] text-zinc-400">
                          {propertyLabel(req.propertyId) || 'Unit'} · {req.tenantName || req.tenantEmail || 'Tenant'} · {shortDate(req.createdAt)}
                        </p>
                      </div>
                      <ActionButton size="sm" variant="secondary" onClick={() => setActiveTab('repairs')}>
                        Respond
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Your landlord">
              {landlord ? (
                <div className="space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
                      {landlord.avatarUrl ? (
                        <img src={resolveMediaUrl(landlord.avatarUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        landlord.displayName?.charAt(0).toUpperCase() || 'L'
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-zinc-950 dark:text-white">{landlord.displayName}</p>
                      <p className="truncate text-xs text-zinc-500">{landlord.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {landlord.phone && (
                      <a
                        href={`tel:${landlord.phone}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"
                      >
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                    )}
                    <a
                      href={`mailto:${landlord.email}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"
                    >
                      <Mail className="h-3.5 w-3.5" /> Email
                    </a>
                    <ActionButton size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setReportDialogOpen(true)}>
                      Send report
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <p className="p-5 text-sm text-zinc-500">Not linked to a landlord yet.</p>
              )}
            </Panel>
          </div>

          {properties.length > 0 && (
            <Panel title={`Properties you look after (${properties.length})`}>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {unitPager.pageItems.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                        {p.title}{p.unitNumber ? ` · Unit ${p.unitNumber}` : ''}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{p.location}</p>
                    </div>
                    <StatusPill status={p.status} />
                  </li>
                ))}
              </ul>
              <div className="px-5 pb-4">
                <Pagination {...unitPager} onPageChange={unitPager.setPage} label="units" />
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === 'repairs' && (
        <div data-tour="caretaker-repairs" className="space-y-4 sm:space-y-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Repairs &amp; house issues</h1>
            <p className="text-sm text-zinc-500">Respond to tenant issues, record your repair notes, and mark work complete.</p>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              value={repairFilter}
              onChange={setRepairFilter}
              options={[
                { id: 'open', label: 'Open', count: requests.filter((r: any) => r.status !== 'resolved').length },
                { id: 'pending', label: 'New', count: requests.filter((r: any) => r.status === 'pending').length },
                { id: 'in-progress', label: 'In progress', count: requests.filter((r: any) => r.status === 'in-progress').length },
                { id: 'resolved', label: 'Resolved', count: requests.filter((r: any) => r.status === 'resolved').length },
                { id: 'all', label: 'All', count: requests.length },
              ]}
            />
            <SearchInput value={repairSearch} onChange={setRepairSearch} placeholder="Search unit, tenant or issue…" />
          </div>

          <Panel>
            {filteredRequests.length === 0 ? (
              <EmptyBlock
                icon={<Wrench className="h-5 w-5" />}
                title="No repair issues"
                body={requests.length ? 'Try another filter.' : 'Tenant repair requests will appear here as soon as they are filed.'}
              />
            ) : (
              <>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {repairPager.pageItems.map((request: any) => {
                    const noteValue = notesByRequest[request.id] ?? request.resolutionNotes ?? '';
                    return (
                      <li key={request.id} className="space-y-3 px-5 py-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-zinc-950 dark:text-white">{request.title}</p>
                              <StatusPill status={request.status} />
                              {(request.priority === 'urgent' || request.priority === 'high') && <StatusPill status={request.priority} />}
                            </div>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{request.description}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {propertyLabel(request.propertyId) || 'Unit'}
                              {' · '}
                              {request.tenantName || request.tenantEmail || 'Tenant'}
                              {request.tenantPhone ? ` (${request.tenantPhone})` : ''}
                              {' · '}
                              {shortDate(request.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={noteValue}
                            onChange={(e) => setNotesByRequest((prev) => ({ ...prev, [request.id]: e.target.value }))}
                            placeholder="Add update or resolution note (e.g. Plumber scheduled for 2pm, replaced valve)…"
                            className="h-9 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 text-xs text-zinc-900 outline-none focus:border-violet-600 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                          />
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {request.status === 'pending' && (
                              <ActionButton
                                size="sm"
                                variant="secondary"
                                loading={isBusy(`req-${request.id}`)}
                                onClick={() => handleRespond(request, 'in-progress')}
                              >
                                Start work
                              </ActionButton>
                            )}
                            {request.status !== 'resolved' ? (
                              <ActionButton
                                size="sm"
                                loading={isBusy(`req-${request.id}`)}
                                onClick={() => handleRespond(request, 'resolved')}
                              >
                                Mark fixed
                              </ActionButton>
                            ) : (
                              <ActionButton
                                size="sm"
                                variant="ghost"
                                loading={isBusy(`req-${request.id}`)}
                                onClick={() => handleRespond(request, 'in-progress')}
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
                  <Pagination {...repairPager} onPageChange={repairPager.setPage} label="repairs" />
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Reports to landlord</h1>
              <p className="text-sm text-zinc-500">File inspections, utility issues, security notes or incident reports with photos.</p>
            </div>
            <div data-tour="caretaker-new-report">
              <ActionButton icon={<Plus className="h-4 w-4" />} onClick={() => setReportDialogOpen(true)}>
                New report
              </ActionButton>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              value={reportFilter}
              onChange={setReportFilter}
              options={[
                { id: 'all', label: 'All', count: reports.length },
                { id: 'open', label: 'Open', count: reports.filter((r: any) => r.status === 'open').length },
                { id: 'acknowledged', label: 'Acknowledged', count: reports.filter((r: any) => r.status === 'acknowledged').length },
                { id: 'resolved', label: 'Resolved', count: reports.filter((r: any) => r.status === 'resolved').length },
              ]}
            />
            <SearchInput value={reportSearch} onChange={setReportSearch} placeholder="Search reports…" />
          </div>

          <Panel>
            {filteredReports.length === 0 ? (
              <EmptyBlock
                icon={<ClipboardList className="h-5 w-5" />}
                title="No reports yet"
                body="File a report anytime you spot damage, utility outages, security concerns, or finish an inspection."
                action={
                  <ActionButton icon={<Plus className="h-4 w-4" />} onClick={() => setReportDialogOpen(true)}>
                    File first report
                  </ActionButton>
                }
              />
            ) : (
              <>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {reportPager.pageItems.map((rep: any) => (
                    <li key={rep.id} className="space-y-2.5 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-950 dark:text-white">{rep.title}</p>
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${REPORT_STATUS_STYLE[rep.status] ?? REPORT_STATUS_STYLE.open}`}>
                            {rep.status}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {CATEGORY_LABELS[rep.category as ReportCategory] ?? rep.category}
                          </span>
                          {(rep.priority === 'urgent' || rep.priority === 'high') && <StatusPill status={rep.priority} />}
                        </div>
                        <span className="text-xs text-zinc-400">{shortDate(rep.createdAt)}</span>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">{rep.description}</p>
                      {(propertyLabel(rep.propertyId) || buildingLabel(rep.buildingId)) && (
                        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <Building2 className="h-3.5 w-3.5" />
                          {[propertyLabel(rep.propertyId), buildingLabel(rep.buildingId)].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {Array.isArray(rep.images) && rep.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {rep.images.map((src: string, idx: number) => (
                            <a
                              key={`${src}-${idx}`}
                              href={resolveMediaUrl(src)}
                              target="_blank"
                              rel="noreferrer"
                              className="h-16 w-20 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700"
                            >
                              <img src={resolveMediaUrl(src)} alt="" className="h-full w-full object-cover" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}
                      {rep.landlordNotes && (
                        <div className="rounded-xl border border-violet-200/70 bg-violet-50/60 px-3.5 py-2.5 text-xs text-violet-950 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200">
                          <span className="font-semibold">Landlord reply: </span>
                          {rep.landlordNotes}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="px-5 pb-4">
                  <Pagination {...reportPager} onPageChange={reportPager.setPage} label="reports" />
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {tab === 'automations' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Notifications</h1>
              <p className="text-sm text-zinc-500">New repair tickets and landlord responses.</p>
            </div>
            {notifications.some((n: any) => !n.read) && (
              <ActionButton
                variant="secondary"
                loading={isBusy('mark-all')}
                onClick={() =>
                  run('mark-all', async () => {
                    await markAllNotificationsRead();
                    await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: queryKeys.unreadCountAll() })]);
                  })
                }
              >
                Mark all read
              </ActionButton>
            )}
          </div>
          <Panel>
            {notifications.length === 0 ? (
              <EmptyBlock icon={<Bell className="h-5 w-5" />} title="No notifications" body="New repair requests and report updates will show up here." />
            ) : (
              <>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {notifPager.pageItems.map((n: any) => (
                    <li key={n.id} className={`flex items-start justify-between gap-3 px-5 py-4 ${n.read ? '' : 'bg-violet-50/40 dark:bg-violet-500/5'}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-950 dark:text-white">{n.title}</p>
                        <p className="mt-0.5 text-sm text-zinc-500">{n.message}</p>
                        <p className="mt-1 text-xs text-zinc-400">{shortDate(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <ActionButton
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            run(`read-${n.id}`, async () => {
                              await markNotificationRead(n.id);
                              await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: queryKeys.unreadCountAll() })]);
                            })
                          }
                        >
                          Mark read
                        </ActionButton>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="px-5 pb-4">
                  <Pagination {...notifPager} onPageChange={notifPager.setPage} label="notifications" />
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {/* File Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={(next) => !submittingReport && setReportDialogOpen(next)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>File report to landlord</DialogTitle>
            <DialogDescription>
              Your landlord receives this report immediately by push notification, in-app alert, and email.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Report title">
              <input
                className={inputClass}
                value={reportForm.title}
                onChange={(e) => setReportForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Borehole pump pressure drop in Block B"
                maxLength={160}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <select
                  className={inputClass}
                  value={reportForm.category}
                  onChange={(e) => setReportForm((f) => ({ ...f, category: e.target.value as ReportCategory }))}
                >
                  {(Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  className={inputClass}
                  value={reportForm.priority}
                  onChange={(e) => setReportForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {properties.length > 0 && (
                <Field label="Specific unit (optional)">
                  <select
                    className={inputClass}
                    value={reportForm.propertyId}
                    onChange={(e) => setReportForm((f) => ({ ...f, propertyId: e.target.value }))}
                  >
                    <option value="none">General / whole compound</option>
                    {properties.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.title}{p.unitNumber ? ` (${p.unitNumber})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {buildings.length > 0 && (
                <Field label="Building (optional)">
                  <select
                    className={inputClass}
                    value={reportForm.buildingId}
                    onChange={(e) => setReportForm((f) => ({ ...f, buildingId: e.target.value }))}
                  >
                    <option value="none">Not specific to a building</option>
                    {buildings.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <Field label="Details & observations">
              <textarea
                className={`${inputClass} h-28 py-2.5`}
                value={reportForm.description}
                onChange={(e) => setReportForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Explain what happened, action already taken, and what the landlord needs to approve…"
                maxLength={4000}
              />
            </Field>

            <div className="space-y-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Evidence photos (optional)</span>
              {reportForm.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {reportForm.images.map((url, idx) => (
                    <div key={`${url}-${idx}`} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                      <img src={resolveMediaUrl(url)} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => setReportForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }))}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <PhotoCaptureControl
                variant="tile"
                multiple
                defaultFacingMode="environment"
                uploading={uploadingPhoto}
                uploadLabel="Upload photos"
                captureLabel="Take photo"
                onFiles={handleReportPhotos}
              />
            </div>
          </div>

          <DialogFooter>
            <ActionButton variant="secondary" onClick={() => setReportDialogOpen(false)} disabled={submittingReport}>
              Cancel
            </ActionButton>
            <ActionButton onClick={handleSubmitReport} loading={submittingReport} disabled={uploadingPhoto}>
              Send report
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: 'violet' | 'amber' | 'rose' | 'neutral' }) {
  const tone = {
    violet: 'text-violet-700 dark:text-violet-300',
    amber: 'text-amber-600 dark:text-amber-300',
    rose: 'text-rose-600 dark:text-rose-400',
    neutral: 'text-zinc-950 dark:text-white',
  }[accent];
  return (
    <div className="rounded-2xl border border-[#221844]/[0.08] bg-white p-4 shadow-2xs dark:border-white/[0.08] dark:bg-[#181922]">
      <p className="text-xs font-medium text-[#5D5A73] dark:text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  Edit3,
  Eye,
  EyeOff,
  Home,
  Layers,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createAdminSubscriptionPlan,
  deleteAdminSubscriptionPlan,
  getAdminSubscriptionPlans,
  updateAdminSubscriptionPlan,
  type SubscriptionPlanWritePayload,
} from '../../lib/api';
import { queryKeys } from '../../lib/queries';
import {
  formatPlanLimitSummary,
  formatPlanPrice,
  getDynamicPlanAmount,
  type DynamicSubscriptionPlan,
  type PlanAudienceType,
} from '../../../../shared/landlordSubscription';

type PlanFilter = 'all' | 'landlord' | 'property_manager' | 'active' | 'inactive';

interface PlanFormState {
  id: string;
  label: string;
  badge: string;
  audienceType: PlanAudienceType;
  description: string;
  monthlyPriceKes: string;
  quarterlyPriceKes: string;
  yearlyPriceKes: string;
  unlimitedUnits: boolean;
  maxListings: string;
  unlimitedBuildings: boolean;
  maxBuildings: string;
  maintenanceHub: boolean;
  caretakerAccess: boolean;
  agencyAccess: boolean;
  highlightsText: string;
  sortOrder: string;
  isActive: boolean;
}

const emptyForm = (nextOrder: number): PlanFormState => ({
  id: '',
  label: '',
  badge: '',
  audienceType: 'landlord',
  description: '',
  monthlyPriceKes: '1500',
  quarterlyPriceKes: '',
  yearlyPriceKes: '',
  unlimitedUnits: false,
  maxListings: '15',
  unlimitedBuildings: false,
  maxBuildings: '3',
  maintenanceHub: true,
  caretakerAccess: false,
  agencyAccess: false,
  highlightsText: 'Automated rent reminders\nDigital rent receipts\nMaintenance ticket hub',
  sortOrder: String(nextOrder),
  isActive: true,
});

const toFormState = (plan: DynamicSubscriptionPlan): PlanFormState => ({
  id: plan.id,
  label: plan.label,
  badge: plan.badge ?? '',
  audienceType: plan.audienceType,
  description: plan.description ?? '',
  monthlyPriceKes: String(plan.monthlyPriceKes),
  quarterlyPriceKes: plan.quarterlyPriceKes === null ? '' : String(plan.quarterlyPriceKes),
  yearlyPriceKes: plan.yearlyPriceKes === null ? '' : String(plan.yearlyPriceKes),
  unlimitedUnits: plan.maxListings === null,
  maxListings: plan.maxListings === null ? '' : String(plan.maxListings),
  unlimitedBuildings: plan.maxBuildings === null,
  maxBuildings: plan.maxBuildings === null ? '' : String(plan.maxBuildings),
  maintenanceHub: plan.maintenanceHub,
  caretakerAccess: plan.caretakerAccess,
  agencyAccess: plan.agencyAccess,
  highlightsText: plan.highlights.join('\n'),
  sortOrder: String(plan.sortOrder),
  isActive: plan.isActive,
});

const audienceLabel = (audience: PlanAudienceType) =>
  audience === 'property_manager' ? 'Property managers' : audience === 'both' ? 'Landlords & PMs' : 'Landlords';

export default function SuperAdminPlansView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DynamicSubscriptionPlan | null>(null);
  const [form, setForm] = useState<PlanFormState>(() => emptyForm(50));
  const [saving, setSaving] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const { data: plans = [], isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: getAdminSubscriptionPlans,
  });

  const invalidateAllPlanQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.publicPlans() }),
    ]);
  };

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (filter === 'landlord') return p.audienceType === 'landlord' || p.audienceType === 'both';
      if (filter === 'property_manager') return p.audienceType === 'property_manager' || p.audienceType === 'both' || p.agencyAccess;
      if (filter === 'active') return p.isActive;
      if (filter === 'inactive') return !p.isActive;
      return true;
    });
  }, [plans, filter]);

  const stats = useMemo(() => {
    const activeCount = plans.filter((p) => p.isActive).length;
    const landlordCount = plans.filter((p) => p.audienceType === 'landlord' || p.audienceType === 'both').length;
    const pmCount = plans.filter((p) => p.audienceType === 'property_manager' || p.audienceType === 'both' || p.agencyAccess).length;
    const totalSubscribers = plans.reduce((sum, p) => sum + (p.subscriberCount ?? 0), 0);
    return { total: plans.length, activeCount, landlordCount, pmCount, totalSubscribers };
  }, [plans]);

  const openCreate = () => {
    const maxSort = plans.reduce((max, p) => Math.max(max, p.sortOrder), 0);
    setEditingPlan(null);
    setForm(emptyForm(maxSort + 10));
    setDialogOpen(true);
  };

  const openEdit = (plan: DynamicSubscriptionPlan) => {
    setEditingPlan(plan);
    setForm(toFormState(plan));
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) {
      toast.error('Enter a plan name.');
      return;
    }
    const monthly = Math.max(0, Math.round(Number(form.monthlyPriceKes || 0)));
    if (Number.isNaN(monthly) || monthly < 0) {
      toast.error('Monthly price must be 0 or greater.');
      return;
    }

    const parsedUnits = form.unlimitedUnits ? null : Math.round(Number(form.maxListings));
    if (!form.unlimitedUnits && (!parsedUnits || parsedUnits < 1)) {
      toast.error('Enter a valid unit limit (at least 1) or enable Unlimited units.');
      return;
    }

    const parsedBuildings = form.unlimitedBuildings ? null : Math.round(Number(form.maxBuildings));
    if (!form.unlimitedBuildings && (!parsedBuildings || parsedBuildings < 1)) {
      toast.error('Enter a valid building limit (at least 1) or enable Unlimited buildings.');
      return;
    }

    const quarterly =
      form.quarterlyPriceKes.trim() === '' ? null : Math.max(0, Math.round(Number(form.quarterlyPriceKes)));
    const yearly =
      form.yearlyPriceKes.trim() === '' ? null : Math.max(0, Math.round(Number(form.yearlyPriceKes)));
    const highlights = form.highlightsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const sortOrder = Math.max(0, Math.round(Number(form.sortOrder || 0)));

    const payload: SubscriptionPlanWritePayload = {
      ...(editingPlan ? {} : form.id.trim() ? { id: form.id.trim().toLowerCase() } : {}),
      label: form.label.trim(),
      badge: form.badge.trim() || null,
      audienceType: form.audienceType,
      description: form.description.trim(),
      monthlyPriceKes: editingPlan?.id === 'free' ? 0 : monthly,
      quarterlyPriceKes: editingPlan?.id === 'free' ? 0 : quarterly,
      yearlyPriceKes: editingPlan?.id === 'free' ? 0 : yearly,
      maxListings: parsedUnits,
      maxBuildings: parsedBuildings,
      maintenanceHub: form.maintenanceHub,
      caretakerAccess: form.caretakerAccess,
      agencyAccess: form.agencyAccess,
      highlights,
      sortOrder,
      isActive: editingPlan?.id === 'free' ? true : form.isActive,
    };

    setSaving(true);
    try {
      if (editingPlan) {
        const { id: _ignored, ...updateBody } = payload;
        await updateAdminSubscriptionPlan(editingPlan.id, updateBody);
        toast.success(`Updated "${payload.label}". Changes are now live across the database and app.`);
      } else {
        await createAdminSubscriptionPlan(payload);
        toast.success(`Created "${payload.label}". Landlords and property managers can now select it.`);
      }
      await invalidateAllPlanQueries();
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: DynamicSubscriptionPlan) => {
    if (plan.id === 'free') return;
    setBusyPlanId(plan.id);
    try {
      await updateAdminSubscriptionPlan(plan.id, { isActive: !plan.isActive });
      toast.success(plan.isActive ? `"${plan.label}" hidden from new signups.` : `"${plan.label}" is now active and visible.`);
      await invalidateAllPlanQueries();
    } catch (err: any) {
      toast.error(err?.message || 'Could not update plan visibility.');
    } finally {
      setBusyPlanId(null);
    }
  };

  const handleDelete = async (plan: DynamicSubscriptionPlan) => {
    if (plan.isSystem || plan.id === 'free') return;
    if (!window.confirm(`Permanently delete the "${plan.label}" plan?`)) return;
    setBusyPlanId(plan.id);
    try {
      await deleteAdminSubscriptionPlan(plan.id);
      toast.success(`Deleted "${plan.label}".`);
      await invalidateAllPlanQueries();
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete plan.');
    } finally {
      setBusyPlanId(null);
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Could not load subscription plans.</p>
          <Button size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top KPI Row + Add CTA */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
            Prepaid Plans &amp; Pricing
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Edit prices, unit limits, building limits, and features — updates take effect immediately in the database, checkout, and signup screens.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 rounded-xl bg-[#5B21B6] text-white hover:bg-[#4C1D95] shrink-0">
          <Plus className="h-4 w-4" />
          Add new plan
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total plans</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">{stats.total}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{stats.activeCount} active · {stats.total - stats.activeCount} hidden</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Landlord plans</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">{stats.landlordCount}</p>
            <p className="mt-0.5 text-xs text-zinc-500">Individual &amp; multi-unit tiers</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Property manager plans</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">{stats.pmCount}</p>
            <p className="mt-0.5 text-xs text-zinc-500">Agency &amp; landlord management</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Active subscribers</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">{stats.totalSubscribers}</p>
            <p className="mt-0.5 text-xs text-zinc-500">Across all live tiers</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            { id: 'all', label: 'All plans' },
            { id: 'landlord', label: 'Landlords' },
            { id: 'property_manager', label: 'Property managers' },
            { id: 'active', label: 'Active' },
            { id: 'inactive', label: 'Hidden' },
          ] as { id: PlanFilter; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === tab.id
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Plans Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredPlans.map((plan) => {
          const quarterly = getDynamicPlanAmount(plan, 'quarterly');
          const yearly = getDynamicPlanAmount(plan, 'yearly');
          const isBusy = busyPlanId === plan.id;
          return (
            <Card
              key={plan.id}
              className={`flex flex-col justify-between overflow-hidden py-0 transition ${
                !plan.isActive ? 'opacity-65 border-dashed' : ''
              }`}
            >
              <CardContent className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-base font-bold text-zinc-950 dark:text-white">{plan.label}</h3>
                        {plan.badge && (
                          <Badge variant="purple" className="text-[10px]">
                            {plan.badge}
                          </Badge>
                        )}
                        {!plan.isActive && (
                          <Badge variant="secondary" className="text-[10px]">
                            Hidden
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-400">ID: {plan.id} · Order #{plan.sortOrder}</p>
                    </div>
                    <Badge variant={plan.audienceType === 'property_manager' ? 'warning' : 'indigo'} className="shrink-0 text-[10px]">
                      {audienceLabel(plan.audienceType)}
                    </Badge>
                  </div>

                  {/* Pricing breakdown */}
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-extrabold tabular-nums text-zinc-950 dark:text-white">
                        {plan.monthlyPriceKes === 0 ? 'KES 0 (Free)' : formatPlanPrice(plan.monthlyPriceKes)}
                      </span>
                      {plan.monthlyPriceKes > 0 && <span className="text-xs text-zinc-500">/ month</span>}
                    </div>
                    {plan.monthlyPriceKes > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 tabular-nums">
                        <span>Quarterly: <strong className="text-zinc-800 dark:text-zinc-200">{formatPlanPrice(quarterly)}</strong></span>
                        <span>Yearly: <strong className="text-zinc-800 dark:text-zinc-200">{formatPlanPrice(yearly)}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-200/70 px-3 py-2 dark:border-zinc-800">
                      <Home className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400">Units</p>
                        <p className="truncate text-xs font-bold text-zinc-950 dark:text-white">
                          {plan.maxListings === null ? 'Unlimited' : `Up to ${plan.maxListings}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-200/70 px-3 py-2 dark:border-zinc-800">
                      <Building2 className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400">Buildings</p>
                        <p className="truncate text-xs font-bold text-zinc-950 dark:text-white">
                          {plan.maxBuildings === null ? 'Unlimited' : `Up to ${plan.maxBuildings}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Capability chips */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${plan.maintenanceHub ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800'}`}>
                      <Wrench className="h-2.5 w-2.5" /> Maintenance
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${plan.caretakerAccess ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800'}`}>
                      <Users className="h-2.5 w-2.5" /> Caretakers
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${plan.agencyAccess ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800'}`}>
                      <ShieldCheck className="h-2.5 w-2.5" /> Agency / PM
                    </span>
                  </div>

                  {plan.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-5">{plan.description}</p>
                  )}

                  {plan.highlights.length > 0 && (
                    <ul className="space-y-1 border-t border-zinc-100 pt-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                      {plan.highlights.slice(0, 4).map((item) => (
                        <li key={item} className="flex items-start gap-1.5">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-violet-600" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Footer & Actions */}
                <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
                    <Layers className="h-3.5 w-3.5" />
                    {plan.subscriberCount ?? 0} active
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg px-2.5 text-xs" onClick={() => openEdit(plan)} disabled={isBusy}>
                      <Edit3 className="h-3 w-3" /> Edit
                    </Button>
                    {plan.id !== 'free' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 rounded-lg px-2.5 text-xs"
                        onClick={() => void handleToggleActive(plan)}
                        disabled={isBusy}
                        title={plan.isActive ? 'Hide plan from new signups' : 'Make plan visible'}
                      >
                        {plan.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {plan.isActive ? 'Hide' : 'Show'}
                      </Button>
                    )}
                    {!plan.isSystem && plan.id !== 'free' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200 dark:border-rose-900"
                        onClick={() => void handleDelete(plan)}
                        disabled={isBusy || (plan.subscriberCount ?? 0) > 0}
                        title={(plan.subscriberCount ?? 0) > 0 ? 'Hide instead of deleting while accounts are subscribed' : 'Delete plan'}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create / Edit Plan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
          <div className="border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="h-4 w-4 text-violet-600" />
              {editingPlan ? `Edit "${editingPlan.label}" Plan` : 'Create New Prepaid Plan'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Updates save directly to Postgres and apply immediately to checkout pricing, unit limits, and building limits.
            </DialogDescription>
          </div>

          <form onSubmit={handleSave} className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Plan name *</label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Growth, Estate 50, Agency Gold"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Plan ID (slug) {editingPlan ? '(fixed)' : '(optional — auto-generated)'}
                </label>
                <Input
                  value={form.id}
                  disabled={Boolean(editingPlan)}
                  onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                  placeholder="e.g. estate-50"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Target audience</label>
                <select
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold outline-none dark:border-zinc-700 dark:bg-zinc-900"
                  value={form.audienceType}
                  onChange={(e) => {
                    const next = e.target.value as PlanAudienceType;
                    setForm((f) => ({
                      ...f,
                      audienceType: next,
                      agencyAccess: next === 'property_manager' ? true : f.agencyAccess,
                    }));
                  }}
                >
                  <option value="landlord">Landlords</option>
                  <option value="property_manager">Property Managers / Agencies</option>
                  <option value="both">Both Landlords &amp; PMs</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Badge (optional)</label>
                <Input
                  value={form.badge}
                  onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                  placeholder="e.g. Most Popular"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Sort order</label>
                <Input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                Prepaid Pricing (KES)
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Monthly (KES) *</label>
                  <Input
                    type="number"
                    min={0}
                    disabled={editingPlan?.id === 'free'}
                    value={form.monthlyPriceKes}
                    onChange={(e) => setForm((f) => ({ ...f, monthlyPriceKes: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Quarterly (optional)</label>
                  <Input
                    type="number"
                    min={0}
                    disabled={editingPlan?.id === 'free'}
                    placeholder="Auto (2.7x)"
                    value={form.quarterlyPriceKes}
                    onChange={(e) => setForm((f) => ({ ...f, quarterlyPriceKes: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Yearly (optional)</label>
                  <Input
                    type="number"
                    min={0}
                    disabled={editingPlan?.id === 'free'}
                    placeholder="Auto (10x)"
                    value={form.yearlyPriceKes}
                    onChange={(e) => setForm((f) => ({ ...f, yearlyPriceKes: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Unit & Building Limits */}
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Units &amp; Buildings Limits
                </p>
                <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
                  {formatPlanLimitSummary(
                    form.unlimitedUnits ? null : Number(form.maxListings) || 0,
                    form.unlimitedBuildings ? null : Number(form.maxBuildings) || 0,
                  )}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Max units</label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={form.unlimitedUnits}
                        onChange={(e) => setForm((f) => ({ ...f, unlimitedUnits: e.target.checked }))}
                        className="h-3.5 w-3.5 accent-violet-600"
                      />
                      Unlimited
                    </label>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    disabled={form.unlimitedUnits}
                    placeholder={form.unlimitedUnits ? 'Unlimited units' : 'e.g. 20'}
                    value={form.unlimitedUnits ? '' : form.maxListings}
                    onChange={(e) => setForm((f) => ({ ...f, maxListings: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Max buildings</label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={form.unlimitedBuildings}
                        onChange={(e) => setForm((f) => ({ ...f, unlimitedBuildings: e.target.checked }))}
                        className="h-3.5 w-3.5 accent-violet-600"
                      />
                      Unlimited
                    </label>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    disabled={form.unlimitedBuildings}
                    placeholder={form.unlimitedBuildings ? 'Unlimited buildings' : 'e.g. 5'}
                    value={form.unlimitedBuildings ? '' : form.maxBuildings}
                    onChange={(e) => setForm((f) => ({ ...f, maxBuildings: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="grid gap-2.5 sm:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 p-3 text-xs font-semibold dark:border-zinc-700">
                <input
                  type="checkbox"
                  checked={form.maintenanceHub}
                  onChange={(e) => setForm((f) => ({ ...f, maintenanceHub: e.target.checked }))}
                  className="h-4 w-4 accent-violet-600"
                />
                Maintenance hub
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 p-3 text-xs font-semibold dark:border-zinc-700">
                <input
                  type="checkbox"
                  checked={form.caretakerAccess}
                  onChange={(e) => setForm((f) => ({ ...f, caretakerAccess: e.target.checked }))}
                  className="h-4 w-4 accent-violet-600"
                />
                Caretaker access
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 p-3 text-xs font-semibold dark:border-zinc-700">
                <input
                  type="checkbox"
                  checked={form.agencyAccess}
                  onChange={(e) => setForm((f) => ({ ...f, agencyAccess: e.target.checked }))}
                  className="h-4 w-4 accent-violet-600"
                />
                Agency / PM role
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Short description / audience</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Ideal for apartment block owners managing 20–50 units."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Feature highlights (one per line)
              </label>
              <Textarea
                rows={4}
                value={form.highlightsText}
                onChange={(e) => setForm((f) => ({ ...f, highlightsText: e.target.value }))}
                placeholder={'Automated M-Pesa reconciliation\nCaretaker role access\nPDF rent receipts'}
              />
            </div>

            {editingPlan?.id !== 'free' && (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="h-4 w-4 accent-violet-600"
                />
                Active &amp; visible to landlords and property managers
              </label>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-2 bg-[#5B21B6] text-white hover:bg-[#4C1D95]">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingPlan ? 'Save changes' : 'Create plan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

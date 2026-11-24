import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getSubscriptionFeatures, isFreePlan, type PendingLandlordSubscription } from '../../../shared/landlordSubscription';
import { normalizeRentPayment } from '../../../shared/rentUtils';
import LandlordSignupFields, { defaultLandlordSignupState } from './LandlordSignupFields';
import LandlordSubscriptionPay from './LandlordSubscriptionPay';
import {
  addPropertyManager,
  assignTenant,
  createBuilding,
  createExpense,
  createProperties,
  deleteBuilding,
  deleteNotification,
  deleteProperty,
  deleteTenant,
  markAllNotificationsRead,
  markNotificationRead,
  markRentPaymentManual,
  provisionUser,
  sendRentReminder,
  syncRentInvoices,
  unassignTenant,
  updateBuilding,
  updateMaintenanceRequestStatus,
  updateProperty,
} from '../lib/api';
import { logAudit } from '../lib/audit';
import { queryKeys, useLandlordDashboard } from '../lib/queries';
import type { UserProfile } from '../App';
import OverviewTab from './landlord/OverviewTab';
import PropertiesTab from './landlord/PropertiesTab';
import TenantsTab from './landlord/TenantsTab';
import PaymentsTab from './landlord/PaymentsTab';
import MaintenanceTab from './landlord/MaintenanceTab';
import NotificationsTab from './landlord/NotificationsTab';
import PropertyFormDialog, { type PropertyFormValues } from './landlord/PropertyFormDialog';
import {
  AssignDialog,
  BuildingDialog,
  BulkUnitsDialog,
  ConfirmDialog,
  ExpenseDialog,
  InviteTenantDialog,
  ManagerDialog,
  type ConfirmRequest,
} from './landlord/dialogs';
import { useBusy } from './landlord/ui';
import type {
  Booking,
  Building,
  Expense,
  Invitation,
  LandlordTab,
  Lease,
  MaintenanceRequest,
  Notification,
  Property,
  RentPayment,
  Tenant,
} from './landlord/types';

interface LandlordDashboardProps {
  profile: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function LandlordDashboard({ profile, activeTab, setActiveTab }: LandlordDashboardProps) {
  const queryClient = useQueryClient();
  const features = useMemo(() => getSubscriptionFeatures(profile), [profile.subscriptionPlan, profile.role]);
  const isPlatformAdmin = Boolean(profile.isAdmin || profile.isSuperAdmin);
  // Free plan: a single house unit, no buildings (also enforced by the server).
  const onFreePlan = isFreePlan(profile.subscriptionPlan) && !isPlatformAdmin;
  const allowBuildings = !onFreePlan;
  const { run, isBusy } = useBusy();

  // Catch-up invoice generation once per visit (the daily job is the main path); the
  // dashboard GET never writes, so the first fetch waits for this.
  const [syncedUid, setSyncedUid] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    syncRentInvoices()
      .catch(() => undefined)
      .finally(() => active && setSyncedUid(profile.uid));
    return () => {
      active = false;
    };
  }, [profile.uid]);

  const { data, error, isPending } = useLandlordDashboard(profile.uid, { enabled: syncedUid === profile.uid });
  useEffect(() => {
    if (error) toast.error('Could not load your dashboard. Check your connection and try again.');
  }, [error]);

  const raw = data as (typeof data & { leases?: Lease[]; registeredEmails?: string[] }) | undefined;
  const properties = (raw?.properties ?? []) as Property[];
  const buildings = (raw?.buildings ?? []) as Building[];
  const requests = (raw?.requests ?? []) as MaintenanceRequest[];
  const payments = useMemo(() => (raw?.payments ?? []).map((row) => normalizeRentPayment(row as any) as RentPayment), [raw?.payments]);
  const bookings = (raw?.bookings ?? []) as Booking[];
  const expenses = (raw?.expenses ?? []) as Expense[];
  const invitations = (raw?.invitations ?? []) as Invitation[];
  const notifications = (raw?.notifications ?? []) as Notification[];
  const leases = raw?.leases ?? [];
  const registered = useMemo(() => new Set((raw?.registeredEmails ?? []).map((e) => e.toLowerCase())), [raw?.registeredEmails]);
  const loading = isPending || syncedUid !== profile.uid;

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.landlordDashboard(profile.uid) });

  /* Derived lookups ---------------------------------------------------------- */

  const nameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const inv of invitations) if (inv.displayName) map.set(inv.email.toLowerCase(), inv.displayName);
    return map;
  }, [invitations]);

  const tenantName = (emailOrId: string) => nameByEmail.get(String(emailOrId).toLowerCase()) || emailOrId || 'Tenant';
  const propertyName = (id: string) => {
    const p = properties.find((x) => x.id === id);
    return p ? `${p.title}${p.unitNumber ? ` (${p.unitNumber})` : ''}` : 'Removed property';
  };

  const tenants = useMemo<Tenant[]>(() => {
    const emails = new Map<string, Invitation | null>();
    for (const inv of invitations) emails.set(inv.email.toLowerCase(), inv);
    for (const p of properties) if (p.tenantId?.includes('@') && !emails.has(p.tenantId.toLowerCase())) emails.set(p.tenantId.toLowerCase(), null);

    return [...emails.entries()].map(([email, inv]) => {
      const units = properties.filter((p) => p.tenantId?.toLowerCase() === email);
      const unpaid = payments.filter((p) => String(p.tenantId).toLowerCase() === email && p.status !== 'paid');
      const overdue = unpaid.some((p) => p.status === 'overdue' || new Date(p.dueDate).getTime() < Date.now() - 86_400_000);
      const hasAccount = registered.has(email) || !inv;
      return {
        email,
        name: inv?.displayName || '',
        phone: inv?.phone || '',
        hasAccount,
        units,
        lease: leases.find((l) => l.tenantEmail.toLowerCase() === email),
        balance: unpaid.reduce((s, p) => s + Number(p.amount || 0), 0),
        status: (!hasAccount ? 'invited' : overdue ? 'overdue' : units.length ? 'active' : 'no-unit') as Tenant['status'],
        invitedAt: inv?.createdAt ?? '',
      };
    }).sort((a, b) => Number(b.status === 'overdue') - Number(a.status === 'overdue') || a.email.localeCompare(b.email));
  }, [invitations, properties, payments, leases, registered]);

  const vacantUnits = properties.filter((p) => p.status === 'available');
  const remainingUnits = features.maxListings == null ? null : Math.max(features.maxListings - properties.length, 0);

  /* Dialog state ------------------------------------------------------------- */

  const [propertyDialog, setPropertyDialog] = useState<{ open: boolean; property: Property | null }>({ open: false, property: null });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assign, setAssign] = useState<{ open: boolean; property?: Property | null; email?: string | null }>({ open: false });
  const [buildingDialog, setBuildingDialog] = useState<{ open: boolean; building: Building | null }>({ open: false, building: null });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [managerFor, setManagerFor] = useState<Property | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeForm, setUpgradeForm] = useState<PendingLandlordSubscription>(() => ({
    ...defaultLandlordSignupState(),
    tier: 'starter',
    rentPayoutMethod: profile.rentPayoutMethod ?? 'cash',
    mpesaSettlementPhone: profile.phone ?? '',
    bankName: profile.bankName ?? '',
    bankAccountNumber: profile.bankAccountNumber ?? '',
    bankAccountName: profile.bankAccountName ?? '',
  }));

  const tab: LandlordTab = (['properties', 'tenants', 'finances', 'maintenance', 'automations'] as const).includes(activeTab as any)
    ? (activeTab as LandlordTab)
    : 'dashboard';

  useEffect(() => {
    if (activeTab === 'maintenance' && !features.maintenanceHub) setActiveTab('dashboard');
  }, [activeTab, features.maintenanceHub, setActiveTab]);

  /* Actions ------------------------------------------------------------------ */

  const openAddProperty = () => {
    if (remainingUnits === 0) {
      toast.info(`Your ${features.label} plan allows ${features.maxListings} ${features.maxListings === 1 ? 'unit' : 'units'}. Upgrade to add more.`);
      setUpgradeOpen(true);
      return;
    }
    setPropertyDialog({ open: true, property: null });
  };

  const saveProperty = async (values: PropertyFormValues) => {
    const body = {
      title: values.title.trim(),
      unitNumber: values.unitNumber.trim() || null,
      buildingId: allowBuildings && values.buildingId !== 'none' ? values.buildingId : null,
      type: values.type,
      price: Number(values.price),
      location: values.location.trim(),
      description: values.description.trim(),
      amenities: values.amenities.split(',').map((a) => a.trim()).filter(Boolean),
      images: values.images,
    };
    try {
      if (propertyDialog.property) {
        const { status } = values;
        await updateProperty(propertyDialog.property.id, propertyDialog.property.status === 'rented' ? body : { ...body, status });
        toast.success('Property updated');
      } else {
        await createProperties([body]);
        toast.success('Property added');
      }
      await refresh();
      setPropertyDialog({ open: false, property: null });
    } catch (err: any) {
      toast.error(err.message || 'Could not save the property');
    }
  };

  const remind = (payment: RentPayment) =>
    run(`remind-${payment.id}`, async () => {
      try {
        await sendRentReminder(payment.id);
        toast.success(`Reminder sent to ${tenantName(payment.tenantId)}`);
      } catch (err: any) {
        toast.error(err.message || 'Could not send the reminder');
      }
    });

  const recordCash = (payment: RentPayment) =>
    setConfirm({
      title: 'Record cash payment',
      body: `Mark ${tenantName(payment.tenantId)}'s invoice of KES ${Number(payment.amount).toLocaleString('en-KE')} as paid in cash? They will get a receipt.`,
      confirmLabel: 'Mark as paid',
      action: async () => {
        await markRentPaymentManual(payment.id, 'Landlord recorded a cash payment');
        logAudit('PAYMENT_MARK_PAID', 'rentPayment', payment.id, { provider: 'manual' });
        await syncRentInvoices().catch(() => undefined);
        await refresh();
        toast.success('Payment recorded');
      },
    });

  const inviteTenant = async (values: { email: string; name: string; phone: string; propertyId: string }) => {
    const result = await provisionUser({
      email: values.email,
      displayName: values.name,
      phone: values.phone || undefined,
      role: 'tenant',
      platformId: profile.platformId,
      landlordId: profile.uid,
    });
    logAudit('TENANT_INVITE', 'user', values.email);
    if (values.propertyId !== 'none') await assignTenant(values.propertyId, values.email);
    await refresh();
    toast.success(result.existing ? `${values.email} already has an account and was added to your tenants` : `Invite sent to ${values.email}`);
  };

  const resendInvite = (tenant: Tenant) =>
    run(`resend-${tenant.email}`, async () => {
      try {
        await provisionUser({
          email: tenant.email,
          displayName: tenant.name || tenant.email,
          phone: tenant.phone || undefined,
          role: 'tenant',
          platformId: profile.platformId,
          landlordId: profile.uid,
        });
        toast.success(`New invite sent to ${tenant.email}. The old link no longer works.`);
      } catch (err: any) {
        toast.error(err.message || 'Could not resend the invite');
      }
    });

  const assignToUnit = async (propertyId: string, email: string) => {
    await assignTenant(propertyId, email);
    await refresh();
    toast.success('Tenant assigned. Their first rent invoice has been created.');
  };

  const tenantMoveOut = (tenant: Tenant) =>
    setConfirm({
      title: 'Move tenant out',
      body: `${tenant.name || tenant.email} will be removed from ${tenant.units.map((u) => u.title).join(', ')}. Unpaid invoices are cancelled and the unit becomes vacant.`,
      confirmLabel: 'Move out',
      danger: true,
      action: async () => {
        await unassignTenant(tenant.email);
        await refresh();
        toast.success('Tenant moved out');
      },
    });

  const removeTenant = (tenant: Tenant) =>
    setConfirm({
      title: 'Remove tenant',
      body: `Remove ${tenant.name || tenant.email} from your tenants? They are moved out of any unit and unpaid invoices are cancelled. Paid records are kept.`,
      confirmLabel: 'Remove tenant',
      danger: true,
      action: async () => {
        await deleteTenant(tenant.email);
        await refresh();
        toast.success('Tenant removed');
      },
    });

  const removeProperty = (property: Property) =>
    setConfirm({
      title: 'Delete property',
      body: `Delete ${property.title}? Its listing, photos and invoices are removed. This cannot be undone.`,
      confirmLabel: 'Delete property',
      danger: true,
      action: async () => {
        await deleteProperty(property.id);
        await refresh();
        toast.success('Property deleted');
      },
    });

  const saveBuilding = async (values: { name: string; address: string; latitude: number | null; longitude: number | null }) => {
    if (buildingDialog.building) await updateBuilding(buildingDialog.building.id, values);
    else await createBuilding(values);
    await refresh();
    toast.success(buildingDialog.building ? 'Building updated' : 'Building added');
  };

  const removeBuilding = (building: Building) =>
    setConfirm({
      title: 'Delete building',
      body: `Delete ${building.name}? Units inside it are kept and simply no longer grouped.`,
      confirmLabel: 'Delete building',
      danger: true,
      action: async () => {
        await deleteBuilding(building.id);
        await refresh();
        toast.success('Building deleted');
      },
    });

  const createBulk = async (values: { buildingId: string; type: Property['type']; price: number; prefix: string; start: number; count: number }) => {
    const building = buildings.find((b) => b.id === values.buildingId);
    if (!building) throw new Error('Choose a building.');
    const units = Array.from({ length: values.count }, (_, i) => {
      const unitNumber = `${values.prefix}${values.start + i}`;
      return {
        buildingId: building.id,
        unitNumber,
        title: `${building.name} ${unitNumber}`,
        description: '',
        type: values.type,
        price: values.price,
        location: building.address || building.name,
        amenities: [],
        images: [],
      };
    });
    await createProperties(units);
    await refresh();
    toast.success(`${values.count} units created`);
  };

  const saveExpense = async (values: Parameters<typeof createExpense>[0]) => {
    await createExpense(values);
    await refresh();
    toast.success('Expense saved');
  };

  const addManager = async (email: string) => {
    if (!managerFor) return;
    await addPropertyManager(managerFor.id, email, 'manager');
    toast.success(`${email} can now help manage ${managerFor.title}`);
  };

  const setRequestStatus = (request: MaintenanceRequest, status: MaintenanceRequest['status']) =>
    run(`req-${request.id}`, async () => {
      try {
        await updateMaintenanceRequestStatus(request.id, status);
        await refresh();
        toast.success(status === 'resolved' ? 'Marked as fixed. The tenant has been told.' : 'Status updated');
      } catch (err: any) {
        toast.error(err.message || 'Could not update the request');
      }
    });

  const invalidateUnread = () => queryClient.invalidateQueries({ queryKey: queryKeys.unreadCountAll() });

  const markRead = (n: Notification) =>
    run(`read-${n.id}`, async () => {
      try {
        await markNotificationRead(n.id);
        await Promise.all([refresh(), invalidateUnread()]);
      } catch {
        toast.error('Could not update the notification');
      }
    });

  const markAllRead = () =>
    run('read-all', async () => {
      try {
        await markAllNotificationsRead();
        await Promise.all([refresh(), invalidateUnread()]);
      } catch {
        toast.error('Could not update notifications');
      }
    });

  const removeNotification = (n: Notification) =>
    run(`del-${n.id}`, async () => {
      try {
        await deleteNotification(n.id);
        await Promise.all([refresh(), invalidateUnread()]);
      } catch (err: any) {
        toast.error(err.message || 'Could not delete the notification');
      }
    });

  const openAssignForProperty = (property: Property) => setAssign({ open: true, property });
  const openAssignForTenant = (tenant: Tenant) => {
    if (!vacantUnits.length) {
      toast.info('All your units are occupied. Add a property or move a tenant out first.');
      return;
    }
    setAssign({ open: true, email: tenant.email });
  };

  /* Render ------------------------------------------------------------------- */

  const firstName = profile.displayName?.split(' ')[0] || 'there';

  return (
    <div className="w-full min-w-0 px-4 pb-24 pt-6 sm:px-6 sm:pb-10 lg:px-8 animate-in fade-in duration-300">
      {tab === 'dashboard' && (
        <OverviewTab
          firstName={firstName}
          loading={loading}
          properties={properties}
          payments={payments}
          requests={requests}
          tenantName={tenantName}
          propertyName={propertyName}
          maintenanceEnabled={features.maintenanceHub}
          planLabel={features.label}
          unitLimit={features.maxListings}
          onFreePlan={onFreePlan}
          isBusy={isBusy}
          onOpenTab={(next) => setActiveTab(next)}
          onRemind={remind}
          onRecordCash={recordCash}
          onAddProperty={openAddProperty}
          onInviteTenant={() => setInviteOpen(true)}
          onUpgrade={() => setUpgradeOpen(true)}
        />
      )}

      {tab === 'properties' && (
        <PropertiesTab
          properties={properties}
          buildings={buildings}
          allowBuildings={allowBuildings}
          onFreePlan={onFreePlan}
          tenantName={tenantName}
          onAdd={openAddProperty}
          onAddBulk={() => setBulkOpen(true)}
          onEdit={(property) => setPropertyDialog({ open: true, property })}
          onDelete={removeProperty}
          onAssign={openAssignForProperty}
          onShareAccess={setManagerFor}
          onAddBuilding={() => setBuildingDialog({ open: true, building: null })}
          onEditBuilding={(building) => setBuildingDialog({ open: true, building })}
          onDeleteBuilding={removeBuilding}
          onUpgrade={() => setUpgradeOpen(true)}
        />
      )}

      {tab === 'tenants' && (
        <TenantsTab
          tenants={tenants}
          isBusy={isBusy}
          onInvite={() => setInviteOpen(true)}
          onResend={resendInvite}
          onAssign={openAssignForTenant}
          onUnassign={tenantMoveOut}
          onRemove={removeTenant}
        />
      )}

      {tab === 'finances' && (
        <PaymentsTab
          payments={payments}
          expenses={expenses}
          bookings={bookings}
          tenantName={tenantName}
          propertyName={propertyName}
          isBusy={isBusy}
          onRemind={remind}
          onRecordCash={recordCash}
          onRecordExpense={() => setExpenseOpen(true)}
        />
      )}

      {tab === 'maintenance' && (
        <MaintenanceTab
          enabled={features.maintenanceHub}
          requests={requests}
          propertyName={propertyName}
          tenantName={tenantName}
          isBusy={isBusy}
          onStatusChange={setRequestStatus}
          onUpgrade={() => setUpgradeOpen(true)}
        />
      )}

      {tab === 'automations' && (
        <NotificationsTab
          notifications={notifications}
          isBusy={isBusy}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onDelete={removeNotification}
        />
      )}

      <PropertyFormDialog
        open={propertyDialog.open}
        property={propertyDialog.property}
        buildings={buildings}
        allowBuildings={allowBuildings}
        onClose={() => setPropertyDialog({ open: false, property: null })}
        onSubmit={saveProperty}
      />
      <InviteTenantDialog open={inviteOpen} onClose={() => setInviteOpen(false)} vacantUnits={vacantUnits} onInvite={inviteTenant} />
      <AssignDialog
        open={assign.open}
        onClose={() => setAssign({ open: false })}
        fixedProperty={assign.property}
        fixedEmail={assign.email}
        vacantUnits={vacantUnits}
        tenantOptions={tenants.filter((t) => t.units.length === 0).map((t) => ({ email: t.email, name: t.name }))}
        onAssign={assignToUnit}
      />
      <BuildingDialog open={buildingDialog.open} building={buildingDialog.building} onClose={() => setBuildingDialog({ open: false, building: null })} onSave={saveBuilding} />
      <BulkUnitsDialog open={bulkOpen} onClose={() => setBulkOpen(false)} buildings={buildings} remaining={remainingUnits} onCreate={createBulk} />
      <ExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} properties={properties} onSave={saveExpense} />
      <ManagerDialog open={Boolean(managerFor)} property={managerFor} onClose={() => setManagerFor(null)} onAdd={addManager} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Upgrade your plan</DialogTitle>
            <DialogDescription>Add more units, buildings and repair tracking. Plans are prepaid and never renew automatically.</DialogDescription>
          </DialogHeader>
          <LandlordSignupFields
            value={upgradeForm}
            onChange={setUpgradeForm}
            showPayment
            paymentSlot={
              upgradeForm.tier === 'free' ? (
                <p className="rounded-xl bg-zinc-50 px-3 py-2 text-center text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  You are already on the free plan. Choose a paid plan to upgrade.
                </p>
              ) : (
                <LandlordSubscriptionPay payload={upgradeForm} phone={profile.phone ?? undefined} />
              )
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

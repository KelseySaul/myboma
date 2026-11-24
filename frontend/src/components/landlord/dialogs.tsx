import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MapPicker from '../MapPicker';
import type { Building, Property, PropertyType } from './types';
import { ActionButton, Field, inputClass } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared shell: closes only when not busy, error line, cancel + primary action. */
function FormDialog({
  open, onClose, title, description, children, submitLabel, onSubmit, error, busy, danger, size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  error?: string | null;
  busy?: boolean;
  danger?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {children}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
          <DialogFooter>
            <ActionButton variant="secondary" onClick={onClose} disabled={busy}>Cancel</ActionButton>
            <ActionButton type="submit" variant={danger ? 'danger' : 'primary'} loading={busy}>{submitLabel}</ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Wraps an async submit with busy + error state. Returns true on success. */
function useSubmit(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}

/* Confirm ------------------------------------------------------------------ */

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => Promise<void>;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const { busy, error, setError, submit } = useSubmit(onClose);
  useEffect(() => setError(null), [request]);
  return (
    <FormDialog
      open={Boolean(request)}
      onClose={onClose}
      title={request?.title ?? ''}
      description={request?.body}
      submitLabel={request?.confirmLabel ?? 'Confirm'}
      danger={request?.danger}
      busy={busy}
      error={error}
      size="sm"
      onSubmit={() => request && submit(request.action)}
    />
  );
}

/* Invite tenant ------------------------------------------------------------ */

export function InviteTenantDialog({ open, onClose, vacantUnits, onInvite }: {
  open: boolean;
  onClose: () => void;
  vacantUnits: Property[];
  onInvite: (values: { email: string; name: string; phone: string; propertyId: string }) => Promise<void>;
}) {
  const [values, setValues] = useState({ email: '', name: '', phone: '', propertyId: 'none' });
  const { busy, error, setError, submit } = useSubmit(onClose);
  useEffect(() => {
    if (open) {
      setValues({ email: '', name: '', phone: '', propertyId: 'none' });
      setError(null);
    }
  }, [open]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Invite a tenant"
      description="We email them a secure link to set up their account. Only they can use it, and it expires after 7 days."
      submitLabel="Send invite"
      busy={busy}
      error={error}
      onSubmit={() => {
        if (!EMAIL_RE.test(values.email.trim())) return setError('Enter a valid email address.');
        if (values.name.trim().length < 2) return setError("Enter the tenant's name.");
        submit(() => onInvite({ ...values, email: values.email.trim().toLowerCase(), name: values.name.trim(), phone: values.phone.trim() }));
      }}
    >
      <Field label="Full name">
        <input className={inputClass} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="e.g. Jane Wanjiru" autoComplete="off" />
      </Field>
      <Field label="Email">
        <input className={inputClass} type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="jane@example.com" autoComplete="off" />
      </Field>
      <Field label="Phone (optional)">
        <input className={inputClass} type="tel" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} placeholder="+254 7xx xxx xxx" />
      </Field>
      {vacantUnits.length > 0 && (
        <Field label="Unit (optional)" hint="Assigning a unit creates their first rent invoice.">
          <select className={inputClass} value={values.propertyId} onChange={(e) => setValues({ ...values, propertyId: e.target.value })}>
            <option value="none">Assign later</option>
            {vacantUnits.map((p) => <option key={p.id} value={p.id}>{p.title}{p.unitNumber ? ` (${p.unitNumber})` : ''}</option>)}
          </select>
        </Field>
      )}
    </FormDialog>
  );
}

/* Assign tenant to unit ---------------------------------------------------- */

export function AssignDialog({ open, onClose, fixedProperty, fixedEmail, vacantUnits, tenantOptions, onAssign }: {
  open: boolean;
  onClose: () => void;
  fixedProperty?: Property | null;
  fixedEmail?: string | null;
  vacantUnits: Property[];
  tenantOptions: { email: string; name: string }[];
  onAssign: (propertyId: string, email: string) => Promise<void>;
}) {
  const [propertyId, setPropertyId] = useState('');
  const [email, setEmail] = useState('');
  const { busy, error, setError, submit } = useSubmit(onClose);
  useEffect(() => {
    if (open) {
      setPropertyId(fixedProperty?.id ?? vacantUnits[0]?.id ?? '');
      setEmail(fixedEmail ?? tenantOptions[0]?.email ?? '');
      setError(null);
    }
  }, [open]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Assign tenant"
      description="The unit is marked occupied and the tenant's first rent invoice is created."
      submitLabel="Assign"
      busy={busy}
      error={error}
      onSubmit={() => {
        if (!propertyId) return setError('Choose a unit.');
        if (!EMAIL_RE.test(email.trim())) return setError('Choose a tenant or enter their email.');
        submit(() => onAssign(propertyId, email.trim().toLowerCase()));
      }}
    >
      {fixedProperty ? (
        <p className="rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800">Unit: <span className="font-semibold">{fixedProperty.title}</span></p>
      ) : (
        <Field label="Unit">
          <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {vacantUnits.length === 0 && <option value="">No vacant units</option>}
            {vacantUnits.map((p) => <option key={p.id} value={p.id}>{p.title}{p.unitNumber ? ` (${p.unitNumber})` : ''}</option>)}
          </select>
        </Field>
      )}
      {fixedEmail ? (
        <p className="rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800">Tenant: <span className="font-semibold">{fixedEmail}</span></p>
      ) : (
        <Field label="Tenant" hint={tenantOptions.length ? undefined : 'Invite the tenant first, or type an email of an existing tenant.'}>
          {tenantOptions.length ? (
            <select className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)}>
              {tenantOptions.map((t) => <option key={t.email} value={t.email}>{t.name ? `${t.name} (${t.email})` : t.email}</option>)}
            </select>
          ) : (
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tenant@example.com" />
          )}
        </Field>
      )}
    </FormDialog>
  );
}

/* Building ----------------------------------------------------------------- */

export function BuildingDialog({ open, onClose, building, onSave }: {
  open: boolean;
  onClose: () => void;
  building: Building | null;
  onSave: (values: { name: string; address: string; latitude: number | null; longitude: number | null }) => Promise<void>;
}) {
  const [values, setValues] = useState({ name: '', address: '', latitude: null as number | null, longitude: null as number | null });
  const { busy, error, setError, submit } = useSubmit(onClose);
  useEffect(() => {
    if (open) {
      setValues({
        name: building?.name ?? '',
        address: building?.address ?? '',
        latitude: building?.latitude == null ? null : Number(building.latitude),
        longitude: building?.longitude == null ? null : Number(building.longitude),
      });
      setError(null);
    }
  }, [open, building]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={building ? 'Rename building' : 'Add building'}
      description="Group units that share an address, like a block of apartments."
      submitLabel={building ? 'Save' : 'Add building'}
      busy={busy}
      error={error}
      onSubmit={() => {
        if (values.name.trim().length < 2) return setError('Enter the building name.');
        submit(() => onSave({
          name: values.name.trim(),
          address: values.address.trim(),
          latitude: values.latitude,
          longitude: values.longitude,
        }));
      }}
    >
      <Field label="Name"><input className={inputClass} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="e.g. Sunrise Apartments" /></Field>
      <Field label="Address"><input className={inputClass} value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} placeholder="e.g. Argwings Kodhek Rd, Kilimani" /></Field>
      <MapPicker
        value={values.latitude === null || values.longitude === null ? null : { latitude: values.latitude, longitude: values.longitude }}
        onChange={({ latitude, longitude }) => setValues({ ...values, latitude, longitude })}
        onClear={() => setValues({ ...values, latitude: null, longitude: null })}
      />
    </FormDialog>
  );
}

/* Several units at once ----------------------------------------------------- */

export function BulkUnitsDialog({ open, onClose, buildings, remaining, onCreate }: {
  open: boolean;
  onClose: () => void;
  buildings: Building[];
  remaining: number | null;
  onCreate: (values: { buildingId: string; type: PropertyType; price: number; prefix: string; start: number; count: number }) => Promise<void>;
}) {
  const [values, setValues] = useState({ buildingId: '', type: 'residential' as PropertyType, price: '', prefix: '', start: '1', count: '5' });
  const { busy, error, setError, submit } = useSubmit(onClose);
  useEffect(() => {
    if (open) {
      setValues((v) => ({ ...v, buildingId: buildings[0]?.id ?? '', price: '', prefix: '', start: '1', count: '5' }));
      setError(null);
    }
  }, [open]);

  const count = Number(values.count) || 0;
  const start = Number(values.start) || 1;
  const preview = count > 0 ? `${values.prefix}${start}${count > 1 ? ` to ${values.prefix}${start + count - 1}` : ''}` : '';

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Add several units"
      description="Create numbered units in a building in one go. You can edit each one afterwards."
      submitLabel={count > 0 ? `Create ${count} units` : 'Create units'}
      busy={busy}
      error={error}
      onSubmit={() => {
        if (!values.buildingId) return setError('Choose a building.');
        if (!Number(values.price)) return setError('Enter the rent for these units.');
        if (count < 1 || count > 100) return setError('Create between 1 and 100 units at a time.');
        if (remaining !== null && count > remaining) return setError(`Your plan allows ${remaining} more ${remaining === 1 ? 'unit' : 'units'}. Upgrade to add more.`);
        submit(() => onCreate({ buildingId: values.buildingId, type: values.type, price: Number(values.price), prefix: values.prefix.trim(), start, count }));
      }}
    >
      <Field label="Building">
        <select className={inputClass} value={values.buildingId} onChange={(e) => setValues({ ...values, buildingId: e.target.value })}>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monthly rent (KES)"><input className={inputClass} type="number" inputMode="numeric" value={values.price} onChange={(e) => setValues({ ...values, price: e.target.value })} /></Field>
        <Field label="Type">
          <select className={inputClass} value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value as PropertyType })}>
            <option value="residential">Home</option>
            <option value="commercial">Commercial</option>
            <option value="bnb">Short stay</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Prefix"><input className={inputClass} value={values.prefix} onChange={(e) => setValues({ ...values, prefix: e.target.value })} placeholder="A" maxLength={8} /></Field>
        <Field label="Start at"><input className={inputClass} type="number" min={0} value={values.start} onChange={(e) => setValues({ ...values, start: e.target.value })} /></Field>
        <Field label="How many"><input className={inputClass} type="number" min={1} max={100} value={values.count} onChange={(e) => setValues({ ...values, count: e.target.value })} /></Field>
      </div>
      {preview && <p className="text-sm text-zinc-500">Units {preview}</p>}
    </FormDialog>
  );
}

/* Expense ------------------------------------------------------------------ */

export function ExpenseDialog({ open, onClose, properties, onSave }: {
  open: boolean;
  onClose: () => void;
  properties: Property[];
  onSave: (values: { propertyId: string | null; category: string; description: string; amount: number; expenseDate: string }) => Promise<void>;
}) {
  const today = () => new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState({ propertyId: 'none', category: 'maintenance', description: '', amount: '', expenseDate: today() });
  const { busy, error, setError, submit } = useSubmit(onClose);
  useEffect(() => {
    if (open) {
      setValues({ propertyId: 'none', category: 'maintenance', description: '', amount: '', expenseDate: today() });
      setError(null);
    }
  }, [open]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Record an expense"
      description="Costs are subtracted from your rent income in reports."
      submitLabel="Save expense"
      busy={busy}
      error={error}
      onSubmit={() => {
        if (!(Number(values.amount) > 0)) return setError('Enter the amount.');
        if (!values.description.trim()) return setError('Say what the expense was for.');
        submit(() => onSave({
          propertyId: values.propertyId === 'none' ? null : values.propertyId,
          category: values.category,
          description: values.description.trim(),
          amount: Number(values.amount),
          expenseDate: values.expenseDate,
        }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (KES)"><input className={inputClass} type="number" inputMode="numeric" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} /></Field>
        <Field label="Date"><input className={inputClass} type="date" value={values.expenseDate} onChange={(e) => setValues({ ...values, expenseDate: e.target.value })} /></Field>
      </div>
      <Field label="What was it for?"><input className={inputClass} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="e.g. Plumber fixed kitchen sink" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select className={inputClass} value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })}>
            <option value="maintenance">Repairs</option>
            <option value="utilities">Water & electricity</option>
            <option value="security">Security</option>
            <option value="cleaning">Cleaning</option>
            <option value="taxes">Taxes & fees</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Property (optional)">
          <select className={inputClass} value={values.propertyId} onChange={(e) => setValues({ ...values, propertyId: e.target.value })}>
            <option value="none">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
      </div>
    </FormDialog>
  );
}

/* Add a manager ------------------------------------------------------------ */

export function ManagerDialog({ open, onClose, property, onAdd }: {
  open: boolean;
  onClose: () => void;
  property: Property | null;
  onAdd: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const { busy, error, setError, submit } = useSubmit(onClose);
  useEffect(() => {
    if (open) {
      setEmail('');
      setError(null);
    }
  }, [open]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Add a manager"
      description={property ? `Let someone help manage ${property.title}. They need a MyBoma account with this email.` : undefined}
      submitLabel="Add manager"
      busy={busy}
      error={error}
      onSubmit={() => {
        if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
        submit(() => onAdd(email.trim().toLowerCase()));
      }}
    >
      <Field label="Manager's email"><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@example.com" /></Field>
    </FormDialog>
  );
}

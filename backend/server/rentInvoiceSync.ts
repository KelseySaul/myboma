/**
 * Server-side rent invoice generation. Runs from the daily cron (/api/cron/daily) for
 * every rented unit, and as a catch-up when a landlord loads their dashboard. Inserts use
 * ON CONFLICT DO NOTHING against the one-invoice-per-tenant-per-month unique index
 * (db/schema/app.ts), so concurrent runs can never create duplicates.
 */
import {and, eq, lt} from 'drizzle-orm';
import {db, schema} from '../db/client.ts';
import {activeLeaseIdsByProperty} from './leases.ts';
import {
  addMonthsToBillingDate,
  billingDateInDays,
  billingMonthKey,
  billingToday,
  buildRentInvoicePayload,
  currentBillingDueDate,
  isRentableUnit,
  nextBillingDueDate,
  propertyHasInvoiceForMonth,
  type RentableProperty,
  type RentPaymentRow,
} from '../../shared/rentInvoices.ts';

type InvoicePayload = ReturnType<typeof buildRentInvoicePayload>;

const insertInvoices = async (rows: InvoicePayload[]) => {
  if (rows.length === 0) return 0;
  // Stamp each invoice with the tenancy it bills.
  const leaseIds = await activeLeaseIdsByProperty([...new Set(rows.map((row) => row.propertyId))]);
  const inserted = await db
    .insert(schema.rentPayments)
    .values(
      rows.map((row) => ({
        ...row,
        leaseId: leaseIds.get(row.propertyId) ?? null,
        amount: String(row.amount),
        status: row.status as 'pending' | 'overdue',
        createdAt: new Date(row.createdAt),
      })),
    )
    .onConflictDoNothing()
    .returning({id: schema.rentPayments.id});
  return inserted.length;
};

/** Flips every past-due pending invoice to overdue in one statement. */
export const refreshAllOverdueStatuses = async () => {
  const updated = await db
    .update(schema.rentPayments)
    .set({status: 'overdue'})
    .where(and(eq(schema.rentPayments.status, 'pending'), lt(schema.rentPayments.dueDate, billingToday())))
    .returning({id: schema.rentPayments.id});
  return updated.length;
};

export interface InitialAssignmentPaymentOptions {
  depositPaid?: boolean;
  depositAmount?: number | null;
  prepaidMonths?: number;
  paymentMethod?: 'mpesa' | 'cash' | 'bank';
  paymentReference?: string;
}

/**
 * Pure planner for initial rent invoices when assigning a tenant to a unit.
 * When the landlord records advance rent months (`prepaidMonths > 0`), each covered month
 * is marked `paid` immediately and the next unpaid `pending` invoice is scheduled after the
 * prepaid window — preventing accidental arrears/overdue emails during paid-up months.
 */
export const planInitialAssignmentInvoices = (
  property: RentableProperty,
  tenantId: string,
  options: InitialAssignmentPaymentOptions = {},
  todayIso = billingToday(),
) => {
  const prepaidMonths = Math.max(0, Math.min(24, Math.floor(options.prepaidMonths ?? 0)));
  const normalizedTenant = tenantId.trim().toLowerCase();
  const amount = Number(property.price || 0);
  const methodLabel =
    options.paymentMethod === 'mpesa' ? 'M-Pesa' : options.paymentMethod === 'bank' ? 'Bank transfer' : 'Cash';
  const refSuffix = options.paymentReference?.trim() ? ` · Ref: ${options.paymentReference.trim()}` : '';
  const depositSuffix =
    options.depositPaid && (options.depositAmount ?? 0) > 0
      ? ` · Deposit KES ${Number(options.depositAmount).toLocaleString('en-KE')} paid`
      : options.depositPaid
        ? ' · Deposit paid'
        : '';

  if (prepaidMonths === 0) {
    const dueDate = addMonthsToBillingDate(todayIso, 1);
    return {
      paidRows: [] as Array<{dueDate: string; amount: number; manualNote: string}>,
      nextPendingDueDate: dueDate,
      tenantId: normalizedTenant,
      amount,
    };
  }

  const paidRows: Array<{dueDate: string; amount: number; manualNote: string}> = [];
  for (let i = 0; i < prepaidMonths; i += 1) {
    const dueDate = addMonthsToBillingDate(todayIso, i);
    const monthTag = prepaidMonths === 1 ? 'First month rent paid on move-in' : `Advance rent paid on move-in (month ${i + 1} of ${prepaidMonths})`;
    paidRows.push({
      dueDate,
      amount,
      manualNote: `${monthTag} · ${methodLabel}${refSuffix}${i === 0 ? depositSuffix : ''}`,
    });
  }

  const nextPendingDueDate = addMonthsToBillingDate(todayIso, prepaidMonths);
  return {
    paidRows,
    nextPendingDueDate,
    tenantId: normalizedTenant,
    amount,
  };
};

/**
 * Records any move-in prepaid rent months (marked `paid`) and schedules the next unpaid invoice
 * so the tenant never receives false arrears reminders for months already covered.
 */
export const recordInitialAssignmentInvoices = async (
  property: RentableProperty,
  tenantId: string,
  leaseId: string | null,
  existingPayments: RentPaymentRow[],
  options: InitialAssignmentPaymentOptions = {},
) => {
  if (!isRentableUnit({...property, tenantId})) {
    return {paidCreated: 0, nextDueDate: null as string | null};
  }

  const plan = planInitialAssignmentInvoices(property, tenantId, options);
  const now = new Date();
  let paidCreated = 0;

  for (const row of plan.paidRows) {
    const monthKey = billingMonthKey(row.dueDate);
    if (propertyHasInvoiceForMonth(existingPayments, property.id, monthKey)) continue;
    const inserted = await db
      .insert(schema.rentPayments)
      .values({
        landlordId: property.landlordId,
        platformId: property.platformId ?? null,
        leaseId,
        tenantId: plan.tenantId,
        propertyId: property.id,
        amount: String(row.amount),
        dueDate: row.dueDate,
        status: 'paid',
        paidAt: now,
        paymentProvider: 'manual',
        providerReference: options.paymentReference?.trim() || 'MOVE-IN-PREPAID',
        paymentMetadata: {
          note: row.manualNote,
          moveInPrepaid: true,
          paymentMethod: options.paymentMethod ?? 'cash',
          depositPaid: Boolean(options.depositPaid),
          depositAmount: options.depositPaid ? (options.depositAmount ?? null) : null,
        },
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({id: schema.rentPayments.id});
    if (inserted.length > 0) {
      paidCreated += 1;
      existingPayments.push({
        id: inserted[0].id,
        propertyId: property.id,
        tenantId: plan.tenantId,
        dueDate: row.dueDate,
        status: 'paid',
      });
    }
  }

  const nextMonthKey = billingMonthKey(plan.nextPendingDueDate);
  if (!propertyHasInvoiceForMonth(existingPayments, property.id, nextMonthKey)) {
    const payload = buildRentInvoicePayload(property, plan.tenantId, plan.nextPendingDueDate);
    payload.status = 'pending';
    await insertInvoices([payload]);
  }

  return {paidCreated, nextDueDate: plan.nextPendingDueDate};
};

export const ensureRentInvoiceForProperty = async (
  property: RentableProperty,
  tenantId: string,
  _landlordId: string,
  _platformId: string | null | undefined,
  existingPayments: RentPaymentRow[],
  initialAssignment = false,
) => {
  if (!isRentableUnit({...property, tenantId})) return {created: false as const};

  // A new tenancy's first invoice is due 30 days out; regular invoices on the 1st.
  const dueDate = initialAssignment ? billingDateInDays(30) : currentBillingDueDate();
  const monthKey = billingMonthKey(dueDate);
  if (propertyHasInvoiceForMonth(existingPayments, property.id, monthKey)) {
    return {created: false as const};
  }

  const payload = buildRentInvoicePayload(property, tenantId, dueDate);
  if (initialAssignment) payload.status = 'pending';
  const created = await insertInvoices([payload]);
  return created > 0 ? {created: true as const, dueDate} : {created: false as const};
};

/**
 * Ensures every rented (non-BnB) unit has an invoice for the current billing month, and
 * pre-issues next month's once the current one is paid. Each invoice is attributed to its
 * own property's owner and platform.
 */
export const syncAutomaticRentInvoices = async (properties: RentableProperty[], existingPayments: RentPaymentRow[]) => {
  const today = billingToday();
  const stale = existingPayments.filter((p) => p.status === 'pending' && p.dueDate < today);
  const overdueUpdated = stale.length ? await refreshAllOverdueStatuses() : 0;

  const currentDueDate = currentBillingDueDate();
  const currentMonthKey = billingMonthKey(currentDueDate);
  const nextDueDate = nextBillingDueDate();
  const nextMonthKey = billingMonthKey(nextDueDate);

  const inserts: InvoicePayload[] = [];

  for (const property of properties.filter(isRentableUnit)) {
    const tenantId = String(property.tenantId);
    const forProperty = existingPayments.filter((p) => p.propertyId === property.id);
    const hasCurrent = propertyHasInvoiceForMonth(forProperty, property.id, currentMonthKey);
    const hasFuture = forProperty.some((p) => p.dueDate > today);

    if (!hasCurrent && !hasFuture) {
      inserts.push(buildRentInvoicePayload(property, tenantId, currentDueDate));
    }

    const currentInvoice = forProperty.find((p) => billingMonthKey(p.dueDate) === currentMonthKey);
    const hasNext = propertyHasInvoiceForMonth(forProperty, property.id, nextMonthKey);
    if (currentInvoice?.status === 'paid' && !hasNext) {
      inserts.push(buildRentInvoicePayload(property, tenantId, nextDueDate));
    }
  }

  const created = await insertInvoices(inserts);
  return {created, overdueUpdated};
};

/** Cron entry point: invoices for every rented unit on the platform, independent of logins. */
export const syncAllRentInvoices = async () => {
  const properties = await db.query.properties.findMany({where: eq(schema.properties.status, 'rented')});
  const rentable = properties.filter((p) => isRentableUnit(p as unknown as RentableProperty));
  if (rentable.length === 0) return {created: 0, overdueUpdated: await refreshAllOverdueStatuses()};

  const today = billingToday();
  const windowStart = `${billingMonthKey(currentBillingDueDate())}-01`;
  // Only this month's and later invoices matter for the sync decision.
  const payments = await db.query.rentPayments.findMany({
    where: (rp, {gte}) => gte(rp.dueDate, windowStart),
    columns: {id: true, propertyId: true, tenantId: true, dueDate: true, status: true},
  });

  const result = await syncAutomaticRentInvoices(rentable as unknown as RentableProperty[], payments as RentPaymentRow[]);
  const overdueUpdated = result.overdueUpdated || (await refreshAllOverdueStatuses());
  return {created: result.created, overdueUpdated, today};
};

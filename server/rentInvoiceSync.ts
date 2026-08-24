/**
 * Server-side port of src/lib/rentInvoices.ts's Supabase-backed functions. This used
 * to run in the browser (src/components/LandlordDashboard.tsx), trusting Supabase RLS
 * to keep a landlord from generating invoices outside their own properties — since a
 * landlord's browser can no longer run authorized DB writes directly, this now runs
 * only on the server, called from app.ts's /landlord/dashboard and mark-paid routes.
 * The pure date/status helpers are unchanged and still imported from the original file.
 */
import {eq} from 'drizzle-orm';
import {db, schema} from '../db/client.ts';
import {
  billingMonthKey,
  buildRentInvoicePayload,
  currentBillingDueDate,
  isRentableUnit,
  propertyHasInvoiceForMonth,
  type RentableProperty,
  type RentPaymentRow,
} from '../src/lib/rentInvoices.ts';

export const refreshOverdueStatuses = async (payments: RentPaymentRow[]) => {
  const today = new Date().toISOString().split('T')[0];
  const stale = payments.filter((p) => p.status === 'pending' && p.dueDate < today);
  if (stale.length === 0) return;

  await Promise.all(
    stale.map((p) => db.update(schema.rentPayments).set({status: 'overdue'}).where(eq(schema.rentPayments.id, p.id))),
  );
};

export const ensureRentInvoiceForProperty = async (
  property: RentableProperty,
  tenantId: string,
  landlordId: string,
  platformId: string | null | undefined,
  existingPayments: RentPaymentRow[],
  initialAssignment = false,
) => {
  if (!isRentableUnit({...property, tenantId})) return {created: false as const};

  let dueDate: string;
  if (initialAssignment) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    dueDate = d.toISOString().split('T')[0];
  } else {
    dueDate = currentBillingDueDate();
  }

  const monthKey = billingMonthKey(dueDate);
  if (propertyHasInvoiceForMonth(existingPayments, property.id, monthKey)) {
    return {created: false as const};
  }

  const payload = buildRentInvoicePayload(property, landlordId, platformId, tenantId, dueDate);
  if (initialAssignment) payload.status = 'pending';

  await db.insert(schema.rentPayments).values({
    ...payload,
    amount: String(payload.amount),
    status: payload.status as 'pending' | 'overdue',
    tenantId: payload.tenantId,
    createdAt: new Date(payload.createdAt),
  });

  return {created: true as const, dueDate};
};

/** Ensures every rented (non-BnB) unit has an invoice for the current billing month. */
export const syncAutomaticRentInvoices = async (
  properties: RentableProperty[],
  existingPayments: RentPaymentRow[],
  landlordId: string,
  platformId?: string | null,
) => {
  await refreshOverdueStatuses(existingPayments);

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentDueDate = currentBillingDueDate(now);
  const currentMonthKey = billingMonthKey(currentDueDate);

  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextDueDate = currentBillingDueDate(nextMonthDate);
  const nextMonthKey = billingMonthKey(nextDueDate);

  const inserts: Array<ReturnType<typeof buildRentInvoicePayload>> = [];

  properties.filter(isRentableUnit).forEach((property) => {
    const hasCurrent = propertyHasInvoiceForMonth(existingPayments, property.id, currentMonthKey);
    const hasFuture = existingPayments.some((p) => p.propertyId === property.id && p.dueDate > today);

    if (!hasCurrent && !hasFuture) {
      inserts.push(buildRentInvoicePayload(property, landlordId, platformId, String(property.tenantId), currentDueDate));
    }

    const currentInvoice = existingPayments.find((p) => p.propertyId === property.id && billingMonthKey(p.dueDate) === currentMonthKey);
    const hasNext = propertyHasInvoiceForMonth(existingPayments, property.id, nextMonthKey);

    if (currentInvoice?.status === 'paid' && !hasNext) {
      inserts.push(buildRentInvoicePayload(property, landlordId, platformId, String(property.tenantId), nextDueDate));
    }
  });

  if (inserts.length === 0) return {created: 0, overdueUpdated: 0};

  await db.insert(schema.rentPayments).values(
    inserts.map((row) => ({
      ...row,
      amount: String(row.amount),
      status: row.status as 'pending' | 'overdue',
      createdAt: new Date(row.createdAt),
    })),
  );

  return {created: inserts.length, overdueUpdated: 0};
};

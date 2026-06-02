import type {SupabaseClient} from '@supabase/supabase-js';
import type {RentPaymentStatus} from './rentUtils';

export interface RentableProperty {
  id: string;
  landlordId: string;
  platformId?: string | null;
  tenantId?: string | null;
  price: number | string;
  status: string;
  type: string;
}

export interface RentPaymentRow {
  id: string;
  propertyId: string;
  tenantId: string;
  dueDate: string;
  status: string;
}

export const billingMonthKey = (dueDate: string) => String(dueDate).slice(0, 7);

export const dueDateForMonth = (year: number, monthIndex: number) => {
  const date = new Date(year, monthIndex, 1);
  return date.toISOString().split('T')[0];
};

export const currentBillingDueDate = (reference = new Date()) =>
  dueDateForMonth(reference.getFullYear(), reference.getMonth());

export const invoiceStatusForDueDate = (dueDate: string, today = new Date().toISOString().split('T')[0]): RentPaymentStatus =>
  dueDate < today ? 'overdue' : 'pending';

export const propertyHasInvoiceForMonth = (
  payments: RentPaymentRow[],
  propertyId: string,
  monthKey: string,
) => payments.some((p) => p.propertyId === propertyId && billingMonthKey(p.dueDate) === monthKey);

export const isRentableUnit = (property: RentableProperty) =>
  property.status === 'rented' && Boolean(property.tenantId) && property.type !== 'bnb';

export const buildRentInvoicePayload = (
  property: RentableProperty,
  landlordId: string,
  platformId: string | null | undefined,
  tenantId: string,
  dueDate: string,
) => ({
  landlordId,
  platformId: platformId ?? null,
  tenantId: tenantId.trim().toLowerCase(),
  propertyId: property.id,
  amount: Number(property.price || 0),
  dueDate,
  status: invoiceStatusForDueDate(dueDate),
  createdAt: new Date().toISOString(),
});

/** Mark pending invoices past due date as overdue. */
export const refreshOverdueStatuses = async (
  supabase: SupabaseClient,
  payments: RentPaymentRow[],
) => {
  const today = new Date().toISOString().split('T')[0];
  const stale = payments.filter((p) => p.status === 'pending' && p.dueDate < today);
  if (stale.length === 0) return;

  await Promise.all(
    stale.map((p) => supabase.from('rentPayments').update({status: 'overdue'}).eq('id', p.id)),
  );
};

/** Create the current month's invoice for one assigned unit if missing. */
export const ensureRentInvoiceForProperty = async (
  supabase: SupabaseClient,
  property: RentableProperty,
  tenantId: string,
  landlordId: string,
  platformId: string | null | undefined,
  existingPayments: RentPaymentRow[],
  initialAssignment = false
) => {
  if (!isRentableUnit({...property, tenantId})) return {created: false as const};

  // For initial assignment, set due date to 30 days from now to provide a grace period.
  // Otherwise, use the 1st of the current month.
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
  
  // Force pending status for initial assignments regardless of due date calculation
  if (initialAssignment) {
    payload.status = 'pending';
  }

  const {error} = await supabase
    .from('rentPayments')
    .insert([payload]);

  if (error) throw error;
  return {created: true as const, dueDate};
};

/**
 * Ensures every rented (non-BnB) unit has an invoice for the current billing month.
 * Also generates the NEXT month's invoice if the current one is already paid.
 */
export const syncAutomaticRentInvoices = async (
  supabase: SupabaseClient,
  properties: RentableProperty[],
  existingPayments: RentPaymentRow[],
  landlordId: string,
  platformId?: string | null,
) => {
  await refreshOverdueStatuses(supabase, existingPayments);

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentDueDate = currentBillingDueDate(now);
  const currentMonthKey = billingMonthKey(currentDueDate);
  
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextDueDate = currentBillingDueDate(nextMonthDate);
  const nextMonthKey = billingMonthKey(nextDueDate);

  const inserts: any[] = [];

  properties.filter(isRentableUnit).forEach((property) => {
    // 1. Ensure current month invoice exists, UNLESS there is already a future-dated invoice (grace period)
    const hasCurrent = propertyHasInvoiceForMonth(existingPayments, property.id, currentMonthKey);
    const hasFuture = existingPayments.some(p => p.propertyId === property.id && p.dueDate > today);
    
    if (!hasCurrent && !hasFuture) {
      inserts.push(buildRentInvoicePayload(
        property,
        landlordId,
        platformId,
        String(property.tenantId),
        currentDueDate,
      ));
    }

    // 2. If current month is PAID, ensure next month is generated (upcoming)
    const currentInvoice = existingPayments.find(p => p.propertyId === property.id && billingMonthKey(p.dueDate) === currentMonthKey);
    const hasNext = propertyHasInvoiceForMonth(existingPayments, property.id, nextMonthKey);
    
    if (currentInvoice?.status === 'paid' && !hasNext) {
      inserts.push(buildRentInvoicePayload(
        property,
        landlordId,
        platformId,
        String(property.tenantId),
        nextDueDate,
      ));
    }
  });

  if (inserts.length === 0) {
    return {created: 0, overdueUpdated: 0};
  }

  // Insert in batches to avoid hitting Supabase's ~1 MB PostgREST payload limit
  const BATCH_SIZE = 50;
  let totalCreated = 0;
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const {data, error} = await supabase.from('rentPayments').insert(batch).select('id');
    if (error) throw error;
    totalCreated += data?.length ?? batch.length;
  }

  return {created: totalCreated, overdueUpdated: 0};
};

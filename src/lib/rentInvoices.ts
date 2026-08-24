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


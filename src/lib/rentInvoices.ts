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

/** Billing runs on Kenyan calendar days regardless of the server's timezone (Vercel is UTC). */
export const BILLING_TIME_ZONE = 'Africa/Nairobi';

const pad = (value: number) => String(value).padStart(2, '0');

/** Calendar parts of `date` as seen in Nairobi. */
export const billingCalendarParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BILLING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {year: get('year'), monthIndex: get('month') - 1, day: get('day')};
};

/** Today's date (YYYY-MM-DD) in Nairobi. */
export const billingToday = (date = new Date()) => {
  const {year, monthIndex, day} = billingCalendarParts(date);
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
};

export const billingMonthKey = (dueDate: string) => String(dueDate).slice(0, 7);

/**
 * First day of the given month as YYYY-MM-DD. Built as a string on purpose: the old
 * `new Date(y, m, 1).toISOString()` shifted to the previous day in any timezone ahead
 * of UTC (e.g. Nairobi), dating November invoices October 31.
 */
export const dueDateForMonth = (year: number, monthIndex: number) => {
  const normalizedYear = year + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12;
  return `${normalizedYear}-${pad(normalizedMonth + 1)}-01`;
};

export const currentBillingDueDate = (reference = new Date()) => {
  const {year, monthIndex} = billingCalendarParts(reference);
  return dueDateForMonth(year, monthIndex);
};

export const nextBillingDueDate = (reference = new Date()) => {
  const {year, monthIndex} = billingCalendarParts(reference);
  return dueDateForMonth(year, monthIndex + 1);
};

/** YYYY-MM-DD that is `days` after today in Nairobi. */
export const billingDateInDays = (days: number, reference = new Date()) => {
  const {year, monthIndex, day} = billingCalendarParts(reference);
  const date = new Date(Date.UTC(year, monthIndex, day + days));
  return date.toISOString().split('T')[0];
};

export const invoiceStatusForDueDate = (dueDate: string, today = billingToday()): RentPaymentStatus =>
  dueDate < today ? 'overdue' : 'pending';

export const propertyHasInvoiceForMonth = (
  payments: RentPaymentRow[],
  propertyId: string,
  monthKey: string,
) => payments.some((p) => p.propertyId === propertyId && billingMonthKey(p.dueDate) === monthKey);

export const isRentableUnit = (property: RentableProperty) =>
  property.status === 'rented' && Boolean(property.tenantId) && property.type !== 'bnb';

/**
 * The invoice always belongs to the property's owner and platform. Taking these from the
 * caller (the old signature) let a manager or admin who loaded the dashboard first become
 * the invoice's landlord — and therefore the Stripe/M-Pesa payout destination.
 */
export const buildRentInvoicePayload = (property: RentableProperty, tenantId: string, dueDate: string) => ({
  landlordId: property.landlordId,
  platformId: property.platformId ?? null,
  tenantId: tenantId.trim().toLowerCase(),
  propertyId: property.id,
  amount: Number(property.price || 0),
  dueDate,
  status: invoiceStatusForDueDate(dueDate),
  createdAt: new Date().toISOString(),
});

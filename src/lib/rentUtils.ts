export type RentPaymentStatus = 'paid' | 'pending' | 'overdue';

export interface TenantIdentity {
  uid: string;
  email: string;
}

/** Normalize DB rows so status/tenant matching is consistent in the UI. */
export const normalizeRentPayment = <T extends {status?: string; tenantId?: string; amount?: number | string}>(
  payment: T,
): T & {status: RentPaymentStatus; tenantId: string; amount: number} => {
  const rawStatus = String(payment.status || 'pending').toLowerCase();
  const status: RentPaymentStatus =
    rawStatus === 'paid' ? 'paid' : rawStatus === 'overdue' ? 'overdue' : 'pending';

  return {
    ...payment,
    status,
    tenantId: String(payment.tenantId || '').trim().toLowerCase(),
    amount: Number(payment.amount || 0),
  };
};

export const matchesTenant = (tenantId: string | undefined | null, identity: TenantIdentity) => {
  const normalized = String(tenantId || '').trim().toLowerCase();
  const email = identity.email.trim().toLowerCase();
  return normalized === email || normalized === identity.uid;
};

/** Supabase PostgREST `.or()` filter for tenant-owned rent rows. */
export const tenantRentOrFilter = (identity: TenantIdentity) => {
  const email = identity.email.trim().toLowerCase();
  return `tenantId.eq.${email},tenantId.eq.${identity.uid}`;
};

export const tenantPropertyOrFilter = (identity: TenantIdentity) => tenantRentOrFilter(identity);

export const formatStatKes = (amount: number) => {
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
  return amount.toLocaleString('en-KE');
};

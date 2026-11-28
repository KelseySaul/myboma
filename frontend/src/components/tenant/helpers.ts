export interface RentPayment {
  id: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'verifying';
  dueDate: string;
  paidAt?: string;
  receiptUrl?: string;
  providerReference?: string;
  paymentProvider?: string;
}

export interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
}

export interface TenantProperty {
  id: string;
  landlordId: string;
  title: string;
  location: string;
  unitNumber?: string | null;
}

export interface TenantLandlord {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  rentPayoutMethod?: 'cash' | 'mpesa' | 'bank' | null;
  mpesaSettlementPhone?: string;
}

export interface TenantLease {
  id: string;
  propertyId: string;
  status: string;
  startDate: string;
  endDate?: string | null;
  rentAmount: number | string;
  depositAmount?: number | string;
}

export interface TenantNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  read: boolean;
}

export const formatMoney = (amount: number | string) => `KES ${Number(amount || 0).toLocaleString('en-KE')}`;

/** Dates from the API are either YYYY-MM-DD or ISO timestamps. */
export const parseDate = (value: string) => {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(value);
};

export const formatDate = (value?: string | null) =>
  value ? parseDate(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Whole days from today until the date (negative = in the past). */
export const daysUntil = (value: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDate(value);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

export const isOverdue = (payment: RentPayment) =>
  payment.status === 'overdue' || (payment.status === 'pending' && daysUntil(payment.dueDate) < 0);

export type RentState =
  | { kind: 'none' }
  | { kind: 'paid' }
  | { kind: 'verifying'; payment: RentPayment }
  | { kind: 'overdue'; payment: RentPayment; total: number; count: number; days: number }
  | { kind: 'due'; payment: RentPayment; days: number };

/** What the tenant needs to know right now about their rent. */
export function rentState(payments: RentPayment[]): RentState {
  if (payments.length === 0) return { kind: 'none' };
  const unpaid = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .sort((a, b) => parseDate(a.dueDate).getTime() - parseDate(b.dueDate).getTime());
  const overdue = unpaid.filter(isOverdue);
  if (overdue.length) {
    return {
      kind: 'overdue',
      payment: overdue[0],
      total: overdue.reduce((sum, p) => sum + Number(p.amount || 0), 0),
      count: overdue.length,
      days: Math.abs(daysUntil(overdue[0].dueDate)),
    };
  }
  if (unpaid.length) return { kind: 'due', payment: unpaid[0], days: daysUntil(unpaid[0].dueDate) };
  const verifying = payments.find((p) => p.status === 'verifying');
  if (verifying) return { kind: 'verifying', payment: verifying };
  return { kind: 'paid' };
}

export const dueLabel = (days: number) =>
  days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : days > 1 ? `Due in ${days} days` : `${Math.abs(days)} days late`;

export const STATUS_LABELS: Record<RentPayment['status'], string> = {
  paid: 'Paid',
  pending: 'Unpaid',
  overdue: 'Overdue',
  verifying: 'Being checked',
};

export const PRIORITY_LABELS: Record<MaintenanceRequest['priority'], string> = {
  low: 'Can wait',
  medium: 'Soon',
  high: 'Urgent',
  urgent: 'Emergency',
};

export const REPAIR_STATUS_LABELS: Record<MaintenanceRequest['status'], string> = {
  pending: 'Reported',
  'in-progress': 'Being fixed',
  resolved: 'Fixed',
};

const receiptReference = (payment: RentPayment) =>
  payment.providerReference?.toLowerCase().startsWith('manual-')
    ? `MANUAL-${payment.providerReference.split('-').pop()}`
    : payment.providerReference || payment.id;

/** A plain-text receipt the tenant can download when the provider gave no receipt URL. */
export function receiptDownload(payment: RentPayment, tenantName: string, tenantEmail: string, propertyTitle?: string) {
  if (payment.receiptUrl) return { href: payment.receiptUrl, fileName: undefined };
  const text = [
    'MyBoma rent receipt',
    `Reference: ${receiptReference(payment)}`,
    `Tenant: ${tenantName}`,
    `Email: ${tenantEmail}`,
    `Home: ${propertyTitle || payment.propertyId}`,
    `Amount: ${formatMoney(payment.amount)}`,
    `Due date: ${formatDate(payment.dueDate)}`,
    `Paid on: ${formatDate(payment.paidAt)}`,
    `Paid with: ${payment.paymentProvider || 'Not recorded'}`,
  ].join('\n');
  return {
    href: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`,
    fileName: `myboma-receipt-${receiptReference(payment)}.txt`,
  };
}

/** Payment providers redirect back here; native apps use the public site. */
export const returnUrl = (query: string, isNative: boolean) =>
  `${isNative ? 'https://myboma.org' : window.location.origin}/?${query}`;

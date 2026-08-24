import {Capacitor} from '@capacitor/core';
import {getStoredToken} from '../lib/auth-client';

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const clientPrefix = () => (Capacitor.isNativePlatform() ? '/api/mobile' : '/api/web');

/** In dev, use same-origin `/api` (Vite proxies to the gateway on :3001). */
const apiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/** For routes mounted directly on the Express app (not under /api/web|mobile), i.e. ones
 * that don't require auth — no bearer/cookie handling needed. */
const publicRequest = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${apiBaseUrl()}${path}`);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json() as Promise<T>;
};

export const bffRequest = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  const isNative = Capacitor.isNativePlatform();
  const token = isNative ? getStoredToken() : null;

  if (isNative && !token) {
    throw new Error('You must be signed in to continue.');
  }

  const response = await fetch(`${apiBaseUrl()}${clientPrefix()}${path}`, {
    ...options,
    // Web sends the Better-Auth session cookie automatically; native has no
    // reliable cross-origin cookie jar, so it authenticates with a bearer token.
    credentials: isNative ? undefined : 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    if (typeof payload === 'object' && payload) {
      if ('error' in payload) message = String(payload.error);
      if ('details' in payload && Array.isArray(payload.details)) {
        const details = payload.details.map((d: any) => `${d.path}: ${d.message}`).join(', ');
        message = `${message} (${details})`;
      }
    }
    throw new Error(message);
  }

  return payload as T;
};

export const getUnreadNotificationCount = () => bffRequest<{count: number}>('/notifications/unread-count');

export const getSession = () =>
  bffRequest<{client: 'web' | 'mobile'; user: {id?: string; email?: string}; profile: Record<string, any>}>(
    '/session',
  );

export const completePasswordReset = (newPassword: string) =>
  bffRequest<{updated: boolean}>('/me/password-reset-complete', {
    method: 'POST',
    body: {newPassword},
  });

export const updateMyProfile = (body: Record<string, unknown>) =>
  bffRequest<{updated: boolean}>('/me', {method: 'PATCH', body});

export const markNotificationRead = (id: string) =>
  bffRequest<{updated: boolean}>(`/notifications/${id}/read`, {method: 'PATCH'});

export const getTenantDashboard = () =>
  bffRequest<{
    property: Record<string, any> | null;
    landlord: Record<string, any> | null;
    requests: Record<string, any>[];
    payments: Record<string, any>[];
    notifications: Record<string, any>[];
  }>('/tenant/dashboard');

export const createMaintenanceRequest = (body: {
  propertyId: string;
  landlordId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}) => bffRequest<Record<string, any>>('/tenant/maintenance-requests', {method: 'POST', body});

export const markAllNotificationsRead = () =>
  bffRequest<{updated: boolean}>('/notifications/mark-all-read', {method: 'POST'});

export const deleteNotification = (id: string) => bffRequest<{deleted: boolean}>(`/notifications/${id}`, {method: 'DELETE'});

export const getLandlordDashboard = () =>
  bffRequest<{
    buildings: Record<string, any>[];
    properties: Record<string, any>[];
    requests: Record<string, any>[];
    payments: Record<string, any>[];
    bookings: Record<string, any>[];
    expenses: Record<string, any>[];
    invitations: Record<string, any>[];
    notifications: Record<string, any>[];
  }>('/landlord/dashboard');

export const syncRentInvoices = () => bffRequest<{created: number; overdueUpdated: number}>('/landlord/rent-invoices/sync', {method: 'POST'});

export const createBuilding = (body: {name: string; address?: string; landlordId?: string; platformId?: string | null}) =>
  bffRequest<Record<string, any>>('/landlord/buildings', {method: 'POST', body});

export const updateBuilding = (id: string, body: {name?: string; address?: string}) =>
  bffRequest<Record<string, any>>(`/landlord/buildings/${id}`, {method: 'PATCH', body});

export const deleteBuilding = (id: string) => bffRequest<{deleted: boolean}>(`/landlord/buildings/${id}`, {method: 'DELETE'});

/** Admin-only cascading delete: also deletes every property in the building and the
 * accounts of any tenants assigned to them. */
export const adminDeleteBuildingCascade = (id: string) =>
  bffRequest<{deleted: boolean}>(`/admin/buildings/${id}`, {method: 'DELETE'});

export const createProperties = (properties: Record<string, any>[], landlordId?: string, platformId?: string | null) =>
  bffRequest<Record<string, any>[]>('/landlord/properties', {method: 'POST', body: {properties, landlordId, platformId}});

export const updateProperty = (id: string, body: Record<string, any>) =>
  bffRequest<Record<string, any>>(`/landlord/properties/${id}`, {method: 'PATCH', body});

export const deleteProperty = (id: string) => bffRequest<{deleted: boolean}>(`/landlord/properties/${id}`, {method: 'DELETE'});

export const addPropertyManager = (propertyId: string, email: string, role: 'manager' | 'co-owner' = 'manager') =>
  bffRequest<{added: boolean}>(`/landlord/properties/${propertyId}/managers`, {method: 'POST', body: {email, role}});

export const assignTenant = (propertyId: string, email: string) =>
  bffRequest<{assigned: boolean; property: Record<string, any>}>('/landlord/tenants/assign', {
    method: 'POST',
    body: {propertyId, email},
  });

export const unassignTenant = (email: string) =>
  bffRequest<{unassigned: boolean}>(`/landlord/tenants/${encodeURIComponent(email)}/unassign`, {method: 'POST'});

export const deleteTenant = (email: string) =>
  bffRequest<{deleted: boolean}>(`/landlord/tenants/${encodeURIComponent(email)}`, {method: 'DELETE'});

export const updateMaintenanceRequestStatus = (id: string, status: 'pending' | 'in-progress' | 'resolved') =>
  bffRequest<Record<string, any>>(`/landlord/maintenance-requests/${id}`, {method: 'PATCH', body: {status}});

export const getAvailableProperties = () => publicRequest<Record<string, any>[]>('/api/public/properties/available');

export const getLandlordPublicContact = (uid: string) =>
  bffRequest<{uid: string; displayName: string; phone?: string; email: string}>(`/landlords/${uid}/public-contact`);

export const createBooking = (body: {
  propertyId: string;
  landlordId: string;
  platformId?: string | null;
  startDate: string;
  endDate: string;
  totalPrice: number;
}) => bffRequest<Record<string, any>>('/hunter/bookings', {method: 'POST', body});

export const createExpense = (body: {
  propertyId?: string | null;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  receiptUrl?: string | null;
}) => bffRequest<Record<string, any>>('/landlord/expenses', {method: 'POST', body});

export const createStripeRentCheckout = (body: {rentPaymentId: string; successUrl?: string; cancelUrl?: string}) =>
  bffRequest<{checkoutUrl: string | null; checkoutSessionId: string}>('/payments/stripe/checkout-session', {
    method: 'POST',
    body,
  });

export const createPesapalRentCheckout = (body: {rentPaymentId: string; successUrl?: string; cancelUrl?: string}) =>
  bffRequest<{status: string; checkoutUrl: string | null; orderTrackingId?: string}>('/payments/pesapal/rent', {
    method: 'POST',
    body,
  });

export const initiateMpesaRentPayment = (body: {rentPaymentId: string; phone?: string}) =>
  bffRequest<{status: string; checkoutRequestId?: string; customerMessage?: string}>('/payments/mpesa/rent', {
    method: 'POST',
    body,
  });

export const provisionUser = (body: {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  role: 'tenant' | 'landlord' | 'hunter' | 'admin';
  platformId?: string | null;
  landlordId?: string;
  mustChangePassword?: boolean;
  rentRouting?: 'admin' | 'direct';
  rentPayoutMethod?: 'cash' | 'mpesa' | 'bank';
  mpesaSettlementPhone?: string;
  mpesaSettlementShortCode?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
}) =>
  bffRequest<{uid: string; email: string; invitation: any}>('/users/provision', {
    method: 'POST',
    body,
  });

export const updateUserStatus = (uid: string, status: 'active' | 'suspended') =>
  bffRequest<{uid: string; status: string}>(`/users/${uid}/status`, {
    method: 'PATCH',
    body: {status},
  });

export const deleteUserAccount = (uid: string) =>
  bffRequest<{deleted: boolean}>(`/users/${uid}`, {
    method: 'DELETE',
  });

export const markRentPaymentManual = (paymentId: string, note?: string) =>
  bffRequest<{status: string; paymentId: string}>(`/rent-payments/${paymentId}/mark-manual`, {
    method: 'POST',
    body: {note},
  });

export const sendRentReminder = (rentPaymentId: string) =>
  bffRequest<{status: string}>('/notifications/remind-rent', {
    method: 'POST',
    body: {rentPaymentId},
  });

export const initPlatform = () => bffRequest<{status: string}>('/admin/init-platform', {method: 'POST'});

export const updatePlatformBranding = (
  platformId: string,
  body: {name: string; brandLogoUrl?: string; brandPrimaryColor?: string; brandSecondaryColor?: string},
) =>
  bffRequest<{updated: boolean}>(`/platforms/${platformId}/branding`, {
    method: 'PUT',
    body,
  });

export const startLandlordSubscriptionCheckout = (body: {
  tier: 'basic' | 'test' | 'starter' | 'growth' | 'pro' | 'proplus';
  billing: 'monthly' | 'quarterly' | 'yearly';
  paymentMethod: 'stripe' | 'mpesa' | 'pesapal';
  phone?: string;
  successUrl?: string;
  cancelUrl?: string;
  rentPayoutMethod: 'cash' | 'mpesa' | 'bank';
  mpesaSettlementPhone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  cashPayoutNotes?: string;
}) =>
  bffRequest<{
    status: string;
    checkoutUrl?: string | null;
    subscriptionPaymentId?: string;
    checkoutRequestId?: string;
    customerMessage?: string;
  }>('/landlord/subscription/checkout', {
    method: 'POST',
    body,
  });

export const getAdminDashboard = (platformId?: string) =>
  bffRequest<{
    users: Record<string, any>[];
    properties: Record<string, any>[];
    invitations: Record<string, any>[];
    payments: Record<string, any>[];
    buildings: Record<string, any>[];
    platforms: Record<string, any>[];
  }>(`/admin/dashboard${platformId ? `?platformId=${encodeURIComponent(platformId)}` : ''}`);

export const getAuditLogs = (userId?: string) =>
  bffRequest<Record<string, any>[]>(`/admin/audit-logs${userId && userId !== 'all' ? `?userId=${encodeURIComponent(userId)}` : ''}`);

export const updateUserRole = (uid: string, role: 'landlord' | 'tenant' | 'hunter' | 'admin' | 'superadmin') =>
  bffRequest<Record<string, any>>(`/admin/users/${uid}/role`, {method: 'PATCH', body: {role}});

export const createPlatform = (body: {name: string; slug: string; ownerEmail: string}) =>
  bffRequest<Record<string, any>>('/admin/platforms', {method: 'POST', body});

export const togglePlatformStatus = (id: string, status: 'active' | 'suspended') =>
  bffRequest<Record<string, any>>(`/admin/platforms/${id}/status`, {method: 'PATCH', body: {status}});

export const insertAuditLog = (body: {
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}) => bffRequest<{logged: boolean}>('/audit-logs', {method: 'POST', body});

export const getPlatformBranding = (platformId: string) =>
  bffRequest<{name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null; brandSecondaryColor: string | null}>(
    `/platforms/${platformId}/branding`,
  );

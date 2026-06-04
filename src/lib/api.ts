import {Capacitor} from '@capacitor/core';
import {supabase} from '../supabase';

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const clientPrefix = () => (Capacitor.isNativePlatform() ? '/api/mobile' : '/api/web');

/** In dev, use same-origin `/api` (Vite proxies to the gateway on :3001). */
const apiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const bffRequest = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  const {
    data: {session},
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be signed in to continue.');
  }

  const response = await fetch(`${apiBaseUrl()}${clientPrefix()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as {error: unknown}).error)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
};

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

export const startLandlordSubscriptionCheckout = (body: {
  tier: 'starter' | 'growth' | 'pro';
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

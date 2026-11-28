import { createAuthClient } from 'better-auth/react';
import { Capacitor } from '@capacitor/core';

// Replaces src/supabase.ts. Web uses Better-Auth's normal cookie session (works for
// the Google OAuth redirect flow, which has no XHR response to read a bearer token
// from). The Capacitor WebView can't reliably use cross-origin cookies, so native
// uses the bearer plugin instead, storing the token itself in the OS keystore.

const IS_NATIVE = Capacitor.isNativePlatform();

const TOKEN_KEY = 'myboma-auth-token';
const REMEMBER_KEY = 'myboma-remember-auth';
const LAST_AUTH_METHOD_KEY = 'myboma-last-auth-method';
const LAST_AUTH_EMAIL_KEY = 'myboma-last-auth-email';
const LAST_AUTH_PHONE_KEY = 'myboma-last-auth-phone';

export type LastAuthMethod = 'google' | 'email' | 'phone';

const canUseBrowserStorage = () => typeof window !== 'undefined' && !!window.localStorage && !!window.sessionStorage;

/**
 * Native bearer token storage. The token lives in memory for the running session and, when
 * "remember me" is on, in the OS keystore (iOS Keychain / Android Keystore) via
 * @aparajita/capacitor-secure-storage — never in WebView localStorage, where any XSS
 * could read it. `authStorageReady` must resolve before the first API call (main.tsx).
 */
let cachedToken: string | null = null;

/** Defaults to true so Google, email, and phone logins stay remembered unless explicitly unchecked. */
export const getAuthPersistence = () => {
  if (!canUseBrowserStorage()) return true;
  return window.localStorage.getItem(REMEMBER_KEY) !== 'false';
};

export const getLastAuthMethod = (): LastAuthMethod | null => {
  if (!canUseBrowserStorage()) return null;
  const raw = window.localStorage.getItem(LAST_AUTH_METHOD_KEY);
  return raw === 'google' || raw === 'email' || raw === 'phone' ? raw : null;
};

export const setLastAuthMethod = (method: LastAuthMethod, hint?: { email?: string | null; phone?: string | null }) => {
  if (!canUseBrowserStorage()) return;
  try {
    window.localStorage.setItem(LAST_AUTH_METHOD_KEY, method);
    if (hint?.email?.trim()) window.localStorage.setItem(LAST_AUTH_EMAIL_KEY, hint.email.trim().toLowerCase());
    if (hint?.phone?.trim()) window.localStorage.setItem(LAST_AUTH_PHONE_KEY, hint.phone.trim());
  } catch {
    /* storage unavailable */
  }
};

export const getLastAuthHints = (): { email?: string; phone?: string } => {
  if (!canUseBrowserStorage()) return {};
  try {
    return {
      email: window.localStorage.getItem(LAST_AUTH_EMAIL_KEY) || undefined,
      phone: window.localStorage.getItem(LAST_AUTH_PHONE_KEY) || undefined,
    };
  } catch {
    return {};
  }
};

const loadSecureStorage = () => import('@aparajita/capacitor-secure-storage').then((m) => m.SecureStorage);

// Keystore writes are serialized so a slow setItem can't resurrect a token after sign-out.
let persistQueue: Promise<void> = Promise.resolve();
const persistToken = (token: string | null) => {
  if (!IS_NATIVE) return Promise.resolve();
  persistQueue = persistQueue
    .catch(() => undefined)
    .then(async () => {
      const storage = await loadSecureStorage();
      if (token && getAuthPersistence()) await storage.setItem(TOKEN_KEY, token);
      else await storage.removeItem(TOKEN_KEY);
    });
  return persistQueue;
};

export const authStorageReady: Promise<void> = (async () => {
  if (!IS_NATIVE) return;
  const legacy = canUseBrowserStorage()
    ? window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY)
    : null;
  try {
    const storage = await loadSecureStorage();
    cachedToken = (await storage.getItem(TOKEN_KEY)) ?? legacy;
    if (legacy) {
      await persistToken(cachedToken);
      // Only drop the WebView copy once the keystore write has succeeded (an over-the-air
      // JS update can reach an older native build that lacks the secure-storage plugin).
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch (error) {
    console.error('[auth] Secure token storage unavailable; keeping existing session:', error);
    cachedToken = legacy;
  }
})();

/** Persists the "Keep me signed in" preference across web and native clients. */
export const setAuthPersistence = (remember: boolean) => {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
  void persistToken(cachedToken).catch(() => undefined);
};

export const getStoredToken = () => (IS_NATIVE ? cachedToken : null);

export const setStoredToken = (token: string) => {
  cachedToken = token;
  void persistToken(token).catch(() => undefined);
};

export const clearStoredToken = () => {
  cachedToken = null;
  if (canUseBrowserStorage()) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
  }
  void persistToken(null).catch(() => undefined);
};

const useGateway = import.meta.env.VITE_USE_GATEWAY === 'true' && !IS_NATIVE;
const baseURL = useGateway
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : import.meta.env.VITE_API_BASE_URL || window.location.origin;

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: IS_NATIVE
    ? {
        auth: {
          type: 'Bearer',
          token: () => getStoredToken() ?? '',
        },
        onSuccess: (ctx) => {
          const token = ctx.response.headers.get('set-auth-token');
          if (token) setStoredToken(token);
        },
        onError: (ctx) => {
          if (ctx.response?.status === 401) clearStoredToken();
        },
      }
    : {
        credentials: 'include',
      },
});

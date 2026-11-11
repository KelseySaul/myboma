import { createAuthClient } from 'better-auth/react';
import { Capacitor } from '@capacitor/core';

// Replaces src/supabase.ts. Web uses Better-Auth's normal cookie session (works for
// the Google OAuth redirect flow, which has no XHR response to read a bearer token
// from). The Capacitor WebView can't reliably use cross-origin cookies, so native
// uses the bearer plugin instead, storing the token itself in the OS keystore.

const IS_NATIVE = Capacitor.isNativePlatform();

const TOKEN_KEY = 'myboma-auth-token';
const REMEMBER_KEY = 'myboma-remember-auth';

const canUseBrowserStorage = () => typeof window !== 'undefined' && !!window.localStorage && !!window.sessionStorage;

/**
 * Native bearer token storage. The token lives in memory for the running session and, when
 * "remember me" is on, in the OS keystore (iOS Keychain / Android Keystore) via
 * @aparajita/capacitor-secure-storage — never in WebView localStorage, where any XSS
 * could read it. `authStorageReady` must resolve before the first API call (main.tsx).
 */
let cachedToken: string | null = null;

export const getAuthPersistence = () => {
  if (!canUseBrowserStorage()) return false;
  return window.localStorage.getItem(REMEMBER_KEY) === 'true';
};

const loadSecureStorage = () => import('@aparajita/capacitor-secure-storage').then((m) => m.SecureStorage);

const persistToken = async (token: string | null) => {
  if (!IS_NATIVE) return;
  const storage = await loadSecureStorage();
  if (token && getAuthPersistence()) await storage.setItem(TOKEN_KEY, token);
  else await storage.removeItem(TOKEN_KEY);
};

export const authStorageReady: Promise<void> = (async () => {
  if (!IS_NATIVE) return;
  try {
    // One-time migration off the old WebView storage.
    const legacy = canUseBrowserStorage()
      ? window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY)
      : null;
    if (canUseBrowserStorage()) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
    const storage = await loadSecureStorage();
    cachedToken = (await storage.getItem(TOKEN_KEY)) ?? legacy;
    if (legacy) await persistToken(cachedToken);
  } catch (error) {
    console.error('[auth] Secure token storage unavailable:', error);
  }
})();

/** Only meaningful on native (bearer storage); on web this maps to signIn's own `rememberMe` flag. */
export const setAuthPersistence = (remember: boolean) => {
  if (!canUseBrowserStorage()) return;
  if (remember) window.localStorage.setItem(REMEMBER_KEY, 'true');
  else window.localStorage.removeItem(REMEMBER_KEY);
  void persistToken(cachedToken).catch(() => undefined);
};

export const getStoredToken = () => (IS_NATIVE ? cachedToken : null);

const setStoredToken = (token: string) => {
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

import { createAuthClient } from 'better-auth/react';
import { Capacitor } from '@capacitor/core';

// Replaces src/supabase.ts. Web uses Better-Auth's normal cookie session (works for
// the Google OAuth redirect flow, which has no XHR response to read a bearer token
// from). The Capacitor WebView can't reliably use cross-origin cookies, so native
// uses the bearer plugin instead, storing the token itself — same "remember me"
// persistence model (localStorage vs sessionStorage) as the old Supabase client.

const IS_NATIVE = Capacitor.isNativePlatform();

const TOKEN_KEY = 'myboma-auth-token';
const REMEMBER_KEY = 'myboma-remember-auth';

const canUseBrowserStorage = () => typeof window !== 'undefined' && !!window.localStorage && !!window.sessionStorage;

export const getAuthPersistence = () => {
  if (!canUseBrowserStorage()) return false;
  return window.localStorage.getItem(REMEMBER_KEY) === 'true';
};

const activeStorage = () => (getAuthPersistence() ? window.localStorage : window.sessionStorage);

/** Only meaningful on native (bearer storage); on web this maps to signIn's own `rememberMe` flag. */
export const setAuthPersistence = (remember: boolean) => {
  if (!canUseBrowserStorage()) return;
  const currentToken = window.sessionStorage.getItem(TOKEN_KEY) ?? window.localStorage.getItem(TOKEN_KEY);

  if (remember) {
    window.localStorage.setItem(REMEMBER_KEY, 'true');
    if (currentToken) window.localStorage.setItem(TOKEN_KEY, currentToken);
    window.sessionStorage.removeItem(TOKEN_KEY);
  } else {
    window.localStorage.removeItem(REMEMBER_KEY);
    if (currentToken) window.sessionStorage.setItem(TOKEN_KEY, currentToken);
    window.localStorage.removeItem(TOKEN_KEY);
  }
};

export const getStoredToken = () => (IS_NATIVE && canUseBrowserStorage() ? activeStorage().getItem(TOKEN_KEY) : null);

const setStoredToken = (token: string) => {
  if (!canUseBrowserStorage()) return;
  activeStorage().setItem(TOKEN_KEY, token);
};

export const clearStoredToken = () => {
  if (!canUseBrowserStorage()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
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

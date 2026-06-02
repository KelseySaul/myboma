import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const AUTH_STORAGE_KEY = 'myboma-auth-token';
const REMEMBER_AUTH_KEY = 'myboma-remember-auth';

const canUseBrowserStorage = () => typeof window !== 'undefined' && !!window.localStorage && !!window.sessionStorage;

export const getAuthPersistence = () => {
  if (!canUseBrowserStorage()) return false;
  return window.localStorage.getItem(REMEMBER_AUTH_KEY) === 'true';
};

const getAuthStorage = () => (getAuthPersistence() ? window.localStorage : window.sessionStorage);

export const setAuthPersistence = (remember: boolean) => {
  if (!canUseBrowserStorage()) return;

  const currentSession =
    window.sessionStorage.getItem(AUTH_STORAGE_KEY) ??
    window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (remember) {
    window.localStorage.setItem(REMEMBER_AUTH_KEY, 'true');
    if (currentSession) window.localStorage.setItem(AUTH_STORAGE_KEY, currentSession);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } else {
    window.localStorage.removeItem(REMEMBER_AUTH_KEY);
    if (currentSession) window.sessionStorage.setItem(AUTH_STORAGE_KEY, currentSession);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
};

const migrateExistingAuthSession = () => {
  if (!canUseBrowserStorage()) return;
  if (
    window.localStorage.getItem(AUTH_STORAGE_KEY) &&
    !window.localStorage.getItem(REMEMBER_AUTH_KEY) &&
    !window.sessionStorage.getItem(AUTH_STORAGE_KEY)
  ) {
    window.localStorage.setItem(REMEMBER_AUTH_KEY, 'true');
  }
};

const authStorage = {
  getItem: (key: string) => {
    if (!canUseBrowserStorage()) return null;
    return getAuthStorage().getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (!canUseBrowserStorage()) return;
    const primary = getAuthStorage();
    const secondary = primary === window.localStorage ? window.sessionStorage : window.localStorage;
    primary.setItem(key, value);
    secondary.removeItem(key);
  },
  removeItem: (key: string) => {
    if (!canUseBrowserStorage()) return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

migrateExistingAuthSession();

// Set VITE_USE_GATEWAY=true only when the API server runs with ENABLE_SUPABASE_PROXY=true.
const useGateway = import.meta.env.VITE_USE_GATEWAY === 'true' && !Capacitor.isNativePlatform();
const supabaseUrl = useGateway
  ? `${window.location.protocol}//${window.location.hostname}:3001/api/v1`
  : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // This helps prevent the "Lock stole it" error in some Dev environments
    storageKey: AUTH_STORAGE_KEY,
    storage: authStorage
  }
});

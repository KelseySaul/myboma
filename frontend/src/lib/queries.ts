import { useQuery } from '@tanstack/react-query';
import {
  getAdminDashboard,
  getAdminPendingInvites,
  getAuditLogs,
  getAvailableProperties,
  getImpersonatedUser,
  getLandlordDashboard,
  getSession,
  getSuperAdminAccounts,
  getTenantDashboard,
  getUnreadNotificationCount,
} from './api';
import { DASHBOARD_POLL_MS, LISTINGS_POLL_MS, PROFILE_POLL_MS, UNREAD_POLL_MS } from './polling';

const accountKey = (accountIds?: string[]) =>
  accountIds === undefined ? 'self' : [...accountIds].sort().join(',');

/**
 * Query-key factories. Every user-scoped key carries the uid the request is served as
 * (the impersonated user's uid during a super-admin support session), so switching users
 * refetches and cached data never leaks between users.
 */
export const queryKeys = {
  session: (userId: string | null | undefined) => ['session', userId ?? null] as const,
  landlordDashboard: (uid: string, accountIds?: string[]) => ['landlord', 'dashboard', uid, accountKey(accountIds)] as const,
  tenantDashboard: (uid: string) => ['tenant', 'dashboard', uid] as const,
  adminDashboard: (params: AdminDashboardParams) =>
    ['admin', 'dashboard', params.uid, params.viewerPlatformId ?? null, params.platformId ?? 'all'] as const,
  adminPendingInvites: (params: { uid: string; platformId?: string; accountIds?: string[] }) =>
    ['admin', 'pending-invites', params.uid, params.platformId ?? 'all', accountKey(params.accountIds)] as const,
  superAdminAccounts: (uid: string) => ['admin', 'accounts', uid] as const,
  auditLogs: (params: { uid: string; userId: string }) => ['admin', 'audit-logs', params.uid, params.userId] as const,
  availableProperties: () => ['properties', 'available'] as const,
  /** Shared by Navbar and Sidebar so both badges come from one request. */
  unreadCount: (identity: string | null | undefined) => ['notifications', 'unread-count', identity ?? null] as const,
  unreadCountAll: () => ['notifications', 'unread-count'] as const,
};

/** `uid`/`viewerPlatformId` identify the viewer (the server scopes results by them);
 * `platformId` is the super-admin's optional platform filter. */
type AdminDashboardParams = { uid: string; viewerPlatformId?: string | null; platformId?: string };

type EnabledOption = { enabled?: boolean; accountIds?: string[] };

/** Current session's profile (/session is never impersonated). Polls for role/subscription
 * changes made elsewhere, e.g. by an admin. */
export const useSessionProfile = (userId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.session(userId),
    queryFn: getSession,
    enabled: Boolean(userId),
    refetchInterval: PROFILE_POLL_MS,
    refetchOnWindowFocus: true,
  });

export const useLandlordDashboard = (uid: string, options: EnabledOption = {}) =>
  useQuery({
    queryKey: queryKeys.landlordDashboard(uid, options.accountIds),
    queryFn: () => getLandlordDashboard(options.accountIds),
    enabled: Boolean(uid) && (options.enabled ?? true),
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });

export const useSuperAdminAccounts = (uid: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.superAdminAccounts(uid ?? ''),
    queryFn: getSuperAdminAccounts,
    enabled: enabled && Boolean(uid),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

export const useAdminPendingInvites = (
  params: { uid: string; platformId?: string; accountIds?: string[] },
  enabled: boolean,
) =>
  useQuery({
    queryKey: queryKeys.adminPendingInvites(params),
    queryFn: () => getAdminPendingInvites({ platformId: params.platformId, accountIds: params.accountIds }),
    enabled: enabled && Boolean(params.uid),
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });

export const useTenantDashboard = (uid: string) =>
  useQuery({
    queryKey: queryKeys.tenantDashboard(uid),
    queryFn: getTenantDashboard,
    enabled: Boolean(uid),
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });

export const useAdminDashboard = (params: AdminDashboardParams) =>
  useQuery({
    queryKey: queryKeys.adminDashboard(params),
    queryFn: () => getAdminDashboard(params.platformId),
    enabled: Boolean(params.uid),
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });

export const useAuditLogs = (params: { uid: string; userId: string }, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => getAuditLogs(params.userId),
    enabled: enabled && Boolean(params.uid),
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });

/**
 * Public listings are the same for every visitor, so the last response is kept in
 * localStorage: returning visitors see homes instantly while a fresh copy loads.
 */
const LISTINGS_STORAGE_KEY = 'myboma_listings_v1';
const LISTINGS_STORAGE_MAX_AGE_MS = 10 * 60_000;

type StoredListings = { savedAt: number; data: Awaited<ReturnType<typeof getAvailableProperties>> };

const readStoredListings = (): StoredListings | undefined => {
  try {
    const raw = localStorage.getItem(LISTINGS_STORAGE_KEY);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as StoredListings;
    if (!Array.isArray(stored?.data) || Date.now() - stored.savedAt > LISTINGS_STORAGE_MAX_AGE_MS) return undefined;
    return stored;
  } catch {
    return undefined;
  }
};

const fetchAndStoreListings = async () => {
  const data = await getAvailableProperties();
  try {
    localStorage.setItem(LISTINGS_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data } satisfies StoredListings));
  } catch {
    // Storage full or blocked (private mode): caching is optional.
  }
  return data;
};

export const useAvailableProperties = () =>
  useQuery({
    queryKey: queryKeys.availableProperties(),
    queryFn: fetchAndStoreListings,
    initialData: () => readStoredListings()?.data,
    // Marks stored data with its real age, so anything older than staleTime refetches on mount.
    initialDataUpdatedAt: () => readStoredListings()?.savedAt,
    staleTime: 60_000,
    refetchInterval: LISTINGS_POLL_MS,
  });

/** Unread notification count for the signed-in user — or, while impersonating, for the
 * impersonated user (the request is served as them). */
export const useUnreadCount = (email: string | null | undefined) => {
  const identity = getImpersonatedUser() ?? email;
  return useQuery({
    queryKey: queryKeys.unreadCount(identity),
    queryFn: getUnreadNotificationCount,
    enabled: Boolean(email),
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    select: (data) => data.count,
  });
};

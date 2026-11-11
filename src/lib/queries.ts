import { useQuery } from '@tanstack/react-query';
import {
  getAdminDashboard,
  getAuditLogs,
  getAvailableProperties,
  getImpersonatedUser,
  getLandlordDashboard,
  getSession,
  getTenantDashboard,
  getUnreadNotificationCount,
} from './api';
import { DASHBOARD_POLL_MS, PROFILE_POLL_MS, UNREAD_POLL_MS } from './polling';

/**
 * Query-key factories. Every user-scoped key carries the uid the request is served as
 * (the impersonated user's uid during a super-admin support session), so switching users
 * refetches and cached data never leaks between users.
 */
export const queryKeys = {
  session: (userId: string | null | undefined) => ['session', userId ?? null] as const,
  landlordDashboard: (uid: string) => ['landlord', 'dashboard', uid] as const,
  tenantDashboard: (uid: string) => ['tenant', 'dashboard', uid] as const,
  adminDashboard: (params: AdminDashboardParams) =>
    ['admin', 'dashboard', params.uid, params.viewerPlatformId ?? null, params.platformId ?? 'all'] as const,
  auditLogs: (params: { uid: string; userId: string }) => ['admin', 'audit-logs', params.uid, params.userId] as const,
  availableProperties: () => ['properties', 'available'] as const,
  /** Shared by Navbar and Sidebar so both badges come from one request. */
  unreadCount: (identity: string | null | undefined) => ['notifications', 'unread-count', identity ?? null] as const,
  unreadCountAll: () => ['notifications', 'unread-count'] as const,
};

/** `uid`/`viewerPlatformId` identify the viewer (the server scopes results by them);
 * `platformId` is the super-admin's optional platform filter. */
type AdminDashboardParams = { uid: string; viewerPlatformId?: string | null; platformId?: string };

type EnabledOption = { enabled?: boolean };

/** Current session's profile (/session is never impersonated). Polls for role/subscription
 * changes made elsewhere, e.g. by an admin. */
export const useSessionProfile = (userId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.session(userId),
    queryFn: getSession,
    enabled: Boolean(userId),
    refetchInterval: PROFILE_POLL_MS,
  });

export const useLandlordDashboard = (uid: string, options: EnabledOption = {}) =>
  useQuery({
    queryKey: queryKeys.landlordDashboard(uid),
    queryFn: getLandlordDashboard,
    enabled: Boolean(uid) && (options.enabled ?? true),
    refetchInterval: DASHBOARD_POLL_MS,
  });

export const useTenantDashboard = (uid: string) =>
  useQuery({
    queryKey: queryKeys.tenantDashboard(uid),
    queryFn: getTenantDashboard,
    enabled: Boolean(uid),
    refetchInterval: DASHBOARD_POLL_MS,
  });

export const useAdminDashboard = (params: AdminDashboardParams) =>
  useQuery({
    queryKey: queryKeys.adminDashboard(params),
    queryFn: () => getAdminDashboard(params.platformId),
    enabled: Boolean(params.uid),
    refetchInterval: DASHBOARD_POLL_MS,
  });

export const useAuditLogs = (params: { uid: string; userId: string }, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => getAuditLogs(params.userId),
    enabled: enabled && Boolean(params.uid),
    refetchInterval: DASHBOARD_POLL_MS,
  });

export const useAvailableProperties = () =>
  useQuery({
    queryKey: queryKeys.availableProperties(),
    queryFn: getAvailableProperties,
    refetchInterval: DASHBOARD_POLL_MS,
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
    select: (data) => data.count,
  });
};

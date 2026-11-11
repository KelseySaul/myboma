/**
 * Polling cadence for dashboard refreshes. Kept modest so each open session stays well
 * inside the API rate limit (and mobile data budgets). Used as TanStack Query
 * `refetchInterval`s (src/lib/queries.ts); background tabs skip polls entirely.
 */
export const DASHBOARD_POLL_MS = 60_000;
export const UNREAD_POLL_MS = 60_000;
export const PROFILE_POLL_MS = 120_000;


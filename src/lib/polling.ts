/**
 * Polling cadence for dashboard refreshes. Kept modest so each open session stays well
 * inside the API rate limit (and mobile data budgets); hidden tabs skip polls entirely.
 */
export const DASHBOARD_POLL_MS = 60_000;
export const UNREAD_POLL_MS = 60_000;
export const PROFILE_POLL_MS = 120_000;

/** Wraps a poll callback so it does nothing while the page is in a background tab. */
export const whenVisible =
  (fn: () => unknown) =>
  () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    void fn();
  };

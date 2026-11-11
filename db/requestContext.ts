import {AsyncLocalStorage} from 'node:async_hooks';

/**
 * Per-request database scope for Row-Level Security (docs/migrations/08-row-level-security.sql).
 * When DATABASE_RLS=true, requireAuth opens one transaction per authenticated request,
 * switches it to the non-bypass `myboma_rls` role and sets the caller's identity; every
 * `db.*` call made while handling that request is routed to that transaction (see the
 * proxy in db/client.ts). Code that legitimately needs to look past the caller's rows
 * (e.g. a double-booking check across other hunters' bookings) wraps itself in
 * `withSystemAccess`, which runs on the owner connection outside the request scope.
 */
export type RequestDbScope = {tx: unknown | null};

export const requestDbScope = new AsyncLocalStorage<RequestDbScope>();

export const isRlsEnabled = () => process.env.DATABASE_RLS === 'true';

/** Runs `fn` as trusted system code (owner role, no RLS) even inside a user request. */
export const withSystemAccess = <T>(fn: () => Promise<T>): Promise<T> => requestDbScope.run({tx: null}, fn);

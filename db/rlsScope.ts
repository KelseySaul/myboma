import type {Response} from 'express';
import {sql} from 'drizzle-orm';
import {rootDb} from './client.js';
import {requestDbScope, type RequestDbScope} from './requestContext.js';

const ABANDONED_REQUEST_GRACE_MS = 30_000;

/** Stand-in for the request transaction after it has been closed: any use throws. */
const poisonedTx = new Proxy(
  {},
  {
    get() {
      throw new Error('Database scope for this request has already ended.');
    },
  },
);

export type RlsIdentity = {
  uid: string;
  email: string;
  platformId?: string | null;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
};

type EndArgs = Parameters<Response['end']>;

/**
 * Runs the rest of an Express request inside one transaction bound to the caller's
 * identity under the non-bypass `myboma_rls` role (docs/migrations/08-*.sql).
 *
 * The transaction COMMITS BEFORE the response is released: `res.end` is held until the
 * commit finishes. Serverless platforms may freeze the function the moment a response is
 * sent, so committing afterwards could silently lose writes. If the commit fails, the
 * client gets a 500 instead of a false success (when headers haven't been flushed yet).
 */
export const runInRlsScope = (identity: RlsIdentity, res: Response, next: () => void) => {
  const originalEnd = res.end.bind(res) as (...args: EndArgs) => Response;
  let heldEnd: EndArgs | null = null;

  return rootDb
    .transaction(async (tx) => {
      await tx.execute(sql`
        SELECT set_config('app.user_id', ${identity.uid}, true),
               set_config('app.user_email', ${identity.email.toLowerCase()}, true),
               set_config('app.platform_id', ${identity.platformId ?? ''}, true),
               set_config('app.is_admin', ${identity.isAdmin ? 'true' : 'false'}, true),
               set_config('app.is_super_admin', ${identity.isSuperAdmin ? 'true' : 'false'}, true)`);
      await tx.execute(sql`SET LOCAL ROLE myboma_rls`);

      const scope: RequestDbScope = {tx};
      await new Promise<void>((resolve) => {
        res.end = ((...args: EndArgs) => {
          heldEnd = args;
          resolve();
          return res;
        }) as Response['end'];
        // If the client disconnects, the handler keeps running and normally still calls
        // res.end. Only if it never does, give up after a grace period — and poison the
        // scope first so late queries fail loudly instead of running on a connection that
        // has gone back to the pool (where they would skip RLS or join another request).
        res.once('close', () => {
          if (heldEnd) return;
          setTimeout(() => {
            if (heldEnd) return;
            scope.tx = poisonedTx;
            resolve();
          }, ABANDONED_REQUEST_GRACE_MS).unref();
        });
        requestDbScope.run(scope, next);
      });

      if (scope.tx === poisonedTx) throw new Error('Request abandoned before responding; rolled back.');
      // A query error that a handler caught and ignored leaves Postgres in an aborted
      // transaction, where COMMIT silently becomes ROLLBACK. Probe first, so the client gets
      // a 500 instead of a success response for writes that were discarded.
      await tx.execute(sql`SELECT 1`);
    })
    .then(
      () => {
        res.end = originalEnd as Response['end'];
        if (heldEnd) originalEnd(...heldEnd);
      },
      (error) => {
        console.error('[rls] Request transaction failed:', error);
        res.end = originalEnd as Response['end'];
        if (!res.headersSent) {
          res.status(500).json({error: 'Internal server error'});
        } else if (heldEnd) {
          originalEnd(...heldEnd);
        }
      },
    );
};

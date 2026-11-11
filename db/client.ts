import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set (server-only, never exposed to the client bundle).');
}

// Node 22+ ships a global WebSocket, which the Neon driver uses for pooled connections.
if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket;

/**
 * Pooled WebSocket connections (previously the neon-http driver, which made every query a
 * separate HTTPS round trip and could not run interactive transactions). A pool reused
 * across warm serverless invocations keeps a few connections open, so a dashboard's many
 * queries share a socket, and `db.transaction()` gives real atomic multi-step writes.
 */
const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 5),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// An idle connection dropped by Neon must not crash the process; the pool reconnects.
pool.on('error', (error) => console.error('[db] Pool connection error:', error.message));

export const db = drizzle(pool, { schema });
export { schema };

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set (server-only, never exposed to the client bundle).');
}

const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
export { schema };

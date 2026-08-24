import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

const connectionString = process.env.DIRECT_DATABASE_URL;
if (!connectionString) {
  throw new Error('DIRECT_DATABASE_URL is not set — required for drizzle-kit push/migrate.');
}

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
  strict: true,
  verbose: true,
});

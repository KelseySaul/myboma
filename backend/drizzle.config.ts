import { defineConfig } from 'drizzle-kit';
import {config} from 'dotenv';
import path from 'node:path';

// drizzle-kit runs from the repo root via npm scripts.
config({path: path.resolve('backend/.env'), quiet: true});

const connectionString = process.env.DIRECT_DATABASE_URL;
if (!connectionString) {
  throw new Error('DIRECT_DATABASE_URL is not set — required for drizzle-kit push/migrate.');
}

export default defineConfig({
  schema: './backend/db/schema/index.ts',
  out: './backend/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
  strict: true,
  verbose: true,
});

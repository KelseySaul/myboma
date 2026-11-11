/**
 * Runs a SQL migration file against DATABASE_URL in ONE transaction.
 *   npx tsx scripts/apply-migration.ts <file.sql>            dry run: applies, verifies, ROLLS BACK
 *   npx tsx scripts/apply-migration.ts <file.sql> --apply    applies and COMMITS
 * Prints the target host and a before/after summary so you can see what changed.
 */
import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {Pool, neonConfig} from '@neondatabase/serverless';

neonConfig.webSocketConstructor = WebSocket;
const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npx tsx scripts/apply-migration.ts <file.sql> [--apply]');
  process.exit(2);
}
const commit = flag === '--apply';
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL / DIRECT_DATABASE_URL not set');

const pool = new Pool({connectionString: url});
const client = await pool.connect();
const countIfExists = async (table: string) => {
  const exists = (await client.query(`select to_regclass('public.${table}') is not null as e`)).rows[0].e;
  return exists ? (await client.query(`select count(*)::int n from ${table}`)).rows[0].n : null;
};
const summary = async () => {
  const q = async (text: string) => (await client.query(text)).rows[0];
  return {
    tables: (await q(`select string_agg(table_name, ',' order by table_name) v from information_schema.tables
      where table_schema='public' and table_name in ('leases','payment_attempts','platform_memberships')`)).v,
    indexes: (await q(`select count(*)::int v from pg_indexes where schemaname='public' and indexname not like '%pkey'`)).v,
    rlsTables: (await q(`select count(*)::int v from pg_class where relrowsecurity and relnamespace='public'::regnamespace`)).v,
    policies: (await q(`select count(*)::int v from pg_policies where schemaname='public'`)).v,
    issuerNullable: (await q(`select is_nullable v from information_schema.columns where table_schema='public' and table_name='account' and column_name='issuer'`))?.v,
    leases: await countIfExists('leases'),
    memberships: await countIfExists('platform_memberships'),
  };
};

console.log(`Target: ${new URL(url).host}  Mode: ${commit ? 'APPLY (commit)' : 'DRY RUN (rollback)'}`);
try {
  console.log('Before:', await summary());
  await client.query('BEGIN');
  await client.query(readFileSync(file, 'utf8'));
  console.log('After: ', await summary());
  await client.query(commit ? 'COMMIT' : 'ROLLBACK');
  console.log(commit ? 'Committed.' : 'Rolled back (dry run). Re-run with --apply to commit.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('FAILED, nothing was changed:', (error as Error).message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

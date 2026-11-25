import '../env.ts';
import {readFileSync} from 'node:fs';
import {Pool, neonConfig} from '@neondatabase/serverless';

if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx backend/scripts/runMigration.ts <path-to-sql>');
    process.exit(1);
  }
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not configured.');
    process.exit(1);
  }
  const sqlText = readFileSync(file, 'utf8');
  const pool = new Pool({connectionString});
  try {
    await pool.query(sqlText);
    console.log(`Applied migration: ${file}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

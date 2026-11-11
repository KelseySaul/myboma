/**
 * Verifies docs/migrations/08-row-level-security.sql against a real database WITHOUT
 * changing it: everything (role, policies, fixtures) runs in one transaction that is
 * always rolled back.  Usage:  npx tsx scripts/test-rls.ts   (reads DATABASE_URL from .env)
 */
import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {Pool, neonConfig} from '@neondatabase/serverless';

neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({connectionString: process.env.DATABASE_URL});
const c = await pool.connect();
const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
const T = '00000000-0000-4000-8000-00000000000c', H = '00000000-0000-4000-8000-00000000000d';
const PA = '00000000-0000-4000-8000-0000000000a1', PB = '00000000-0000-4000-8000-0000000000b1', PC = '00000000-0000-4000-8000-0000000000c1';
let failures = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
};

try {
  await c.query('BEGIN');
  // Tables created by `db:push` on newer schemas; created here if missing so the policies apply.
  await c.query(`CREATE TABLE IF NOT EXISTS leases (id uuid primary key default gen_random_uuid(), "platformId" uuid, "propertyId" uuid, "landlordId" uuid, "tenantUserId" uuid, "tenantEmail" text, status text)`);
  await c.query(`CREATE TABLE IF NOT EXISTS platform_memberships (id uuid primary key default gen_random_uuid(), "platformId" uuid, "userId" uuid, role text)`);
  await c.query(`CREATE TABLE IF NOT EXISTS payment_attempts (id uuid primary key default gen_random_uuid(), "rentPaymentId" uuid)`);
  await c.query(readFileSync('docs/migrations/08-row-level-security.sql', 'utf8'));

  for (const [id, email, role] of [[A, 'a@rls.test', 'landlord'], [B, 'b@rls.test', 'landlord'], [T, 't@rls.test', 'tenant'], [H, 'h@rls.test', 'hunter']]) {
    await c.query(`INSERT INTO "user"(id,name,email) VALUES ($1,'x',$2)`, [id, email]);
    await c.query(`INSERT INTO users(uid,email,role) VALUES ($1,$2,$3)`, [id, email, role]);
  }
  await c.query(`INSERT INTO properties(id,"landlordId",title,type,price,location,status,"tenantId") VALUES
    ($1,$4,'A unit','residential',100,'x','rented','t@rls.test'),
    ($2,$5,'B unit','residential',100,'x','rented','someone@rls.test'),
    ($3,$5,'B vacant','residential',100,'x','available',null)`, [PA, PB, PC, A, B]);
  await c.query(`INSERT INTO "rentPayments"("tenantId","propertyId","landlordId",amount,"dueDate")
    VALUES ('t@rls.test',$1,$3,100,'2026-11-01'),('someone@rls.test',$2,$4,100,'2026-11-01')`, [PA, PB, A, B]);

  const as = async (uid: string | null, email = '') => {
    await c.query('RESET ROLE');
    await c.query(`SELECT set_config('app.user_id',$1,true), set_config('app.user_email',$2,true),
      set_config('app.is_admin','false',true), set_config('app.is_super_admin','false',true),
      set_config('app.platform_id','',true)`, [uid ?? '', email]);
    if (uid) await c.query('SET LOCAL ROLE myboma_rls');
  };
  const titles = async () =>
    (await c.query(`select title from properties where title in ('A unit','B unit','B vacant') order by title`)).rows.map((r: any) => r.title).join(',');
  const invoices = async () => (await c.query(`select count(*)::int n from "rentPayments" where "tenantId" like '%@rls.test'`)).rows[0].n;
  const fails = async (statement: string, params: unknown[]) => {
    await c.query('SAVEPOINT probe');
    try {
      await c.query(statement, params);
      return false;
    } catch {
      return true;
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT probe');
    }
  };

  await as(A, 'a@rls.test');
  let t = await titles(); check('landlord sees own unit + public vacancy only', t === 'A unit,B vacant', t);
  let n = await invoices(); check('landlord sees only own invoices', n === 1, n);
  const upd = (await c.query(`update properties set title='hijacked' where id=$1`, [PB])).rowCount;
  check("landlord cannot update another landlord's unit", upd === 0, upd);
  check("landlord cannot create a unit owned by another landlord",
    await fails(`insert into properties("landlordId",title,type,price,location) values ($1,'evil','residential',1,'x')`, [B]));
  check('landlord can create their own unit',
    !(await fails(`insert into properties("landlordId",title,type,price,location) values ($1,'mine','residential',1,'x')`, [A])));

  await as(T, 't@rls.test');
  t = await titles(); check('tenant sees their rented unit + vacancy', t === 'A unit,B vacant', t);
  n = await invoices(); check('tenant sees only their invoice', n === 1, n);
  const tu = (await c.query(`update "rentPayments" set status='verifying' where "tenantId"='t@rls.test'`)).rowCount;
  check('tenant can submit a receipt on their invoice', tu === 1, tu);

  await as(H, 'h@rls.test');
  t = await titles(); check('hunter sees only the vacancy', t === 'B vacant', t);
  n = await invoices(); check('hunter sees no invoices', n === 0, n);
  check('hunter can notify a landlord', !(await fails(`insert into notifications("recipientEmail",title) values ('b@rls.test','booking')`, [])));

  await as(null);
  n = await invoices(); check('system context (cron/webhooks) sees everything', n === 2, n);
} finally {
  await c.query('ROLLBACK');
  c.release();
  await pool.end();
}
process.exit(failures ? 1 : 0);

/**
 * Verifies backend/migrations/08-row-level-security.sql AND 13-strict-rls-hardening.sql
 * against a real database WITHOUT changing it: everything (role, policies, fixtures) runs
 * in one transaction that is always rolled back.
 * Usage: npx tsx backend/scripts/test-rls.ts   (reads DATABASE_URL from backend/.env)
 */
import '../env.ts';
import {readFileSync} from 'node:fs';
import {Pool, neonConfig} from '@neondatabase/serverless';

if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30_000});
const c = await pool.connect();

const A = '00000000-0000-4000-8000-00000000000a'; // Landlord A
const B = '00000000-0000-4000-8000-00000000000b'; // Landlord B
const T = '00000000-0000-4000-8000-00000000000c'; // Tenant of Landlord A
const H = '00000000-0000-4000-8000-00000000000d'; // House Hunter
const CT = '00000000-0000-4000-8000-00000000000e'; // Caretaker of Landlord A
const PM = '00000000-0000-4000-8000-00000000000f'; // Property Manager / Agency managing Landlord A
const PA = '00000000-0000-4000-8000-0000000000a1';
const PB = '00000000-0000-4000-8000-0000000000b1';
const PC = '00000000-0000-4000-8000-0000000000c1';

let failures = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
};

try {
  await c.query('BEGIN');
  await c.query(readFileSync('backend/migrations/08-row-level-security.sql', 'utf8'));
  await c.query(readFileSync('backend/migrations/13-strict-rls-hardening.sql', 'utf8'));

  // Provision isolated test users (rolled back at end of script)
  for (const [id, email, role, managedBy] of [
    [PM, 'pm@rls.test', 'admin', null],
    [A, 'a@rls.test', 'landlord', PM],
    [B, 'b@rls.test', 'landlord', null],
    [T, 't@rls.test', 'tenant', null],
    [H, 'h@rls.test', 'hunter', null],
    [CT, 'ct@rls.test', 'caretaker', A],
  ] as const) {
    await c.query(`INSERT INTO "user"(id,name,email) VALUES ($1,'x',$2)`, [id, email]);
    await c.query(`INSERT INTO users(uid,email,role,"managedByAdminId") VALUES ($1,$2,$3,$4)`, [id, email, role, managedBy]);
  }

  await c.query(
    `INSERT INTO properties(id,"landlordId",title,type,price,location,status,"tenantId") VALUES
     ($1,$4,'A unit','residential',100,'x','rented','t@rls.test'),
     ($2,$5,'B unit','residential',100,'x','rented','someone@rls.test'),
     ($3,$5,'B vacant','residential',100,'x','available',null)`,
    [PA, PB, PC, A, B],
  );
  await c.query(
    `INSERT INTO "rentPayments"("tenantId","propertyId","landlordId",amount,"dueDate") VALUES
     ('t@rls.test',$1,$3,100,'2026-11-01'),
     ('someone@rls.test',$2,$4,100,'2026-11-01')`,
    [PA, PB, A, B],
  );
  await c.query(
    `INSERT INTO "landlordSubscriptionPayments"("landlordId",plan,amount,"paymentChannel","paymentReference",status,"receiptNumber","periodEnd") VALUES
     ($1,'pro_monthly',1500,'pesapal','REF-A','confirmed','RCP-RLS-A',now() + interval '30 days'),
     ($2,'pro_monthly',1500,'pesapal','REF-B','confirmed','RCP-RLS-B',now() + interval '30 days')`,
    [A, B],
  );
  await c.query(
    `INSERT INTO caretaker_reports("landlordId","caretakerId","propertyId",title,description) VALUES
     ($1,$2,$3,'Gate latch','Needs oil')`,
    [A, CT, PA],
  );

  // Verify FORCE ROW LEVEL SECURITY is active on all 14 tenant-scoped tables
  const rlsTables = (
    await c.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND relname = ANY($1::text[])`,
      [[
        'properties', 'buildings', 'rentPayments', 'leases', 'maintenanceRequests',
        'expenses', 'bookings', 'notifications', 'invitations', 'payment_attempts',
        'audit_logs', 'platform_memberships', 'caretaker_reports', 'landlordSubscriptionPayments',
      ]],
    )
  ).rows;
  const unforced = rlsTables.filter((r: any) => !r.relrowsecurity || !r.relforcerowsecurity).map((r: any) => r.relname);
  check('all 14 tenant tables have ENABLE + FORCE ROW LEVEL SECURITY', rlsTables.length === 14 && unforced.length === 0, {
    found: rlsTables.length,
    unforced,
  });

  const as = async (uid: string | null, email = '') => {
    await c.query('RESET ROLE');
    await c.query(
      `SELECT set_config('app.user_id',$1,true), set_config('app.user_email',$2,true),
              set_config('app.is_admin','false',true), set_config('app.is_super_admin','false',true),
              set_config('app.platform_id','',true)`,
      [uid ?? '', email],
    );
    if (uid) await c.query('SET LOCAL ROLE myboma_rls');
  };
  const titles = async () =>
    (await c.query(`select title from properties where title in ('A unit','B unit','B vacant') order by title`))
      .rows.map((r: any) => r.title)
      .join(',');
  const invoices = async () =>
    (await c.query(`select count(*)::int n from "rentPayments" where "tenantId" like '%@rls.test'`)).rows[0].n;
  const subReceipts = async () =>
    (await c.query(`select count(*)::int n from "landlordSubscriptionPayments" where "receiptNumber" like 'RCP-RLS-%'`)).rows[0].n;
  const reports = async () =>
    (await c.query(`select count(*)::int n from caretaker_reports where title = 'Gate latch'`)).rows[0].n;
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

  // 1. Landlord A isolation
  await as(A, 'a@rls.test');
  let t = await titles(); check('landlord sees own unit + public vacancy only', t === 'A unit,B vacant', t);
  let n = await invoices(); check('landlord sees only own invoices', n === 1, n);
  check('landlord sees only own subscription receipts', (await subReceipts()) === 1);
  check('landlord sees own caretaker report', (await reports()) === 1);
  const upd = (await c.query(`update properties set title='hijacked' where id=$1`, [PB])).rowCount;
  check("landlord cannot update another landlord's unit", upd === 0, upd);
  check("landlord cannot create a unit owned by another landlord",
    await fails(`insert into properties("landlordId",title,type,price,location) values ($1,'evil','residential',1,'x')`, [B]));
  check('landlord can create their own unit',
    !(await fails(`insert into properties("landlordId",title,type,price,location) values ($1,'mine','residential',1,'x')`, [A])));
  check('landlord cannot spoof audit_logs under another userId',
    await fails(`insert into audit_logs("userId",action) values ($1,'spoof')`, [B]));
  check('landlord can insert own audit_log row',
    !(await fails(`insert into audit_logs("userId",action) values ($1,'own_action')`, [A])));

  // 2. Landlord B isolation (cannot see A's caretaker reports or subscription payments)
  await as(B, 'b@rls.test');
  check("landlord B cannot see landlord A's caretaker reports", (await reports()) === 0);
  check("landlord B sees only own subscription receipt", (await subReceipts()) === 1);

  // 3. Caretaker of Landlord A
  await as(CT, 'ct@rls.test');
  t = await titles(); check("caretaker sees employer's unit + public vacancy only", t === 'A unit,B vacant', t);
  check('caretaker sees zero rent invoices', (await invoices()) === 0);
  check('caretaker sees zero subscription receipts', (await subReceipts()) === 0);
  check('caretaker can file report to own employer landlord',
    !(await fails(`insert into caretaker_reports("landlordId","caretakerId",title,description) values ($1,$2,'Roof leak','Checked')`, [A, CT])));
  check('caretaker cannot file report to another landlord',
    await fails(`insert into caretaker_reports("landlordId","caretakerId",title,description) values ($1,$2,'Fake','Nope')`, [B, CT]));

  // 4. Property Manager / Agency managing Landlord A (not B)
  await as(PM, 'pm@rls.test');
  t = await titles(); check("agency manager sees managed landlord's unit + vacancy only", t === 'A unit,B vacant', t);
  check("agency manager sees managed landlord's invoice only", (await invoices()) === 1);
  check("agency manager sees managed landlord's subscription receipt only", (await subReceipts()) === 1);
  check('agency manager can create invite for managed landlord',
    !(await fails(`insert into invitations(email,role,"landlordId") values ('newtenant@rls.test','tenant',$1)`, [A])));
  check('agency manager cannot create invite for unmanaged landlord B',
    await fails(`insert into invitations(email,role,"landlordId") values ('hijack@rls.test','tenant',$1)`, [B]));

  // 5. Tenant isolation
  await as(T, 't@rls.test');
  t = await titles(); check('tenant sees their rented unit + vacancy', t === 'A unit,B vacant', t);
  n = await invoices(); check('tenant sees only their invoice', n === 1, n);
  check('tenant sees zero subscription receipts', (await subReceipts()) === 0);
  const tu = (await c.query(`update "rentPayments" set status='verifying' where "tenantId"='t@rls.test'`)).rowCount;
  check('tenant can submit a receipt on their invoice', tu === 1, tu);

  // 6. Hunter isolation
  await as(H, 'h@rls.test');
  t = await titles(); check('hunter sees only the vacancy', t === 'B vacant', t);
  n = await invoices(); check('hunter sees no invoices', n === 0, n);
  check('hunter can notify a landlord', !(await fails(`insert into notifications("recipientEmail",title) values ('b@rls.test','booking')`, [])));

  // 7. System context (cron / webhooks)
  await as(null);
  n = await invoices(); check('system context (cron/webhooks) sees everything', n === 2, n);
} finally {
  await c.query('ROLLBACK');
  c.release();
  await pool.end();
}
process.exit(failures ? 1 : 0);

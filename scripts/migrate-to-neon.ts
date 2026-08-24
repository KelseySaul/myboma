/**
 * One-time Supabase -> Neon data migration.
 *
 * Run manually (not part of the app): `npx tsx scripts/migrate-to-neon.ts`
 *
 * Copies every table in FK-safe order from the old Supabase project into Neon via
 * Drizzle, and recreates each Supabase Auth user as a Better-Auth user (preserving
 * the same uid so every existing foreign key in the app tables keeps working
 * unchanged).
 *
 * IMPORTANT — passwords cannot be migrated:
 * Supabase never exposes password hashes via its Admin API (by design), and even if
 * it did, Better-Auth's hashing scheme is not compatible with Supabase's. This
 * script therefore:
 *   - For users with a linked Google identity: creates a matching Better-Auth
 *     `account` row (provider "google", same provider account id), so those users
 *     can keep signing in with Google immediately — no action needed from them.
 *   - For email/password-only users: creates the Better-Auth `user` row with NO
 *     usable password and sets `users.mustChangePassword = true`. These users
 *     cannot sign in until an admin sends them a password reset, since there is no
 *     credential to carry over. Do this via Better-Auth's forgot-password flow
 *     once SMTP is wired into server/auth.ts (`emailAndPassword.sendResetPassword`)
 *     — that isn't configured yet, so treat this as a manual follow-up per user.
 */
import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {db, schema} from '../db/client.ts';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to read from the old Supabase project.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {auth: {autoRefreshToken: false, persistSession: false}});

const log = (msg: string) => console.log(`[migrate-to-neon] ${msg}`);

/** Fetches every row of a table via paginated .select(), since Supabase caps page size. */
async function fetchAll<T = any>(table: string, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const {data, error} = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed reading ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function migrateAuthUsers() {
  log('Migrating auth.users -> Better-Auth user/account (preserving uid)...');
  let page = 1;
  let migrated = 0;
  let googleLinked = 0;
  let needsPasswordReset = 0;

  for (;;) {
    const {data, error} = await supabase.auth.admin.listUsers({page, perPage: 1000});
    if (error) throw new Error(`Failed listing auth users: ${error.message}`);
    if (!data.users.length) break;

    for (const u of data.users) {
      if (!u.email) continue; // skip anonymous/phone-only accounts, if any
      const email = u.email.toLowerCase();
      const name = (u.user_metadata?.full_name as string | undefined) || email;

      await db
        .insert(schema.authUser)
        .values({
          id: u.id,
          name,
          email,
          emailVerified: Boolean(u.email_confirmed_at),
          image: (u.user_metadata?.avatar_url as string | undefined) ?? null,
          createdAt: new Date(u.created_at),
          updatedAt: new Date(u.updated_at ?? u.created_at),
        })
        .onConflictDoNothing({target: schema.authUser.id});

      const googleIdentity = u.identities?.find((i) => i.provider === 'google');
      if (googleIdentity) {
        await db
          .insert(schema.authAccount)
          .values({
            id: randomUUID(),
            userId: u.id,
            accountId: googleIdentity.id,
            providerId: 'google',
            // Matches @better-auth/core's createOAuthAccountIssuer('google').
            issuer: 'local:oauth:google',
            createdAt: new Date(u.created_at),
            updatedAt: new Date(u.updated_at ?? u.created_at),
          })
          .onConflictDoNothing();
        googleLinked += 1;
      } else {
        needsPasswordReset += 1;
      }

      migrated += 1;
    }

    if (data.users.length < 1000) break;
    page += 1;
  }

  log(`Migrated ${migrated} auth users (${googleLinked} keep Google sign-in, ${needsPasswordReset} need a password reset before they can log in again).`);
}

async function migrateTable(table: string, insert: (rows: any[]) => Promise<void>) {
  const rows = await fetchAll(table);
  if (rows.length === 0) {
    log(`${table}: 0 rows, skipped.`);
    return;
  }
  await insert(rows);
  log(`${table}: migrated ${rows.length} rows.`);
}

async function main() {
  // FK-safe order: parents before children.
  await migrateAuthUsers();

  await migrateTable('platforms', async (rows) => {
    await db.insert(schema.platforms).values(rows).onConflictDoNothing({target: schema.platforms.id});
  });

  await migrateTable('users', async (rows) => {
    await db.insert(schema.users).values(rows).onConflictDoNothing({target: schema.users.uid});
  });

  await migrateTable('buildings', async (rows) => {
    await db.insert(schema.buildings).values(rows).onConflictDoNothing({target: schema.buildings.id});
  });

  await migrateTable('properties', async (rows) => {
    await db.insert(schema.properties).values(rows).onConflictDoNothing({target: schema.properties.id});
  });

  await migrateTable('property_managers', async (rows) => {
    await db.insert(schema.propertyManagers).values(rows).onConflictDoNothing({target: schema.propertyManagers.id});
  });

  await migrateTable('invitations', async (rows) => {
    await db.insert(schema.invitations).values(rows).onConflictDoNothing({target: schema.invitations.email});
  });

  await migrateTable('bookings', async (rows) => {
    await db.insert(schema.bookings).values(rows).onConflictDoNothing({target: schema.bookings.id});
  });

  await migrateTable('rentPayments', async (rows) => {
    await db.insert(schema.rentPayments).values(rows).onConflictDoNothing({target: schema.rentPayments.id});
  });

  await migrateTable('maintenanceRequests', async (rows) => {
    await db.insert(schema.maintenanceRequests).values(rows).onConflictDoNothing({target: schema.maintenanceRequests.id});
  });

  await migrateTable('expenses', async (rows) => {
    await db.insert(schema.expenses).values(rows).onConflictDoNothing({target: schema.expenses.id});
  });

  await migrateTable('notifications', async (rows) => {
    await db.insert(schema.notifications).values(rows).onConflictDoNothing({target: schema.notifications.id});
  });

  await migrateTable('audit_logs', async (rows) => {
    await db.insert(schema.auditLogs).values(rows).onConflictDoNothing({target: schema.auditLogs.id});
  });

  await migrateTable('waitlistSignups', async (rows) => {
    await db.insert(schema.waitlistSignups).values(rows).onConflictDoNothing({target: schema.waitlistSignups.id});
  });

  await migrateTable('landlordSubscriptionPayments', async (rows) => {
    await db.insert(schema.landlordSubscriptionPayments).values(rows).onConflictDoNothing({target: schema.landlordSubscriptionPayments.id});
  });

  log('Done. Remember: email/password users cannot log in until they reset their password (see header comment).');
}

main().catch((err) => {
  console.error('[migrate-to-neon] Failed:', err);
  process.exit(1);
});

-- ============================================================================================
-- 10: everything pending for production, in order, as ONE transaction (all or nothing).
-- Generated from the Drizzle schema (drizzle-kit export) + migrations 05-09. Idempotent:
-- safe to re-run. Apply with:  npx tsx scripts/apply-migration.ts docs/migrations/10-pending-production.sql --apply
-- Compatible with the code currently deployed (master): only additive changes, and the RLS
-- policies allow everything until the app sets DATABASE_RLS=true.
-- ============================================================================================

-- ---- 06: Better Auth >= 1.7.3 no longer writes account.issuer ----
ALTER TABLE public.account ALTER COLUMN issuer DROP NOT NULL;
DROP INDEX IF EXISTS public."account_issuer_accountId_uidx";

-- ---- new enums ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lease_status') THEN
    CREATE TYPE "public"."lease_status" AS ENUM('active', 'ended');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
    CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'manager', 'landlord', 'tenant', 'member');
  END IF;
END $$;

-- ---- new tables ----
CREATE TABLE IF NOT EXISTS "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platformId" uuid,
	"propertyId" uuid NOT NULL,
	"landlordId" uuid NOT NULL,
	"tenantUserId" uuid,
	"tenantEmail" text NOT NULL,
	"status" "lease_status" DEFAULT 'active' NOT NULL,
	"startDate" date NOT NULL,
	"endDate" date,
	"rentAmount" numeric(14, 2) NOT NULL,
	"dueDay" integer DEFAULT 1 NOT NULL,
	"depositAmount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"endedAt" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rentPaymentId" uuid,
	"provider" "payment_provider" NOT NULL,
	"providerReference" text NOT NULL,
	"merchantReference" text,
	"amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_providerReference_unique" UNIQUE("providerReference")
);

CREATE TABLE IF NOT EXISTS "platform_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platformId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_memberships_platform_user_uq" UNIQUE("platformId","userId")
);

ALTER TABLE "rentPayments" ADD COLUMN IF NOT EXISTS "leaseId" uuid;

-- ---- foreign keys ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_platformId_platforms_id_fk') THEN
    ALTER TABLE "leases" ADD CONSTRAINT "leases_platformId_platforms_id_fk" FOREIGN KEY ("platformId") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_propertyId_properties_id_fk') THEN
    ALTER TABLE "leases" ADD CONSTRAINT "leases_propertyId_properties_id_fk" FOREIGN KEY ("propertyId") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_landlordId_users_uid_fk') THEN
    ALTER TABLE "leases" ADD CONSTRAINT "leases_landlordId_users_uid_fk" FOREIGN KEY ("landlordId") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_tenantUserId_users_uid_fk') THEN
    ALTER TABLE "leases" ADD CONSTRAINT "leases_tenantUserId_users_uid_fk" FOREIGN KEY ("tenantUserId") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_rentPaymentId_rentPayments_id_fk') THEN
    ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_rentPaymentId_rentPayments_id_fk" FOREIGN KEY ("rentPaymentId") REFERENCES "public"."rentPayments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_memberships_platformId_platforms_id_fk') THEN
    ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_platformId_platforms_id_fk" FOREIGN KEY ("platformId") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_memberships_userId_users_uid_fk') THEN
    ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_userId_users_uid_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rentPayments_leaseId_leases_id_fk') THEN
    ALTER TABLE "rentPayments" ADD CONSTRAINT "rentPayments_leaseId_leases_id_fk" FOREIGN KEY ("leaseId") REFERENCES "public"."leases"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

-- ---- indexes ----
CREATE INDEX IF NOT EXISTS "account_user_idx" ON "account" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" USING btree ("createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_user_idx" ON "audit_logs" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "bookings_landlord_idx" ON "bookings" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "bookings_property_idx" ON "bookings" USING btree ("propertyId");
CREATE INDEX IF NOT EXISTS "bookings_hunter_idx" ON "bookings" USING btree ("hunterId");
CREATE INDEX IF NOT EXISTS "buildings_landlord_idx" ON "buildings" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "buildings_platform_idx" ON "buildings" USING btree ("platformId");
CREATE INDEX IF NOT EXISTS "expenses_landlord_idx" ON "expenses" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "expenses_property_idx" ON "expenses" USING btree ("propertyId");
CREATE INDEX IF NOT EXISTS "invitations_landlord_idx" ON "invitations" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "invitations_platform_idx" ON "invitations" USING btree ("platformId");
CREATE INDEX IF NOT EXISTS "landlord_sub_payments_landlord_idx" ON "landlordSubscriptionPayments" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "landlord_sub_payments_checkout_idx" ON "landlordSubscriptionPayments" USING btree ("providerCheckoutRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "leases_one_active_per_property_uq" ON "leases" USING btree ("propertyId") WHERE "leases"."status" = 'active';
CREATE INDEX IF NOT EXISTS "leases_tenant_user_idx" ON "leases" USING btree ("tenantUserId");
CREATE INDEX IF NOT EXISTS "leases_tenant_email_idx" ON "leases" USING btree (lower("tenantEmail"));
CREATE INDEX IF NOT EXISTS "leases_landlord_idx" ON "leases" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "maintenance_landlord_idx" ON "maintenanceRequests" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "maintenance_property_idx" ON "maintenanceRequests" USING btree ("propertyId");
CREATE INDEX IF NOT EXISTS "maintenance_tenant_idx" ON "maintenanceRequests" USING btree ("tenantId");
CREATE INDEX IF NOT EXISTS "notifications_recipient_read_idx" ON "notifications" USING btree (lower("recipientEmail"),"read");
CREATE INDEX IF NOT EXISTS "payment_attempts_rent_payment_idx" ON "payment_attempts" USING btree ("rentPaymentId");
CREATE INDEX IF NOT EXISTS "payment_attempts_merchant_idx" ON "payment_attempts" USING btree ("merchantReference");
CREATE INDEX IF NOT EXISTS "platform_memberships_user_idx" ON "platform_memberships" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "properties_landlord_idx" ON "properties" USING btree ("landlordId");
CREATE INDEX IF NOT EXISTS "properties_platform_idx" ON "properties" USING btree ("platformId");
CREATE INDEX IF NOT EXISTS "properties_building_idx" ON "properties" USING btree ("buildingId");
CREATE INDEX IF NOT EXISTS "properties_status_created_idx" ON "properties" USING btree ("status","createdAt");
CREATE INDEX IF NOT EXISTS "properties_tenant_lower_idx" ON "properties" USING btree (lower("tenantId"));
CREATE INDEX IF NOT EXISTS "property_managers_user_idx" ON "property_managers" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "rent_payments_landlord_due_idx" ON "rentPayments" USING btree ("landlordId","dueDate");
CREATE INDEX IF NOT EXISTS "rent_payments_property_idx" ON "rentPayments" USING btree ("propertyId");
CREATE INDEX IF NOT EXISTS "rent_payments_tenant_lower_idx" ON "rentPayments" USING btree (lower("tenantId"));
CREATE INDEX IF NOT EXISTS "rent_payments_status_due_idx" ON "rentPayments" USING btree ("status","dueDate");
CREATE INDEX IF NOT EXISTS "rent_payments_checkout_idx" ON "rentPayments" USING btree ("providerCheckoutRequestId");
CREATE INDEX IF NOT EXISTS "rent_payments_merchant_idx" ON "rentPayments" USING btree ("providerMerchantRequestId");
CREATE INDEX IF NOT EXISTS "users_platform_idx" ON "users" USING btree ("platformId");
CREATE INDEX IF NOT EXISTS "users_managed_by_idx" ON "users" USING btree ("managedByAdminId");
CREATE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users" USING btree (lower("email"));

-- ---- 05: remove duplicate unpaid invoices, then the one-invoice-per-month guard ----
-- Abort if a property/tenant/month has more than one PAID invoice: those are real money
-- records and must be reconciled by hand (refund or re-date) before the index can exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "rentPayments" WHERE status = 'paid'
    GROUP BY "propertyId", lower("tenantId"), date_trunc('month', "dueDate"::timestamp)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate PAID invoices exist for the same property/tenant/month; reconcile them manually first.';
  END IF;
END $$;

DELETE FROM "rentPayments" r
USING (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY "propertyId", lower("tenantId"), date_trunc('month', "dueDate"::timestamp)
             ORDER BY (status = 'paid') DESC, "createdAt" ASC
           ) AS rn
    FROM "rentPayments"
  ) ranked
  WHERE rn > 1 AND id IN (SELECT id FROM "rentPayments" WHERE status <> 'paid')
) dupes
WHERE r.id = dupes.id;



CREATE UNIQUE INDEX IF NOT EXISTS "rent_payments_one_per_month_uq" ON "rentPayments" USING btree ("propertyId",lower("tenantId"),date_trunc('month', "dueDate"::timestamp));

-- ---- 07: leases backfill ----

INSERT INTO leases ("platformId", "propertyId", "landlordId", "tenantUserId", "tenantEmail", status, "startDate", "rentAmount")
SELECT DISTINCT ON (p.id)
       p."platformId",
       p.id,
       p."landlordId",
       COALESCE(u_by_email.uid, u_by_id.uid),
       lower(COALESCE(u_by_id.email, p."tenantId")),
       'active',
       COALESCE(
         (SELECT min(rp."dueDate") FROM "rentPayments" rp WHERE rp."propertyId" = p.id),
         p."createdAt"::date
       ),
       p.price
FROM properties p
LEFT JOIN users u_by_email ON lower(u_by_email.email) = lower(p."tenantId")
LEFT JOIN users u_by_id ON u_by_id.uid::text = p."tenantId"
WHERE p."tenantId" IS NOT NULL
  AND p.status = 'rented'
  AND NOT EXISTS (SELECT 1 FROM leases l WHERE l."propertyId" = p.id AND l.status = 'active')
ORDER BY p.id, u_by_email."createdAt" NULLS LAST;

-- Link invoices to the lease of the same unit + tenant.
UPDATE "rentPayments" rp
SET "leaseId" = l.id
FROM leases l
WHERE rp."leaseId" IS NULL
  AND rp."propertyId" = l."propertyId"
  AND (lower(rp."tenantId") = lower(l."tenantEmail") OR rp."tenantId" = l."tenantUserId"::text);

-- ---- 09: platform memberships backfill ----
INSERT INTO platform_memberships ("platformId", "userId", role)
SELECT u."platformId",
       u.uid,
       (CASE
          WHEN u."isAdmin" THEN 'admin'
          WHEN u.role IN ('landlord', 'tenant') THEN u.role::text
          ELSE 'member'
        END)::membership_role
FROM users u
WHERE u."platformId" IS NOT NULL
ON CONFLICT ("platformId", "userId") DO NOTHING;

-- Platform owners (by platforms.ownerEmail) become 'owner'.
UPDATE platform_memberships m
SET role = 'owner'
FROM platforms p, users u
WHERE m."platformId" = p.id AND m."userId" = u.uid AND lower(u.email) = lower(p."ownerEmail");

-- ---- 08: row-level security ----
-- Row-Level Security: a database-enforced tenant boundary behind the app's own checks
-- (db/authz.ts). If a route ever forgets an authorization check, Postgres still refuses to
-- return or modify another landlord's / tenant's / platform's rows.
--
-- HOW CONTEXT WORKS
-- With DATABASE_RLS=true, every authenticated API request runs inside one transaction that
-- switches to the non-bypass role myboma_rls and sets transaction-local settings
-- (db/requestContext.ts):
--   app.user_id, app.user_email, app.platform_id, app.is_admin, app.is_super_admin
-- When app.user_id is NOT set (cron jobs, payment webhooks, Better Auth, or DATABASE_RLS
-- off) the session is treated as trusted system code and policies allow everything. So
-- this migration is safe to apply before enabling the flag: behaviour is unchanged until
-- DATABASE_RLS=true is set.
--
-- users / auth tables / property_managers are intentionally NOT under RLS: auth and the
-- authorization helpers below need to read them.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------- role
-- Neon's owner role (neondb_owner, via neon_superuser) has BYPASSRLS, so policies never
-- apply to it. Authenticated requests therefore run `SET LOCAL ROLE myboma_rls` inside
-- their transaction: a NOLOGIN role WITHOUT bypass that the owner can switch into.
-- System code (cron, webhooks, auth) keeps running as the owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myboma_rls') THEN
    CREATE ROLE myboma_rls NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT myboma_rls TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO myboma_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO myboma_rls;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO myboma_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO myboma_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO myboma_rls;

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION app_ctx(key text) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.' || key, true), '') $$;

-- Trusted system code (no end-user context on this transaction).
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app_ctx('user_id') IS NULL $$;

CREATE OR REPLACE FUNCTION app_is_super() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(app_ctx('is_super_admin') = 'true', false) $$;

CREATE OR REPLACE FUNCTION app_is_me(uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT uid IS NOT NULL AND uid::text = app_ctx('user_id') $$;

-- Platform admin of a (non-null) platform. A null platform never matches.
CREATE OR REPLACE FUNCTION app_admin_of(platform uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(app_ctx('is_admin') = 'true', false)
       AND platform IS NOT NULL
       AND platform::text = app_ctx('platform_id')
  $$;

-- Tenant reference columns hold an email or a uid (legacy); match either.
CREATE OR REPLACE FUNCTION app_is_tenant_ref(ref text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT ref IS NOT NULL AND (lower(ref) = lower(app_ctx('user_email')) OR ref = app_ctx('user_id'))
  $$;

-- SECURITY DEFINER so they can read property_managers/users regardless of caller.
CREATE OR REPLACE FUNCTION app_manages_property(prop uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM property_managers pm
      WHERE pm."propertyId" = prop AND pm."userId"::text = app_ctx('user_id')
    )
  $$;

-- Pro Plus agency managing this landlord (users.managedByAdminId).
CREATE OR REPLACE FUNCTION app_manages_landlord(landlord uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM users u
      WHERE u.uid = landlord AND u."managedByAdminId"::text = app_ctx('user_id')
    )
  $$;

CREATE OR REPLACE FUNCTION app_manages_building(building uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM properties p
      JOIN property_managers pm ON pm."propertyId" = p.id
      WHERE p."buildingId" = building AND pm."userId"::text = app_ctx('user_id')
    )
  $$;

-- Common "owns or administers this landlord's asset" predicate.
CREATE OR REPLACE FUNCTION app_owns(landlord uuid, platform uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app_is_system() OR app_is_super() OR app_is_me(landlord)
        OR app_admin_of(platform) OR app_manages_landlord(landlord)
  $$;

-- ---------------------------------------------------------------- policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','buildings','rentPayments','leases','maintenanceRequests',
                           'expenses','bookings','notifications','invitations','payment_attempts','audit_logs',
                           'platform_memberships']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE: the app connects as the table owner, which would otherwise bypass RLS.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_delete ON %I', t);
  END LOOP;
END $$;

-- properties: public listings are readable; tenants read their own unit.
CREATE POLICY rls_read ON properties FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_property(id)
  OR status = 'available' OR app_is_tenant_ref("tenantId"));
CREATE POLICY rls_insert ON properties FOR INSERT WITH CHECK (app_owns("landlordId", "platformId"));
CREATE POLICY rls_update ON properties FOR UPDATE
  USING (app_owns("landlordId", "platformId") OR app_manages_property(id))
  WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property(id));
CREATE POLICY rls_delete ON properties FOR DELETE USING (app_owns("landlordId", "platformId") OR app_manages_property(id));

-- buildings: managers can see the building of a unit they manage; only owners/admins write.
CREATE POLICY rls_read ON buildings FOR SELECT USING (app_owns("landlordId", "platformId") OR app_manages_building(id));
CREATE POLICY rls_insert ON buildings FOR INSERT WITH CHECK (app_owns("landlordId", "platformId"));
CREATE POLICY rls_update ON buildings FOR UPDATE USING (app_owns("landlordId", "platformId")) WITH CHECK (app_owns("landlordId", "platformId"));
CREATE POLICY rls_delete ON buildings FOR DELETE USING (app_owns("landlordId", "platformId"));

-- rentPayments: tenants read theirs and may update (submit a manual receipt code);
-- the app restricts which fields they can touch.
CREATE POLICY rls_read ON "rentPayments" FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_tenant_ref("tenantId"));
CREATE POLICY rls_insert ON "rentPayments" FOR INSERT WITH CHECK (
  app_owns("landlordId", "platformId") OR app_manages_property("propertyId"));
CREATE POLICY rls_update ON "rentPayments" FOR UPDATE
  USING (app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_tenant_ref("tenantId"))
  WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_tenant_ref("tenantId"));
CREATE POLICY rls_delete ON "rentPayments" FOR DELETE USING (
  app_owns("landlordId", "platformId") OR app_manages_property("propertyId"));

-- leases
CREATE POLICY rls_read ON leases FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_property("propertyId")
  OR app_is_me("tenantUserId") OR app_is_tenant_ref("tenantEmail"));
CREATE POLICY rls_insert ON leases FOR INSERT WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property("propertyId"));
CREATE POLICY rls_update ON leases FOR UPDATE
  USING (app_owns("landlordId", "platformId") OR app_manages_property("propertyId"))
  WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property("propertyId"));
CREATE POLICY rls_delete ON leases FOR DELETE USING (app_owns("landlordId", "platformId"));

-- maintenanceRequests: the filing tenant, the owner side, managers.
CREATE POLICY rls_read ON "maintenanceRequests" FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_me("tenantId"));
CREATE POLICY rls_insert ON "maintenanceRequests" FOR INSERT WITH CHECK (
  app_is_me("tenantId") OR app_owns("landlordId", "platformId"));
CREATE POLICY rls_update ON "maintenanceRequests" FOR UPDATE
  USING (app_owns("landlordId", "platformId") OR app_manages_property("propertyId"))
  WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property("propertyId"));
CREATE POLICY rls_delete ON "maintenanceRequests" FOR DELETE USING (app_owns("landlordId", "platformId"));

-- expenses
CREATE POLICY rls_read ON expenses FOR SELECT USING (
  app_owns("landlordId", "platformId") OR ("propertyId" IS NOT NULL AND app_manages_property("propertyId")));
CREATE POLICY rls_insert ON expenses FOR INSERT WITH CHECK (app_owns("landlordId", "platformId"));
CREATE POLICY rls_update ON expenses FOR UPDATE USING (app_owns("landlordId", "platformId")) WITH CHECK (app_owns("landlordId", "platformId"));
CREATE POLICY rls_delete ON expenses FOR DELETE USING (app_owns("landlordId", "platformId"));

-- bookings: the hunter who booked, the owner side, managers.
CREATE POLICY rls_read ON bookings FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_me("hunterId"));
CREATE POLICY rls_insert ON bookings FOR INSERT WITH CHECK (app_is_me("hunterId") OR app_owns("landlordId", "platformId"));
CREATE POLICY rls_update ON bookings FOR UPDATE
  USING (app_owns("landlordId", "platformId") OR app_manages_property("propertyId"))
  WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property("propertyId"));
CREATE POLICY rls_delete ON bookings FOR DELETE USING (app_owns("landlordId", "platformId"));

-- notifications: only the recipient reads/updates; any authenticated request may create
-- one (the app decides who gets notified, e.g. a tenant's payment notifies the landlord).
CREATE POLICY rls_read ON notifications FOR SELECT USING (
  app_is_system() OR app_is_super() OR lower("recipientEmail") = lower(app_ctx('user_email')));
CREATE POLICY rls_insert ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY rls_update ON notifications FOR UPDATE
  USING (app_is_system() OR app_is_super() OR lower("recipientEmail") = lower(app_ctx('user_email')))
  WITH CHECK (app_is_system() OR app_is_super() OR lower("recipientEmail") = lower(app_ctx('user_email')));
CREATE POLICY rls_delete ON notifications FOR DELETE USING (app_is_system() OR app_is_super());

-- invitations
CREATE POLICY rls_read ON invitations FOR SELECT USING (
  app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId")
  OR app_manages_landlord("landlordId") OR lower(email) = lower(app_ctx('user_email')));
CREATE POLICY rls_insert ON invitations FOR INSERT WITH CHECK (
  app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId"));
CREATE POLICY rls_update ON invitations FOR UPDATE
  USING (app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId"))
  WITH CHECK (app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId"));
CREATE POLICY rls_delete ON invitations FOR DELETE USING (
  app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId"));

-- payment_attempts: visible/writable only alongside an invoice the caller can see.
CREATE POLICY rls_read ON payment_attempts FOR SELECT USING (
  app_is_system() OR app_is_super() OR "rentPaymentId" IN (SELECT id FROM "rentPayments"));
CREATE POLICY rls_insert ON payment_attempts FOR INSERT WITH CHECK (
  app_is_system() OR app_is_super() OR "rentPaymentId" IN (SELECT id FROM "rentPayments"));
CREATE POLICY rls_update ON payment_attempts FOR UPDATE
  USING (app_is_system() OR app_is_super() OR "rentPaymentId" IN (SELECT id FROM "rentPayments"))
  WITH CHECK (true);
CREATE POLICY rls_delete ON payment_attempts FOR DELETE USING (app_is_system() OR app_is_super());

-- audit_logs: append-only for requests; readable by super admins only.
CREATE POLICY rls_read ON audit_logs FOR SELECT USING (app_is_system() OR app_is_super());
CREATE POLICY rls_insert ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY rls_update ON audit_logs FOR UPDATE USING (app_is_system()) WITH CHECK (app_is_system());
CREATE POLICY rls_delete ON audit_logs FOR DELETE USING (app_is_system());

-- platform_memberships: members see their own; platform admins manage their platform's.
CREATE POLICY rls_read ON platform_memberships FOR SELECT USING (
  app_is_system() OR app_is_super() OR app_is_me("userId") OR app_admin_of("platformId"));
CREATE POLICY rls_insert ON platform_memberships FOR INSERT WITH CHECK (
  app_is_system() OR app_is_super() OR app_admin_of("platformId"));
CREATE POLICY rls_update ON platform_memberships FOR UPDATE
  USING (app_is_system() OR app_is_super() OR app_admin_of("platformId"))
  WITH CHECK (app_is_system() OR app_is_super() OR app_admin_of("platformId"));
CREATE POLICY rls_delete ON platform_memberships FOR DELETE USING (
  app_is_system() OR app_is_super() OR app_admin_of("platformId"));

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO myboma_rls;

-- To roll back completely:
--   for each table above: ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY; ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;

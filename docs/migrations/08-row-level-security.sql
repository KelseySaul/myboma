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

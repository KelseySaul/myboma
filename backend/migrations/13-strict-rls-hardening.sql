-- Strict Row-Level Security hardening across all tenant-scoped tables.
-- Ensures myboma_rls role exists, FORCE ROW LEVEL SECURITY is active on every tenant table,
-- and closes overly-permissive WITH CHECK (true) policies on audit_logs and payment_attempts.
-- Idempotent: safe to run multiple times.

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

-- Ensure core RLS helper functions exist and stay up to date
CREATE OR REPLACE FUNCTION app_ctx(key text) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.' || key, true), '') $$;

CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app_ctx('user_id') IS NULL $$;

CREATE OR REPLACE FUNCTION app_is_super() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(app_ctx('is_super_admin') = 'true', false) $$;

CREATE OR REPLACE FUNCTION app_is_me(uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT uid IS NOT NULL AND uid::text = app_ctx('user_id') $$;

CREATE OR REPLACE FUNCTION app_admin_of(platform uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(app_ctx('is_admin') = 'true', false)
       AND platform IS NOT NULL
       AND platform::text = app_ctx('platform_id')
  $$;

CREATE OR REPLACE FUNCTION app_is_tenant_ref(ref text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT ref IS NOT NULL AND (lower(ref) = lower(app_ctx('user_email')) OR ref = app_ctx('user_id'))
  $$;

CREATE OR REPLACE FUNCTION app_manages_property(prop uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM property_managers pm
      WHERE pm."propertyId" = prop AND pm."userId"::text = app_ctx('user_id')
    )
  $$;

CREATE OR REPLACE FUNCTION app_manages_landlord(landlord uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM users u
      WHERE u.uid = landlord AND u."managedByAdminId"::text = app_ctx('user_id')
    )
  $$;

CREATE OR REPLACE FUNCTION app_is_caretaker_of(landlord uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM users u
      WHERE u.uid::text = app_ctx('user_id')
        AND u.role::text = 'caretaker'
        AND u."managedByAdminId" = landlord
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

CREATE OR REPLACE FUNCTION app_owns(landlord uuid, platform uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app_is_system() OR app_is_super() OR app_is_me(landlord)
        OR app_admin_of(platform) OR app_manages_landlord(landlord)
  $$;

-- Enforce ENABLE + FORCE ROW LEVEL SECURITY on every tenant-scoped table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'properties', 'buildings', 'rentPayments', 'leases', 'maintenanceRequests',
    'expenses', 'bookings', 'notifications', 'invitations', 'payment_attempts',
    'audit_logs', 'platform_memberships', 'caretaker_reports', 'landlordSubscriptionPayments'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Tightened invitations policy (includes agency managers managing a landlord)
DROP POLICY IF EXISTS rls_read ON invitations;
DROP POLICY IF EXISTS rls_insert ON invitations;
DROP POLICY IF EXISTS rls_update ON invitations;
DROP POLICY IF EXISTS rls_delete ON invitations;

CREATE POLICY rls_read ON invitations FOR SELECT USING (
  app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId")
  OR app_manages_landlord("landlordId") OR lower(email) = lower(app_ctx('user_email'))
);
CREATE POLICY rls_insert ON invitations FOR INSERT WITH CHECK (
  app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId")
  OR app_manages_landlord("landlordId")
);
CREATE POLICY rls_update ON invitations FOR UPDATE
  USING (
    app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId")
    OR app_manages_landlord("landlordId")
  )
  WITH CHECK (
    app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId")
    OR app_manages_landlord("landlordId")
  );
CREATE POLICY rls_delete ON invitations FOR DELETE USING (
  app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_admin_of("platformId")
  OR app_manages_landlord("landlordId")
);

-- Tightened payment_attempts UPDATE WITH CHECK so an attacker cannot re-point an attempt
-- onto another tenant's invoice
DROP POLICY IF EXISTS rls_update ON payment_attempts;
CREATE POLICY rls_update ON payment_attempts FOR UPDATE
  USING (app_is_system() OR app_is_super() OR "rentPaymentId" IN (SELECT id FROM "rentPayments"))
  WITH CHECK (app_is_system() OR app_is_super() OR "rentPaymentId" IN (SELECT id FROM "rentPayments"));

-- Tightened audit_logs: platform admins read only their own platform; callers may only
-- insert audit rows attributed to themselves (system code and super admins retain full access)
DROP POLICY IF EXISTS rls_read ON audit_logs;
CREATE POLICY rls_read ON audit_logs FOR SELECT USING (
  app_is_system() OR app_is_super() OR app_admin_of("platformId")
);
DROP POLICY IF EXISTS rls_insert ON audit_logs;
CREATE POLICY rls_insert ON audit_logs FOR INSERT WITH CHECK (
  app_is_system() OR app_is_super() OR app_is_me("userId")
);

-- Subscription payment receipts: strictly scoped to the paying landlord, their agency manager,
-- super admins, and system payment webhooks
DROP POLICY IF EXISTS rls_read ON "landlordSubscriptionPayments";
DROP POLICY IF EXISTS rls_insert ON "landlordSubscriptionPayments";
DROP POLICY IF EXISTS rls_update ON "landlordSubscriptionPayments";
DROP POLICY IF EXISTS rls_delete ON "landlordSubscriptionPayments";

CREATE POLICY rls_read ON "landlordSubscriptionPayments" FOR SELECT USING (
  app_is_system() OR app_is_super() OR app_is_me("landlordId") OR app_manages_landlord("landlordId")
);
CREATE POLICY rls_insert ON "landlordSubscriptionPayments" FOR INSERT WITH CHECK (
  app_is_system() OR app_is_super() OR app_is_me("landlordId")
);
CREATE POLICY rls_update ON "landlordSubscriptionPayments" FOR UPDATE
  USING (app_is_system() OR app_is_super() OR app_is_me("landlordId"))
  WITH CHECK (app_is_system() OR app_is_super() OR app_is_me("landlordId"));
CREATE POLICY rls_delete ON "landlordSubscriptionPayments" FOR DELETE USING (
  app_is_system() OR app_is_super()
);

-- Tightened notifications INSERT: system/super admins or authenticated callers only
DROP POLICY IF EXISTS rls_insert ON notifications;
CREATE POLICY rls_insert ON notifications FOR INSERT WITH CHECK (
  app_is_system() OR app_is_super() OR app_ctx('user_id') IS NOT NULL
);

-- Ensure properties, buildings, maintenanceRequests, and caretaker_reports include caretaker + agency predicates
DROP POLICY IF EXISTS rls_read ON properties;
CREATE POLICY rls_read ON properties FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_property(id)
  OR app_is_caretaker_of("landlordId")
  OR status = 'available' OR app_is_tenant_ref("tenantId")
);

DROP POLICY IF EXISTS rls_read ON buildings;
CREATE POLICY rls_read ON buildings FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_building(id)
  OR app_is_caretaker_of("landlordId")
);

DROP POLICY IF EXISTS rls_read ON "maintenanceRequests";
CREATE POLICY rls_read ON "maintenanceRequests" FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_manages_property("propertyId")
  OR app_is_caretaker_of("landlordId") OR app_is_me("tenantId")
);

DROP POLICY IF EXISTS rls_update ON "maintenanceRequests";
CREATE POLICY rls_update ON "maintenanceRequests" FOR UPDATE
  USING (app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_caretaker_of("landlordId"))
  WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_caretaker_of("landlordId"));

DROP POLICY IF EXISTS rls_read ON caretaker_reports;
DROP POLICY IF EXISTS rls_insert ON caretaker_reports;
DROP POLICY IF EXISTS rls_update ON caretaker_reports;
DROP POLICY IF EXISTS rls_delete ON caretaker_reports;

CREATE POLICY rls_read ON caretaker_reports FOR SELECT USING (
  app_owns("landlordId", "platformId") OR app_is_me("caretakerId")
);
CREATE POLICY rls_insert ON caretaker_reports FOR INSERT WITH CHECK (
  app_owns("landlordId", "platformId") OR (app_is_me("caretakerId") AND app_is_caretaker_of("landlordId"))
);
CREATE POLICY rls_update ON caretaker_reports FOR UPDATE
  USING (app_owns("landlordId", "platformId") OR app_is_me("caretakerId"))
  WITH CHECK (app_owns("landlordId", "platformId") OR app_is_me("caretakerId"));
CREATE POLICY rls_delete ON caretaker_reports FOR DELETE USING (
  app_owns("landlordId", "platformId")
);

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO myboma_rls;

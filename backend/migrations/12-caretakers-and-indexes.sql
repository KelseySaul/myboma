-- Caretaker role, caretaker reports, maintenance resolution notes, and performance indexes.
-- Idempotent: safe to run multiple times.

-- 1. Add caretaker role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'caretaker';

-- 2. Maintenance request resolution metadata
ALTER TABLE "maintenanceRequests"
  ADD COLUMN IF NOT EXISTS "resolutionNotes" text,
  ADD COLUMN IF NOT EXISTS "updatedById" uuid REFERENCES users(uid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz;

-- 3. Caretaker reports enums & table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'caretaker_report_status') THEN
    CREATE TYPE caretaker_report_status AS ENUM ('open', 'acknowledged', 'resolved');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'caretaker_report_category') THEN
    CREATE TYPE caretaker_report_category AS ENUM (
      'maintenance',
      'security',
      'cleanliness',
      'utility',
      'tenant_issue',
      'inspection',
      'other'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS caretaker_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES platforms(id) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  "caretakerId" uuid NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  "propertyId" uuid REFERENCES properties(id) ON DELETE SET NULL,
  "buildingId" uuid REFERENCES buildings(id) ON DELETE SET NULL,
  category caretaker_report_category NOT NULL DEFAULT 'maintenance',
  priority maintenance_priority NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text NOT NULL,
  images text[] NOT NULL DEFAULT '{}'::text[],
  status caretaker_report_status NOT NULL DEFAULT 'open',
  "landlordNotes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 4. RLS helper & policies for caretakers and caretaker_reports (when RLS is installed)
CREATE OR REPLACE FUNCTION app_is_caretaker_of(landlord uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM users u
      WHERE u.uid::text = app_ctx('user_id')
        AND u.role::text = 'caretaker'
        AND u."managedByAdminId" = landlord
    )
  $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myboma_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE caretaker_reports TO myboma_rls;
    GRANT EXECUTE ON FUNCTION app_is_caretaker_of(uuid) TO myboma_rls;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_owns') THEN
    DROP POLICY IF EXISTS rls_read ON properties;
    CREATE POLICY rls_read ON properties FOR SELECT USING (
      app_owns("landlordId", "platformId") OR app_manages_property(id)
      OR app_is_caretaker_of("landlordId")
      OR status = 'available' OR app_is_tenant_ref("tenantId"));

    DROP POLICY IF EXISTS rls_read ON buildings;
    CREATE POLICY rls_read ON buildings FOR SELECT USING (
      app_owns("landlordId", "platformId") OR app_manages_building(id)
      OR app_is_caretaker_of("landlordId"));

    DROP POLICY IF EXISTS rls_read ON "maintenanceRequests";
    CREATE POLICY rls_read ON "maintenanceRequests" FOR SELECT USING (
      app_owns("landlordId", "platformId") OR app_manages_property("propertyId")
      OR app_is_caretaker_of("landlordId") OR app_is_me("tenantId"));

    DROP POLICY IF EXISTS rls_update ON "maintenanceRequests";
    CREATE POLICY rls_update ON "maintenanceRequests" FOR UPDATE
      USING (app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_caretaker_of("landlordId"))
      WITH CHECK (app_owns("landlordId", "platformId") OR app_manages_property("propertyId") OR app_is_caretaker_of("landlordId"));

    ALTER TABLE caretaker_reports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE caretaker_reports FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_read ON caretaker_reports;
    DROP POLICY IF EXISTS rls_insert ON caretaker_reports;
    DROP POLICY IF EXISTS rls_update ON caretaker_reports;
    DROP POLICY IF EXISTS rls_delete ON caretaker_reports;

    CREATE POLICY rls_read ON caretaker_reports FOR SELECT USING (
      app_owns("landlordId", "platformId") OR app_is_me("caretakerId"));
    CREATE POLICY rls_insert ON caretaker_reports FOR INSERT WITH CHECK (
      app_owns("landlordId", "platformId") OR (app_is_me("caretakerId") AND app_is_caretaker_of("landlordId")));
    CREATE POLICY rls_update ON caretaker_reports FOR UPDATE
      USING (app_owns("landlordId", "platformId") OR app_is_me("caretakerId"))
      WITH CHECK (app_owns("landlordId", "platformId") OR app_is_me("caretakerId"));
    CREATE POLICY rls_delete ON caretaker_reports FOR DELETE USING (
      app_owns("landlordId", "platformId"));
  END IF;
END $$;

-- 5. Performance indexes across high-traffic queries and foreign keys
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);
CREATE INDEX IF NOT EXISTS users_platform_created_idx ON users ("platformId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_sub_status_expires_idx ON users ("subscriptionStatus", "subscriptionExpiresAt");

CREATE INDEX IF NOT EXISTS properties_landlord_status_idx ON properties ("landlordId", status);
CREATE INDEX IF NOT EXISTS properties_platform_status_created_idx ON properties ("platformId", status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS properties_type_status_idx ON properties (type, status);

CREATE INDEX IF NOT EXISTS buildings_landlord_created_idx ON buildings ("landlordId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS rent_payments_platform_status_paid_idx ON "rentPayments" ("platformId", status, "paidAt");
CREATE INDEX IF NOT EXISTS rent_payments_landlord_status_due_idx ON "rentPayments" ("landlordId", status, "dueDate");
CREATE INDEX IF NOT EXISTS rent_payments_lease_idx ON "rentPayments" ("leaseId") WHERE "leaseId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_landlord_status_created_idx ON "maintenanceRequests" ("landlordId", status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS maintenance_platform_status_idx ON "maintenanceRequests" ("platformId", status);
CREATE INDEX IF NOT EXISTS maintenance_property_status_idx ON "maintenanceRequests" ("propertyId", status);

CREATE INDEX IF NOT EXISTS invitations_landlord_created_idx ON invitations ("landlordId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON notifications (lower("recipientEmail"), "createdAt" DESC);
CREATE INDEX IF NOT EXISTS notifications_property_idx ON notifications ("propertyId") WHERE "propertyId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_logs_platform_created_idx ON audit_logs ("platformId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS audit_logs_email_created_idx ON audit_logs (lower("userEmail"), "createdAt" DESC);

CREATE INDEX IF NOT EXISTS leases_landlord_status_idx ON leases ("landlordId", status);
CREATE INDEX IF NOT EXISTS leases_property_status_idx ON leases ("propertyId", status);

CREATE INDEX IF NOT EXISTS property_managers_landlord_idx ON property_managers ("landlordId");
CREATE INDEX IF NOT EXISTS property_managers_property_idx ON property_managers ("propertyId");

CREATE INDEX IF NOT EXISTS caretaker_reports_landlord_status_created_idx ON caretaker_reports ("landlordId", status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS caretaker_reports_caretaker_created_idx ON caretaker_reports ("caretakerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS caretaker_reports_property_idx ON caretaker_reports ("propertyId") WHERE "propertyId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS caretaker_reports_building_idx ON caretaker_reports ("buildingId") WHERE "buildingId" IS NOT NULL;

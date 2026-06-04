-- MYBOMA SUPABASE SETUP + MIGRATION
-- Run this in the Supabase SQL editor whenever the database needs to be created
-- or upgraded. It is intentionally idempotent.

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Core tables
CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  "ownerEmail" text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  uid uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE SET NULL,
  email text UNIQUE NOT NULL,
  "displayName" text NOT NULL DEFAULT 'User',
  role text NOT NULL DEFAULT 'hunter' CHECK (role IN ('landlord', 'tenant', 'hunter', 'admin')),
  "isAdmin" boolean NOT NULL DEFAULT false,
  "isSuperAdmin" boolean NOT NULL DEFAULT false,
  phone text,
  address text,
  "avatarUrl" text,
  "termsAcceptedAt" timestamptz,
  "termsVersion" text,
  "privacyVersion" text,
  "stripeAccountId" text,
  "mpesaSettlementPhone" text,
  "mpesaSettlementShortCode" text,
  "bankName" text,
  "bankAccountNumber" text,
  "bankAccountName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "mustChangePassword" boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'))
);

CREATE TABLE IF NOT EXISTS public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  "buildingId" uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  "unitNumber" text,
  title text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('residential', 'commercial', 'bnb')),
  price numeric(14, 2) NOT NULL CHECK (price >= 0),
  location text NOT NULL,
  images text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'booked')),
  amenities text[] NOT NULL DEFAULT '{}',
  "tenantId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."maintenanceRequests" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "tenantId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  "propertyId" uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'resolved')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."rentPayments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "tenantId" text NOT NULL,
  "propertyId" uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  "dueDate" date NOT NULL,
  "paidAt" timestamptz,
  "receiptUrl" text,
  "paymentProvider" text CHECK ("paymentProvider" IS NULL OR "paymentProvider" IN ('stripe', 'mpesa', 'manual')),
  "providerReference" text,
  "providerCheckoutRequestId" text,
  "providerMerchantRequestId" text,
  "paymentMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "settlementStatus" text CHECK ("settlementStatus" IS NULL OR "settlementStatus" IN ('pending', 'initiated', 'settled', 'failed')),
  "settlementReference" text,
  "settledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "hunterId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  "propertyId" uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  "startDate" date NOT NULL,
  "endDate" date NOT NULL,
  "totalPrice" numeric(14, 2) NOT NULL CHECK ("totalPrice" >= 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  "paymentReference" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("endDate" >= "startDate")
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  "propertyId" uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  "expenseDate" date NOT NULL DEFAULT current_date,
  "receiptUrl" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "recipientEmail" text NOT NULL,
  type text,
  title text NOT NULL,
  message text,
  "propertyId" uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  read boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invitations (
  email text PRIMARY KEY,
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "displayName" text,
  phone text,
  role text NOT NULL DEFAULT 'tenant' CHECK (role IN ('landlord', 'tenant', 'hunter', 'admin')),
  "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.property_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('manager', 'co-owner')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("propertyId", "userId")
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  "userId" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "userEmail" text,
  action text NOT NULL,
  resource text,
  "resourceId" text,
  metadata jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Only authenticated and service_role need access; RLS policies below control what they can do.
GRANT INSERT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON public.audit_logs;

-- 3. Safe upgrades for databases created before this script was repaired
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS "ownerEmail" text;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "displayName" text NOT NULL DEFAULT 'User';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'hunter';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "isAdmin" boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "isSuperAdmin" boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "avatarUrl" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "termsAcceptedAt" timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "termsVersion" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "privacyVersion" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "stripeAccountId" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "mpesaSettlementPhone" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "mpesaSettlementShortCode" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "bankName" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "bankAccountNumber" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "bankAccountName" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "buildingId" uuid REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "unitNumber" text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'residential';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS price numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "tenantId" text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS "tenantId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS "propertyId" uuid REFERENCES public.properties(id) ON DELETE CASCADE;
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
ALTER TABLE public."maintenanceRequests" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

-- receiptUrl is added below with paidAt; removed early duplicate
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "tenantId" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "propertyId" uuid REFERENCES public.properties(id) ON DELETE CASCADE;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS amount numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "dueDate" date NOT NULL DEFAULT current_date;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "paidAt" timestamptz;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "receiptUrl" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "paymentProvider" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "providerReference" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "providerCheckoutRequestId" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "providerMerchantRequestId" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "paymentMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "settlementStatus" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "settlementReference" text;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "settledAt" timestamptz;
ALTER TABLE public."rentPayments" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "hunterId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "propertyId" uuid REFERENCES public.properties(id) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "startDate" date NOT NULL DEFAULT current_date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "endDate" date NOT NULL DEFAULT current_date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "totalPrice" numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "paymentReference" text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS "propertyId" uuid REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS amount numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS "expenseDate" date NOT NULL DEFAULT current_date;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS "receiptUrl" text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS "recipientEmail" text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS "propertyId" uuid REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "displayName" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'tenant';
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "landlordId" uuid REFERENCES public.users(uid) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

-- 4. Helpful indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (lower(email));
CREATE INDEX IF NOT EXISTS properties_landlord_idx ON public.properties ("landlordId");
CREATE INDEX IF NOT EXISTS properties_tenant_idx ON public.properties (lower("tenantId"));
CREATE INDEX IF NOT EXISTS properties_status_idx ON public.properties (status);
CREATE INDEX IF NOT EXISTS rent_payments_landlord_idx ON public."rentPayments" ("landlordId", "dueDate");
CREATE INDEX IF NOT EXISTS rent_payments_tenant_idx ON public."rentPayments" (lower("tenantId"), "dueDate");
CREATE INDEX IF NOT EXISTS rent_payments_provider_checkout_idx ON public."rentPayments" ("providerCheckoutRequestId");
CREATE INDEX IF NOT EXISTS bookings_landlord_idx ON public.bookings ("landlordId", "startDate");
CREATE INDEX IF NOT EXISTS bookings_hunter_idx ON public.bookings ("hunterId", "startDate");
CREATE INDEX IF NOT EXISTS expenses_landlord_idx ON public.expenses ("landlordId", "expenseDate");
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications (lower("recipientEmail"), read);

-- Public launch waitlist. Only the server service role reads or writes this table.
CREATE TABLE IF NOT EXISTS public."waitlistSignups" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  source text NOT NULL DEFAULT 'landing-page',
  status text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  "unsubscribeToken" uuid NOT NULL DEFAULT gen_random_uuid(),
  "consentAt" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "unsubscribedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updatedAt" timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS waitlist_signups_status_idx
  ON public."waitlistSignups" (status, "createdAt" DESC);

ALTER TABLE public."waitlistSignups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."waitlistSignups" FROM anon, authenticated;
GRANT ALL ON TABLE public."waitlistSignups" TO service_role;

-- Landlord subscriptions (MyBoma platform fee)
CREATE TABLE IF NOT EXISTS public."landlordSubscriptionPayments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  plan text NOT NULL,
  "providerCheckoutRequestId" text,
  "paymentProvider" text,
  amount numeric(14, 2) NOT NULL,
  "paymentChannel" text NOT NULL CHECK ("paymentChannel" IN ('mpesa', 'bank', 'stripe', 'pesapal')),
  "paymentReference" text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  "receiptNumber" text NOT NULL UNIQUE,
  "receiptText" text,
  "periodStart" timestamptz NOT NULL DEFAULT now(),
  "periodEnd" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "rentPayoutMethod" text
  CHECK ("rentPayoutMethod" IS NULL OR "rentPayoutMethod" IN ('cash', 'mpesa', 'bank'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "cashPayoutNotes" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "subscriptionPlan" text
  CHECK ("subscriptionPlan" IS NULL OR "subscriptionPlan" IN ('monthly', 'quarterly', 'yearly'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "subscriptionStatus" text NOT NULL DEFAULT 'none'
  CHECK ("subscriptionStatus" IN ('none', 'pending', 'active', 'expired', 'suspended'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" timestamptz;

CREATE INDEX IF NOT EXISTS landlord_subscription_landlord_idx
  ON public."landlordSubscriptionPayments" ("landlordId", "createdAt" DESC);

-- 5. Auth/profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  invited public.invitations%ROWTYPE;
  normalized_email text := lower(coalesce(new.email, ''));
  resolved_role text;
BEGIN
  SELECT *
    INTO invited
    FROM public.invitations
   WHERE lower(email) = normalized_email
   LIMIT 1;

  resolved_role := CASE
      WHEN COALESCE(invited.role, new.raw_user_meta_data->>'intended_role', 'hunter') IN ('landlord', 'tenant', 'hunter', 'admin')
        THEN COALESCE(invited.role, new.raw_user_meta_data->>'intended_role', 'hunter')
      ELSE 'hunter'
    END;

  INSERT INTO public.users (
    uid,
    "platformId",
    email,
    "displayName",
    role,
    "isAdmin",
    "isSuperAdmin",
    phone,
    "createdAt",
    "mustChangePassword"
  )
  VALUES (
    new.id,
    invited."platformId",
    normalized_email,
    COALESCE(new.raw_user_meta_data->>'full_name', invited."displayName", 'User'),
    resolved_role,
    resolved_role = 'admin',
    false,
    COALESCE(new.raw_user_meta_data->>'phone', invited.phone),
    now(),
    COALESCE((new.raw_user_meta_data->>'must_change_password')::boolean, false)
  )
  ON CONFLICT (uid) DO UPDATE SET
    email = excluded.email,
    "platformId" = COALESCE(public.users."platformId", excluded."platformId"),
    "displayName" = COALESCE(NULLIF(public.users."displayName", ''), excluded."displayName"),
    role = CASE WHEN excluded."isSuperAdmin" THEN 'admin' ELSE COALESCE(public.users.role, excluded.role) END,
    "isAdmin" = public.users."isAdmin" OR excluded."isAdmin",
    "isSuperAdmin" = public.users."isSuperAdmin" OR excluded."isSuperAdmin",
    phone = COALESCE(public.users.phone, excluded.phone),
    "mustChangePassword" = COALESCE(public.users."mustChangePassword", excluded."mustChangePassword");

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. RLS helpers
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.current_profile_is_super_admin()
RETURNS boolean AS $$
  SELECT COALESCE((SELECT u."isSuperAdmin" FROM public.users u WHERE u.uid = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_profile_is_admin()
RETURNS boolean AS $$
  SELECT
    public.current_profile_is_super_admin()
    OR COALESCE((SELECT u."isAdmin" FROM public.users u WHERE u.uid = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_profile_platform_id()
RETURNS uuid AS $$
  SELECT (SELECT u."platformId" FROM public.users u WHERE u.uid = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_property_manager(p_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_managers
    WHERE "propertyId" = p_id AND "userId" = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_building_manager(b_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.properties p
    JOIN public.property_managers pm ON p.id = pm."propertyId"
    WHERE p."buildingId" = b_id AND pm."userId" = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 7. Row-level security
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenanceRequests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rentPayments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage platforms" ON public.platforms;
CREATE POLICY "Super admins manage platforms" ON public.platforms
  FOR ALL USING (public.current_profile_is_super_admin())
  WITH CHECK (public.current_profile_is_super_admin());

DROP POLICY IF EXISTS "Users read visible profiles" ON public.users;
CREATE POLICY "Users read visible profiles" ON public.users
  FOR SELECT USING (
    uid = auth.uid()
    OR public.current_profile_is_super_admin()
    OR (
      public.current_profile_is_admin()
      AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()
    )
    OR email = public.current_user_email()
    OR EXISTS (
      SELECT 1
        FROM public.properties p
       WHERE p."landlordId" = users.uid
         AND (
           p.status = 'available'
           OR lower(coalesce(p."tenantId", '')) = public.current_user_email()
         )
    )
    OR EXISTS (
      SELECT 1
        FROM public.invitations i
       WHERE i.email = users.email
         AND i."landlordId" = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own profile" ON public.users;
CREATE POLICY "Users insert own profile" ON public.users
  FOR INSERT WITH CHECK (
    public.current_profile_is_super_admin()
    OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id())
    OR (
      uid = auth.uid()
      AND "isSuperAdmin" = false
      AND "isAdmin" = false
      AND role IN ('landlord', 'tenant', 'hunter')
    )
  );

DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile" ON public.users
  FOR UPDATE USING (uid = auth.uid() OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  WITH CHECK (
    public.current_profile_is_super_admin()
    OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id())
    OR (
      uid = auth.uid()
      AND "isSuperAdmin" = false
      AND "isAdmin" = false
      AND role IN ('landlord', 'tenant', 'hunter')
    )
  );

DROP POLICY IF EXISTS "Landlords manage own buildings" ON public.buildings;
CREATE POLICY "Landlords manage own buildings" ON public.buildings
  FOR ALL USING ("landlordId" = auth.uid() OR public.is_building_manager(id) OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  WITH CHECK ("landlordId" = auth.uid() OR public.is_building_manager(id) OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()));

DROP POLICY IF EXISTS "Authenticated users read available properties" ON public.properties;
CREATE POLICY "Authenticated users read available properties" ON public.properties
  FOR SELECT USING (
    status = 'available'
    OR "landlordId" = auth.uid()
    OR public.is_property_manager(id)
    OR lower(coalesce("tenantId", '')) = public.current_user_email()
    OR public.current_profile_is_super_admin()
    OR (
      public.current_profile_is_admin()
      AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()
    )
  );

DROP POLICY IF EXISTS "Landlords manage own properties" ON public.properties;
CREATE POLICY "Landlords manage own properties" ON public.properties
  FOR ALL USING ("landlordId" = auth.uid() OR public.is_property_manager(id) OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  WITH CHECK ("landlordId" = auth.uid() OR public.is_property_manager(id) OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()));

DROP POLICY IF EXISTS "Landlords manage property managers" ON public.property_managers;
CREATE POLICY "Landlords manage property managers" ON public.property_managers
  FOR ALL USING (
    "landlordId" = auth.uid()
    OR "userId" = auth.uid()
    OR public.current_profile_is_super_admin() 
    OR (public.current_profile_is_admin() AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = "propertyId" AND p."platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  )
  WITH CHECK (
    "landlordId" = auth.uid()
    OR public.current_profile_is_super_admin() 
    OR (public.current_profile_is_admin() AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = "propertyId" AND p."platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  );

DROP POLICY IF EXISTS "Maintenance visible to tenant and landlord" ON public."maintenanceRequests";
CREATE POLICY "Maintenance visible to tenant and landlord" ON public."maintenanceRequests"
  FOR SELECT USING ("tenantId" = auth.uid() OR "landlordId" = auth.uid() OR public.is_property_manager("propertyId") OR public.current_profile_is_super_admin());

DROP POLICY IF EXISTS "Tenants create maintenance" ON public."maintenanceRequests";
CREATE POLICY "Tenants create maintenance" ON public."maintenanceRequests"
  FOR INSERT WITH CHECK ("tenantId" = auth.uid() OR public.current_profile_is_super_admin());

DROP POLICY IF EXISTS "Landlords update maintenance" ON public."maintenanceRequests";
CREATE POLICY "Landlords update maintenance" ON public."maintenanceRequests"
  FOR UPDATE USING ("landlordId" = auth.uid() OR public.is_property_manager("propertyId") OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  WITH CHECK ("landlordId" = auth.uid() OR public.is_property_manager("propertyId") OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()));

DROP POLICY IF EXISTS "Payments visible to tenant and landlord" ON public."rentPayments";
CREATE POLICY "Payments visible to tenant and landlord" ON public."rentPayments"
  FOR SELECT USING (
    "landlordId" = auth.uid()
    OR public.is_property_manager("propertyId")
    OR lower("tenantId") = public.current_user_email()
    OR "tenantId" = auth.uid()::text
    OR public.current_profile_is_super_admin()
    OR (
      public.current_profile_is_admin()
      AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()
    )
  );

DROP POLICY IF EXISTS "Landlords manage rent payments" ON public."rentPayments";
CREATE POLICY "Landlords manage rent payments" ON public."rentPayments"
  FOR ALL USING ("landlordId" = auth.uid() OR public.is_property_manager("propertyId") OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  WITH CHECK ("landlordId" = auth.uid() OR public.is_property_manager("propertyId") OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()));

DROP POLICY IF EXISTS "Bookings visible to guests and landlords" ON public.bookings;
CREATE POLICY "Bookings visible to guests and landlords" ON public.bookings
  FOR SELECT USING ("hunterId" = auth.uid() OR "landlordId" = auth.uid() OR public.is_property_manager("propertyId") OR public.current_profile_is_super_admin());

DROP POLICY IF EXISTS "Guests create own bookings" ON public.bookings;
CREATE POLICY "Guests create own bookings" ON public.bookings
  FOR INSERT WITH CHECK ("hunterId" = auth.uid() OR public.current_profile_is_super_admin());

DROP POLICY IF EXISTS "Landlords manage own expenses" ON public.expenses;
CREATE POLICY "Landlords manage own expenses" ON public.expenses
  FOR ALL USING ("landlordId" = auth.uid() OR ("propertyId" IS NOT NULL AND public.is_property_manager("propertyId")) OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  WITH CHECK ("landlordId" = auth.uid() OR ("propertyId" IS NOT NULL AND public.is_property_manager("propertyId")) OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()));

DROP POLICY IF EXISTS "Notifications visible to recipient" ON public.notifications;
CREATE POLICY "Notifications visible to recipient" ON public.notifications
  FOR SELECT USING (lower("recipientEmail") = public.current_user_email() OR public.current_profile_is_super_admin());

DROP POLICY IF EXISTS "Authenticated users can send notifications" ON public.notifications;
DROP POLICY IF EXISTS "Landlords send tenant notifications" ON public.notifications;
CREATE POLICY "Landlords send tenant notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    public.current_profile_is_super_admin()
    OR (
      public.current_profile_is_admin()
      AND ("platformId" IS NOT DISTINCT FROM public.current_profile_platform_id() OR "platformId" IS NULL)
    )
    OR EXISTS (
      SELECT 1
        FROM public.properties p
       WHERE (p."landlordId" = auth.uid() OR public.is_property_manager(p.id))
         AND lower(coalesce(p."tenantId", '')) = lower("recipientEmail")
    )
    OR EXISTS (
      SELECT 1
        FROM public."rentPayments" rp
       WHERE (rp."landlordId" = auth.uid() OR public.is_property_manager(rp."propertyId"))
         AND lower(rp."tenantId") = lower("recipientEmail")
    )
    OR EXISTS (
      SELECT 1
        FROM public.bookings b
       WHERE (b."landlordId" = auth.uid() OR public.is_property_manager(b."propertyId"))
         AND lower("recipientEmail") IN (
           SELECT lower(u.email) FROM public.users u WHERE u.uid = b."hunterId"
         )
    )
  );

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (lower("recipientEmail") = public.current_user_email() OR public.current_profile_is_super_admin())
  WITH CHECK (lower("recipientEmail") = public.current_user_email() OR public.current_profile_is_super_admin());

DROP POLICY IF EXISTS "Invitations visible to invitee or landlord" ON public.invitations;
CREATE POLICY "Invitations visible to invitee or landlord" ON public.invitations
  FOR SELECT USING (
    lower(email) = public.current_user_email()
    OR "landlordId" = auth.uid()
    OR public.current_profile_is_super_admin()
    OR (
      public.current_profile_is_admin()
      AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()
    )
  );

DROP POLICY IF EXISTS "Landlords manage invitations" ON public.invitations;
CREATE POLICY "Landlords manage invitations" ON public.invitations
  FOR ALL USING ("landlordId" = auth.uid() OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()))
  WITH CHECK ("landlordId" = auth.uid() OR public.current_profile_is_super_admin() OR (public.current_profile_is_admin() AND "platformId" IS NOT DISTINCT FROM public.current_profile_platform_id()));

DROP POLICY IF EXISTS "Landlords create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Landlords update invitations" ON public.invitations;

-- 8. Public storage bucket for property images
INSERT INTO storage.buckets (id, name, public)
VALUES ('properties', 'properties', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own property images" ON storage.objects;
CREATE POLICY "Users upload own property images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'properties'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Property images are public" ON storage.objects;
CREATE POLICY "Property images are public" ON storage.objects
  FOR SELECT USING (bucket_id = 'properties');

DROP POLICY IF EXISTS "Owners manage property images" ON storage.objects;
DROP POLICY IF EXISTS "Users manage own property images" ON storage.objects;
CREATE POLICY "Users manage own property images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'properties'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'properties'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owners delete property images" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own property images" ON storage.objects;
CREATE POLICY "Users delete own property images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'properties'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 9. Realtime publication
DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'users',
    'buildings',
    'properties',
    'maintenanceRequests',
    'rentPayments',
    'bookings',
    'expenses',
    'notifications',
    'invitations',
    'platforms',
    'property_managers',
    'audit_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- AUDIT LOGS: Indexes, Grants, and RLS (table created in section 2 above)
-- ============================================================

-- Ensure the platformId and userEmail columns exist (safe upgrade)
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS "platformId" uuid REFERENCES public.platforms(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS "userEmail" text;

-- Index for fast per-user and per-platform queries
CREATE INDEX IF NOT EXISTS audit_logs_user_idx     ON public.audit_logs ("userId");
CREATE INDEX IF NOT EXISTS audit_logs_platform_idx ON public.audit_logs ("platformId");
CREATE INDEX IF NOT EXISTS audit_logs_created_idx  ON public.audit_logs ("createdAt" DESC);

-- RLS: users can only INSERT their own logs; SuperAdmins can SELECT all
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own audit logs" ON public.audit_logs;
CREATE POLICY "Users insert own audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK ("userId" = auth.uid());

DROP POLICY IF EXISTS "SuperAdmins read all audit logs" ON public.audit_logs;
CREATE POLICY "SuperAdmins read all audit logs" ON public.audit_logs
  FOR SELECT USING (public.current_profile_is_super_admin());

-- Force PostgREST to see newly added columns such as users."isSuperAdmin".
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- RPC: ADD PROPERTY MANAGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_property_manager(p_property_id uuid, p_email text, p_role text DEFAULT 'manager')
RETURNS void AS $$
DECLARE
  v_user_id uuid;
  v_landlord_id uuid;
BEGIN
  -- 1. Ensure the caller owns the property
  SELECT "landlordId" INTO v_landlord_id FROM public.properties WHERE id = p_property_id;
  IF v_landlord_id IS NULL OR v_landlord_id != auth.uid() THEN
    RAISE EXCEPTION 'You do not have permission to add managers to this property.';
  END IF;

  -- 2. Find the user by email
  SELECT uid INTO v_user_id FROM public.users WHERE lower(email) = lower(p_email);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that email address.';
  END IF;

  -- 3. Insert into property_managers
  INSERT INTO public.property_managers ("propertyId", "userId", "landlordId", role)
  VALUES (p_property_id, v_user_id, v_landlord_id, p_role)
  ON CONFLICT ("propertyId", "userId") DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

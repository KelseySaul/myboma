-- Dynamic database-backed prepaid subscription plans managed by the Super Admin.
-- Super Admins can edit prices, unit limits, building limits, features, and add unlimited custom plans.
-- Idempotent: safe to run multiple times without overwriting customized plans.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id text PRIMARY KEY,
  label text NOT NULL,
  badge text,
  "audienceType" text NOT NULL DEFAULT 'landlord',
  description text NOT NULL DEFAULT '',
  "monthlyPriceKes" integer NOT NULL DEFAULT 0,
  "quarterlyPriceKes" integer,
  "yearlyPriceKes" integer,
  "maxListings" integer,
  "maxBuildings" integer,
  "maintenanceHub" boolean NOT NULL DEFAULT true,
  "caretakerAccess" boolean NOT NULL DEFAULT false,
  "agencyAccess" boolean NOT NULL DEFAULT false,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "isSystem" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans (
  id, label, badge, "audienceType", description,
  "monthlyPriceKes", "quarterlyPriceKes", "yearlyPriceKes",
  "maxListings", "maxBuildings", "maintenanceHub", "caretakerAccess", "agencyAccess",
  highlights, "sortOrder", "isActive", "isSystem"
) VALUES
  (
    'free',
    'Free',
    NULL,
    'landlord',
    'Individual landlords testing the platform with 1–2 SQs/units.',
    0,
    0,
    0,
    2,
    1,
    false,
    false,
    false,
    '["Digital tenant & rent ledger","Manual payment logging & basic receipts","Expense tracking"]'::jsonb,
    10,
    true,
    true
  ),
  (
    'starter',
    'Starter',
    NULL,
    'landlord',
    'Small plot/court owners (e.g., 6–10 bedsitters or 1BR units).',
    750,
    2025,
    7500,
    10,
    2,
    true,
    false,
    false,
    '["Everything in Free","Automated SMS & Email rent reminders","Auto-generated PDF rent receipts","Maintenance & repair ticket hub"]'::jsonb,
    20,
    true,
    false
  ),
  (
    'pro',
    'Pro',
    'Most Popular',
    'landlord',
    'Standard residential apartment block owners (15–40 units).',
    2000,
    5400,
    20000,
    20,
    5,
    true,
    true,
    false,
    '["Everything in Starter","Automated M-Pesa Paybill / Till reconciliation","Tenant self-service portal & arrears aging reports","Caretaker / staff role access"]'::jsonb,
    30,
    true,
    false
  ),
  (
    'proplus',
    'Agency / Enterprise',
    NULL,
    'property_manager',
    'Real estate management agencies & large estate developers.',
    10000,
    27000,
    100000,
    NULL,
    NULL,
    true,
    true,
    true,
    '["Everything in Pro","Multi-user admin & accountant permissions","Whitelabel branding (custom domain & logo)","Bulk water/electricity meter billing & API"]'::jsonb,
    40,
    true,
    false
  )
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myboma_rls') THEN
    GRANT SELECT ON TABLE subscription_plans TO myboma_rls;
  END IF;
END $$;

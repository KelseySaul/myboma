-- MyBoma: Landlord subscription + rent payout columns
-- Run this entire script once in Supabase → SQL Editor

-- 1) Subscription payment records (receipts)
CREATE TABLE IF NOT EXISTS public."landlordSubscriptionPayments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "landlordId" uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('monthly', 'quarterly', 'yearly')),
  amount numeric(14, 2) NOT NULL,
  "paymentChannel" text NOT NULL CHECK ("paymentChannel" IN ('mpesa', 'bank')),
  "paymentReference" text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  "receiptNumber" text NOT NULL UNIQUE,
  "receiptText" text,
  "periodStart" timestamptz NOT NULL DEFAULT now(),
  "periodEnd" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- 2) User profile fields for subscription + how tenants pay rent
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

-- 3) Optional: keep existing landlords active (remove this block if you want everyone to re-subscribe)
-- UPDATE public.users
-- SET "subscriptionStatus" = 'active',
--     "subscriptionExpiresAt" = now() + interval '1 year'
-- WHERE role = 'landlord';

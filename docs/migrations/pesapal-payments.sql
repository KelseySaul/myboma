-- MyBoma: Pesapal payment channel support
-- Run in Supabase SQL Editor.

-- Fix landlordSubscriptionPayments constraint
ALTER TABLE public."landlordSubscriptionPayments"
  DROP CONSTRAINT IF EXISTS "landlordSubscriptionPayments_paymentChannel_check";
ALTER TABLE public."landlordSubscriptionPayments"
  DROP CONSTRAINT IF EXISTS "landlordsubscriptionpayments_paymentchannel_check";

ALTER TABLE public."landlordSubscriptionPayments"
  ADD CONSTRAINT "landlordSubscriptionPayments_paymentChannel_check"
  CHECK ("paymentChannel" IN ('mpesa', 'bank', 'stripe', 'pesapal'));

CREATE INDEX IF NOT EXISTS landlord_subscription_checkout_idx
  ON public."landlordSubscriptionPayments" ("providerCheckoutRequestId");

-- Fix rentPayments constraint
ALTER TABLE public."rentPayments"
  DROP CONSTRAINT IF EXISTS "rentPayments_paymentProvider_check";
ALTER TABLE public."rentPayments"
  DROP CONSTRAINT IF EXISTS "rentpayments_paymentprovider_check";

ALTER TABLE public."rentPayments"
  ADD CONSTRAINT "rentPayments_paymentProvider_check"
  CHECK ("paymentProvider" IS NULL OR "paymentProvider" IN ('stripe', 'mpesa', 'manual', 'pesapal'));

-- Fix incorrect subscriptionPlan constraint on users table
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscriptionPlan_check;

ALTER TABLE public.users
  ADD CONSTRAINT "users_subscriptionPlan_check"
  CHECK ("subscriptionPlan" IS NULL OR "subscriptionPlan" LIKE '%:%');

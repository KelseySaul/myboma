-- MyBoma: Tiered plans + Stripe/M-Pesa checkout columns
-- Run in Supabase SQL Editor after landlord-subscription.sql

ALTER TABLE public."landlordSubscriptionPayments" DROP CONSTRAINT IF EXISTS "landlordSubscriptionPayments_plan_check";
ALTER TABLE public."landlordSubscriptionPayments" DROP CONSTRAINT IF EXISTS "landlordsubscriptionpayments_plan_check";

ALTER TABLE public."landlordSubscriptionPayments" ADD COLUMN IF NOT EXISTS "providerCheckoutRequestId" text;
ALTER TABLE public."landlordSubscriptionPayments" ADD COLUMN IF NOT EXISTS "paymentProvider" text;

CREATE INDEX IF NOT EXISTS landlord_subscription_checkout_idx
  ON public."landlordSubscriptionPayments" ("providerCheckoutRequestId");

-- plan column now stores tier:billing e.g. starter:monthly, growth:yearly

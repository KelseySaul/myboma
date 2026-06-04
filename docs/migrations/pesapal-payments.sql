-- MyBoma: Pesapal payment channel support
-- Run in Supabase SQL Editor after landlord-subscription-v2.sql.

ALTER TABLE public."landlordSubscriptionPayments"
  DROP CONSTRAINT IF EXISTS "landlordSubscriptionPayments_paymentChannel_check";
ALTER TABLE public."landlordSubscriptionPayments"
  DROP CONSTRAINT IF EXISTS "landlordsubscriptionpayments_paymentchannel_check";

ALTER TABLE public."landlordSubscriptionPayments"
  ADD CONSTRAINT "landlordSubscriptionPayments_paymentChannel_check"
  CHECK ("paymentChannel" IN ('mpesa', 'bank', 'stripe', 'pesapal'));

CREATE INDEX IF NOT EXISTS landlord_subscription_checkout_idx
  ON public."landlordSubscriptionPayments" ("providerCheckoutRequestId");

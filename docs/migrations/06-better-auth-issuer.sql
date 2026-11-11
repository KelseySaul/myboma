-- Required for better-auth >= 1.7.3 (this branch ships 1.7.20).
-- 1.7.0-1.7.2 added a NOT NULL account.issuer column; newer versions never write it, so
-- every sign-up / account link fails until the constraint is relaxed. Reversible.
-- Source: https://www.better-auth.com/docs/guides/1-7-upgrade-guide
ALTER TABLE public.account ALTER COLUMN issuer DROP NOT NULL;
DROP INDEX IF EXISTS public."account_issuer_accountId_uidx";

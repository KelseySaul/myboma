-- Run BEFORE `npm run db:push` on an existing database.
-- 1) Removes duplicate rent invoices (same property + tenant + billing month) so the new
--    unique index rent_payments_one_per_month_uq can be created. Keeps a paid row if one
--    exists, otherwise the earliest-created row. Review the SELECT first.

-- Preview what would be deleted:
-- SELECT * FROM (
--   SELECT id, "propertyId", "tenantId", "dueDate", status,
--          row_number() OVER (
--            PARTITION BY "propertyId", lower("tenantId"), date_trunc('month', "dueDate"::timestamp)
--            ORDER BY (status = 'paid') DESC, "createdAt" ASC
--          ) AS rn
--   FROM "rentPayments"
-- ) d WHERE rn > 1;

-- Abort if a property/tenant/month has more than one PAID invoice: those are real money
-- records and must be reconciled by hand (refund or re-date) before the index can exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "rentPayments" WHERE status = 'paid'
    GROUP BY "propertyId", lower("tenantId"), date_trunc('month', "dueDate"::timestamp)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate PAID invoices exist for the same property/tenant/month; reconcile them manually first.';
  END IF;
END $$;

DELETE FROM "rentPayments" r
USING (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY "propertyId", lower("tenantId"), date_trunc('month', "dueDate"::timestamp)
             ORDER BY (status = 'paid') DESC, "createdAt" ASC
           ) AS rn
    FROM "rentPayments"
  ) ranked
  WHERE rn > 1 AND id IN (SELECT id FROM "rentPayments" WHERE status <> 'paid')
) dupes
WHERE r.id = dupes.id;

-- 2) Security clean-up: list accounts holding platform-admin flags so each one can be
--    confirmed. Before this release anyone could self-register as admin.
-- SELECT uid, email, role, "isAdmin", "isSuperAdmin", "platformId", "createdAt"
-- FROM users WHERE "isAdmin" OR "isSuperAdmin" ORDER BY "createdAt" DESC;

-- 3) Optional, before enabling REQUIRE_EMAIL_VERIFICATION=true: mark existing accounts verified
--    so they are not locked out.
-- UPDATE "user" SET "emailVerified" = true WHERE "emailVerified" = false;

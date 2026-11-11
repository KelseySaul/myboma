-- Run AFTER `npm run db:push` has created the "leases" table and rentPayments."leaseId".
-- Creates one active lease for every currently rented unit and links existing invoices.
-- Idempotent: units that already have an active lease are skipped.

INSERT INTO leases ("platformId", "propertyId", "landlordId", "tenantUserId", "tenantEmail", status, "startDate", "rentAmount")
SELECT p."platformId",
       p.id,
       p."landlordId",
       COALESCE(u_by_email.uid, u_by_id.uid),
       lower(COALESCE(u_by_id.email, p."tenantId")),
       'active',
       COALESCE(
         (SELECT min(rp."dueDate") FROM "rentPayments" rp WHERE rp."propertyId" = p.id),
         p."createdAt"::date
       ),
       p.price
FROM properties p
LEFT JOIN users u_by_email ON lower(u_by_email.email) = lower(p."tenantId")
LEFT JOIN users u_by_id ON u_by_id.uid::text = p."tenantId"
WHERE p."tenantId" IS NOT NULL
  AND p.status = 'rented'
  AND NOT EXISTS (SELECT 1 FROM leases l WHERE l."propertyId" = p.id AND l.status = 'active');

-- Link invoices to the lease of the same unit + tenant.
UPDATE "rentPayments" rp
SET "leaseId" = l.id
FROM leases l
WHERE rp."leaseId" IS NULL
  AND rp."propertyId" = l."propertyId"
  AND (lower(rp."tenantId") = lower(l."tenantEmail") OR rp."tenantId" = l."tenantUserId"::text);

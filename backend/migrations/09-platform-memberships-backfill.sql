-- Run AFTER `npm run db:push` has created "platform_memberships".
-- One membership per user that already belongs to a platform; idempotent.
INSERT INTO platform_memberships ("platformId", "userId", role)
SELECT u."platformId",
       u.uid,
       (CASE
          WHEN u."isAdmin" THEN 'admin'
          WHEN u.role IN ('landlord', 'tenant') THEN u.role::text
          ELSE 'member'
        END)::membership_role
FROM users u
WHERE u."platformId" IS NOT NULL
ON CONFLICT ("platformId", "userId") DO NOTHING;

-- Platform owners (by platforms.ownerEmail) become 'owner'.
UPDATE platform_memberships m
SET role = 'owner'
FROM platforms p, users u
WHERE m."platformId" = p.id AND m."userId" = u.uid AND lower(u.email) = lower(p."ownerEmail");

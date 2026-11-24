import {and, desc, eq, inArray, isNull, like, or, sql} from 'drizzle-orm';
import {withSystemAccess} from '../../db/requestContext.ts';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {invalidatePublicListings} from '../http/cache.ts';
import {canAdministerBuilding, canWriteUser, isSuperAdmin} from '../../db/authz.ts';
import {updatePlatformBrandingSchema} from '../adminHandlers.ts';
import {toActor} from '../types.ts';
import {
  asyncHandler,
  getValidatedBody,
  inviteSendLimiter,
  isAgencyAdmin,
  recordAudit,
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
  validateBody,
} from '../http/middleware.ts';
import {emailSchema} from '../http/schemas.ts';
import {createAndSendInvite} from '../inviteService.ts';
import {INVITE_IDENTIFIER_PREFIX, parseInvitePayload, type InvitePayload} from '../invitePolicy.ts';

const resendInviteSchema = z.object({email: emailSchema}).strict();

const updateRoleSchema = z.object({role: z.enum(['landlord', 'tenant', 'hunter', 'admin', 'superadmin'])}).strict();

const createPlatformSchema = z
  .object({name: z.string().min(1).max(160), slug: z.string().min(1).max(80), ownerEmail: emailSchema})
  .strict();

export function registerAdminRoutes(bffRouter: Router) {
  /**
   * Consolidates the admin dashboard's old users + properties + invitations + rentPayments
   * + buildings (+ platforms, for super admins) fetches and their five-table Realtime
   * channel into one polled endpoint. Filtering mirrors the old client exactly, including
   * its narrower-than-RLS choice for plain admins (see comments below).
   */
  bffRouter.get(
    '/admin/dashboard',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const listLimit = 200;
      const platformIdParam = typeof req.query.platformId === 'string' ? req.query.platformId : undefined;

      // Super admins may pick any platform (or 'all'); plain admins are always pinned to
      // their own platform ('none' meaning "no platform assigned").
      const filterId = isSuperAdmin(actor) ? (platformIdParam && platformIdParam !== 'all' ? platformIdParam : null) : actor.platformId || 'none';

      // Loosely typed on purpose: this closes over columns from five different tables
      // (users/properties/invitations/rentPayments/buildings) that all happen to share
      // the same platformId/landlordId column shape.
      const platformWhere = (col: any) => (filterId === null ? undefined : filterId === 'none' ? isNull(col) : eq(col, filterId));
      const withLandlordScope = (col: any, base: any) => (isSuperAdmin(actor) ? base : and(base, eq(col, actor.id)));

      // Plain admins only see users they've personally invited (as "landlordId" on the
      // invitation), plus themselves. Filtered in SQL — filtering after a LIMIT made older
      // managed users silently disappear once the table grew past the limit.
      const invitedByMe = isSuperAdmin(actor)
        ? undefined
        : or(
            eq(schema.users.uid, actor.id),
            sql`lower(${schema.users.email}) IN (SELECT lower(${schema.invitations.email}) FROM ${schema.invitations} WHERE ${schema.invitations.landlordId} = ${actor.id})`,
          );
      const users = await db.query.users.findMany({
        where: invitedByMe ? and(platformWhere(schema.users.platformId), invitedByMe) : platformWhere(schema.users.platformId),
        orderBy: desc(schema.users.createdAt),
        limit: isSuperAdmin(actor) ? listLimit : 2000,
      });

      const properties = await db.query.properties.findMany({
        where: withLandlordScope(schema.properties.landlordId, platformWhere(schema.properties.platformId)),
        orderBy: desc(schema.properties.createdAt),
        limit: listLimit,
      });

      const invitationRows = await db.query.invitations.findMany({
        where: withLandlordScope(schema.invitations.landlordId, platformWhere(schema.invitations.platformId)),
        orderBy: desc(schema.invitations.createdAt),
        limit: listLimit,
      });
      const registeredEmails = new Set(users.map((u) => u.email.toLowerCase()));
      const invitations = invitationRows.filter((inv) => !registeredEmails.has(inv.email.toLowerCase()));

      const paymentRows = await db.query.rentPayments.findMany({
        where: withLandlordScope(schema.rentPayments.landlordId, platformWhere(schema.rentPayments.platformId)),
        orderBy: desc(schema.rentPayments.dueDate),
        limit: listLimit,
      });
      const payments = paymentRows.map((p) => ({...p, amount: Number(p.amount)}));

      const buildings = await db.query.buildings.findMany({
        where: withLandlordScope(schema.buildings.landlordId, platformWhere(schema.buildings.platformId)),
        orderBy: desc(schema.buildings.createdAt),
        limit: listLimit,
      });

      const platforms = isSuperAdmin(actor) ? await db.query.platforms.findMany() : [];

      res.json({users, properties, invitations, payments, buildings, platforms});
    }),
  );

  /**
   * Re-sends an invitation email with a fresh 7-day link (the old link stops working).
   * Keeps the settings stored with the latest link when there is one.
   */
  bffRouter.post(
    '/admin/invitations/resend',
    requireAuth,
    requireAdmin,
    validateBody(resendInviteSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const {email} = getValidatedBody<z.infer<typeof resendInviteSchema>>(req);
      const target = email.trim().toLowerCase();
      const invitation = await db.query.invitations.findFirst({where: sql`lower(${schema.invitations.email}) = ${target}`});
      if (!invitation) {
        res.status(404).json({error: 'No pending invitation for that email.'});
        return;
      }
      const allowed = isSuperAdmin(actor) || invitation.landlordId === actor.id || (actor.platformId && invitation.platformId === actor.platformId);
      if (!allowed) {
        res.status(403).json({error: 'You can only resend invitations you manage.'});
        return;
      }
      const existingAccount = await db.query.users.findFirst({where: sql`lower(${schema.users.email}) = ${target}`, columns: {uid: true}});
      if (existingAccount) {
        res.status(409).json({error: 'This person has already set up their account.'});
        return;
      }

      const tokens = await withSystemAccess(() =>
        db
          .select({value: schema.authVerification.value})
          .from(schema.authVerification)
          .where(like(schema.authVerification.identifier, `${INVITE_IDENTIFIER_PREFIX}%`)),
      );
      const previous = tokens.map((row) => parseInvitePayload(row.value)).find((payload) => payload?.email === target);

      try {
        const {expiresAt} = await createAndSendInvite({
          email: target,
          role: previous?.role ?? (invitation.role as InvitePayload['role']),
          platformId: previous?.platformId ?? invitation.platformId ?? null,
          landlordId: previous?.landlordId ?? invitation.landlordId ?? null,
          invitedBy: actor.id,
          invitedByName: req.profile!.displayName || 'MyBoma',
          displayName: previous?.displayName ?? invitation.displayName ?? null,
          phone: previous?.phone ?? invitation.phone ?? null,
          profile: previous?.profile ?? {},
        });
        await recordAudit(req.profile!, 'INVITE_RESENT', 'invitation', target);
        res.json({ok: true, expiresAt});
      } catch (err) {
        console.error('[Invite] Resend failed:', err);
        res.status(502).json({error: 'The email could not be sent. Try again shortly.'});
      }
    }),
  );

  /**
   * Real numbers for the admin overview: counts, money this month vs last month, 6-month
   * trends and recent activity. Same visibility rules as /admin/dashboard above.
   */
  bffRouter.get(
    '/admin/overview',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const superAdmin = isSuperAdmin(actor);
      const platformIdParam = typeof req.query.platformId === 'string' ? req.query.platformId : undefined;
      const filterId = superAdmin ? (platformIdParam && platformIdParam !== 'all' ? platformIdParam : null) : actor.platformId || 'none';
      const platformWhere = (col: any) => (filterId === null ? undefined : filterId === 'none' ? isNull(col) : eq(col, filterId));
      const scoped = (landlordCol: any, platformCol: any) =>
        superAdmin ? platformWhere(platformCol) : and(platformWhere(platformCol), eq(landlordCol, actor.id));
      const invitedByMe = superAdmin
        ? undefined
        : or(
            eq(schema.users.uid, actor.id),
            sql`lower(${schema.users.email}) IN (SELECT lower(${schema.invitations.email}) FROM ${schema.invitations} WHERE ${schema.invitations.landlordId} = ${actor.id})`,
          );
      const userWhere = invitedByMe ? and(platformWhere(schema.users.platformId), invitedByMe) : platformWhere(schema.users.platformId);
      const count = sql<number>`count(*)::int`;

      const [usersByRole, invitesPending, propertyRows, moneyRows, collectionsByMonth, signupsByMonth, maintenanceRows, activity] =
        await Promise.all([
          db.select({role: schema.users.role, n: count}).from(schema.users).where(userWhere).groupBy(schema.users.role),
          db
            .select({n: count})
            .from(schema.invitations)
            .where(
              and(
                scoped(schema.invitations.landlordId, schema.invitations.platformId),
                sql`lower(${schema.invitations.email}) NOT IN (SELECT lower(${schema.users.email}) FROM ${schema.users})`,
              ),
            ),
          db
            .select({type: schema.properties.type, status: schema.properties.status, n: count})
            .from(schema.properties)
            .where(scoped(schema.properties.landlordId, schema.properties.platformId))
            .groupBy(schema.properties.type, schema.properties.status),
          db
            .select({
              collectedThisMonth: sql<string>`coalesce(sum(${schema.rentPayments.amount}) filter (where ${schema.rentPayments.status} = 'paid' and ${schema.rentPayments.paidAt} >= date_trunc('month', now())), 0)`,
              collectedLastMonth: sql<string>`coalesce(sum(${schema.rentPayments.amount}) filter (where ${schema.rentPayments.status} = 'paid' and ${schema.rentPayments.paidAt} >= date_trunc('month', now()) - interval '1 month' and ${schema.rentPayments.paidAt} < date_trunc('month', now())), 0)`,
              overdueCount: sql<number>`(count(*) filter (where ${schema.rentPayments.status} = 'overdue' or (${schema.rentPayments.status} = 'pending' and ${schema.rentPayments.dueDate} < current_date)))::int`,
              overdueAmount: sql<string>`coalesce(sum(${schema.rentPayments.amount}) filter (where ${schema.rentPayments.status} = 'overdue' or (${schema.rentPayments.status} = 'pending' and ${schema.rentPayments.dueDate} < current_date)), 0)`,
              dueSoonAmount: sql<string>`coalesce(sum(${schema.rentPayments.amount}) filter (where ${schema.rentPayments.status} = 'pending' and ${schema.rentPayments.dueDate} >= current_date), 0)`,
            })
            .from(schema.rentPayments)
            .where(scoped(schema.rentPayments.landlordId, schema.rentPayments.platformId)),
          db
            .select({
              month: sql<string>`to_char(date_trunc('month', ${schema.rentPayments.paidAt}), 'YYYY-MM')`,
              amount: sql<string>`sum(${schema.rentPayments.amount})`,
            })
            .from(schema.rentPayments)
            .where(
              and(
                scoped(schema.rentPayments.landlordId, schema.rentPayments.platformId),
                eq(schema.rentPayments.status, 'paid'),
                sql`${schema.rentPayments.paidAt} >= date_trunc('month', now()) - interval '5 months'`,
              ),
            )
            .groupBy(sql`1`),
          db
            .select({month: sql<string>`to_char(date_trunc('month', ${schema.users.createdAt}), 'YYYY-MM')`, n: count})
            .from(schema.users)
            .where(and(userWhere, sql`${schema.users.createdAt} >= date_trunc('month', now()) - interval '5 months'`))
            .groupBy(sql`1`),
          db
            .select({status: schema.maintenanceRequests.status, n: count})
            .from(schema.maintenanceRequests)
            .where(scoped(schema.maintenanceRequests.landlordId, schema.maintenanceRequests.platformId))
            .groupBy(schema.maintenanceRequests.status),
          superAdmin || actor.platformId
            ? db.query.auditLogs.findMany({
                where: superAdmin ? platformWhere(schema.auditLogs.platformId) : eq(schema.auditLogs.platformId, actor.platformId!),
                orderBy: desc(schema.auditLogs.createdAt),
                limit: 8,
                columns: {id: true, action: true, userEmail: true, resource: true, createdAt: true},
              })
            : Promise.resolve([]),
        ]);

      // Last 6 calendar months, oldest first, with zero-filled gaps.
      const months: string[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const collected = new Map(collectionsByMonth.map((r) => [r.month, Number(r.amount)]));
      const signups = new Map(signupsByMonth.map((r) => [r.month, r.n]));
      const money = moneyRows[0];

      res.json({
        users: Object.fromEntries(usersByRole.map((r) => [r.role, r.n])),
        pendingInvites: invitesPending[0]?.n ?? 0,
        properties: propertyRows.map((r) => ({type: r.type, status: r.status, count: r.n})),
        rent: {
          collectedThisMonth: Number(money?.collectedThisMonth ?? 0),
          collectedLastMonth: Number(money?.collectedLastMonth ?? 0),
          overdueCount: money?.overdueCount ?? 0,
          overdueAmount: Number(money?.overdueAmount ?? 0),
          dueSoonAmount: Number(money?.dueSoonAmount ?? 0),
        },
        maintenance: Object.fromEntries(maintenanceRows.map((r) => [r.status, r.n])),
        trend: months.map((month) => ({month, collected: collected.get(month) ?? 0, signups: signups.get(month) ?? 0})),
        activity,
      });
    }),
  );

  bffRouter.post(
    '/admin/impersonation/:uid',
    requireAuth,
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const target = await db.query.users.findFirst({
        where: eq(schema.users.uid, req.params.uid),
        columns: {uid: true, email: true},
      });
      if (!target) {
        res.status(404).json({error: 'User not found'});
        return;
      }
      await recordAudit(req.profile!, 'ADMIN_IMPERSONATE_START', 'user', target.uid, {targetEmail: target.email});
      res.json({ok: true});
    }),
  );

  bffRouter.get(
    '/admin/audit-logs',
    requireAuth,
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const rows = await db.query.auditLogs.findMany({
        where: userId && userId !== 'all' ? eq(schema.auditLogs.userId, userId) : undefined,
        orderBy: desc(schema.auditLogs.createdAt),
        limit: 200,
      });
      res.json(rows);
    }),
  );

  bffRouter.patch(
    '/admin/users/:uid/role',
    requireAuth,
    requireAdmin,
    validateBody(updateRoleSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const {role} = getValidatedBody<z.infer<typeof updateRoleSchema>>(req);
      const target = await db.query.users.findFirst({where: eq(schema.users.uid, req.params.uid)});
      if (!target) {
        res.status(404).json({error: 'Not found'});
        return;
      }

      const isSuper = role === 'superadmin';
      const roleValue = isSuper ? 'admin' : role;
      const nextIsAdmin = roleValue === 'admin' || isSuper;

      // Privilege changes are super-admin only: granting/revoking admin, touching a super
      // admin, or changing one's own role would otherwise let an admin escalate or lock
      // out the platform owner.
      const touchesPrivilege = nextIsAdmin || target.isAdmin || target.isSuperAdmin;
      if (!actor.isSuperAdmin && (touchesPrivilege || target.uid === actor.id)) {
        res.status(403).json({error: 'Only a super admin can change admin privileges or your own role.'});
        return;
      }
      if (actor.isSuperAdmin && target.uid === actor.id && !isSuper) {
        res.status(400).json({error: 'You cannot remove your own super admin role.'});
        return;
      }

      if (!canWriteUser(actor, {uid: target.uid, platformId: target.platformId, isAdmin: nextIsAdmin, isSuperAdmin: isSuper, role: roleValue})) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }

      const [updated] = await db
        .update(schema.users)
        .set({role: roleValue, isAdmin: nextIsAdmin, isSuperAdmin: isSuper})
        .where(eq(schema.users.uid, req.params.uid))
        .returning();
      await recordAudit(req.profile!, 'USER_ROLE_CHANGE', 'user', target.uid, {
        from: {role: target.role, isAdmin: target.isAdmin, isSuperAdmin: target.isSuperAdmin},
        to: {role: roleValue, isAdmin: nextIsAdmin, isSuperAdmin: isSuper},
      });
      res.json(updated);
    }),
  );

  /** Admin-only cascading delete: unlike the landlord version (which just unassigns
   * units), this also deletes every property in the building and the accounts of any
   * tenants assigned to them — matches AdminDashboard's more destructive confirmation. */
  bffRouter.delete(
    '/admin/buildings/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const building = await db.query.buildings.findFirst({where: eq(schema.buildings.id, req.params.id)});
      if (!building) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      if (!canAdministerBuilding(actor, building)) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }

      const props = await db.query.properties.findMany({
        where: eq(schema.properties.buildingId, req.params.id),
        columns: {id: true, tenantId: true},
      });

      // Tenant accounts are NOT deleted here: properties.tenantId is landlord-editable, so a
      // landlord could point it at any email (an admin's included) and have it wiped. Removing
      // the units unassigns the tenants; their accounts are deleted explicitly if needed.
      // One transaction: either the units and the building go, or nothing does.
      await db.transaction(async (tx) => {
        if (props.length > 0) {
          await tx.delete(schema.properties).where(inArray(schema.properties.id, props.map((p) => p.id)));
        }
        await tx.delete(schema.buildings).where(eq(schema.buildings.id, req.params.id));
      });
      invalidatePublicListings();
      await recordAudit(req.profile!, 'BUILDING_DELETE', 'building', req.params.id, {units: props.length});

      res.json({deleted: true});
    }),
  );

  bffRouter.post(
    '/admin/platforms',
    requireAuth,
    requireSuperAdmin,
    inviteSendLimiter,
    validateBody(createPlatformSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof createPlatformSchema>>(req);
      const ownerEmail = body.ownerEmail.toLowerCase();

      const [platform] = await db
        .insert(schema.platforms)
        .values({name: body.name, slug: body.slug, ownerEmail})
        .returning();

      await db
        .insert(schema.invitations)
        .values({email: ownerEmail, displayName: `${body.name} Owner`, role: 'admin', platformId: platform.id})
        .onConflictDoUpdate({
          target: schema.invitations.email,
          set: {displayName: `${body.name} Owner`, role: 'admin', platformId: platform.id},
        });

      res.status(201).json(platform);
    }),
  );

  bffRouter.patch(
    '/admin/platforms/:id/status',
    requireAuth,
    requireSuperAdmin,
    validateBody(z.object({status: z.enum(['active', 'suspended'])}).strict()),
    asyncHandler(async (req, res) => {
      const {status} = getValidatedBody<{status: 'active' | 'suspended'}>(req);
      const [updated] = await db
        .update(schema.platforms)
        .set({status})
        .where(eq(schema.platforms.id, req.params.id))
        .returning();
      if (!updated) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      res.json(updated);
    }),
  );

  bffRouter.put(
    '/platforms/:id/branding',
    requireAuth,
    requireAdmin,
    validateBody(updatePlatformBrandingSchema),
    asyncHandler(async (req, res) => {
      const actor = req.profile!;
      const platformId = req.params.id;
      if (!actor.isSuperAdmin && actor.platformId !== platformId) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      const body = req.validatedBody as z.infer<typeof updatePlatformBrandingSchema>;
      await db.update(schema.platforms).set(body).where(eq(schema.platforms.id, platformId));
      res.json({updated: true});
    }),
  );

  bffRouter.post(
    '/admin/init-platform',
    requireAuth,
    asyncHandler(async (req, res) => {
      const actor = req.profile!;

      if (!actor.isSuperAdmin && !actor.isAdmin && !isAgencyAdmin(actor)) {
        res.status(403).json({error: 'Only admins can init platform'});
        return;
      }

      if (actor.platformId) {
        res.json({status: 'exists', platformId: actor.platformId});
        return;
      }

      // slug is unique+required; derive one from the admin's name plus a uid fragment
      // so it can't collide (platforms.slug has no default, unlike supabase-setup.sql
      // implied — this insert would have violated NOT NULL there too).
      const slugBase = actor.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'platform';
      const slug = `${slugBase}-${actor.uid.slice(0, 8)}`;

      // One system transaction: the platform, the caller's owner membership and their profile
      // link commit together (the membership can't be written under the caller's RLS scope,
      // which has no platform yet).
      const platform = await withSystemAccess(() =>
        db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.platforms)
            .values({name: `${actor.displayName}'s Platform`, slug, status: 'active'})
            .returning({id: schema.platforms.id});
          await tx.update(schema.users).set({platformId: created.id}).where(eq(schema.users.uid, actor.uid));
          await tx
            .insert(schema.platformMemberships)
            .values({platformId: created.id, userId: actor.uid, role: 'owner'})
            .onConflictDoNothing();
          return created;
        }),
      );

      res.json({status: 'created', platformId: platform.id});
    }),
  );
}

import {and, desc, eq, inArray, isNull, or, sql} from 'drizzle-orm';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {canAdministerBuilding, canWriteUser, isSuperAdmin} from '../../db/authz.ts';
import {updatePlatformBrandingSchema} from '../adminHandlers.ts';
import {toActor} from '../types.ts';
import {
  asyncHandler,
  getValidatedBody,
  isAgencyAdmin,
  recordAudit,
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
  validateBody,
} from '../http/middleware.ts';
import {emailSchema} from '../http/schemas.ts';

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
      await recordAudit(req.profile!, 'BUILDING_DELETE', 'building', req.params.id, {units: props.length});

      res.json({deleted: true});
    }),
  );

  bffRouter.post(
    '/admin/platforms',
    requireAuth,
    requireSuperAdmin,
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

      const [platform] = await db
        .insert(schema.platforms)
        .values({name: `${actor.displayName}'s Platform`, slug, status: 'active'})
        .returning({id: schema.platforms.id});

      await db.update(schema.users).set({platformId: platform.id}).where(eq(schema.users.uid, actor.uid));

      res.json({status: 'created', platformId: platform.id});
    }),
  );
}

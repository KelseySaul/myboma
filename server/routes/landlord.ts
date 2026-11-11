import {and, desc, eq, inArray, ne, or, sql} from 'drizzle-orm';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {
  canAdministerBuilding,
  canAdministerProperty,
  canManageProperty,
  canUpdateMaintenanceRequest,
  isAdminInPlatform,
} from '../../db/authz.ts';
import {parseSubscriptionPlan, SUBSCRIPTION_TIERS} from '../../src/lib/landlordSubscription.ts';
import {ensureRentInvoiceForProperty, syncAutomaticRentInvoices} from '../rentInvoiceSync.ts';
import {endLeaseForProperty, endLeasesForTenant, startLease} from '../leases.ts';
import type {UserProfileRecord} from '../types.ts';
import {toActor} from '../types.ts';
import {
  asyncHandler,
  getValidatedBody,
  hasActiveSubscription,
  isAgencyAdmin,
  recordAudit,
  requireAuth,
  unitLimitFor,
  validateBody,
} from '../http/middleware.ts';
import {emailSchema} from '../http/schemas.ts';

/**
 * Resolves the property/building ids a landlord's account can reach: rows they own
 * directly, plus rows for properties they've been added as a manager on. The old
 * client fetched these tables unfiltered and relied on Postgres RLS to narrow the
 * result set to exactly this — see db/authz.ts for the ported policy logic.
 */
async function landlordReach(actorId: string) {
  const managed = await db
    .select({propertyId: schema.propertyManagers.propertyId})
    .from(schema.propertyManagers)
    .where(eq(schema.propertyManagers.userId, actorId));
  const managedPropertyIds = managed.map((m) => m.propertyId);

  let managedBuildingIds: string[] = [];
  if (managedPropertyIds.length > 0) {
    const rows = await db
      .select({buildingId: schema.properties.buildingId})
      .from(schema.properties)
      .where(inArray(schema.properties.id, managedPropertyIds));
    managedBuildingIds = rows.map((r) => r.buildingId).filter((id): id is string => Boolean(id));
  }

  return {managedPropertyIds, managedBuildingIds};
}

const buildingSchema = z.object({name: z.string().min(1).max(160), address: z.string().max(280).optional()}).strict();
const buildingCreateSchema = buildingSchema.extend({
  landlordId: z.string().uuid().optional(),
  platformId: z.string().uuid().nullable().optional(),
}).strict();

/**
 * Resolves who owns a new building/property. Creating for someone else requires being a
 * super admin, a platform admin of the TARGET landlord's platform, or the Pro Plus agency
 * that manages that landlord. Platform scope always comes from the target's row, never the
 * client. Creating for yourself requires an active plan (the UI paywall is not a control).
 */
const resolveAssetOwner = async (
  profile: UserProfileRecord,
  requestedLandlordId?: string,
): Promise<{ok: true; landlordId: string; platformId: string | null; owner: UserProfileRecord} | {ok: false; status: number; error: string}> => {
  if (!requestedLandlordId || requestedLandlordId === profile.uid) {
    const isPlatformAdmin = Boolean(profile.isAdmin || profile.isSuperAdmin);
    if (!isPlatformAdmin && !hasActiveSubscription(profile)) {
      return {ok: false, status: 402, error: 'An active landlord subscription is required.'};
    }
    return {ok: true, landlordId: profile.uid, platformId: profile.platformId ?? null, owner: profile};
  }

  const target = await db.query.users.findFirst({where: eq(schema.users.uid, requestedLandlordId)});
  if (!target) return {ok: false, status: 404, error: 'Landlord not found'};
  const actor = toActor(profile);
  const allowed =
    isAdminInPlatform(actor, target.platformId ?? null) || (isAgencyAdmin(profile) && target.managedByAdminId === profile.uid);
  if (!allowed) return {ok: false, status: 403, error: 'Forbidden'};
  return {ok: true, landlordId: target.uid, platformId: target.platformId ?? null, owner: target as unknown as UserProfileRecord};
};

const propertyInputSchema = z.object({
  buildingId: z.string().uuid().nullable().optional(),
  unitNumber: z.string().max(60).nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  type: z.enum(['residential', 'commercial', 'bnb']),
  price: z.number().min(0),
  location: z.string().min(1).max(280),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
});

const propertyCreateBatchSchema = z
  .object({
    properties: z.array(propertyInputSchema).min(1).max(200),
    landlordId: z.string().uuid().optional(),
    platformId: z.string().uuid().nullable().optional(),
  })
  .strict();

const propertyUpdateSchema = propertyInputSchema
  .partial()
  .extend({
    status: z.enum(['available', 'rented', 'booked']).optional(),
    tenantId: z.string().max(320).nullable().optional(),
    price: z.number().min(0).optional(),
  })
  .strict();

const addManagerSchema = z.object({email: emailSchema, role: z.enum(['manager', 'co-owner']).default('manager')}).strict();

const assignTenantSchema = z.object({propertyId: z.string().uuid(), email: emailSchema}).strict();

const tenantEmailParamSchema = z.object({email: emailSchema}).strict();

const expenseInputSchema = z
  .object({
    propertyId: z.string().uuid().nullable().optional(),
    category: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    amount: z.number().min(0),
    expenseDate: z.string(),
    receiptUrl: z.string().url().nullable().optional(),
  })
  .strict();

export function registerLandlordRoutes(bffRouter: Router) {
  /**
   * Consolidates the landlord dashboard's old buildings + properties + maintenanceRequests
   * + rentPayments + bookings + expenses + invitations + notifications fetches (and their
   * seven Realtime channels) into one polled endpoint, plus the automatic rent-invoice sync
   * that used to run client-side (see server/rentInvoiceSync.ts).
   */
  bffRouter.get(
    '/landlord/dashboard',
    requireAuth,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const {managedPropertyIds, managedBuildingIds} = await landlordReach(actor.id);
      const propertyReach = or(eq(schema.properties.landlordId, actor.id), inArray(schema.properties.id, managedPropertyIds));

      const buildings = await db
        .select()
        .from(schema.buildings)
        .where(or(eq(schema.buildings.landlordId, actor.id), inArray(schema.buildings.id, managedBuildingIds)));

      const properties = await db.select().from(schema.properties).where(propertyReach);
      const propertyIds = properties.map((p) => p.id);

      const requests = propertyIds.length
        ? await db.query.maintenanceRequests.findMany({
            where: or(eq(schema.maintenanceRequests.landlordId, actor.id), inArray(schema.maintenanceRequests.propertyId, propertyIds)),
          })
        : await db.query.maintenanceRequests.findMany({where: eq(schema.maintenanceRequests.landlordId, actor.id)});

      const paymentsWhere = propertyIds.length
        ? or(eq(schema.rentPayments.landlordId, actor.id), inArray(schema.rentPayments.propertyId, propertyIds))
        : eq(schema.rentPayments.landlordId, actor.id);

      const rentPaymentRows = await db.query.rentPayments.findMany({where: paymentsWhere, orderBy: desc(schema.rentPayments.dueDate)});

      // Read-only: invoices are generated by the daily cron and POST /landlord/rent-invoices/sync,
      // never as a side effect of a GET. Independent reads run in parallel.
      const payments = rentPaymentRows.map((p) => ({...p, amount: Number(p.amount)}));

      const [bookings, expenses, invitations, notifications] = await Promise.all([
        db.query.bookings.findMany({
          where: propertyIds.length
            ? or(eq(schema.bookings.landlordId, actor.id), inArray(schema.bookings.propertyId, propertyIds))
            : eq(schema.bookings.landlordId, actor.id),
          orderBy: desc(schema.bookings.startDate),
          limit: 500,
        }),
        db.query.expenses.findMany({
          where: propertyIds.length
            ? or(eq(schema.expenses.landlordId, actor.id), inArray(schema.expenses.propertyId, propertyIds))
            : eq(schema.expenses.landlordId, actor.id),
          orderBy: desc(schema.expenses.expenseDate),
          limit: 1000,
        }),
        // Agency admins see their own platform's invitations; a missing platform matches nothing.
        actor.role === 'admin' && actor.platformId
          ? db.query.invitations.findMany({where: eq(schema.invitations.platformId, actor.platformId)})
          : db.query.invitations.findMany({where: eq(schema.invitations.landlordId, actor.id)}),
        db.query.notifications.findMany({
          where: sql`lower(${schema.notifications.recipientEmail}) = ${actor.email.toLowerCase()}`,
          orderBy: desc(schema.notifications.createdAt),
          limit: 100,
        }),
      ]);

      res.json({buildings, properties, requests, payments, bookings, expenses, invitations, notifications});
    }),
  );

  bffRouter.post(
    '/landlord/rent-invoices/sync',
    requireAuth,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const {managedPropertyIds} = await landlordReach(actor.id);
      const properties = await db
        .select()
        .from(schema.properties)
        .where(or(eq(schema.properties.landlordId, actor.id), inArray(schema.properties.id, managedPropertyIds)));
      const propertyIds = properties.map((p) => p.id);
      const payments = propertyIds.length
        ? await db.query.rentPayments.findMany({where: inArray(schema.rentPayments.propertyId, propertyIds)})
        : [];
      const result = await syncAutomaticRentInvoices(properties as any, payments as any);
      res.json(result);
    }),
  );

  /** Landlords create buildings for themselves; an admin may pass an explicit landlordId
   * (and platformId) to create one on a managed landlord's behalf — mirrors AdminDashboard's
   * "add asset group" flow, which always specifies the target landlord. */
  bffRouter.post(
    '/landlord/buildings',
    requireAuth,
    validateBody(buildingCreateSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof buildingCreateSchema>>(req);
      const owner = await resolveAssetOwner(req.profile!, body.landlordId);
      if ('error' in owner) {
        res.status(owner.status).json({error: owner.error});
        return;
      }
      const {landlordId, platformId} = owner;

      const [building] = await db
        .insert(schema.buildings)
        .values({name: body.name, address: body.address ?? null, landlordId, platformId})
        .returning();
      res.status(201).json(building);
    }),
  );

  bffRouter.patch(
    '/landlord/buildings/:id',
    requireAuth,
    validateBody(buildingSchema.partial()),
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
      const body = getValidatedBody<z.infer<typeof buildingSchema>>(req);
      const [updated] = await db.update(schema.buildings).set(body).where(eq(schema.buildings.id, req.params.id)).returning();
      res.json(updated);
    }),
  );

  bffRouter.delete(
    '/landlord/buildings/:id',
    requireAuth,
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
      await db.delete(schema.buildings).where(eq(schema.buildings.id, req.params.id));
      res.json({deleted: true});
    }),
  );

  /** Landlords create properties for themselves; an admin may pass an explicit landlordId
   * (and platformId) to create on a managed landlord's behalf — mirrors AdminDashboard's
   * "add property"/"bulk add" flows, which always specify the target landlord. */
  bffRouter.post(
    '/landlord/properties',
    requireAuth,
    validateBody(propertyCreateBatchSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof propertyCreateBatchSchema>>(req);
      const owner = await resolveAssetOwner(req.profile!, body.landlordId);
      if ('error' in owner) {
        res.status(owner.status).json({error: owner.error});
        return;
      }
      const {landlordId, platformId} = owner;

      // Plan unit limits, enforced server-side (previously only checked in the browser).
      const limit = unitLimitFor(owner.owner);
      if (limit !== null) {
        const [{count}] = await db
          .select({count: sql<number>`count(*)::int`})
          .from(schema.properties)
          .where(eq(schema.properties.landlordId, landlordId));
        if (count + body.properties.length > limit) {
          res.status(402).json({error: `Your plan allows up to ${limit} units. Upgrade to add more.`});
          return;
        }
      }

      // Units may only be placed in buildings that belong to the same landlord.
      const buildingIds = [...new Set(body.properties.map((p) => p.buildingId).filter((id): id is string => Boolean(id)))];
      if (buildingIds.length) {
        const owned = await db
          .select({id: schema.buildings.id})
          .from(schema.buildings)
          .where(and(inArray(schema.buildings.id, buildingIds), eq(schema.buildings.landlordId, landlordId)));
        if (owned.length !== buildingIds.length) {
          res.status(403).json({error: 'Building does not belong to this landlord'});
          return;
        }
      }

      const inserted = await db
        .insert(schema.properties)
        .values(
          body.properties.map((p) => ({
            ...p,
            landlordId,
            platformId,
            status: 'available' as const,
            price: String(p.price),
          })),
        )
        .returning();
      res.status(201).json(inserted);
    }),
  );

  bffRouter.patch(
    '/landlord/properties/:id',
    requireAuth,
    validateBody(propertyUpdateSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const property = await db.query.properties.findFirst({where: eq(schema.properties.id, req.params.id)});
      if (!property) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      if (!(await canManageProperty(actor, property))) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }

      const body = getValidatedBody<z.infer<typeof propertyUpdateSchema>>(req);
      if (body.price !== undefined && Number(body.price) !== Number(property.price) && !(await canAdministerProperty(actor, property))) {
        res.status(403).json({error: 'Only the owner or a co-owner can change the rent'});
        return;
      }
      if (body.buildingId) {
        const building = await db.query.buildings.findFirst({
          where: and(eq(schema.buildings.id, body.buildingId), eq(schema.buildings.landlordId, property.landlordId)),
          columns: {id: true},
        });
        if (!building) {
          res.status(403).json({error: 'Building does not belong to this landlord'});
          return;
        }
      }
      const [updated] = await db
        .update(schema.properties)
        .set({
          ...body,
          tenantId: body.tenantId === undefined ? undefined : body.tenantId ? body.tenantId.trim().toLowerCase() : null,
          price: body.price !== undefined ? String(body.price) : undefined,
        })
        .where(eq(schema.properties.id, req.params.id))
        .returning();

      if (body.tenantId !== undefined || body.status !== undefined) {
        if (updated.status === 'rented' && updated.tenantId) await startLease(updated, updated.tenantId);
        else if (!updated.tenantId || updated.status === 'available') await endLeaseForProperty(updated.id);
      }

      if (updated.status === 'rented' && updated.tenantId) {
        // Invoices always belong to the property's owner (never the manager/admin editing it),
        // because landlordId drives Stripe transfers and M-Pesa B2C payouts.
        const payments = await db.query.rentPayments.findMany({where: eq(schema.rentPayments.propertyId, updated.id)});
        await ensureRentInvoiceForProperty(updated as any, updated.tenantId, updated.landlordId, updated.platformId, payments as any);
      }

      res.json(updated);
    }),
  );

  bffRouter.delete(
    '/landlord/properties/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const property = await db.query.properties.findFirst({where: eq(schema.properties.id, req.params.id)});
      if (!property) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      if (!(await canAdministerProperty(actor, property))) {
        res.status(403).json({error: 'Only the owner or a co-owner can delete a unit'});
        return;
      }
      await db.delete(schema.properties).where(eq(schema.properties.id, req.params.id));
      await recordAudit(req.profile!, 'PROPERTY_DELETE', 'property', property.id, {title: property.title});
      res.json({deleted: true});
    }),
  );

  /** Ports the add_property_manager Postgres RPC (supabase-setup.sql) — only the actual
   * landlord who owns the property may add managers to it, matching the RPC's own check. */
  bffRouter.post(
    '/landlord/properties/:id/managers',
    requireAuth,
    validateBody(addManagerSchema),
    asyncHandler(async (req, res) => {
      const actor = req.profile!;
      const body = getValidatedBody<z.infer<typeof addManagerSchema>>(req);
      const property = await db.query.properties.findFirst({where: eq(schema.properties.id, req.params.id)});
      if (!property) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      if (property.landlordId !== actor.uid && !actor.isSuperAdmin) {
        res.status(403).json({error: 'You do not have permission to add managers to this property.'});
        return;
      }
      const targetUser = await db.query.users.findFirst({where: sql`lower(${schema.users.email}) = ${body.email.toLowerCase()}`});
      if (!targetUser) {
        res.status(404).json({error: 'No user found with that email address.'});
        return;
      }
      await db
        .insert(schema.propertyManagers)
        .values({propertyId: property.id, userId: targetUser.uid, landlordId: property.landlordId, role: body.role})
        .onConflictDoNothing();
      res.status(201).json({added: true});
    }),
  );

  bffRouter.post(
    '/landlord/tenants/assign',
    requireAuth,
    validateBody(assignTenantSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const body = getValidatedBody<z.infer<typeof assignTenantSchema>>(req);
      const property = await db.query.properties.findFirst({where: eq(schema.properties.id, body.propertyId)});
      if (!property) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      if (!(await canManageProperty(actor, property))) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }

      const tenantEmail = body.email.toLowerCase();
      const [updated] = await db
        .update(schema.properties)
        .set({tenantId: tenantEmail, status: 'rented'})
        .where(eq(schema.properties.id, body.propertyId))
        .returning();
      await startLease(updated, tenantEmail);

      const payments = await db.query.rentPayments.findMany({where: eq(schema.rentPayments.propertyId, updated.id)});
      await ensureRentInvoiceForProperty(updated as any, tenantEmail, updated.landlordId, updated.platformId, payments as any, true);

      res.json({assigned: true, property: updated});
    }),
  );

  /** Unassigns a tenant from every property matching this landlord's account and cancels
   * their unpaid invoices, without deleting the invitation (tenant registry entry). */
  bffRouter.post(
    '/landlord/tenants/:email/unassign',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = tenantEmailParamSchema.safeParse({email: req.params.email});
      if (!parsed.success) {
        res.status(400).json({error: 'Invalid email'});
        return;
      }
      const actor = req.profile!;
      const email = parsed.data.email.toLowerCase();

      await db
        .update(schema.properties)
        .set({tenantId: null, status: 'available'})
        .where(and(sql`lower(${schema.properties.tenantId}) = ${email}`, eq(schema.properties.landlordId, actor.uid)));
      await db
        .delete(schema.rentPayments)
        .where(and(sql`lower(${schema.rentPayments.tenantId}) = ${email}`, eq(schema.rentPayments.landlordId, actor.uid), ne(schema.rentPayments.status, 'paid')));

      await endLeasesForTenant(email, undefined, actor.uid);
      res.json({unassigned: true});
    }),
  );

  bffRouter.delete(
    '/landlord/tenants/:email',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = tenantEmailParamSchema.safeParse({email: req.params.email});
      if (!parsed.success) {
        res.status(400).json({error: 'Invalid email'});
        return;
      }
      const actor = req.profile!;
      const email = parsed.data.email.toLowerCase();

      await db.delete(schema.invitations).where(and(sql`lower(${schema.invitations.email}) = ${email}`, eq(schema.invitations.landlordId, actor.uid)));
      await db
        .update(schema.properties)
        .set({tenantId: null, status: 'available'})
        .where(and(sql`lower(${schema.properties.tenantId}) = ${email}`, eq(schema.properties.landlordId, actor.uid)));
      await db
        .delete(schema.rentPayments)
        .where(and(sql`lower(${schema.rentPayments.tenantId}) = ${email}`, eq(schema.rentPayments.landlordId, actor.uid), ne(schema.rentPayments.status, 'paid')));

      await endLeasesForTenant(email, undefined, actor.uid);
      res.json({deleted: true});
    }),
  );

  bffRouter.patch(
    '/landlord/maintenance-requests/:id',
    requireAuth,
    validateBody(z.object({status: z.enum(['pending', 'in-progress', 'resolved'])}).strict()),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const request = await db.query.maintenanceRequests.findFirst({where: eq(schema.maintenanceRequests.id, req.params.id)});
      if (!request) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      if (!(await canUpdateMaintenanceRequest(actor, request))) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      // The maintenance hub is a Pro/Pro Plus feature of the unit owner's plan.
      if (!actor.isAdmin && !actor.isSuperAdmin) {
        const owner = await db.query.users.findFirst({where: eq(schema.users.uid, request.landlordId)});
        const tier = parseSubscriptionPlan(owner?.subscriptionPlan)?.tier;
        const entitled =
          Boolean(owner) &&
          hasActiveSubscription(owner as unknown as UserProfileRecord) &&
          Boolean(tier && SUBSCRIPTION_TIERS[tier].features.maintenanceHub);
        if (!entitled && !(owner && (owner.isAdmin || owner.isSuperAdmin))) {
          res.status(402).json({error: 'The maintenance hub requires a Pro or Pro Plus plan.'});
          return;
        }
      }
      const {status} = getValidatedBody<{status: 'pending' | 'in-progress' | 'resolved'}>(req);
      const [updated] = await db
        .update(schema.maintenanceRequests)
        .set({status})
        .where(eq(schema.maintenanceRequests.id, req.params.id))
        .returning();
      res.json(updated);
    }),
  );

  bffRouter.post(
    '/landlord/expenses',
    requireAuth,
    validateBody(expenseInputSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof expenseInputSchema>>(req);
      const actor = req.profile!;
      if (body.propertyId) {
        const property = await db.query.properties.findFirst({where: eq(schema.properties.id, body.propertyId)});
        if (!property || !(await canManageProperty(toActor(actor), property))) {
          res.status(403).json({error: 'You can only record expenses against your own units'});
          return;
        }
      }
      const [expense] = await db
        .insert(schema.expenses)
        .values({...body, amount: String(body.amount), landlordId: actor.uid, platformId: actor.platformId ?? null})
        .returning();
      res.status(201).json(expense);
    }),
  );
}

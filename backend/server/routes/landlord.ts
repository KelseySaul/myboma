import {and, desc, eq, inArray, like, ne, or, sql} from 'drizzle-orm';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {withSystemAccess} from '../../db/requestContext.ts';
import {
  canAdministerBuilding,
  canAdministerProperty,
  canManageProperty,
  canUpdateCaretakerReport,
  canUpdateMaintenanceRequest,
  isAdminInPlatform,
  isAgencyManagerOfLandlord,
  isSuperAdmin,
} from '../../db/authz.ts';
import {parseSubscriptionPlan, SUBSCRIPTION_TIERS} from '../../../shared/landlordSubscription.ts';
import {ensureRentInvoiceForProperty, syncAutomaticRentInvoices} from '../rentInvoiceSync.ts';
import {endLeaseForProperty, endLeasesForTenant, startLease} from '../leases.ts';
import {normalizeMediaArray, normalizeStoredFileUrl} from '../http/fileUrls.ts';
import {insertNotification} from '../services/notify.ts';
import type {UserProfileRecord} from '../types.ts';
import {toActor} from '../types.ts';
import {
  asyncHandler,
  buildingLimitFor,
  getValidatedBody,
  hasActiveSubscription,
  inviteSendLimiter,
  isAgencyAdmin,
  recordAudit,
  requireAuth,
  unitLimitFor,
  isOnFreePlan,
  FREE_PLAN_BUILDING_ERROR,
  validateBody,
} from '../http/middleware.ts';
import {emailSchema, mediaUrlSchema, parseAccountIdsParam} from '../http/schemas.ts';
import {invalidatePublicListings} from '../http/cache.ts';
import {createAndSendInvite} from '../inviteService.ts';
import {INVITE_IDENTIFIER_PREFIX, parseInvitePayload, type InvitePayload} from '../invitePolicy.ts';

/**
 * Resolves the property/building ids one or more landlord accounts can reach: rows they
 * own directly, plus rows for properties they've been added as a manager on.
 */
async function landlordReachMany(actorIds: string[]) {
  if (actorIds.length === 0) return {managedPropertyIds: [] as string[], managedBuildingIds: [] as string[]};
  const managed = await db
    .select({propertyId: schema.propertyManagers.propertyId})
    .from(schema.propertyManagers)
    .where(inArray(schema.propertyManagers.userId, actorIds));
  const managedPropertyIds = [...new Set(managed.map((m) => m.propertyId))];

  let managedBuildingIds: string[] = [];
  if (managedPropertyIds.length > 0) {
    const rows = await db
      .select({buildingId: schema.properties.buildingId})
      .from(schema.properties)
      .where(inArray(schema.properties.id, managedPropertyIds));
    managedBuildingIds = [...new Set(rows.map((r) => r.buildingId).filter((id): id is string => Boolean(id)))];
  }

  return {managedPropertyIds, managedBuildingIds};
}

const landlordReach = (actorId: string) => landlordReachMany([actorId]);

const buildingFields = {
  name: z.string().min(1).max(160),
  address: z.string().max(280).optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
};

const requireCoordinatePair = (
  value: {latitude?: number | null; longitude?: number | null},
  ctx: z.RefinementCtx,
) => {
  const hasLatitude = value.latitude !== undefined && value.latitude !== null;
  const hasLongitude = value.longitude !== undefined && value.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: 'custom',
      message: 'Latitude and longitude must be provided together.',
      path: hasLatitude ? ['longitude'] : ['latitude'],
    });
  }
};

const buildingCreateSchema = z.object({
  ...buildingFields,
  landlordId: z.string().uuid().optional(),
  platformId: z.string().uuid().nullable().optional(),
}).strict().superRefine(requireCoordinatePair);
const buildingUpdateSchema = z.object({
  name: buildingFields.name.optional(),
  address: buildingFields.address,
  latitude: buildingFields.latitude,
  longitude: buildingFields.longitude,
}).strict().superRefine(requireCoordinatePair);

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
    receiptUrl: mediaUrlSchema.nullable().optional(),
  })
  .strict();

const updateCaretakerReportSchema = z
  .object({
    status: z.enum(['open', 'acknowledged', 'resolved']),
    landlordNotes: z.string().trim().max(2000).nullable().optional(),
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
      const superAdmin = isSuperAdmin(actor);
      const hasAccountFilterParam = req.query.accountIds !== undefined;

      // Super admins may pass `?accountIds=uuid1,uuid2` to inspect one, multiple, or their
      // own accounts across Maintenance, Rent & Payments, Tenants, and Notifications.
      // Passing an empty filter returns empty collections instead of leaking unscoped data.
      let targetIds = [actor.id];
      let targetEmails = [actor.email.toLowerCase()];
      let superMultiScoped = false;

      if (superAdmin && hasAccountFilterParam) {
        superMultiScoped = true;
        targetIds = parseAccountIdsParam(req.query.accountIds);
        if (targetIds.length === 0) {
          res.json({
            buildings: [],
            properties: [],
            requests: [],
            payments: [],
            bookings: [],
            expenses: [],
            invitations: [],
            notifications: [],
            leases: [],
            registeredEmails: [],
            caretakers: [],
            caretakerReports: [],
          });
          return;
        }
        const selectedAccounts = await db.query.users.findMany({
          where: inArray(schema.users.uid, targetIds),
          columns: {uid: true, email: true},
        });
        targetIds = selectedAccounts.map((u) => u.uid);
        targetEmails = selectedAccounts.map((u) => u.email.toLowerCase());
        if (targetIds.length === 0) {
          res.json({
            buildings: [],
            properties: [],
            requests: [],
            payments: [],
            bookings: [],
            expenses: [],
            invitations: [],
            notifications: [],
            leases: [],
            registeredEmails: [],
            caretakers: [],
            caretakerReports: [],
          });
          return;
        }
      }

      if (!superMultiScoped && isAgencyAdmin(req.profile!)) {
        const managedLandlords = await db
          .select({uid: schema.users.uid, email: schema.users.email})
          .from(schema.users)
          .where(eq(schema.users.managedByAdminId, actor.id));
        if (managedLandlords.length > 0) {
          targetIds = [...new Set([...targetIds, ...managedLandlords.map((l) => l.uid)])];
        }
      }

      const {managedPropertyIds, managedBuildingIds} = await landlordReachMany(targetIds);
      const propertyReach = managedPropertyIds.length
        ? or(inArray(schema.properties.landlordId, targetIds), inArray(schema.properties.id, managedPropertyIds))
        : inArray(schema.properties.landlordId, targetIds);

      const buildings = await db
        .select()
        .from(schema.buildings)
        .where(
          managedBuildingIds.length
            ? or(inArray(schema.buildings.landlordId, targetIds), inArray(schema.buildings.id, managedBuildingIds))
            : inArray(schema.buildings.landlordId, targetIds),
        );

      const properties = await db.select().from(schema.properties).where(propertyReach);
      const propertyIds = properties.map((p) => p.id);

      const requests = propertyIds.length
        ? await db.query.maintenanceRequests.findMany({
            where: or(inArray(schema.maintenanceRequests.landlordId, targetIds), inArray(schema.maintenanceRequests.propertyId, propertyIds)),
            orderBy: desc(schema.maintenanceRequests.createdAt),
          })
        : await db.query.maintenanceRequests.findMany({
            where: inArray(schema.maintenanceRequests.landlordId, targetIds),
            orderBy: desc(schema.maintenanceRequests.createdAt),
          });

      const paymentsWhere = propertyIds.length
        ? or(inArray(schema.rentPayments.landlordId, targetIds), inArray(schema.rentPayments.propertyId, propertyIds))
        : inArray(schema.rentPayments.landlordId, targetIds);

      const rentPaymentRows = await db.query.rentPayments.findMany({where: paymentsWhere, orderBy: desc(schema.rentPayments.dueDate)});

      // Read-only: invoices are generated by the daily cron and POST /landlord/rent-invoices/sync,
      // never as a side effect of a GET. Independent reads run in parallel.
      const payments = rentPaymentRows.map((p) => ({...p, amount: Number(p.amount)}));

      const [bookings, expenses, invitations, notifications] = await Promise.all([
        db.query.bookings.findMany({
          where: propertyIds.length
            ? or(inArray(schema.bookings.landlordId, targetIds), inArray(schema.bookings.propertyId, propertyIds))
            : inArray(schema.bookings.landlordId, targetIds),
          orderBy: desc(schema.bookings.startDate),
          limit: 500,
        }),
        db.query.expenses.findMany({
          where: propertyIds.length
            ? or(inArray(schema.expenses.landlordId, targetIds), inArray(schema.expenses.propertyId, propertyIds))
            : inArray(schema.expenses.landlordId, targetIds),
          orderBy: desc(schema.expenses.expenseDate),
          limit: 1000,
        }),
        // Agency admins see their own platform's invitations; superadmins with account filter
        // see invitations sent by the selected account(s); landlords see invitations they sent.
        !superMultiScoped && actor.role === 'admin' && actor.platformId
          ? db.query.invitations.findMany({
              where: eq(schema.invitations.platformId, actor.platformId),
              orderBy: desc(schema.invitations.createdAt),
            })
          : db.query.invitations.findMany({
              where: inArray(schema.invitations.landlordId, targetIds),
              orderBy: desc(schema.invitations.createdAt),
            }),
        targetEmails.length
          ? db.query.notifications.findMany({
              where: inArray(sql`lower(${schema.notifications.recipientEmail})`, targetEmails),
              orderBy: desc(schema.notifications.createdAt),
              limit: 200,
            })
          : Promise.resolve([]),
      ]);

      // Lease terms for the tenant list, registered accounts, caretakers, and caretaker reports.
      const invitedEmails = invitations.map((i) => i.email.toLowerCase());
      const [leases, invitedAccounts, caretakers, caretakerReportRows] = await Promise.all([
        propertyIds.length
          ? db.query.leases.findMany({
              where: and(inArray(schema.leases.propertyId, propertyIds), eq(schema.leases.status, 'active')),
              columns: {id: true, propertyId: true, tenantEmail: true, startDate: true, endDate: true, rentAmount: true, dueDay: true, depositAmount: true},
            })
          : Promise.resolve([]),
        invitedEmails.length
          ? db
              .select({email: schema.users.email})
              .from(schema.users)
              .where(inArray(sql`lower(${schema.users.email})`, invitedEmails))
          : Promise.resolve([] as {email: string}[]),
        db.query.users.findMany({
          where: and(inArray(schema.users.managedByAdminId, targetIds), eq(schema.users.role, 'caretaker')),
          columns: {
            uid: true,
            email: true,
            displayName: true,
            phone: true,
            avatarUrl: true,
            status: true,
            createdAt: true,
            managedByAdminId: true,
          },
          orderBy: desc(schema.users.createdAt),
        }),
        db.query.caretakerReports.findMany({
          where: inArray(schema.caretakerReports.landlordId, targetIds),
          orderBy: desc(schema.caretakerReports.createdAt),
          limit: 300,
        }),
      ]);
      const registeredEmails = invitedAccounts.map((u) => u.email.toLowerCase());
      const caretakerByUid = new Map(caretakers.map((c) => [c.uid, c]));

      res.json({
        buildings,
        properties: properties.map((p) => ({
          ...p,
          price: Number(p.price),
          images: normalizeMediaArray(req, p.images),
        })),
        requests,
        payments: payments.map((p) => ({
          ...p,
          receiptUrl: p.receiptUrl ? normalizeStoredFileUrl(req, p.receiptUrl) : p.receiptUrl,
        })),
        bookings,
        expenses: expenses.map((e) => ({
          ...e,
          amount: Number(e.amount),
          receiptUrl: e.receiptUrl ? normalizeStoredFileUrl(req, e.receiptUrl) : e.receiptUrl,
        })),
        invitations,
        notifications,
        leases: leases.map((l) => ({...l, rentAmount: Number(l.rentAmount), depositAmount: Number(l.depositAmount)})),
        registeredEmails,
        caretakers: caretakers.map((c) => ({
          ...c,
          avatarUrl: c.avatarUrl ? normalizeStoredFileUrl(req, c.avatarUrl) : null,
        })),
        caretakerReports: caretakerReportRows.map((rep) => ({
          ...rep,
          images: normalizeMediaArray(req, rep.images),
          caretakerName: caretakerByUid.get(rep.caretakerId)?.displayName ?? null,
          caretakerEmail: caretakerByUid.get(rep.caretakerId)?.email ?? null,
          caretakerPhone: caretakerByUid.get(rep.caretakerId)?.phone ?? null,
        })),
      });
    }),
  );

  /** Landlords (and admins/superadmins) can resend a pending invitation they created. */
  bffRouter.post(
    '/landlord/invitations/resend',
    requireAuth,
    inviteSendLimiter,
    validateBody(z.object({email: emailSchema}).strict()),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const {email} = getValidatedBody<{email: string}>(req);
      const target = email.trim().toLowerCase();
      const invitation = await db.query.invitations.findFirst({where: sql`lower(${schema.invitations.email}) = ${target}`});
      if (!invitation) {
        res.status(404).json({error: 'No pending invitation found for that email.'});
        return;
      }
      const allowed =
        isSuperAdmin(actor) ||
        invitation.landlordId === actor.id ||
        (actor.isAdmin && actor.platformId && invitation.platformId === actor.platformId);
      if (!allowed) {
        res.status(403).json({error: 'You can only resend invitations you created.'});
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
          landlordId: previous?.landlordId ?? invitation.landlordId ?? actor.id,
          invitedBy: actor.id,
          invitedByName: req.profile!.displayName || 'MyBoma',
          displayName: previous?.displayName ?? invitation.displayName ?? null,
          phone: previous?.phone ?? invitation.phone ?? null,
          profile: previous?.profile ?? {},
        });
        await recordAudit(req.profile!, 'INVITE_RESENT', 'invitation', target);
        res.json({ok: true, expiresAt});
      } catch (err) {
        console.error('[Landlord Invite] Resend failed:', err);
        res.status(502).json({error: 'The email could not be sent. Try again shortly.'});
      }
    }),
  );

  /** Cancels a pending invitation created by this landlord (or any invite, for superadmin). */
  bffRouter.delete(
    '/landlord/invitations/:email',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = tenantEmailParamSchema.safeParse({email: req.params.email});
      if (!parsed.success) {
        res.status(400).json({error: 'Invalid email'});
        return;
      }
      const actor = toActor(req.profile!);
      const target = parsed.data.email.toLowerCase();
      const invitation = await db.query.invitations.findFirst({where: sql`lower(${schema.invitations.email}) = ${target}`});
      if (!invitation) {
        res.status(404).json({error: 'Invitation not found'});
        return;
      }
      const allowed =
        isSuperAdmin(actor) ||
        invitation.landlordId === actor.id ||
        (actor.isAdmin && actor.platformId && invitation.platformId === actor.platformId);
      if (!allowed) {
        res.status(403).json({error: 'You can only cancel invitations you created.'});
        return;
      }

      const ownerLandlordId = invitation.landlordId ?? actor.id;
      await db.delete(schema.invitations).where(sql`lower(${schema.invitations.email}) = ${target}`);
      await db
        .update(schema.properties)
        .set({tenantId: null, status: 'available'})
        .where(and(sql`lower(${schema.properties.tenantId}) = ${target}`, eq(schema.properties.landlordId, ownerLandlordId)));
      await db
        .delete(schema.rentPayments)
        .where(and(sql`lower(${schema.rentPayments.tenantId}) = ${target}`, eq(schema.rentPayments.landlordId, ownerLandlordId), ne(schema.rentPayments.status, 'paid')));
      invalidatePublicListings();
      await endLeasesForTenant(target, undefined, ownerLandlordId);
      await recordAudit(req.profile!, 'INVITE_CANCELLED', 'invitation', target);
      res.json({deleted: true});
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
      const bLimit = buildingLimitFor(owner.owner);
      if (bLimit !== null) {
        const [{count}] = await db
          .select({count: sql<number>`count(*)::int`})
          .from(schema.buildings)
          .where(eq(schema.buildings.landlordId, landlordId));
        if (count >= bLimit) {
          res.status(402).json({
            error: `Your plan allows up to ${bLimit} ${bLimit === 1 ? 'building' : 'buildings'}. Upgrade to add more.`,
          });
          return;
        }
      }

      const [building] = await db
        .insert(schema.buildings)
        .values({
          name: body.name,
          address: body.address ?? null,
          latitude: body.latitude == null ? null : String(body.latitude),
          longitude: body.longitude == null ? null : String(body.longitude),
          landlordId,
          platformId,
        })
        .returning();
      res.status(201).json(building);
    }),
  );

  bffRouter.patch(
    '/landlord/buildings/:id',
    requireAuth,
    validateBody(buildingUpdateSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const building = await db.query.buildings.findFirst({where: eq(schema.buildings.id, req.params.id)});
      if (!building) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      if (!canAdministerBuilding(actor, building) && !(await isAgencyManagerOfLandlord(actor, building.landlordId))) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      const body = getValidatedBody<z.infer<typeof buildingUpdateSchema>>(req);
      const {latitude, longitude, ...buildingFields} = body;
      const update = {
        ...buildingFields,
        ...(latitude === undefined ? {} : {latitude: latitude == null ? null : String(latitude)}),
        ...(longitude === undefined ? {} : {longitude: longitude == null ? null : String(longitude)}),
      };
      const [updated] = await db.update(schema.buildings).set(update).where(eq(schema.buildings.id, req.params.id)).returning();
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
      if (!canAdministerBuilding(actor, building) && !(await isAgencyManagerOfLandlord(actor, building.landlordId))) {
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
      invalidatePublicListings();
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
      invalidatePublicListings();

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
      invalidatePublicListings();
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
      invalidatePublicListings();
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

      invalidatePublicListings();
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

      invalidatePublicListings();
      await endLeasesForTenant(email, undefined, actor.uid);
      res.json({deleted: true});
    }),
  );

  bffRouter.patch(
    '/landlord/maintenance-requests/:id',
    requireAuth,
    validateBody(
      z
        .object({
          status: z.enum(['pending', 'in-progress', 'resolved']),
          resolutionNotes: z.string().trim().max(2000).nullable().optional(),
        })
        .strict(),
    ),
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
      if (!actor.isAdmin && !actor.isSuperAdmin && actor.role !== 'caretaker') {
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
      const {status, resolutionNotes} = getValidatedBody<{
        status: 'pending' | 'in-progress' | 'resolved';
        resolutionNotes?: string | null;
      }>(req);
      const [updated] = await db
        .update(schema.maintenanceRequests)
        .set({
          status,
          ...(resolutionNotes !== undefined ? {resolutionNotes} : {}),
          updatedById: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.maintenanceRequests.id, req.params.id))
        .returning();
      res.json(updated);
    }),
  );

  /** Landlord reviews, acknowledges, or resolves a report filed by one of their caretakers. */
  bffRouter.patch(
    '/landlord/caretaker-reports/:id',
    requireAuth,
    validateBody(updateCaretakerReportSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const report = await db.query.caretakerReports.findFirst({
        where: eq(schema.caretakerReports.id, req.params.id),
      });
      if (!report) {
        res.status(404).json({error: 'Caretaker report not found'});
        return;
      }
      if (!canUpdateCaretakerReport(actor, report)) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }

      const body = getValidatedBody<z.infer<typeof updateCaretakerReportSchema>>(req);
      const [updated] = await db
        .update(schema.caretakerReports)
        .set({
          status: body.status,
          ...(body.landlordNotes !== undefined ? {landlordNotes: body.landlordNotes} : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.caretakerReports.id, req.params.id))
        .returning();

      const caretaker = await db.query.users.findFirst({
        where: eq(schema.users.uid, report.caretakerId),
        columns: {email: true},
      });
      if (caretaker?.email) {
        const noteText = body.landlordNotes ? ` Note: "${body.landlordNotes}"` : '';
        await insertNotification({
          recipientEmail: caretaker.email.toLowerCase(),
          platformId: report.platformId,
          type: 'caretaker_report',
          title: `Report ${body.status}: ${report.title}`,
          message: `${req.profile!.displayName || 'Your landlord'} marked your report "${report.title}" as ${body.status}.${noteText}`,
          propertyId: report.propertyId,
          read: false,
        }).catch(() => undefined);
      }

      await recordAudit(req.profile!, 'CARETAKER_REPORT_UPDATE', 'caretaker_report', updated.id, {status: body.status});
      res.json({...updated, images: normalizeMediaArray(req, updated.images)});
    }),
  );

  /** Landlord removes a caretaker account from their team (revokes caretaker link + manager assignments). */
  bffRouter.delete(
    '/landlord/caretakers/:uid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const targetUid = req.params.uid;
      const caretaker = await db.query.users.findFirst({
        where: eq(schema.users.uid, targetUid),
        columns: {uid: true, email: true, role: true, managedByAdminId: true},
      });
      if (!caretaker || caretaker.role !== 'caretaker') {
        res.status(404).json({error: 'Caretaker not found'});
        return;
      }
      if (!isSuperAdmin(actor) && caretaker.managedByAdminId !== actor.id) {
        res.status(403).json({error: 'You can only remove caretakers on your own team.'});
        return;
      }

      await withSystemAccess(() =>
        db.transaction(async (tx) => {
          await tx
            .delete(schema.propertyManagers)
            .where(and(eq(schema.propertyManagers.userId, targetUid), eq(schema.propertyManagers.landlordId, caretaker.managedByAdminId ?? actor.id)));
          await tx
            .update(schema.users)
            .set({managedByAdminId: null, status: 'suspended'})
            .where(eq(schema.users.uid, targetUid));
          await tx
            .delete(schema.invitations)
            .where(and(sql`lower(${schema.invitations.email}) = ${caretaker.email.toLowerCase()}`, eq(schema.invitations.role, 'caretaker')));
        }),
      );
      await recordAudit(req.profile!, 'CARETAKER_REMOVED', 'user', targetUid, {email: caretaker.email});
      res.json({removed: true});
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

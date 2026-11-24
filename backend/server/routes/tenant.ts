import {desc, eq, or, sql} from 'drizzle-orm';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {canCreateMaintenanceRequest} from '../../db/authz.ts';
import {toActor} from '../types.ts';
import {asyncHandler, getValidatedBody, requireAuth, validateBody} from '../http/middleware.ts';

const createMaintenanceRequestSchema = z
  .object({
    propertyId: z.string().uuid(),
    landlordId: z.string().uuid(),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(2000),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
  })
  .strict();

export function registerTenantRoutes(bffRouter: Router) {
  /**
   * Consolidates the tenant dashboard's old property + landlord + maintenanceRequests +
   * rentPayments + notifications fetches (and their four Realtime channels) into one
   * polled endpoint. tenantId columns historically hold either the tenant's email or uid
   * (see db/authz.ts), so both are matched, exactly like the old tenantRentOrFilter.
   */
  bffRouter.get(
    '/tenant/dashboard',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uid = req.profile!.uid;
      const email = req.profile!.email.toLowerCase();
      const tenantMatch = (column: typeof schema.properties.tenantId | typeof schema.rentPayments.tenantId) =>
        or(eq(column, email), eq(column, uid));

      // A tenant can rent more than one unit; return all of them (newest first) and keep
      // `property` as the primary one so existing clients keep working deterministically.
      const tenantProperties = await db.query.properties.findMany({
        where: or(sql`lower(${schema.properties.tenantId}) = ${email}`, eq(schema.properties.tenantId, uid)),
        orderBy: desc(schema.properties.createdAt),
      });
      const property = tenantProperties[0] ?? null;

      let landlord = null;
      if (property) {
        const landlordRow = await db.query.users.findFirst({
          where: eq(schema.users.uid, property.landlordId),
          columns: {
            uid: true, displayName: true, email: true, phone: true, bankName: true,
            bankAccountNumber: true, bankAccountName: true, rentRecipientId: true,
            rentPayoutMethod: true, mpesaSettlementPhone: true,
          },
        });
        if (landlordRow?.rentRecipientId && landlordRow.rentRecipientId !== landlordRow.uid) {
          landlord = (await db.query.users.findFirst({
            where: eq(schema.users.uid, landlordRow.rentRecipientId),
            columns: {
              uid: true, displayName: true, email: true, phone: true, bankName: true,
              bankAccountNumber: true, bankAccountName: true, rentPayoutMethod: true, mpesaSettlementPhone: true,
            },
          })) ?? landlordRow;
        } else {
          landlord = landlordRow ?? null;
        }
      }

      const requests = await db.query.maintenanceRequests.findMany({where: eq(schema.maintenanceRequests.tenantId, uid)});

      const payments = await db.query.rentPayments.findMany({
        where: tenantMatch(schema.rentPayments.tenantId),
        orderBy: desc(schema.rentPayments.dueDate),
      });

      const notifications = await db.query.notifications.findMany({
        where: sql`lower(${schema.notifications.recipientEmail}) = ${email}`,
        orderBy: desc(schema.notifications.createdAt),
      });

      const leases = await db.query.leases.findMany({
        where: or(eq(schema.leases.tenantUserId, uid), sql`lower(${schema.leases.tenantEmail}) = ${email}`),
        orderBy: desc(schema.leases.startDate),
      });

      res.json({property, properties: tenantProperties, leases, landlord, requests, payments, notifications});
    }),
  );

  bffRouter.post(
    '/tenant/maintenance-requests',
    requireAuth,
    validateBody(createMaintenanceRequestSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof createMaintenanceRequestSchema>>(req);
      const actor = toActor(req.profile!);

      if (!canCreateMaintenanceRequest(actor, actor.id)) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }

      // The request must be for the unit the caller actually rents; landlord and platform
      // come from the property row, never from the client.
      const property = await db.query.properties.findFirst({
        where: eq(schema.properties.id, body.propertyId),
        columns: {id: true, landlordId: true, platformId: true, tenantId: true},
      });
      const tenantRef = String(property?.tenantId ?? '').toLowerCase();
      if (!property || (tenantRef !== actor.email.toLowerCase() && tenantRef !== actor.id.toLowerCase())) {
        res.status(403).json({error: 'You can only file maintenance requests for your own unit'});
        return;
      }

      const [request] = await db
        .insert(schema.maintenanceRequests)
        .values({
          tenantId: actor.id,
          propertyId: property.id,
          landlordId: property.landlordId,
          platformId: property.platformId,
          title: body.title,
          description: body.description,
          priority: body.priority,
          status: 'pending',
        })
        .returning();

      res.status(201).json(request);
    }),
  );
}

import {and, desc, eq, inArray, or, sql} from 'drizzle-orm';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {canUpdateMaintenanceRequest, isCaretakerOfLandlord} from '../../db/authz.ts';
import {appBaseUrl} from '../http/config.ts';
import {normalizeMediaArray, normalizeStoredFileUrl} from '../http/fileUrls.ts';
import {asyncHandler, getValidatedBody, recordAudit, requireAuth, validateBody} from '../http/middleware.ts';
import {mediaUrlSchema} from '../http/schemas.ts';
import {insertNotification, sendEmail} from '../services/notify.ts';
import {toActor} from '../types.ts';

const respondMaintenanceSchema = z
  .object({
    status: z.enum(['pending', 'in-progress', 'resolved']),
    resolutionNotes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const createCaretakerReportSchema = z
  .object({
    propertyId: z.string().uuid().nullable().optional(),
    buildingId: z.string().uuid().nullable().optional(),
    category: z.enum(['maintenance', 'security', 'cleanliness', 'utility', 'tenant_issue', 'inspection', 'other']).default('maintenance'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().min(5).max(4000),
    images: z.array(mediaUrlSchema).max(6).default([]),
  })
  .strict();

/** Resolves the landlord + assigned units a caretaker can work on. */
async function resolveCaretakerScope(uid: string, managedByAdminId?: string | null) {
  const managedRows = await db
    .select({propertyId: schema.propertyManagers.propertyId, landlordId: schema.propertyManagers.landlordId})
    .from(schema.propertyManagers)
    .where(eq(schema.propertyManagers.userId, uid));

  const assignedPropertyIds = [...new Set(managedRows.map((m) => m.propertyId))];
  const landlordId = managedByAdminId || managedRows[0]?.landlordId || null;

  return {landlordId, assignedPropertyIds};
}

export function registerCaretakerRoutes(bffRouter: Router) {
  /** Caretaker workspace feed: employer landlord, units/buildings, repair queue, own reports, and alerts. */
  bffRouter.get(
    '/caretaker/dashboard',
    requireAuth,
    asyncHandler(async (req, res) => {
      const profile = req.profile!;
      if (profile.role !== 'caretaker' && !profile.isSuperAdmin) {
        res.status(403).json({error: 'Caretaker access required'});
        return;
      }

      const {landlordId, assignedPropertyIds} = await resolveCaretakerScope(profile.uid, profile.managedByAdminId);
      const email = profile.email.toLowerCase();

      if (!landlordId && assignedPropertyIds.length === 0) {
        const notifications = await db.query.notifications.findMany({
          where: sql`lower(${schema.notifications.recipientEmail}) = ${email}`,
          orderBy: desc(schema.notifications.createdAt),
          limit: 200,
        });
        res.json({
          landlord: null,
          buildings: [],
          properties: [],
          requests: [],
          reports: [],
          notifications,
        });
        return;
      }

      const propertyWhere = assignedPropertyIds.length > 0
        ? inArray(schema.properties.id, assignedPropertyIds)
        : eq(schema.properties.landlordId, landlordId!);

      const [landlord, properties, notifications] = await Promise.all([
        landlordId
          ? db.query.users.findFirst({
              where: eq(schema.users.uid, landlordId),
              columns: {uid: true, displayName: true, email: true, phone: true, avatarUrl: true},
            })
          : Promise.resolve(null),
        db.select().from(schema.properties).where(propertyWhere).orderBy(desc(schema.properties.createdAt)),
        db.query.notifications.findMany({
          where: sql`lower(${schema.notifications.recipientEmail}) = ${email}`,
          orderBy: desc(schema.notifications.createdAt),
          limit: 200,
        }),
      ]);

      const propertyIds = properties.map((p) => p.id);
      const buildingIds = [...new Set(properties.map((p) => p.buildingId).filter((id): id is string => Boolean(id)))];

      const [buildings, requests, reports] = await Promise.all([
        landlordId
          ? db.query.buildings.findMany({
              where: buildingIds.length
                ? or(eq(schema.buildings.landlordId, landlordId), inArray(schema.buildings.id, buildingIds))
                : eq(schema.buildings.landlordId, landlordId),
              orderBy: desc(schema.buildings.createdAt),
            })
          : Promise.resolve([]),
        propertyIds.length
          ? db.query.maintenanceRequests.findMany({
              where: inArray(schema.maintenanceRequests.propertyId, propertyIds),
              orderBy: desc(schema.maintenanceRequests.createdAt),
              limit: 500,
            })
          : landlordId
            ? db.query.maintenanceRequests.findMany({
                where: eq(schema.maintenanceRequests.landlordId, landlordId),
                orderBy: desc(schema.maintenanceRequests.createdAt),
                limit: 500,
              })
            : Promise.resolve([]),
        db.query.caretakerReports.findMany({
          where: eq(schema.caretakerReports.caretakerId, profile.uid),
          orderBy: desc(schema.caretakerReports.createdAt),
          limit: 300,
        }),
      ]);

      // Attach tenant display info so caretakers know who reported each house issue.
      const tenantUids = [...new Set(requests.map((r) => r.tenantId))];
      const tenantUsers = tenantUids.length
        ? await db.query.users.findMany({
            where: inArray(schema.users.uid, tenantUids),
            columns: {uid: true, displayName: true, email: true, phone: true},
          })
        : [];
      const tenantMap = new Map(tenantUsers.map((u) => [u.uid, u]));

      res.json({
        landlord: landlord
          ? {...landlord, avatarUrl: landlord.avatarUrl ? normalizeStoredFileUrl(req, landlord.avatarUrl) : null}
          : null,
        buildings,
        properties: properties.map((p) => ({...p, price: Number(p.price), images: normalizeMediaArray(req, p.images)})),
        requests: requests.map((r) => ({
          ...r,
          tenantName: tenantMap.get(r.tenantId)?.displayName ?? null,
          tenantPhone: tenantMap.get(r.tenantId)?.phone ?? null,
          tenantEmail: tenantMap.get(r.tenantId)?.email ?? null,
        })),
        reports: reports.map((rep) => ({...rep, images: normalizeMediaArray(req, rep.images)})),
        notifications,
      });
    }),
  );

  /** Caretaker responds to a tenant repair / house issue with status & resolution notes. */
  bffRouter.patch(
    '/caretaker/maintenance-requests/:id',
    requireAuth,
    validateBody(respondMaintenanceSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const request = await db.query.maintenanceRequests.findFirst({
        where: eq(schema.maintenanceRequests.id, req.params.id),
      });
      if (!request) {
        res.status(404).json({error: 'Maintenance request not found'});
        return;
      }
      if (!(await canUpdateMaintenanceRequest(actor, request))) {
        res.status(403).json({error: 'You do not have permission to respond to this issue'});
        return;
      }

      const body = getValidatedBody<z.infer<typeof respondMaintenanceSchema>>(req);
      const [updated] = await db
        .update(schema.maintenanceRequests)
        .set({
          status: body.status,
          ...(body.resolutionNotes !== undefined ? {resolutionNotes: body.resolutionNotes} : {}),
          updatedById: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.maintenanceRequests.id, req.params.id))
        .returning();

      // Notify tenant & landlord via push + in-app alert so everyone stays in sync.
      const [tenant, landlord, property] = await Promise.all([
        db.query.users.findFirst({where: eq(schema.users.uid, request.tenantId), columns: {email: true, displayName: true}}),
        db.query.users.findFirst({where: eq(schema.users.uid, request.landlordId), columns: {email: true, displayName: true}}),
        db.query.properties.findFirst({where: eq(schema.properties.id, request.propertyId), columns: {title: true, unitNumber: true}}),
      ]);
      const unitLabel = property?.title || property?.unitNumber || 'your unit';
      const responderName = req.profile!.displayName || 'Caretaker';
      const statusLabel = body.status === 'resolved' ? 'resolved' : body.status === 'in-progress' ? 'in progress' : 'reopened';
      const noteText = body.resolutionNotes ? ` Note: "${body.resolutionNotes}"` : '';

      await Promise.allSettled([
        tenant?.email
          ? insertNotification({
              recipientEmail: tenant.email.toLowerCase(),
              platformId: request.platformId,
              type: 'maintenance',
              title: `Repair ${statusLabel}: ${request.title}`,
              message: `${responderName} marked "${request.title}" (${unitLabel}) as ${statusLabel}.${noteText}`,
              propertyId: request.propertyId,
              read: false,
            })
          : Promise.resolve(),
        landlord?.email && landlord.email.toLowerCase() !== req.profile!.email.toLowerCase()
          ? insertNotification({
              recipientEmail: landlord.email.toLowerCase(),
              platformId: request.platformId,
              type: 'maintenance',
              title: `Caretaker updated repair: ${request.title}`,
              message: `${responderName} marked "${request.title}" (${unitLabel}) as ${statusLabel}.${noteText}`,
              propertyId: request.propertyId,
              read: false,
            })
          : Promise.resolve(),
      ]);

      await recordAudit(req.profile!, 'MAINTENANCE_RESPOND', 'maintenance_request', updated.id, {status: body.status});
      res.json(updated);
    }),
  );

  /** Caretaker files a field/inspection/incident report directly to their landlord. */
  bffRouter.post(
    '/caretaker/reports',
    requireAuth,
    validateBody(createCaretakerReportSchema),
    asyncHandler(async (req, res) => {
      const profile = req.profile!;
      const actor = toActor(profile);
      const {landlordId} = await resolveCaretakerScope(profile.uid, profile.managedByAdminId);

      if (!landlordId || (!isCaretakerOfLandlord(actor, landlordId) && !profile.isSuperAdmin)) {
        res.status(403).json({error: 'Only caretakers linked to a landlord can submit reports.'});
        return;
      }

      const body = getValidatedBody<z.infer<typeof createCaretakerReportSchema>>(req);

      let propertyLabel: string | null = null;
      if (body.propertyId) {
        const property = await db.query.properties.findFirst({
          where: and(eq(schema.properties.id, body.propertyId), eq(schema.properties.landlordId, landlordId)),
          columns: {id: true, title: true, unitNumber: true},
        });
        if (!property) {
          res.status(403).json({error: 'Selected unit does not belong to your landlord.'});
          return;
        }
        propertyLabel = property.title || property.unitNumber || null;
      }

      if (body.buildingId) {
        const building = await db.query.buildings.findFirst({
          where: and(eq(schema.buildings.id, body.buildingId), eq(schema.buildings.landlordId, landlordId)),
          columns: {id: true, name: true},
        });
        if (!building) {
          res.status(403).json({error: 'Selected building does not belong to your landlord.'});
          return;
        }
        if (!propertyLabel) propertyLabel = building.name;
      }

      const landlord = await db.query.users.findFirst({
        where: eq(schema.users.uid, landlordId),
        columns: {uid: true, email: true, displayName: true, platformId: true},
      });
      if (!landlord) {
        res.status(404).json({error: 'Landlord account not found.'});
        return;
      }

      const [report] = await db
        .insert(schema.caretakerReports)
        .values({
          platformId: landlord.platformId ?? profile.platformId ?? null,
          landlordId,
          caretakerId: profile.uid,
          propertyId: body.propertyId ?? null,
          buildingId: body.buildingId ?? null,
          category: body.category,
          priority: body.priority,
          title: body.title,
          description: body.description,
          images: body.images,
          status: 'open',
        })
        .returning();

      const caretakerName = profile.displayName || profile.email;
      const scopeNote = propertyLabel ? ` (${propertyLabel})` : '';
      const alertTitle = `Caretaker report: ${body.title}`;
      const alertMsg = `${caretakerName} filed a ${body.priority}-priority ${body.category.replace('_', ' ')} report${scopeNote}: ${body.description.slice(0, 180)}`;

      await Promise.allSettled([
        insertNotification({
          recipientEmail: landlord.email.toLowerCase(),
          platformId: landlord.platformId ?? null,
          type: 'caretaker_report',
          title: alertTitle,
          message: alertMsg,
          propertyId: body.propertyId ?? null,
          read: false,
        }),
        sendEmail({
          to: landlord.email,
          subject: alertTitle,
          template: {
            preheader: alertMsg,
            eyebrow: 'Caretaker report',
            tone: body.priority === 'urgent' || body.priority === 'high' ? 'danger' : 'info',
            heading: body.title,
            paragraphs: [
              `${caretakerName} submitted a new field report${scopeNote}.`,
              body.description,
            ],
            callout: {
              label: 'Report priority',
              value: body.priority.toUpperCase(),
              sublabel: `${body.category.replace('_', ' ')}${propertyLabel ? ` · ${propertyLabel}` : ''}`,
            },
            details: [
              ['Caretaker', caretakerName],
              ['Category', body.category.replace('_', ' ')],
              ['Priority', body.priority.toUpperCase()],
              ...(propertyLabel ? [['Unit / Building', propertyLabel] as [string, string]] : []),
            ],
            button: {
              label: 'Review report in MyBoma',
              url: appBaseUrl,
              hint: 'Open Caretakers & reports to inspect photos and reply:',
            },
            footerNote: 'You received this because a caretaker filed a report under your MyBoma account.',
          },
        }),
      ]);

      await recordAudit(profile, 'CARETAKER_REPORT_CREATE', 'caretaker_report', report.id, {category: body.category, priority: body.priority});
      res.status(201).json({...report, images: normalizeMediaArray(req, report.images)});
    }),
  );
}

import {and, eq, sql} from 'drizzle-orm';
import {type Router} from 'express';
import multer from 'multer';
import {fromNodeHeaders} from 'better-auth/node';
import {z} from 'zod';
import {auth} from '../auth.ts';
import {db, schema} from '../../db/client.ts';
import {canReadPlatformBranding, canUpdateNotification} from '../../db/authz.ts';
import {
  handleDeleteUser,
  handleProvisionUser,
  handleSuspendUser,
  provisionUserSchema,
  suspendUserSchema,
} from '../adminHandlers.ts';
import {handleSendRentReminder} from '../notificationHandlers.ts';
import {buildObjectKey, uploadObject} from '../storage.ts';
import {toActor} from '../types.ts';
import {appBaseUrl} from '../http/config.ts';
import {
  asyncHandler,
  getValidatedBody,
  isAgencyAdmin,
  recordAudit,
  requireAdmin,
  requireAuth,
  validateBody,
} from '../http/middleware.ts';
import {uuidSchema} from '../http/schemas.ts';
import {streamStoredObject} from '../services/files.ts';
import {insertNotification, sendEmail} from '../services/notify.ts';

// 4MB keeps uploads under Vercel's ~4.5MB request body cap.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 4 * 1024 * 1024},
});

/** Identifies the image type from its magic bytes; the client-declared mimetype is never trusted. */
const sniffImageType = (buffer: Buffer): {mime: string; ext: string} | null => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return {mime: 'image/jpeg', ext: 'jpg'};
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {mime: 'image/png', ext: 'png'};
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return {mime: 'image/webp', ext: 'webp'};
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return {mime: 'image/gif', ext: 'gif'};
  return null;
};

const sanitizeUploadSubpath = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const segments = value
    .split('/')
    .map((segment) => segment.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean);
  return segments.length ? segments.slice(0, 4).join('/') : undefined;
};

/**
 * Self-service profile update, shared by every role's "edit profile" form. Deliberately
 * excludes role/isAdmin/isSuperAdmin/email/platformId — canWriteUser (db/authz.ts) would
 * reject a self-escalation attempt anyway, but this schema keeps such fields from ever
 * reaching that check in the first place.
 */
const selfProfileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    phone: z.string().max(20).nullable().optional(),
    address: z.string().max(280).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    bankName: z.string().max(120).nullable().optional(),
    bankAccountNumber: z.string().max(40).nullable().optional(),
    bankAccountName: z.string().max(120).nullable().optional(),
    rentPayoutMethod: z.enum(['cash', 'mpesa', 'bank']).nullable().optional(),
    cashPayoutNotes: z.string().max(280).nullable().optional(),
    mpesaSettlementPhone: z.string().max(20).nullable().optional(),
    mpesaSettlementShortCode: z.string().max(20).nullable().optional(),
  })
  .strict();

const auditLogSchema = z
  .object({
    action: z.string().min(1).max(60),
    resource: z.string().max(60).nullable().optional(),
    resourceId: z.string().max(200).nullable().optional(),
    metadata: z.record(z.string(), z.any()).nullable().optional(),
  })
  .strict();

const passwordResetCompleteSchema = z.object({newPassword: z.string().min(8).max(128)}).strict();

/** Account-level BFF routes: uploads/files, session, profile, notifications, audit log, user provisioning. */
export function registerUserRoutes(bffRouter: Router) {
  /** Replaces supabase.storage.from('properties').upload(...) — every upload lands
   * under the caller's own uid folder, matching the old bucket's storage RLS policy. */
  bffRouter.post(
    '/uploads',
    requireAuth,
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const file = (req as unknown as {file?: Express.Multer.File}).file;
      if (!file) {
        res.status(400).json({error: 'No file provided'});
        return;
      }
      const detected = sniffImageType(file.buffer);
      if (!detected) {
        res.status(415).json({error: 'Only JPEG, PNG, WebP or GIF images are allowed'});
        return;
      }
      const subpath = sanitizeUploadSubpath(req.body?.subpath);
      const key = buildObjectKey(req.profile!.uid, `upload.${detected.ext}`, subpath);
      await uploadObject(key, file.buffer, detected.mime);
      // `private/...` subpaths (receipts, IDs, expense evidence) are only reachable through
      // the authenticated route; everything else is a public marketing asset.
      const isPrivate = subpath?.split('/')[0] === 'private';
      const url = isPrivate ? `${appBaseUrl}${req.baseUrl}/files/${key}` : `${appBaseUrl}/api/files/${key}`;
      res.status(201).json({url, private: isPrivate});
    }),
  );

  /** Private documents: the uploader, a super admin, or a platform admin of the uploader's
   * platform. Short private cache only — never shared/CDN cached. */
  bffRouter.get(
    '/files/*',
    requireAuth,
    asyncHandler(async (req, res) => {
      const key = (req.params as unknown as string[])[0];
      if (!key || key.includes('..') || key.split('/')[1] !== 'private') {
        res.status(404).json({error: 'Not found'});
        return;
      }
      const ownerUid = key.split('/')[0];
      const actor = req.impersonator ?? req.profile!;
      let allowed = actor.uid === ownerUid || Boolean(actor.isSuperAdmin);
      if (!allowed && actor.isAdmin && actor.platformId) {
        const owner = await db.query.users.findFirst({where: eq(schema.users.uid, ownerUid), columns: {platformId: true}});
        allowed = owner?.platformId === actor.platformId;
      }
      if (!allowed) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      await streamStoredObject(key, res, 'private, max-age=300');
    }),
  );

  bffRouter.get('/session', requireAuth, asyncHandler(async (req, res) => {
    res.json({
      client: req.clientKind,
      user: {
        id: req.authUser?.id,
        email: req.authUser?.email,
      },
      profile: req.profile,
    });
  }));

  // canViewNotification (db/authz.ts) just checks recipientEmail === actor's email,
  // so this is naturally scoped to the caller's own notifications.
  bffRouter.get('/notifications/unread-count', requireAuth, asyncHandler(async (req, res) => {
    const email = req.profile!.email.toLowerCase();
    const [row] = await db
      .select({count: sql<number>`count(*)::int`})
      .from(schema.notifications)
      .where(and(sql`lower(${schema.notifications.recipientEmail}) = ${email}`, eq(schema.notifications.read, false)));
    res.json({count: row?.count ?? 0});
  }));

  bffRouter.patch(
    '/me',
    requireAuth,
    validateBody(selfProfileUpdateSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof selfProfileUpdateSchema>>(req);
      await db.update(schema.users).set(body).where(eq(schema.users.uid, req.profile!.uid));
      res.json({updated: true});
    }),
  );

  bffRouter.patch(
    '/notifications/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const notification = await db.query.notifications.findFirst({
        where: eq(schema.notifications.id, req.params.id),
        columns: {id: true, recipientEmail: true},
      });
      if (!notification) {
        res.status(404).json({error: 'Notification not found'});
        return;
      }
      if (!canUpdateNotification(actor, notification)) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      await db.update(schema.notifications).set({read: true}).where(eq(schema.notifications.id, req.params.id));
      res.json({updated: true});
    }),
  );

  bffRouter.post(
    '/notifications/mark-all-read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const email = req.profile!.email.toLowerCase();
      await db
        .update(schema.notifications)
        .set({read: true})
        .where(and(sql`lower(${schema.notifications.recipientEmail}) = ${email}`, eq(schema.notifications.read, false)));
      res.json({updated: true});
    }),
  );

  /** supabase-setup.sql never granted a DELETE policy on notifications to anyone but the
   * service role — not even the recipient — so this preserves that: nobody but a super
   * admin can delete one. The old client-side delete button always failed under RLS. */
  bffRouter.delete(
    '/notifications/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.profile!.isSuperAdmin) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      await db.delete(schema.notifications).where(eq(schema.notifications.id, req.params.id));
      res.json({deleted: true});
    }),
  );

  /** canInsertAuditLog (db/authz.ts) requires userId === actor.id, so this is always a
   * self-insert — matches the original "Users insert own audit logs" RLS policy exactly. */
  bffRouter.post(
    '/audit-logs',
    requireAuth,
    validateBody(auditLogSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof auditLogSchema>>(req);
      const actor = req.profile!;
      await db.insert(schema.auditLogs).values({
        userId: actor.uid,
        userEmail: actor.email,
        platformId: actor.platformId ?? null,
        action: body.action,
        resource: body.resource ?? null,
        resourceId: body.resourceId ?? null,
        metadata: body.metadata ?? null,
      });
      res.status(201).json({logged: true});
    }),
  );

  /** Non-sensitive branding fields only — see canReadPlatformBranding (db/authz.ts) for
   * why this is deliberately more permissive than the platforms table's own RLS policy. */
  bffRouter.get(
    '/platforms/:id/branding',
    requireAuth,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      if (!canReadPlatformBranding(actor, req.params.id)) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      const platform = await db.query.platforms.findFirst({
        where: eq(schema.platforms.id, req.params.id),
        columns: {name: true, brandLogoUrl: true, brandPrimaryColor: true, brandSecondaryColor: true},
      });
      if (!platform) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      res.json(platform);
    }),
  );

  /**
   * Forced first-login password change (see users.mustChangePassword, set by
   * server/adminHandlers.ts when an admin/landlord provisions an account with a
   * temp password). Uses Better-Auth's setPassword — unlike changePassword, it
   * doesn't require the caller to already know a current password, matching the
   * old Supabase `auth.updateUser({ password })` behavior this replaces.
   */
  bffRouter.post(
    '/me/password-reset-complete',
    requireAuth,
    validateBody(passwordResetCompleteSchema),
    asyncHandler(async (req, res) => {
      const {newPassword} = getValidatedBody<z.infer<typeof passwordResetCompleteSchema>>(req);
      await auth.api.setPassword({body: {newPassword}, headers: fromNodeHeaders(req.headers)});
      await db.update(schema.users).set({mustChangePassword: false}).where(eq(schema.users.uid, req.profile!.uid));
      res.json({updated: true});
    }),
  );

  bffRouter.post(
    '/users/provision',
    requireAuth,
    validateBody(provisionUserSchema),
    asyncHandler(async (req, res) => {
      await handleProvisionUser(req, res, isAgencyAdmin(req.profile!));
      if (res.statusCode < 300) {
        const body = req.validatedBody as {email: string; role: string};
        await recordAudit(req.profile!, 'USER_PROVISION', 'user', body.email, {role: body.role});
      }
    }),
  );

  bffRouter.patch(
    '/users/:uid/status',
    requireAuth,
    requireAdmin,
    validateBody(suspendUserSchema),
    asyncHandler(async (req, res) => {
      await handleSuspendUser(req, res);
      if (res.statusCode < 300) {
        await recordAudit(req.profile!, 'USER_STATUS_CHANGE', 'user', req.params.uid, req.validatedBody as Record<string, unknown>);
      }
    }),
  );

  bffRouter.delete(
    '/users/:uid',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      await handleDeleteUser(req, res);
      if (res.statusCode < 300) await recordAudit(req.profile!, 'USER_DELETE', 'user', req.params.uid);
    }),
  );

  bffRouter.post(
    '/notifications/remind-rent',
    requireAuth,
    validateBody(z.object({ rentPaymentId: uuidSchema })),
    asyncHandler(async (req, res) => {
      await handleSendRentReminder(req, res, { sendEmail, insertNotification });
    }),
  );
}

import {and, eq, sql} from 'drizzle-orm';
import {type RequestHandler, type Router} from 'express';
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
import {handleSendBulkRentReminders, handleSendRentReminder} from '../notificationHandlers.ts';
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
  inviteSendLimiter,
  uploadLimiter,
  validateBody,
} from '../http/middleware.ts';
import {uuidSchema} from '../http/schemas.ts';
import {streamStoredObject} from '../services/files.ts';
import {ImageRejectedError, imageKindForSubpath, MAX_UPLOAD_BYTES, toWebp} from '../services/images.ts';
import {insertNotification, sendEmail} from '../services/notify.ts';

// Photos are re-encoded to WebP on the server (services/images.ts), so the stored file is
// small no matter what the phone sends.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: MAX_UPLOAD_BYTES, files: 1},
});

/** multer's own errors (e.g. file too large) become clean 413/400 JSON responses. */
const singleUpload: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? `Images must be smaller than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` : 'Upload one image at a time.',
      });
      return;
    }
    next(err);
  });
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
    uploadLimiter,
    singleUpload,
    asyncHandler(async (req, res) => {
      const file = (req as unknown as {file?: Express.Multer.File}).file;
      if (!file) {
        res.status(400).json({error: 'No file provided'});
        return;
      }
      const subpath = sanitizeUploadSubpath(req.body?.subpath);
      // The client-declared type is never trusted: sharp decodes the bytes, and anything
      // that is not a real image is rejected before it reaches storage.
      let webp: Buffer;
      try {
        webp = (await toWebp(file.buffer, imageKindForSubpath(subpath))).buffer;
      } catch (err) {
        if (err instanceof ImageRejectedError) {
          res.status(err.status).json({error: err.message});
          return;
        }
        throw err;
      }
      const key = buildObjectKey(req.profile!.uid, 'upload.webp', subpath);
      await uploadObject(key, webp, 'image/webp');
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
    inviteSendLimiter,
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

  bffRouter.post(
    '/notifications/remind-rent/bulk',
    requireAuth,
    validateBody(z.object({ rentPaymentIds: z.array(uuidSchema).min(1).max(50) }).strict()),
    asyncHandler(async (req, res) => {
      await handleSendBulkRentReminders(req, res, { sendEmail, insertNotification });
    }),
  );
}

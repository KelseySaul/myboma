import {and, desc, eq, inArray, isNull, like, or, sql} from 'drizzle-orm';
import {withSystemAccess} from '../../db/requestContext.ts';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {invalidatePublicListings} from '../http/cache.ts';
import {canAdministerBuilding, canWriteUser, isAgencyManagerOfLandlord, isSuperAdmin} from '../../db/authz.ts';
import {updatePlatformBrandingSchema} from '../adminHandlers.ts';
import {normalizeMediaArray, normalizeStoredFileUrl} from '../http/fileUrls.ts';
import {toActor} from '../types.ts';
import {
  asyncHandler,
  getValidatedBody,
  inviteResendLimiter,
  inviteSendLimiter,
  isAgencyAdmin,
  recordAudit,
  reminderLimiter,
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
  validateBody,
} from '../http/middleware.ts';
import {emailSchema, parseAccountIdsParam, uuidSchema} from '../http/schemas.ts';
import {createAndSendInvite} from '../inviteService.ts';
import {INVITE_IDENTIFIER_PREFIX, parseInvitePayload, type InvitePayload} from '../invitePolicy.ts';
import {billingToday, daysUntilDueDate} from '../../../shared/rentInvoices.ts';
import {isFreePlan, parseSubscriptionPlan} from '../../../shared/landlordSubscription.ts';
import {
  formatSubscriptionPlanLabel,
  resendSubscriptionReceipt,
  sendSubscriptionRenewalReminder,
  subscriberAccountType,
} from '../landlordSubscriptionHandlers.ts';
import {
  createSubscriptionPlan,
  createSubscriptionPlanSchema,
  deleteSubscriptionPlan,
  listSubscriptionPlans,
  updateSubscriptionPlan,
  updateSubscriptionPlanSchema,
} from '../services/subscriptionPlans.ts';
import {insertNotification, sendEmail} from '../services/notify.ts';

const resendInviteSchema = z.object({email: emailSchema}).strict();

const updateRoleSchema = z.object({role: z.enum(['landlord', 'tenant', 'hunter', 'caretaker', 'admin', 'superadmin'])}).strict();

const createPlatformSchema = z
  .object({name: z.string().min(1).max(160), slug: z.string().min(1).max(80), ownerEmail: emailSchema})
  .strict();

type AdminScope =
  | {mode: 'superadmin'}
  | {mode: 'staff_admin'}
  | {mode: 'white_label_platform'; platformId: string}
  | {mode: 'agency_manager'};

/**
 * Distinguishes the three non-superadmin admin tiers cleanly:
 * - Super Admin (`isSuperAdmin`): full platform access, optional platformId filter.
 * - White-label Platform Admin (`isAdmin` attached to a dedicated platform with `ownerEmail`):
 *   full access to all users and assets in that platform.
 * - MyBoma Staff Admin (`isAdmin` without a dedicated white-label platform — e.g. created
 *   by the Super Admin on the root MyBoma deployment): sees all users and operational rows.
 * - Pro Plus Property Manager / Agency (`role === 'admin'`, `isAdmin === false`):
 *   strictly scoped to themselves, landlords/caretakers they manage, and people they invited.
 */
async function resolveAdminScope(actor: ReturnType<typeof toActor>): Promise<AdminScope> {
  if (isSuperAdmin(actor)) return {mode: 'superadmin'};
  if (actor.isAdmin) {
    if (actor.platformId) {
      const platform = await withSystemAccess(() =>
        db.query.platforms.findFirst({
          where: eq(schema.platforms.id, actor.platformId!),
          columns: {id: true, ownerEmail: true},
        }),
      );
      if (platform?.ownerEmail) {
        return {mode: 'white_label_platform', platformId: platform.id};
      }
    }
    return {mode: 'staff_admin'};
  }
  return {mode: 'agency_manager'};
}

/**
 * Fetches all lowercased emails invited by any of the given landlord/manager owner IDs.
 * Kept as an explicit `db.select` query (never embedded inside `db.query.*.findMany`)
 * because Drizzle's relational query builder rewrites column table aliases in `where`.
 */
async function getInvitedEmailsForOwners(ownerIds: string[]): Promise<string[]> {
  if (ownerIds.length === 0) return [];
  const rows = await db
    .select({email: schema.invitations.email})
    .from(schema.invitations)
    .where(inArray(schema.invitations.landlordId, ownerIds));
  return [...new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean))];
}

export function registerAdminRoutes(bffRouter: Router) {
  /**
   * Consolidates the admin dashboard's users + properties + invitations + rentPayments
   * + buildings (+ platforms, for super admins) fetches into one polled endpoint.
   */
  bffRouter.get(
    '/admin/dashboard',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const scope = await resolveAdminScope(actor);
      const listLimit = 200;
      const platformIdParam = typeof req.query.platformId === 'string' ? req.query.platformId : undefined;

      const runScopedRead = <T>(fn: () => Promise<T>) =>
        scope.mode === 'staff_admin' ? withSystemAccess(fn) : fn();

      const data = await runScopedRead(async () => {
        const filterId =
          scope.mode === 'superadmin'
            ? platformIdParam && platformIdParam !== 'all'
              ? platformIdParam
              : null
            : scope.mode === 'white_label_platform'
              ? scope.platformId
              : scope.mode === 'staff_admin'
                ? null
                : actor.platformId || 'none';

        const platformWhere = (col: any) =>
          filterId === null ? undefined : filterId === 'none' ? isNull(col) : eq(col, filterId);

        let managedOwnerIds: string[] = [];
        let agencyInvitedEmails: string[] = [];
        if (scope.mode === 'agency_manager') {
          const managedLandlordRows = await db
            .select({uid: schema.users.uid})
            .from(schema.users)
            .where(eq(schema.users.managedByAdminId, actor.id));
          managedOwnerIds = [actor.id, ...managedLandlordRows.map((row) => row.uid)];
          agencyInvitedEmails = await getInvitedEmailsForOwners(managedOwnerIds);
        }

        const withLandlordScope = (col: any, base: any) =>
          scope.mode === 'agency_manager' ? and(base, inArray(col, managedOwnerIds)) : base;

        const agencyUsersFilter =
          scope.mode === 'agency_manager'
            ? or(
                eq(schema.users.uid, actor.id),
                eq(schema.users.managedByAdminId, actor.id),
                ...(agencyInvitedEmails.length > 0
                  ? [inArray(sql`lower(${schema.users.email})`, agencyInvitedEmails)]
                  : []),
              )
            : undefined;

        const usersWhere = agencyUsersFilter
          ? and(platformWhere(schema.users.platformId), agencyUsersFilter)
          : platformWhere(schema.users.platformId);

        const [users, properties, invitationRows, paymentRows, buildings, platforms] = await Promise.all([
          db
            .select()
            .from(schema.users)
            .where(usersWhere)
            .orderBy(desc(schema.users.createdAt))
            .limit(scope.mode === 'superadmin' || scope.mode === 'staff_admin' ? 1000 : 2000),
          db
            .select()
            .from(schema.properties)
            .where(withLandlordScope(schema.properties.landlordId, platformWhere(schema.properties.platformId)))
            .orderBy(desc(schema.properties.createdAt))
            .limit(listLimit),
          db
            .select()
            .from(schema.invitations)
            .where(withLandlordScope(schema.invitations.landlordId, platformWhere(schema.invitations.platformId)))
            .orderBy(desc(schema.invitations.createdAt))
            .limit(listLimit),
          db
            .select()
            .from(schema.rentPayments)
            .where(withLandlordScope(schema.rentPayments.landlordId, platformWhere(schema.rentPayments.platformId)))
            .orderBy(desc(schema.rentPayments.dueDate))
            .limit(listLimit),
          db
            .select()
            .from(schema.buildings)
            .where(withLandlordScope(schema.buildings.landlordId, platformWhere(schema.buildings.platformId)))
            .orderBy(desc(schema.buildings.createdAt))
            .limit(listLimit),
          scope.mode === 'superadmin' ? db.select().from(schema.platforms) : Promise.resolve([]),
        ]);

        const registeredEmails = new Set(users.map((u) => u.email.toLowerCase()));
        const invitations = invitationRows.filter((inv) => !registeredEmails.has(inv.email.toLowerCase()));
        const payments = paymentRows.map((p) => ({...p, amount: Number(p.amount)}));

        return {users, properties, invitations, payments, buildings, platforms};
      });

      res.json({
        users: data.users.map((u) => ({
          ...u,
          avatarUrl: u.avatarUrl ? normalizeStoredFileUrl(req, u.avatarUrl) : u.avatarUrl,
        })),
        properties: data.properties.map((p) => ({
          ...p,
          price: Number(p.price),
          images: normalizeMediaArray(req, p.images),
        })),
        invitations: data.invitations,
        payments: data.payments.map((p) => ({
          ...p,
          receiptUrl: p.receiptUrl ? normalizeStoredFileUrl(req, p.receiptUrl) : p.receiptUrl,
        })),
        buildings: data.buildings,
        platforms: data.platforms.map((pl) => ({
          ...pl,
          brandLogoUrl:
            typeof pl.brandLogoUrl === 'string' && pl.brandLogoUrl
              ? normalizeStoredFileUrl(req, pl.brandLogoUrl)
              : pl.brandLogoUrl,
        })),
      });
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
    inviteResendLimiter,
    inviteSendLimiter,
    validateBody(resendInviteSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const scope = await resolveAdminScope(actor);
      const {email} = getValidatedBody<z.infer<typeof resendInviteSchema>>(req);
      const target = email.trim().toLowerCase();
      const invitation = await (scope.mode === 'staff_admin'
        ? withSystemAccess(() => db.query.invitations.findFirst({where: sql`lower(${schema.invitations.email}) = ${target}`}))
        : db.query.invitations.findFirst({where: sql`lower(${schema.invitations.email}) = ${target}`}));
      if (!invitation) {
        res.status(404).json({error: 'No pending invitation for that email.'});
        return;
      }
      const allowed =
        scope.mode === 'superadmin' ||
        scope.mode === 'staff_admin' ||
        invitation.landlordId === actor.id ||
        (scope.mode === 'white_label_platform' && invitation.platformId === scope.platformId);
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
   * Compact directory of all accounts for the Super Admin multi-account filter bar,
   * available across every workspace tab (Overview, Pending invites, Maintenance, etc.).
   */
  bffRouter.get(
    '/admin/accounts',
    requireAuth,
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const accounts = await db.query.users.findMany({
        orderBy: desc(schema.users.createdAt),
        limit: 500,
        columns: {
          uid: true,
          displayName: true,
          email: true,
          role: true,
          platformId: true,
          avatarUrl: true,
          isAdmin: true,
          isSuperAdmin: true,
          status: true,
        },
      });
      res.json(
        accounts.map((a) => ({
          ...a,
          avatarUrl: a.avatarUrl ? normalizeStoredFileUrl(req, a.avatarUrl) : a.avatarUrl,
        })),
      );
    }),
  );

  /**
   * Pending (unaccepted) invitations. For super admins, strictly requires selecting one
   * or more account IDs (`?accountIds=uuid1,uuid2`) — returns an empty list until chosen.
   */
  bffRouter.get(
    '/admin/pending-invites',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const scope = await resolveAdminScope(actor);
      const superAdmin = scope.mode === 'superadmin';
      const platformIdParam = typeof req.query.platformId === 'string' ? req.query.platformId : undefined;
      const filterId = superAdmin
        ? platformIdParam && platformIdParam !== 'all'
          ? platformIdParam
          : null
        : scope.mode === 'white_label_platform'
          ? scope.platformId
          : scope.mode === 'staff_admin'
            ? null
            : actor.platformId || 'none';
      const platformWhere = (col: any) => (filterId === null ? undefined : filterId === 'none' ? isNull(col) : eq(col, filterId));

      const runScopedRead = <T>(fn: () => Promise<T>) =>
        scope.mode === 'staff_admin' ? withSystemAccess(fn) : fn();

      const rows = await runScopedRead(async () => {
        let ownerFilter;
        if (superAdmin) {
          const accountIds = parseAccountIdsParam(req.query.accountIds);
          if (accountIds.length === 0) return [];
          ownerFilter = inArray(schema.invitations.landlordId, accountIds);
        } else if (scope.mode === 'agency_manager') {
          const managedRows = await db
            .select({uid: schema.users.uid})
            .from(schema.users)
            .where(eq(schema.users.managedByAdminId, actor.id));
          const ownerIds = [actor.id, ...managedRows.map((r) => r.uid)];
          ownerFilter = inArray(schema.invitations.landlordId, ownerIds);
        }

        return db
          .select()
          .from(schema.invitations)
          .where(
            and(
              ownerFilter,
              platformWhere(schema.invitations.platformId),
              sql`lower(${schema.invitations.email}) NOT IN (SELECT lower(u.email) FROM users u)`,
            ),
          )
          .orderBy(desc(schema.invitations.createdAt))
          .limit(500);
      });

      res.json(rows);
    }),
  );

  /**
   * Real numbers for the admin overview: counts, money this month vs last month, 6-month
   * trends and recent activity. For super admins, strictly requires selecting one or more
   * accounts (`?accountIds=...`) before returning data; staff admins see platform-wide stats;
   * Pro Plus agency managers stay scoped to their managed landlords and invitees.
   */
  bffRouter.get(
    '/admin/overview',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const scope = await resolveAdminScope(actor);
      const superAdmin = scope.mode === 'superadmin';
      const platformIdParam = typeof req.query.platformId === 'string' ? req.query.platformId : undefined;
      const filterId = superAdmin
        ? platformIdParam && platformIdParam !== 'all'
          ? platformIdParam
          : null
        : scope.mode === 'white_label_platform'
          ? scope.platformId
          : scope.mode === 'staff_admin'
            ? null
            : actor.platformId || 'none';
      const platformWhere = (col: any) => (filterId === null ? undefined : filterId === 'none' ? isNull(col) : eq(col, filterId));

      // Last 6 calendar months, oldest first, with zero-filled gaps.
      const months: string[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }

      const emptyOverview = () => ({
        users: {},
        pendingInvites: 0,
        properties: [],
        rent: {collectedThisMonth: 0, collectedLastMonth: 0, overdueCount: 0, overdueAmount: 0, dueSoonAmount: 0},
        maintenance: {},
        trend: months.map((month) => ({month, collected: 0, signups: 0})),
        activity: [],
      });

      const runScopedRead = <T>(fn: () => Promise<T>) =>
        scope.mode === 'staff_admin' ? withSystemAccess(fn) : fn();

      const payload = await runScopedRead(async () => {
        let selectedAccountIds: string[] = [];
        let selectedAccountEmails: string[] = [];
        let managedPropertyIds: string[] = [];

        if (superAdmin) {
          selectedAccountIds = parseAccountIdsParam(req.query.accountIds);
          if (selectedAccountIds.length === 0) return emptyOverview();

          const [selectedUsers, managedRows] = await Promise.all([
            db
              .select({uid: schema.users.uid, email: schema.users.email})
              .from(schema.users)
              .where(inArray(schema.users.uid, selectedAccountIds)),
            db
              .select({propertyId: schema.propertyManagers.propertyId})
              .from(schema.propertyManagers)
              .where(inArray(schema.propertyManagers.userId, selectedAccountIds)),
          ]);
          selectedAccountIds = selectedUsers.map((u) => u.uid);
          selectedAccountEmails = selectedUsers.map((u) => u.email.toLowerCase());
          managedPropertyIds = [...new Set(managedRows.map((m) => m.propertyId))];

          if (selectedAccountIds.length === 0) return emptyOverview();
        }

        const isOwnerScoped = scope.mode === 'superadmin' || scope.mode === 'agency_manager';
        let targetIds: string[] = [];
        let invitedEmails: string[] = [];

        if (scope.mode === 'superadmin') {
          targetIds = selectedAccountIds;
          invitedEmails = await getInvitedEmailsForOwners(targetIds);
        } else if (scope.mode === 'agency_manager') {
          const managedRows = await db
            .select({uid: schema.users.uid})
            .from(schema.users)
            .where(eq(schema.users.managedByAdminId, actor.id));
          targetIds = [actor.id, ...managedRows.map((r) => r.uid)];
          invitedEmails = await getInvitedEmailsForOwners(targetIds);
        }

        const scoped = (landlordCol: any, platformCol: any, propertyIdCol?: any) => {
          if (!isOwnerScoped) return platformWhere(platformCol);
          const ownerCond =
            propertyIdCol && managedPropertyIds.length > 0
              ? or(inArray(landlordCol, targetIds), inArray(propertyIdCol, managedPropertyIds))
              : inArray(landlordCol, targetIds);
          return and(platformWhere(platformCol), ownerCond);
        };

        const userWhere = isOwnerScoped
          ? and(
              platformWhere(schema.users.platformId),
              or(
                inArray(schema.users.uid, targetIds),
                inArray(schema.users.managedByAdminId, targetIds),
                ...(invitedEmails.length > 0 ? [inArray(sql`lower(${schema.users.email})`, invitedEmails)] : []),
              ),
            )
          : platformWhere(schema.users.platformId);
        const count = sql<number>`count(*)::int`;

        const activityWhere = superAdmin
          ? and(
              platformWhere(schema.auditLogs.platformId),
              selectedAccountEmails.length > 0
                ? or(
                    inArray(schema.auditLogs.userId, targetIds),
                    inArray(sql`lower(${schema.auditLogs.userEmail})`, selectedAccountEmails),
                  )
                : inArray(schema.auditLogs.userId, targetIds),
            )
          : scope.mode === 'white_label_platform'
            ? eq(schema.auditLogs.platformId, scope.platformId)
            : undefined;

        const [usersByRole, invitesPending, propertyRows, moneyRows, collectionsByMonth, signupsByMonth, maintenanceRows, activity] =
          await Promise.all([
            db.select({role: schema.users.role, n: count}).from(schema.users).where(userWhere).groupBy(schema.users.role),
            db
              .select({n: count})
              .from(schema.invitations)
              .where(
                and(
                  scoped(schema.invitations.landlordId, schema.invitations.platformId),
                  sql`lower(${schema.invitations.email}) NOT IN (SELECT lower(u.email) FROM users u)`,
                ),
              ),
            db
              .select({type: schema.properties.type, status: schema.properties.status, n: count})
              .from(schema.properties)
              .where(scoped(schema.properties.landlordId, schema.properties.platformId, schema.properties.id))
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
              .where(scoped(schema.rentPayments.landlordId, schema.rentPayments.platformId, schema.rentPayments.propertyId)),
            db
              .select({
                month: sql<string>`to_char(date_trunc('month', ${schema.rentPayments.paidAt}), 'YYYY-MM')`,
                amount: sql<string>`sum(${schema.rentPayments.amount})`,
              })
              .from(schema.rentPayments)
              .where(
                and(
                  scoped(schema.rentPayments.landlordId, schema.rentPayments.platformId, schema.rentPayments.propertyId),
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
              .where(scoped(schema.maintenanceRequests.landlordId, schema.maintenanceRequests.platformId, schema.maintenanceRequests.propertyId))
              .groupBy(schema.maintenanceRequests.status),
            scope.mode === 'superadmin' || scope.mode === 'white_label_platform' || scope.mode === 'staff_admin'
              ? db
                  .select({
                    id: schema.auditLogs.id,
                    action: schema.auditLogs.action,
                    userEmail: schema.auditLogs.userEmail,
                    resource: schema.auditLogs.resource,
                    createdAt: schema.auditLogs.createdAt,
                  })
                  .from(schema.auditLogs)
                  .where(activityWhere)
                  .orderBy(desc(schema.auditLogs.createdAt))
                  .limit(8)
              : Promise.resolve([]),
          ]);

        const collected = new Map(collectionsByMonth.map((r) => [r.month, Number(r.amount)]));
        const signups = new Map(signupsByMonth.map((r) => [r.month, r.n]));
        const money = moneyRows[0];

        return {
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
        };
      });

      res.json(payload);
    }),
  );

  bffRouter.post(
    '/admin/impersonation/:uid',
    requireAuth,
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const target = await db.query.users.findFirst({
        where: eq(schema.users.uid, req.params.uid),
        columns: {uid: true, email: true, isSuperAdmin: true},
      });
      if (!target) {
        res.status(404).json({error: 'User not found'});
        return;
      }
      if (target.isSuperAdmin) {
        res.status(403).json({error: 'Super admin accounts cannot be impersonated.'});
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

      // Super admin accounts are immutable from the user management role endpoint so no
      // admin or other user can ever edit or demote a super admin account.
      if (target.isSuperAdmin) {
        res.status(403).json({error: 'Super admin accounts cannot be modified.'});
        return;
      }

      // Privilege changes are super-admin only: granting/revoking admin, touching a super
      // admin, or changing one's own role would otherwise let an admin escalate or lock
      // out the platform owner.
      const touchesPrivilege = nextIsAdmin || target.isAdmin || target.isSuperAdmin;
      if (!actor.isSuperAdmin && (touchesPrivilege || target.uid === actor.id)) {
        res.status(403).json({error: 'Only a super admin can change admin privileges or your own role.'});
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
      if (!canAdministerBuilding(actor, building) && !(await isAgencyManagerOfLandlord(actor, building.landlordId))) {
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

  /**
   * Super Admin platform-wide revenue & accounts ledger (always visible without account filter).
   * Classifies every user by registration source (self-registered vs created by super admin vs
   * invited by another account) and role (Landlord, Property Manager, Tenant, Caretaker, Hunter),
   * summarizes subscription earnings from Landlords vs Property Managers, and lists renewals due.
   */
  bffRouter.get(
    '/admin/superadmin/revenue',
    requireAuth,
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const superUid = req.profile!.uid;
      const now = new Date();
      const todayIso = billingToday(now);
      const currentMonthKey = todayIso.slice(0, 7);
      const prevMonthDate = new Date(Date.UTC(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 2, 1));
      const lastMonthKey = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;

      const [allUsers, allInvitations, provisionAudits, allSubPayments] = await Promise.all([
        db
          .select({
            uid: schema.users.uid,
            displayName: schema.users.displayName,
            email: schema.users.email,
            phone: schema.users.phone,
            role: schema.users.role,
            isAdmin: schema.users.isAdmin,
            isSuperAdmin: schema.users.isSuperAdmin,
            status: schema.users.status,
            managedByAdminId: schema.users.managedByAdminId,
            subscriptionPlan: schema.users.subscriptionPlan,
            subscriptionStatus: schema.users.subscriptionStatus,
            subscriptionExpiresAt: schema.users.subscriptionExpiresAt,
            createdAt: schema.users.createdAt,
          })
          .from(schema.users)
          .orderBy(desc(schema.users.createdAt)),
        db
          .select({
            email: schema.invitations.email,
            landlordId: schema.invitations.landlordId,
            role: schema.invitations.role,
          })
          .from(schema.invitations),
        db
          .select({
            userId: schema.auditLogs.userId,
            resourceId: schema.auditLogs.resourceId,
          })
          .from(schema.auditLogs)
          .where(eq(schema.auditLogs.action, 'USER_PROVISION')),
        db
          .select()
          .from(schema.landlordSubscriptionPayments)
          .orderBy(desc(schema.landlordSubscriptionPayments.createdAt))
          .limit(500),
      ]);

      const userByUid = new Map(allUsers.map((u) => [u.uid, u]));
      const creatorByEmail = new Map<string, string>();
      for (const inv of allInvitations) {
        if (inv.landlordId) creatorByEmail.set(inv.email.trim().toLowerCase(), inv.landlordId);
      }
      for (const audit of provisionAudits) {
        if (audit.userId && audit.resourceId) {
          creatorByEmail.set(audit.resourceId.trim().toLowerCase(), audit.userId);
        }
      }

      // Per-user payment totals (confirmed receipts only)
      const paidByUser = new Map<string, {total: number; count: number}>();
      let totalRevenueKes = 0;
      let landlordRevenueKes = 0;
      let propertyManagerRevenueKes = 0;
      let thisMonthKes = 0;
      let lastMonthKes = 0;
      let totalConfirmedPayments = 0;

      const payments = allSubPayments.map((p) => {
        const subscriber = userByUid.get(p.landlordId);
        const parsed = parseSubscriptionPlan(p.plan);
        const isPm =
          parsed?.tier === 'proplus' ||
          Boolean(subscriber && subscriber.role === 'admin' && !subscriber.isSuperAdmin);
        const accountType = isPm ? ('property_manager' as const) : ('landlord' as const);
        const amountNum = Number(p.amount) || 0;

        if (p.status === 'confirmed') {
          totalRevenueKes += amountNum;
          totalConfirmedPayments += 1;
          if (isPm) propertyManagerRevenueKes += amountNum;
          else landlordRevenueKes += amountNum;

          const monthKey = billingToday(new Date(p.createdAt)).slice(0, 7);
          if (monthKey === currentMonthKey) thisMonthKes += amountNum;
          else if (monthKey === lastMonthKey) lastMonthKes += amountNum;

          const prev = paidByUser.get(p.landlordId) ?? {total: 0, count: 0};
          paidByUser.set(p.landlordId, {total: prev.total + amountNum, count: prev.count + 1});
        }

        return {
          id: p.id,
          landlordId: p.landlordId,
          userName: subscriber?.displayName || subscriber?.email || 'Deleted user',
          userEmail: subscriber?.email || '',
          accountType,
          plan: p.plan,
          planLabel: formatSubscriptionPlanLabel(p.plan),
          amount: amountNum,
          paymentChannel: p.paymentChannel,
          paymentReference: p.paymentReference,
          status: p.status,
          receiptNumber: p.receiptNumber,
          receiptText: p.receiptText,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          createdAt: p.createdAt,
        };
      });

      const roleCounts = {
        landlord: 0,
        property_manager: 0,
        tenant: 0,
        caretaker: 0,
        hunter: 0,
        superadmin: 0,
      };
      let selfRegisteredCount = 0;
      let createdByMeCount = 0;
      let invitedByOtherCount = 0;
      let activePaidLandlords = 0;
      let activePaidPropertyManagers = 0;
      let expiringSoonCount = 0;
      let expiredCount = 0;

      const users = allUsers.map((u) => {
        const emailLower = u.email.trim().toLowerCase();
        const creatorUid = creatorByEmail.get(emailLower) || u.managedByAdminId || null;
        const source: 'self_registered' | 'created_by_me' | 'invited_by_other' =
          u.uid === superUid
            ? 'self_registered'
            : creatorUid === superUid
              ? 'created_by_me'
              : creatorUid
                ? 'invited_by_other'
                : 'self_registered';
        const creatorUser = creatorUid ? userByUid.get(creatorUid) : null;

        const parsedPlan = parseSubscriptionPlan(u.subscriptionPlan ?? null);
        const accountType: 'superadmin' | 'property_manager' | 'landlord' | 'tenant' | 'caretaker' | 'hunter' =
          u.isSuperAdmin
            ? 'superadmin'
            : u.role === 'admin' || parsedPlan?.tier === 'proplus'
              ? 'property_manager'
              : u.role === 'landlord'
                ? 'landlord'
                : u.role === 'tenant'
                  ? 'tenant'
                  : u.role === 'caretaker'
                    ? 'caretaker'
                    : 'hunter';

        roleCounts[accountType] += 1;
        if (u.uid !== superUid) {
          if (source === 'created_by_me') createdByMeCount += 1;
          else if (source === 'invited_by_other') invitedByOtherCount += 1;
          else selfRegisteredCount += 1;
        }

        const isPaid = Boolean(u.subscriptionPlan && !isFreePlan(u.subscriptionPlan));
        const expiresAt = u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt) : null;
        const daysUntilExpiry = expiresAt ? daysUntilDueDate(billingToday(expiresAt), todayIso) : null;
        const isActivePaid =
          isPaid && u.subscriptionStatus === 'active' && (daysUntilExpiry === null || daysUntilExpiry >= 0);

        if (!u.isSuperAdmin && isActivePaid) {
          if (accountType === 'property_manager') activePaidPropertyManagers += 1;
          else if (accountType === 'landlord') activePaidLandlords += 1;
        }
        if (!u.isSuperAdmin && isPaid && daysUntilExpiry !== null) {
          if (daysUntilExpiry < 0 || u.subscriptionStatus === 'expired') expiredCount += 1;
          else if (daysUntilExpiry <= 7) expiringSoonCount += 1;
        }

        const totals = paidByUser.get(u.uid) ?? {total: 0, count: 0};

        return {
          uid: u.uid,
          displayName: u.displayName,
          email: u.email,
          phone: u.phone,
          role: u.role,
          accountType,
          source,
          createdByName: creatorUser?.displayName || creatorUser?.email || null,
          status: u.status,
          subscriptionPlan: u.subscriptionPlan,
          subscriptionPlanLabel: formatSubscriptionPlanLabel(u.subscriptionPlan),
          subscriptionStatus: u.subscriptionStatus,
          subscriptionExpiresAt: u.subscriptionExpiresAt,
          daysUntilExpiry,
          totalPaidKes: totals.total,
          paymentCount: totals.count,
          createdAt: u.createdAt,
        };
      });

      const dueAccounts = users
        .filter(
          (u) =>
            !u.accountType.includes('superadmin') &&
            (u.accountType === 'landlord' || u.accountType === 'property_manager') &&
            u.subscriptionPlan &&
            !isFreePlan(u.subscriptionPlan) &&
            u.daysUntilExpiry !== null &&
            (u.daysUntilExpiry <= 14 || u.subscriptionStatus === 'expired'),
        )
        .sort((a, b) => (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999));

      res.json({
        summary: {
          totalRevenueKes,
          landlordRevenueKes,
          propertyManagerRevenueKes,
          thisMonthKes,
          lastMonthKes,
          totalConfirmedPayments,
          activePaidLandlords,
          activePaidPropertyManagers,
          expiringSoonCount,
          expiredCount,
          totalUsers: users.length,
          selfRegisteredCount,
          createdByMeCount,
          invitedByOtherCount,
          roleCounts,
        },
        users,
        payments,
        dueAccounts,
      });
    }),
  );

  /** Super Admin sends an immediate subscription renewal reminder (email + in-app + push). */
  bffRouter.post(
    '/admin/subscriptions/remind',
    requireAuth,
    requireSuperAdmin,
    reminderLimiter,
    validateBody(z.object({userId: uuidSchema}).strict()),
    asyncHandler(async (req, res) => {
      const {userId} = getValidatedBody<{userId: string}>(req);
      const result = await sendSubscriptionRenewalReminder(userId, {sendEmail, insertNotification});
      if (result.ok === false) {
        res.status(result.status).json({error: result.error});
        return;
      }
      await recordAudit(req.profile!, 'SUBSCRIPTION_REMINDER_SENT', 'user', userId, {email: result.email, title: result.title});
      res.json({ok: true, email: result.email, message: `Reminder sent to ${result.email}.`});
    }),
  );

  /** Super Admin resends a subscription payment receipt (email + in-app copy). */
  bffRouter.post(
    '/admin/subscriptions/:paymentId/resend-receipt',
    requireAuth,
    requireSuperAdmin,
    reminderLimiter,
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.paymentId);
      if (!parsedId.success) {
        res.status(400).json({error: 'Invalid payment id.'});
        return;
      }
      const result = await resendSubscriptionReceipt(parsedId.data, {sendEmail, insertNotification});
      if (result.ok === false) {
        res.status(result.status).json({error: result.error});
        return;
      }
      await recordAudit(req.profile!, 'SUBSCRIPTION_RECEIPT_RESENT', 'subscription_payment', parsedId.data, {
        email: result.email,
        receiptNumber: result.receiptNumber,
      });
      res.json({ok: true, email: result.email, receiptNumber: result.receiptNumber, message: `Receipt ${result.receiptNumber} sent to ${result.email}.`});
    }),
  );

  /** Super Admin lists all prepaid subscription plans (including hidden/inactive) + live subscriber counts. */
  bffRouter.get(
    '/admin/plans',
    requireAuth,
    requireSuperAdmin,
    asyncHandler(async (_req, res) => {
      const [plans, users] = await Promise.all([
        listSubscriptionPlans({includeInactive: true}),
        db.select({subscriptionPlan: schema.users.subscriptionPlan, subscriptionStatus: schema.users.subscriptionStatus}).from(schema.users),
      ]);
      const counts = new Map<string, number>();
      for (const u of users) {
        if (u.subscriptionStatus !== 'active') continue;
        const parsed = parseSubscriptionPlan(u.subscriptionPlan);
        if (!parsed) continue;
        counts.set(parsed.tier, (counts.get(parsed.tier) ?? 0) + 1);
      }
      res.json(plans.map((p) => ({...p, subscriberCount: counts.get(p.id) ?? 0})));
    }),
  );

  /** Super Admin creates a new custom prepaid plan (takes effect immediately across DB, limits, and checkout). */
  bffRouter.post(
    '/admin/plans',
    requireAuth,
    requireSuperAdmin,
    validateBody(createSubscriptionPlanSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof createSubscriptionPlanSchema>>(req);
      const created = await createSubscriptionPlan(body);
      await recordAudit(req.profile!, 'SUBSCRIPTION_PLAN_CREATE', 'subscription_plan', created.id, {
        label: created.label,
        monthlyPriceKes: created.monthlyPriceKes,
        maxListings: created.maxListings,
        maxBuildings: created.maxBuildings,
      });
      res.status(201).json(created);
    }),
  );

  /** Super Admin updates an existing prepaid plan's pricing, unit/building limits, features, or visibility. */
  bffRouter.patch(
    '/admin/plans/:id',
    requireAuth,
    requireSuperAdmin,
    validateBody(updateSubscriptionPlanSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof updateSubscriptionPlanSchema>>(req);
      const updated = await updateSubscriptionPlan(req.params.id, body);
      await recordAudit(req.profile!, 'SUBSCRIPTION_PLAN_UPDATE', 'subscription_plan', updated.id, body);
      res.json(updated);
    }),
  );

  /** Super Admin deletes an unused custom prepaid plan. */
  bffRouter.delete(
    '/admin/plans/:id',
    requireAuth,
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const result = await deleteSubscriptionPlan(req.params.id);
      await recordAudit(req.profile!, 'SUBSCRIPTION_PLAN_DELETE', 'subscription_plan', req.params.id);
      res.json(result);
    }),
  );
}

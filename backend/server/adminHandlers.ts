import type {Response} from 'express';
import {withSystemAccess} from '../db/requestContext.ts';
import {eq, ne, and, or, sql} from 'drizzle-orm';
import {z} from 'zod';
import {createAndSendInvite} from './inviteService.ts';
import {db, schema} from '../db/client.ts';
import {invalidatePublicListings} from './http/cache.ts';
import {mediaUrlSchema} from './http/schemas.ts';
import type {AuthenticatedRequest, UserProfileRecord} from './types.ts';
import {
  assertCanProvision,
  provisionUserSchema,
  resolveProvisionedLandlordSubscription,
} from './provisionPolicy.ts';

export {assertCanProvision, provisionUserSchema, resolveProvisionedLandlordSubscription};

export const suspendUserSchema = z
  .object({
    status: z.enum(['active', 'suspended']),
  })
  .strict();

export const manualRentPaidSchema = z
  .object({
    note: z.string().max(500).optional(),
  })
  .strict();

export const updatePlatformBrandingSchema = z
  .object({
    brandLogoUrl: mediaUrlSchema.or(z.literal('')).nullable().optional(),
    brandPrimaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).or(z.literal('')).nullable().optional(),
    brandSecondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).or(z.literal('')).nullable().optional(),
  })
  .strict();

export const syncSuperAdminFromEnv = async (
  profile: UserProfileRecord,
  isEnvSuperAdmin: (email?: string | null) => boolean,
): Promise<UserProfileRecord> => {
  if (!isEnvSuperAdmin(profile.email) || profile.isSuperAdmin) return profile;

  const [updated] = await db
    .update(schema.users)
    .set({isSuperAdmin: true, isAdmin: true, role: 'admin'})
    .where(eq(schema.users.uid, profile.uid))
    .returning();

  return updated as unknown as UserProfileRecord;
};

export const handleProvisionUser = async (req: AuthenticatedRequest, res: Response, isAgencyAdmin = false) => {
  const body = req.validatedBody as z.infer<typeof provisionUserSchema>;
  const actor = req.profile!;
  assertCanProvision(actor, body, isAgencyAdmin);

  const email = body.email.toLowerCase();
  const platformId = actor.isSuperAdmin ? (body.platformId ?? actor.platformId ?? null) : (actor.platformId ?? null);
  // Every invitation records who created it, so the creator (and RLS) can see it later.
  const landlordId =
    body.role === 'tenant' || body.role === 'caretaker'
      ? body.landlordId || actor.uid
      : (body.landlordId ?? actor.uid);

  // Provisioning invites NEW people only. Updating an existing user from here let any
  // landlord rewrite someone else's role, admin flags and rent routing.
  const alreadyRegistered = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${email}`,
    columns: {uid: true, role: true},
  });
  if (alreadyRegistered) {
    // A landlord adding an already-registered tenant just records the link; it never
    // touches the user's profile, and never steals another landlord's invitation.
    if (body.role === 'tenant' && (alreadyRegistered.role === 'tenant' || alreadyRegistered.role === 'hunter')) {
      // hunter -> tenant is the only change allowed, and only for an account whose owner has
      // verified the mailbox; an unverified account gets it if and when it is verified.
      const authRow = await db.query.authUser.findFirst({
        where: eq(schema.authUser.id, alreadyRegistered.uid),
        columns: {emailVerified: true},
      });
      if (alreadyRegistered.role === 'hunter' && authRow?.emailVerified) {
        await db.update(schema.users).set({role: 'tenant'}).where(eq(schema.users.uid, alreadyRegistered.uid));
      }
      const [invitation] = await db
        .insert(schema.invitations)
        .values({email, displayName: body.displayName, phone: body.phone ?? null, role: 'tenant', platformId, landlordId: landlordId ?? null})
        .onConflictDoNothing()
        .returning();
      res.status(200).json({uid: alreadyRegistered.uid, email, invitation: invitation ?? null, existing: true});
      return;
    }
    res.status(409).json({error: 'An account with this email already exists.'});
    return;
  }

  // 1. No account is created now. The invitee gets a single-use link and creates the
  // account themselves (choosing their own password) — see server/inviteService.ts. The
  // provisioning-specific profile fields travel with the invite and are applied on accept.
  const isManagedLandlord = body.role === 'landlord';
  const isCaretaker = body.role === 'caretaker';
  const direct = body.rentRouting === 'direct';
  const profile = {
    rentRecipientId: isManagedLandlord && body.rentRouting === 'admin' ? actor.uid : null,
    managedByAdminId: isManagedLandlord ? actor.uid : isCaretaker ? (landlordId ?? actor.uid) : null,
    rentPayoutMethod: direct ? (body.rentPayoutMethod ?? null) : null,
    mpesaSettlementPhone: direct ? (body.mpesaSettlementPhone || null) : null,
    mpesaSettlementShortCode: direct ? (body.mpesaSettlementShortCode ?? null) : null,
    bankName: direct ? (body.bankName ?? null) : null,
    bankAccountNumber: direct ? (body.bankAccountNumber ?? null) : null,
    bankAccountName: direct ? (body.bankAccountName ?? null) : null,
    ...(isCaretaker && body.propertyIds?.length ? {propertyIds: body.propertyIds} : {}),
    ...(isManagedLandlord
      ? // Super admins can assign any explicit subscription tier; platform admins cover their
        // landlords; Pro Plus agencies pass their own subscription to managed landlords.
        actor.isSuperAdmin
        ? resolveProvisionedLandlordSubscription(body.subscriptionTier, body.subscriptionBilling ?? 'monthly')
        : actor.isAdmin
          ? {subscriptionPlan: 'proplus:yearly', subscriptionStatus: 'active' as const, subscriptionExpiresAt: '2099-12-31T23:59:59Z'}
          : {
              subscriptionPlan: actor.subscriptionPlan ?? null,
              subscriptionStatus: (actor.subscriptionStatus ?? 'none') as 'none' | 'pending' | 'active' | 'expired' | 'suspended',
              subscriptionExpiresAt: actor.subscriptionExpiresAt ? new Date(actor.subscriptionExpiresAt).toISOString() : null,
            }
      : {}),
  };

  // 2. The invitation row keeps the inviter's registry (LandlordDashboard lists it) and is
  // what Google sign-in / email verification fall back to.
  const invitationValues = {
    email,
    displayName: body.displayName,
    phone: body.phone || null,
    role: body.role,
    platformId,
    landlordId: landlordId ?? null,
  };
  // System access: a stale invitation for this email may belong to someone else
  // (invisible to the caller under RLS) and must still be replaced.
  const [invitation] = await withSystemAccess(() =>
    db
      .insert(schema.invitations)
      .values(invitationValues)
      .onConflictDoUpdate({target: schema.invitations.email, set: invitationValues})
      .returning(),
  );

  try {
    await createAndSendInvite({
      email,
      role: body.role,
      platformId,
      landlordId: landlordId ?? null,
      invitedBy: actor.uid,
      invitedByName: actor.displayName || 'MyBoma',
      displayName: body.displayName,
      phone: body.phone || null,
      profile,
    });
  } catch (err) {
    console.error('[Provisioning] Invite email failed:', err);
    res.status(502).json({error: 'The invitation was saved but the email could not be sent. Try again shortly.'});
    return;
  }

  console.log(`[Provisioning] Invited ${body.role} ${email} (by ${actor.uid})`);
  res.status(201).json({uid: null, email, invitation, invited: true});
};

const isDedicatedWhiteLabelAdmin = async (actor: {isAdmin?: boolean; isSuperAdmin?: boolean; platformId?: string | null}) => {
  if (!actor.isAdmin || actor.isSuperAdmin || !actor.platformId) return false;
  const platform = await withSystemAccess(() =>
    db.query.platforms.findFirst({
      where: eq(schema.platforms.id, actor.platformId!),
      columns: {ownerEmail: true},
    }),
  );
  return Boolean(platform?.ownerEmail);
};

export const handleSuspendUser = async (req: AuthenticatedRequest, res: Response) => {
  const {status} = req.validatedBody as z.infer<typeof suspendUserSchema>;
  const targetUid = req.params.uid;
  if (!targetUid) {
    res.status(400).json({error: 'User id is required'});
    return;
  }

  const actor = req.profile!;
  if (!actor.isSuperAdmin && !actor.isAdmin) {
    res.status(403).json({error: 'Forbidden'});
    return;
  }

  const target = await db.query.users.findFirst({
    where: eq(schema.users.uid, targetUid),
    columns: {uid: true, platformId: true, isAdmin: true, isSuperAdmin: true},
  });

  if (!target) {
    res.status(404).json({error: 'User not found'});
    return;
  }
  if (target.isSuperAdmin) {
    res.status(403).json({error: 'Super admin accounts cannot be paused or suspended.'});
    return;
  }
  if (target.isAdmin && !actor.isSuperAdmin) {
    res.status(403).json({error: 'Cannot modify another admin account'});
    return;
  }
  if (!actor.isSuperAdmin && (await isDedicatedWhiteLabelAdmin(actor)) && target.platformId !== actor.platformId) {
    res.status(403).json({error: 'User is outside your platform'});
    return;
  }

  // Enforced at app.ts's requireAuth (checks profile.status on every request) — there is
  // no separate auth-provider-level ban to set, unlike the old Supabase Auth admin API.
  await db.update(schema.users).set({status}).where(eq(schema.users.uid, targetUid));

  res.json({uid: targetUid, status});
};

export const handleDeleteUser = async (req: AuthenticatedRequest, res: Response) => {
  const targetUid = req.params.uid;
  const actor = req.profile!;

  try {
    if (targetUid === actor.uid) {
      res.status(400).json({error: 'You cannot delete your own account'});
      return;
    }

    // 1. Fetch user details first to check permissions and delete invitations/assignments
    const targetUser = await db.query.users.findFirst({
      where: eq(schema.users.uid, targetUid),
      columns: {email: true, platformId: true, role: true, isAdmin: true, isSuperAdmin: true, managedByAdminId: true, createdAt: true},
    });

    if (!targetUser) {
      res.status(404).json({error: 'User not found'});
      return;
    }

    if (targetUser.isSuperAdmin) {
      res.status(403).json({error: 'Super admin accounts cannot be deleted.'});
      return;
    }

    if (!actor.isSuperAdmin) {
      let isCreator = false;
      if (!actor.isAdmin && !targetUser.isAdmin && ['tenant', 'landlord', 'caretaker'].includes(targetUser.role)) {
        // "Creator" means the account was created from this actor's invitation (the
        // invitation predates the account) or is a landlord they manage — merely
        // linking an existing user later must not grant the power to delete them.
        const inv = await db.query.invitations.findFirst({
          where: eq(schema.invitations.email, targetUser.email),
          columns: {landlordId: true, createdAt: true},
        });
        // Provisioning writes the user row a moment before the invitation, so allow a
        // short window; an invitation added long after the account existed doesn't count.
        const PROVISION_WINDOW_MS = 5 * 60 * 1000;
        isCreator =
          targetUser.managedByAdminId === actor.uid ||
          Boolean(
            inv &&
              inv.landlordId === actor.uid &&
              inv.createdAt.getTime() <= targetUser.createdAt.getTime() + PROVISION_WINDOW_MS,
          );
      }

      const isWhiteLabelAdmin = await isDedicatedWhiteLabelAdmin(actor);
      const isPlatformAdminOfTarget =
        Boolean(actor.isAdmin) &&
        !targetUser.isAdmin &&
        (!isWhiteLabelAdmin || targetUser.platformId === actor.platformId);
      if (!isCreator && !isPlatformAdminOfTarget) {
        res.status(403).json({error: 'You do not have permission to delete this user.'});
        return;
      }
    }

    // 2+3 in ONE transaction: delete the auth user (cascades to public.users and Better-Auth
    // session/account rows), purge invitations, unassign units and cancel unpaid invoices.
    // A failure part-way used to leave orphaned tenancies and invoices behind.
    const email = targetUser.email.trim().toLowerCase();
    // System access: authorization was decided above; cleanup must reach every tenancy and
    // invoice of this account, not just the rows visible to the caller under RLS.
    await withSystemAccess(() => db.transaction(async (tx) => {
      await tx
        .update(schema.leases)
        .set({status: 'ended', endDate: new Date().toISOString().slice(0, 10), endedAt: new Date()})
        .where(
          and(
            eq(schema.leases.status, 'active'),
            or(eq(schema.leases.tenantUserId, targetUid), sql`lower(${schema.leases.tenantEmail}) = ${email}`),
          ),
        );
      await tx.delete(schema.authUser).where(eq(schema.authUser.id, targetUid));
      // Exact (case-insensitive) matches: ilike treated '_' in emails as a wildcard and
      // could wipe other people's tenancies and invoices.
      await tx.delete(schema.invitations).where(sql`lower(${schema.invitations.email}) = ${email}`);
      await tx
        .update(schema.properties)
        .set({tenantId: null, status: 'available'})
        .where(or(sql`lower(${schema.properties.tenantId}) = ${email}`, eq(schema.properties.tenantId, targetUid)));
      await tx
        .delete(schema.rentPayments)
        .where(
          and(
            or(sql`lower(${schema.rentPayments.tenantId}) = ${email}`, eq(schema.rentPayments.tenantId, targetUid)),
            ne(schema.rentPayments.status, 'paid'),
          ),
        );
    }));
    invalidatePublicListings();

    res.json({deleted: true});
  } catch (err: any) {
    console.error('Error in handleDeleteUser:', err);
    res.status(500).json({error: 'Failed to delete user'});
  }
};

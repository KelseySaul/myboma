import type {Response} from 'express';
import {eq, ne, and, or, sql} from 'drizzle-orm';
import {z} from 'zod';
import {APIError} from 'better-auth';
import {auth} from './auth.ts';
import {db, schema} from '../db/client.ts';
import type {AuthenticatedRequest, UserProfileRecord} from './types.ts';

const emailSchema = z.string().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const phoneSchema = z
  .string()
  .max(20)
  .regex(/^\+?\d+$/)
  .or(z.literal(''))
  .nullable()
  .optional();

export const provisionUserSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().min(1).max(120),
    phone: phoneSchema,
    role: z.enum(['tenant', 'landlord', 'hunter', 'admin']),
    platformId: z.string().uuid().nullable().optional(),
    landlordId: z.string().uuid().optional(),
    mustChangePassword: z.boolean().optional(),
    rentRouting: z.enum(['direct', 'admin']).optional(),
    rentPayoutMethod: z.enum(['cash', 'mpesa', 'bank']).optional(),
    mpesaSettlementPhone: phoneSchema,
    mpesaSettlementShortCode: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankAccountName: z.string().optional(),
  })
  .strict();

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
    brandLogoUrl: z.string().url().or(z.literal('')).nullable().optional(),
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

const forbidden = (message: string) => {
  const error = new Error(message);
  (error as any).statusCode = 403;
  return error;
};

/**
 * Who may create which accounts:
 * - super admin: anything, including other admins.
 * - platform admin (isAdmin): tenants/landlords/hunters inside their own platform only.
 * - Pro Plus agency admin / landlord: tenants for themselves; agencies may also add
 *   managed landlords. Nobody but a super admin can mint an admin.
 */
export const assertCanProvision = (
  actor: UserProfileRecord,
  body: z.infer<typeof provisionUserSchema>,
  isAgencyAdmin = false,
) => {
  if (actor.isSuperAdmin) return;
  if (body.role === 'admin') throw forbidden('Only a super admin can create admin accounts.');

  if (actor.isAdmin) {
    if (!actor.platformId) throw forbidden('Your admin account is not attached to a platform.');
    if (body.platformId && body.platformId !== actor.platformId) {
      throw forbidden('Cannot provision users outside your platform.');
    }
    return;
  }

  if (body.platformId && body.platformId !== (actor.platformId ?? null)) {
    throw forbidden('Cannot provision users outside your platform.');
  }

  if (body.role === 'tenant') {
    if (body.landlordId && body.landlordId !== actor.uid) {
      throw forbidden('You can only provision tenants for your own account.');
    }
    if (actor.role === 'landlord' || isAgencyAdmin) return;
  }

  if (body.role === 'landlord' && isAgencyAdmin) return;

  throw forbidden('You are not allowed to provision this user type.');
};

export const handleProvisionUser = async (req: AuthenticatedRequest, res: Response, isAgencyAdmin = false) => {
  const body = req.validatedBody as z.infer<typeof provisionUserSchema>;
  const actor = req.profile!;
  assertCanProvision(actor, body, isAgencyAdmin);

  const email = body.email.toLowerCase();
  const platformId = actor.isSuperAdmin ? (body.platformId ?? actor.platformId ?? null) : (actor.platformId ?? null);
  const landlordId = body.role === 'tenant' ? body.landlordId || actor.uid : body.landlordId;

  // 1. Try to create the auth user. signUpEmail also runs databaseHooks.user.create.after
  // (server/auth.ts), which seeds a baseline public.users row from these same fields.
  // Provisioning creates NEW accounts only. Updating an existing user from here let any
  // landlord rewrite someone else's role, admin flags and rent routing.
  const alreadyRegistered = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${email}`,
    columns: {uid: true, role: true},
  });
  if (alreadyRegistered) {
    // A landlord adding an already-registered tenant just records the link; it never
    // touches the user's profile, and never steals another landlord's invitation.
    if (body.role === 'tenant' && (alreadyRegistered.role === 'tenant' || alreadyRegistered.role === 'hunter')) {
      // hunter -> tenant is the only change allowed: it grants no extra privilege.
      if (alreadyRegistered.role === 'hunter') {
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

  let uid: string | undefined;
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password: body.password,
        name: body.displayName,
        phone: body.phone,
        intended_role: body.role,
        must_change_password: body.mustChangePassword ?? true,
      } as Parameters<typeof auth.api.signUpEmail>[0]['body'],
    });
    uid = signUpResult.user.id;
  } catch (err) {
    const isDuplicate = err instanceof APIError && err.status === 'UNPROCESSABLE_ENTITY';
    if (isDuplicate) {
      res.status(409).json({error: 'An account with this email already exists.'});
      return;
    }
    console.error('[Provisioning] signUpEmail failed:', err);
    res.status(400).json({error: 'Failed to create user'});
    return;
  }

  if (!uid) {
    res.status(500).json({error: 'Failed to resolve user ID'});
    return;
  }

  // 2. Upsert the profile with admin-provisioning-specific fields the signup hook
  // doesn't set (payout routing, managed-landlord subscription defaults, etc).
  const isManagedLandlord = body.role === 'landlord';
  const rentRecipientId = isManagedLandlord && body.rentRouting === 'admin' ? actor.uid : null;
  const managedByAdminId = isManagedLandlord ? actor.uid : null;

  const profileValues = {
    uid,
    email,
    displayName: body.displayName,
    role: body.role,
    platformId,
    phone: body.phone ?? null,
    isAdmin: body.role === 'admin',
    isSuperAdmin: false,
    mustChangePassword: body.mustChangePassword ?? true,
    rentRecipientId,
    managedByAdminId,
    rentPayoutMethod: body.rentRouting === 'direct' ? (body.rentPayoutMethod ?? null) : null,
    mpesaSettlementPhone: body.rentRouting === 'direct' ? (body.mpesaSettlementPhone ?? null) : null,
    mpesaSettlementShortCode: body.rentRouting === 'direct' ? (body.mpesaSettlementShortCode ?? null) : null,
    bankName: body.rentRouting === 'direct' ? (body.bankName ?? null) : null,
    bankAccountNumber: body.rentRouting === 'direct' ? (body.bankAccountNumber ?? null) : null,
    bankAccountName: body.rentRouting === 'direct' ? (body.bankAccountName ?? null) : null,
    ...(isManagedLandlord
      ? {
          // Landlords managed by a platform admin are covered by the platform; landlords
          // managed by a Pro Plus agency inherit the agency's plan (and are extended when
          // the agency renews — see activateLandlordSubscription).
          ...(actor.isAdmin || actor.isSuperAdmin
            ? {
                subscriptionPlan: 'proplus:yearly',
                subscriptionStatus: 'active' as const,
                subscriptionExpiresAt: new Date('2099-12-31T23:59:59Z'),
              }
            : {
                subscriptionPlan: actor.subscriptionPlan ?? null,
                subscriptionStatus: (actor.subscriptionStatus ?? 'none') as 'none' | 'pending' | 'active' | 'expired' | 'suspended',
                subscriptionExpiresAt: actor.subscriptionExpiresAt ? new Date(actor.subscriptionExpiresAt) : null,
              }),
        }
      : {}),
  };

  await db
    .insert(schema.users)
    .values(profileValues)
    .onConflictDoUpdate({target: schema.users.uid, set: profileValues});

  // 3. Ensure the invitation exists for the landlord's tenant list. We NO LONGER
  // delete it here, as the LandlordDashboard relies on the invitations table
  // to show the registry of tenants linked to that landlord.
  const invitationValues = {
    email,
    displayName: body.displayName,
    phone: body.phone ?? null,
    role: body.role,
    platformId,
    landlordId: landlordId ?? null,
  };

  // Stale invitation rows for a brand-new account are replaced; there is no user yet
  // whose relationships could be hijacked.
  const [invitation] = await db
    .insert(schema.invitations)
    .values(invitationValues)
    .onConflictDoUpdate({target: schema.invitations.email, set: invitationValues})
    .returning();

  console.log(`[Provisioning] Provisioned ${body.role} ${uid} (landlord: ${landlordId ?? 'none'})`);
  res.status(201).json({uid, email, invitation});
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
    columns: {uid: true, platformId: true, isSuperAdmin: true},
  });

  if (!target) {
    res.status(404).json({error: 'User not found'});
    return;
  }
  if (target.isSuperAdmin && !actor.isSuperAdmin) {
    res.status(403).json({error: 'Cannot modify a super admin'});
    return;
  }
  if (!actor.isSuperAdmin && (!actor.platformId || target.platformId !== actor.platformId)) {
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

    if (targetUser.isSuperAdmin && !actor.isSuperAdmin) {
      res.status(403).json({error: 'Cannot delete a super admin'});
      return;
    }

    if (!actor.isSuperAdmin) {
      let isCreator = false;
      if (!actor.isAdmin && !targetUser.isAdmin && ['tenant', 'landlord'].includes(targetUser.role)) {
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

      const isPlatformAdminOfTarget =
        Boolean(actor.isAdmin) && Boolean(actor.platformId) && targetUser.platformId === actor.platformId && !targetUser.isAdmin;
      if (!isCreator && !isPlatformAdminOfTarget) {
        res.status(403).json({error: 'You do not have permission to delete this user.'});
        return;
      }
    }

    // 2. Delete the auth user — cascades to public.users (FK onDelete: 'cascade') and to
    // Better-Auth's own session/account rows.
    await db.delete(schema.authUser).where(eq(schema.authUser.id, targetUid));

    // 3. Purge invitations, unassign properties, and cancel unpaid invoices for the user email
    if (targetUser?.email) {
      const email = targetUser.email.trim().toLowerCase();
      // Exact (case-insensitive) matches: ilike treated '_' in emails as a wildcard and
      // could wipe other people's tenancies and invoices.
      await db.delete(schema.invitations).where(sql`lower(${schema.invitations.email}) = ${email}`);
      await db
        .update(schema.properties)
        .set({tenantId: null, status: 'available'})
        .where(or(sql`lower(${schema.properties.tenantId}) = ${email}`, eq(schema.properties.tenantId, targetUid)));
      await db
        .delete(schema.rentPayments)
        .where(
          and(
            or(sql`lower(${schema.rentPayments.tenantId}) = ${email}`, eq(schema.rentPayments.tenantId, targetUid)),
            ne(schema.rentPayments.status, 'paid'),
          ),
        );
    }

    res.json({deleted: true});
  } catch (err: any) {
    console.error('Error in handleDeleteUser:', err);
    res.status(500).json({error: 'Failed to delete user'});
  }
};

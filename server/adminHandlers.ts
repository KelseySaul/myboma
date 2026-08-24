import type {Response} from 'express';
import {eq, ilike, ne, and} from 'drizzle-orm';
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

export const assertCanProvision = (actor: UserProfileRecord, body: z.infer<typeof provisionUserSchema>) => {
  if (actor.isSuperAdmin) return;

  if (actor.role === 'landlord' && ['tenant', 'landlord', 'hunter'].includes(body.role)) {
    if (body.role === 'tenant' && body.landlordId && body.landlordId !== actor.uid) {
      const error = new Error('You can only provision tenants for your own account.');
      (error as any).statusCode = 403;
      throw error;
    }
    return;
  }

  if ((actor.isAdmin || actor.role === 'admin') && ['tenant', 'landlord', 'hunter', 'admin'].includes(body.role)) {
    if (body.platformId && actor.platformId && body.platformId !== actor.platformId) {
      const error = new Error('Cannot provision users outside your platform.');
      (error as any).statusCode = 403;
      throw error;
    }
    return;
  }

  const error = new Error('You are not allowed to provision this user type.');
  (error as any).statusCode = 403;
  throw error;
};

export const handleProvisionUser = async (req: AuthenticatedRequest, res: Response) => {
  const body = req.validatedBody as z.infer<typeof provisionUserSchema>;
  const actor = req.profile!;
  assertCanProvision(actor, body);

  const email = body.email.toLowerCase();
  const platformId = body.platformId ?? actor.platformId ?? null;
  const landlordId = body.role === 'tenant' ? body.landlordId || actor.uid : body.landlordId;

  // 1. Try to create the auth user. signUpEmail also runs databaseHooks.user.create.after
  // (server/auth.ts), which seeds a baseline public.users row from these same fields.
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
    // If the user already exists, look them up by email instead of failing.
    const isDuplicate = err instanceof APIError && err.status === 'UNPROCESSABLE_ENTITY';
    if (!isDuplicate) {
      res.status(400).json({error: err instanceof Error ? err.message : 'Failed to create user'});
      return;
    }
    const existingProfile = await db.query.users.findFirst({
      where: ilike(schema.users.email, email),
      columns: {uid: true},
    });
    uid = existingProfile?.uid;
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
          subscriptionPlan: actor.subscriptionPlan ?? 'pro_plus:monthly',
          subscriptionStatus: (actor.subscriptionStatus ?? 'active') as 'none' | 'pending' | 'active' | 'expired' | 'suspended',
          subscriptionExpiresAt: actor.subscriptionExpiresAt ? new Date(actor.subscriptionExpiresAt) : new Date('2099-12-31T23:59:59Z'),
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

  const [invitation] = await db
    .insert(schema.invitations)
    .values(invitationValues)
    .onConflictDoUpdate({target: schema.invitations.email, set: invitationValues})
    .returning();

  console.log(`[Provisioning] Successfully provisioned ${body.role}: ${email} (UID: ${uid}, Landlord: ${landlordId})`);
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
  if (!actor.isSuperAdmin && actor.platformId && target.platformId !== actor.platformId) {
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
    console.log(`[handleDeleteUser] Attempting to delete targetUid: "${targetUid}" by actor: ${actor.uid}`);

    const targetUser = await db.query.users.findFirst({
      where: eq(schema.users.uid, targetUid),
      columns: {email: true, platformId: true, role: true},
    });

    console.log(`[handleDeleteUser] Fetch result - targetUser:`, targetUser);

    if (!targetUser) {
      res.status(404).json({error: 'User not found'});
      return;
    }

    if (!actor.isSuperAdmin) {
      let isCreator = false;
      if (!actor.isAdmin) {
        const inv = await db.query.invitations.findFirst({
          where: eq(schema.invitations.email, targetUser.email),
          columns: {landlordId: true},
        });
        if (inv && inv.landlordId === actor.uid) {
          isCreator = true;
        }
      }

      if (!isCreator && (!actor.isAdmin || targetUser.platformId !== actor.platformId)) {
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
      await db.delete(schema.invitations).where(ilike(schema.invitations.email, email));
      await db
        .update(schema.properties)
        .set({tenantId: null, status: 'available'})
        .where(ilike(schema.properties.tenantId, email));
      await db
        .delete(schema.rentPayments)
        .where(and(ilike(schema.rentPayments.tenantId, email), ne(schema.rentPayments.status, 'paid')));
    }

    res.json({deleted: true});
  } catch (err: any) {
    console.error('Error in handleDeleteUser:', err);
    res.status(500).json({error: err.message || 'Internal Server Error'});
  }
};

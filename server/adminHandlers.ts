import type {SupabaseClient} from '@supabase/supabase-js';
import type {Response} from 'express';
import {z} from 'zod';
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

export const syncSuperAdminFromEnv = async (
  supabase: SupabaseClient,
  profile: UserProfileRecord,
  isEnvSuperAdmin: (email?: string | null) => boolean,
): Promise<UserProfileRecord> => {
  if (!isEnvSuperAdmin(profile.email) || profile.isSuperAdmin) return profile;

  const {data, error} = await supabase
    .from('users')
    .update({isSuperAdmin: true, isAdmin: true, role: 'admin'})
    .eq('uid', profile.uid)
    .select('uid,email,displayName,role,platformId,phone,isAdmin,isSuperAdmin,stripeAccountId,mpesaSettlementPhone,mpesaSettlementShortCode')
    .single();

  if (error) throw error;
  return data as UserProfileRecord;
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

export const handleProvisionUser =
  (supabase: SupabaseClient) => async (req: AuthenticatedRequest, res: Response) => {
    const body = req.validatedBody as z.infer<typeof provisionUserSchema>;
    const actor = req.profile!;
    assertCanProvision(actor, body);

    const email = body.email.toLowerCase();
    const platformId = body.platformId ?? actor.platformId ?? null;
    const landlordId = body.role === 'tenant' ? body.landlordId || actor.uid : body.landlordId;

    // 1. Try to create the auth user
    let uid: string | undefined;
    const {data: authData, error: authError} = await supabase.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        full_name: body.displayName,
        phone: body.phone,
        intended_role: body.role,
        must_change_password: body.mustChangePassword ?? true,
      },
    });

    if (authError) {
      // If user already exists, look them up by email from the users table (service role bypasses RLS)
      if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already exists')) {
        const {data: existingProfile} = await supabase
          .from('users')
          .select('uid')
          .ilike('email', email)
          .maybeSingle();
        if (existingProfile?.uid) {
          uid = existingProfile.uid;
        }
      }

      if (!uid) {
        res.status(400).json({error: authError.message});
        return;
      }
    } else {
      uid = authData.user?.id;
    }

    if (!uid) {
      res.status(500).json({error: 'Failed to resolve user ID'});
      return;
    }

    // 2. Upsert the profile
    const {error: upsertError} = await supabase.from('users').upsert(
      [
        {
          uid,
          email,
          displayName: body.displayName,
          role: body.role,
          platformId,
          phone: body.phone ?? null,
          isAdmin: body.role === 'admin',
          isSuperAdmin: false,
          mustChangePassword: body.mustChangePassword ?? true,
        },
      ],
      {onConflict: 'uid'},
    );

    if (upsertError) {
      res.status(500).json({error: `Profile sync failed: ${upsertError.message}`});
      return;
    }

    // 3. Ensure the invitation exists for the landlord's tenant list
    // We NO LONGER delete it here, as the LandlordDashboard relies on the invitations table
    // to show the registry of tenants linked to that landlord.
    const {data: invitation, error: invError} = await supabase.from('invitations').upsert(
      [
        {
          email,
          displayName: body.displayName,
          phone: body.phone ?? null,
          role: body.role,
          platformId,
          landlordId: landlordId ?? null,
        },
      ],
      {onConflict: 'email'},
    ).select().maybeSingle();

    if (invError) {
      console.error(`[Provisioning] Invitation upsert failed for ${email}:`, invError);
      res.status(500).json({error: `Invitation sync failed: ${invError.message}`});
      return;
    }

    console.log(`[Provisioning] Successfully provisioned ${body.role}: ${email} (UID: ${uid}, Landlord: ${landlordId})`);
    res.status(201).json({uid, email, invitation});
  };

export const handleSuspendUser =
  (supabase: SupabaseClient) => async (req: AuthenticatedRequest, res: Response) => {
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

    const {data: target, error: targetError} = await supabase
      .from('users')
      .select('uid,platformId,isSuperAdmin')
      .eq('uid', targetUid)
      .maybeSingle();

    if (targetError) throw targetError;
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

    const banDuration = status === 'suspended' ? '876000h' : 'none';
    const {error: authError} = await supabase.auth.admin.updateUserById(targetUid, {ban_duration: banDuration});
    if (authError) throw authError;

    const {error: dbError} = await supabase.from('users').update({status}).eq('uid', targetUid);
    if (dbError) throw dbError;

    res.json({uid: targetUid, status});
  };

export const handleDeleteUser =
  (supabase: SupabaseClient) => async (req: AuthenticatedRequest, res: Response) => {
    const targetUid = req.params.uid;
    const actor = req.profile!;

    try {
      if (targetUid === actor.uid) {
        res.status(400).json({error: 'You cannot delete your own account'});
        return;
      }

      // 1. Fetch user details first to check permissions and delete invitations/assignments
      console.log(`[handleDeleteUser] Attempting to delete targetUid: "${targetUid}" by actor: ${actor.uid}`);
      
      const { data: targetUser, error: fetchError } = await supabase
        .from('users')
        .select('email, platformId, role')
        .eq('uid', targetUid)
        .maybeSingle();

      console.log(`[handleDeleteUser] Fetch result - targetUser:`, targetUser, `error:`, fetchError);

      if (!targetUser) {
        res.status(404).json({error: 'User not found'});
        return;
      }

      if (!actor.isSuperAdmin) {
        let isCreator = false;
        if (!actor.isAdmin) {
          const { data: inv } = await supabase.from('invitations').select('landlordId').eq('email', targetUser.email).maybeSingle();
          if (inv && inv.landlordId === actor.uid) {
            isCreator = true;
          }
        }
        
        if (!isCreator && (!actor.isAdmin || targetUser.platformId !== actor.platformId)) {
          res.status(403).json({error: 'You do not have permission to delete this user.'});
          return;
        }
      }

      // 2. Delete auth user
      const {error: authError} = await supabase.auth.admin.deleteUser(targetUid);
      if (authError) throw authError;

      // 3. Delete user profile
      await supabase.from('users').delete().eq('uid', targetUid);

      // 4. Purge invitations, unassign properties, and cancel unpaid invoices for the user email
      if (targetUser?.email) {
        const email = targetUser.email.trim().toLowerCase();
        await supabase.from('invitations').delete().ilike('email', email);
        await supabase.from('properties').update({ tenantId: null, status: 'available' }).ilike('tenantId', email);
        await supabase.from('rentPayments').delete().ilike('tenantId', email).neq('status', 'paid');
      }

      res.json({deleted: true});
    } catch (err: any) {
      console.error('Error in handleDeleteUser:', err);
      res.status(500).json({error: err.message || 'Internal Server Error'});
    }
  };

import type {Request} from 'express';
import type {Actor} from '../db/authz.ts';

export type ClientKind = 'web' | 'mobile';

/** Minimal shape of a Better-Auth session user, as used by requireAuth in app.ts. */
export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  clientKind?: ClientKind;
  authUser?: AuthUser;
  profile?: UserProfileRecord;
  validatedBody?: unknown;
}

export interface UserProfileRecord {
  uid: string;
  email: string;
  displayName?: string;
  role?: string;
  platformId?: string | null;
  phone?: string | null;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  stripeAccountId?: string | null;
  mpesaSettlementPhone?: string | null;
  mpesaSettlementShortCode?: string | null;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: string | null;
}

/** Adapts a requireAuth-loaded profile (uid-keyed) to db/authz.ts's Actor shape (id-keyed). */
export const toActor = (profile: UserProfileRecord): Actor => ({
  id: profile.uid,
  email: profile.email,
  role: (profile.role as Actor['role']) ?? 'hunter',
  isAdmin: Boolean(profile.isAdmin),
  isSuperAdmin: Boolean(profile.isSuperAdmin),
  platformId: profile.platformId ?? null,
});

export interface RentPaymentRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  platformId?: string | null;
  amount: number | string;
  status: string;
  dueDate?: string;
}

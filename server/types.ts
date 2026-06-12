import type {Request} from 'express';
import type {User} from '@supabase/supabase-js';

export type ClientKind = 'web' | 'mobile';

export interface AuthenticatedRequest extends Request {
  clientKind?: ClientKind;
  authUser?: User;
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

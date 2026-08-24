import { insertAuditLog } from './api';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'PROFILE_UPDATE'
  | 'PROPERTY_VIEW'
  | 'PROPERTY_CREATE'
  | 'PROPERTY_UPDATE'
  | 'PROPERTY_DELETE'
  | 'BOOKING_CREATE'
  | 'BOOKING_CANCEL'
  | 'MAINTENANCE_CREATE'
  | 'MAINTENANCE_UPDATE'
  | 'PAYMENT_MARK_PAID'
  | 'TENANT_INVITE'
  | 'BUILDING_CREATE'
  | 'ADMIN_IMPERSONATE_START'
  | 'ADMIN_IMPERSONATE_END';

export interface AuditMeta {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Fire-and-forget audit logger. Never throws — safe to call anywhere.
 */
export async function logAudit(
  action: AuditAction,
  resource?: string,
  resourceId?: string,
  metadata?: AuditMeta
): Promise<void> {
  try {
    await insertAuditLog({
      action,
      resource: resource ?? null,
      resourceId: resourceId ?? null,
      metadata: metadata ?? null,
    });
  } catch {
    // Silently ignore — audit logging should never break the UI
  }
}

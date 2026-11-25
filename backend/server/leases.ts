/**
 * Tenancy lifecycle. Every assignment of a tenant to a unit creates a lease row; every
 * unassignment ends it. The legacy properties.tenantId column is still written alongside
 * (by the callers) so existing screens keep working while reads migrate to leases.
 */
import {and, eq, inArray, sql} from 'drizzle-orm';
import {db, schema} from '../db/client.ts';
import {billingToday} from '../../shared/rentInvoices.ts';

type Property = {id: string; landlordId: string; platformId: string | null; price: string | number};

const resolveTenantUserId = async (tenantRef: string) => {
  const ref = tenantRef.trim().toLowerCase();
  if (!ref.includes('@')) return ref; // already a uid
  // Link only an account that really belongs to this mailbox: a tenant account (created
  // through an invitation or provisioning) or one whose email is verified. An unverified
  // self-signup using someone else's address must not be attached to their tenancy.
  const rows = await db
    .select({uid: schema.users.uid, role: schema.users.role, emailVerified: schema.authUser.emailVerified})
    .from(schema.users)
    .leftJoin(schema.authUser, eq(schema.authUser.id, schema.users.uid))
    .where(sql`lower(${schema.users.email}) = ${ref}`)
    .limit(1);
  const user = rows[0];
  if (!user || !(user.role === 'tenant' || user.emailVerified)) return null;
  return user.uid;
};

const resolveTenantEmail = async (tenantRef: string) => {
  const ref = tenantRef.trim().toLowerCase();
  if (ref.includes('@')) return ref;
  const user = await db.query.users.findFirst({where: eq(schema.users.uid, ref), columns: {email: true}});
  return user?.email.toLowerCase() ?? ref;
};

export interface StartLeaseOptions {
  depositAmount?: number | null;
  dueDay?: number | null;
}

/** Ends any active lease on the unit and starts a new one for `tenantRef` (email or uid). */
export const startLease = async (property: Property, tenantRef: string, options: StartLeaseOptions = {}) => {
  return db.transaction(async (tx) => {
    // Lock the unit so concurrent assignments serialize, then follow whatever tenant the
    // property row holds NOW: if another request assigned someone else after the caller's
    // property update, the lease must match the property, not the stale argument.
    const [locked] = await tx.execute<{tenantId: string | null}>(
      sql`SELECT "tenantId" FROM properties WHERE id = ${property.id} FOR UPDATE`,
    ).then((result) => result.rows);
    const effectiveRef = locked?.tenantId ?? tenantRef;
    const [tenantUserId, tenantEmail] = await Promise.all([resolveTenantUserId(effectiveRef), resolveTenantEmail(effectiveRef)]);
    const depositVal =
      typeof options.depositAmount === 'number' && Number.isFinite(options.depositAmount) && options.depositAmount >= 0
        ? String(options.depositAmount)
        : undefined;
    const dueDayVal =
      typeof options.dueDay === 'number' && Number.isInteger(options.dueDay) && options.dueDay >= 1 && options.dueDay <= 28
        ? options.dueDay
        : undefined;

    const current = await tx.query.leases.findFirst({
      where: and(eq(schema.leases.propertyId, property.id), eq(schema.leases.status, 'active')),
    });
    if (current && (current.tenantEmail === tenantEmail || (tenantUserId && current.tenantUserId === tenantUserId))) {
      if (depositVal !== undefined || dueDayVal !== undefined) {
        const [updatedLease] = await tx
          .update(schema.leases)
          .set({
            ...(depositVal !== undefined ? {depositAmount: depositVal} : {}),
            ...(dueDayVal !== undefined ? {dueDay: dueDayVal} : {}),
          })
          .where(eq(schema.leases.id, current.id))
          .returning();
        return updatedLease;
      }
      return current; // same tenant re-assigned: keep the existing tenancy
    }
    if (current) {
      await tx
        .update(schema.leases)
        .set({status: 'ended', endDate: billingToday(), endedAt: new Date()})
        .where(eq(schema.leases.id, current.id));
    }
    const [lease] = await tx
      .insert(schema.leases)
      .values({
        propertyId: property.id,
        landlordId: property.landlordId,
        platformId: property.platformId,
        tenantUserId,
        tenantEmail,
        startDate: billingToday(),
        rentAmount: String(property.price ?? 0),
        ...(depositVal !== undefined ? {depositAmount: depositVal} : {}),
        ...(dueDayVal !== undefined ? {dueDay: dueDayVal} : {}),
      })
      .returning();
    return lease;
  });
};

/** Ends the active lease on a unit (tenant moved out / unassigned). */
export const endLeaseForProperty = async (propertyId: string) => {
  await db
    .update(schema.leases)
    .set({status: 'ended', endDate: billingToday(), endedAt: new Date()})
    .where(and(eq(schema.leases.propertyId, propertyId), eq(schema.leases.status, 'active')));
};

/** Ends every active lease a tenant holds, optionally only with one landlord. */
export const endLeasesForTenant = async (tenantEmail: string, tenantUserId?: string | null, landlordId?: string) => {
  const email = tenantEmail.trim().toLowerCase();
  const tenantMatch = tenantUserId
    ? sql`(lower(${schema.leases.tenantEmail}) = ${email} OR ${schema.leases.tenantUserId} = ${tenantUserId})`
    : sql`lower(${schema.leases.tenantEmail}) = ${email}`;
  await db
    .update(schema.leases)
    .set({status: 'ended', endDate: billingToday(), endedAt: new Date()})
    .where(
      and(
        eq(schema.leases.status, 'active'),
        tenantMatch,
        ...(landlordId ? [eq(schema.leases.landlordId, landlordId)] : []),
      ),
    );
};

/** Active lease id per property, for stamping invoices. */
export const activeLeaseIdsByProperty = async (propertyIds: string[]) => {
  if (propertyIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({id: schema.leases.id, propertyId: schema.leases.propertyId})
    .from(schema.leases)
    .where(and(inArray(schema.leases.propertyId, propertyIds), eq(schema.leases.status, 'active')));
  return new Map(rows.map((row) => [row.propertyId, row.id]));
};

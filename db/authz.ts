/**
 * App-layer replacement for the Supabase Row-Level-Security policies that used to run
 * inside Postgres (see supabase-setup.sql, section 7). Neon has no RLS enforcement for
 * this app, so every handler in app.ts / server/*.ts that reads or writes one of these
 * tables MUST call the matching function here before touching the row. There is no
 * fallback safety net if a check is skipped.
 *
 * Each function is a 1:1 port of the original policy's USING/WITH CHECK logic,
 * including its existing quirks (documented inline) — those are preserved on purpose,
 * not fixed as a side effect of this migration.
 */
import { and, eq, or, sql } from 'drizzle-orm';
import { db, schema } from './client.js';

export type Actor = {
  id: string; // users.uid (== Better-Auth user.id)
  email: string;
  role: 'landlord' | 'tenant' | 'hunter' | 'admin';
  isAdmin: boolean;
  isSuperAdmin: boolean;
  platformId: string | null;
};

const email = (value: string) => value.trim().toLowerCase();

/** Postgres `IS NOT DISTINCT FROM` — null-safe equality used throughout the original policies. */
const platformMatches = (a: string | null, b: string | null) => a === b;

export const isSuperAdmin = (actor: Actor) => actor.isSuperAdmin;
export const isAdmin = (actor: Actor) => actor.isSuperAdmin || actor.isAdmin;
export const isAdminInPlatform = (actor: Actor, platformId: string | null) =>
  isSuperAdmin(actor) || (isAdmin(actor) && platformMatches(actor.platformId, platformId));

export async function isPropertyManager(actor: Actor, propertyId: string): Promise<boolean> {
  const row = await db.query.propertyManagers.findFirst({
    where: and(
      eq(schema.propertyManagers.propertyId, propertyId),
      eq(schema.propertyManagers.userId, actor.id),
    ),
  });
  return Boolean(row);
}

export async function isBuildingManager(actor: Actor, buildingId: string): Promise<boolean> {
  const row = await db
    .select({ id: schema.properties.id })
    .from(schema.properties)
    .innerJoin(schema.propertyManagers, eq(schema.propertyManagers.propertyId, schema.properties.id))
    .where(and(eq(schema.properties.buildingId, buildingId), eq(schema.propertyManagers.userId, actor.id)))
    .limit(1);
  return row.length > 0;
}

// ---------------------------------------------------------------------------
// platforms — "Super admins manage platforms": FOR ALL, super admin only.
// ---------------------------------------------------------------------------
export const canManagePlatform = (actor: Actor) => isSuperAdmin(actor);

/**
 * The original SQL had no SELECT grant for plain admins/landlords/tenants to read
 * `platforms` (only super admins, via canManagePlatform) even though the client reads
 * platform branding (Navbar/SettingsPage) — a pre-existing gap the research flagged.
 * Since branding now flows through a trusted BFF endpoint (not a per-row anon client),
 * it's safe to allow any authenticated member of the platform (or an admin of it) to
 * read non-sensitive branding fields. This is a deliberate widening, not a port.
 */
export const canReadPlatformBranding = (actor: Actor, platformId: string) =>
  isSuperAdmin(actor) || platformMatches(actor.platformId, platformId) || isAdminInPlatform(actor, platformId);

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
type UserRow = typeof schema.users.$inferSelect;

export async function canViewUser(actor: Actor, target: UserRow): Promise<boolean> {
  if (target.uid === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, target.platformId)) return true;
  if (email(target.email) === email(actor.email)) return true;

  const ownedProperty = await db
    .select({ id: schema.properties.id })
    .from(schema.properties)
    .where(
      and(
        eq(schema.properties.landlordId, target.uid),
        or(eq(schema.properties.status, 'available'), sql`lower(coalesce(${schema.properties.tenantId}, '')) = ${email(actor.email)}`),
      ),
    )
    .limit(1);
  if (ownedProperty.length > 0) return true;

  const invitedByActor = await db.query.invitations.findFirst({
    where: and(eq(schema.invitations.email, target.email), eq(schema.invitations.landlordId, actor.id)),
  });
  return Boolean(invitedByActor);
}

/** Shared by INSERT and UPDATE — the original policies use the identical predicate for both. */
export function canWriteUser(
  actor: Actor,
  row: { uid: string; platformId: string | null; isAdmin: boolean; isSuperAdmin: boolean; role: string },
): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, row.platformId)) return true;
  return (
    row.uid === actor.id &&
    row.isSuperAdmin === false &&
    row.isAdmin === false &&
    (['landlord', 'tenant', 'hunter'] as string[]).includes(row.role)
  );
}

// ---------------------------------------------------------------------------
// buildings — single FOR ALL policy.
// ---------------------------------------------------------------------------
export async function canManageBuilding(
  actor: Actor,
  building: { id: string; landlordId: string; platformId: string | null },
): Promise<boolean> {
  if (building.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, building.platformId)) return true;
  return isBuildingManager(actor, building.id);
}

// ---------------------------------------------------------------------------
// properties
// ---------------------------------------------------------------------------
type PropertyRow = typeof schema.properties.$inferSelect;

export async function canViewProperty(actor: Actor, property: PropertyRow): Promise<boolean> {
  if (property.status === 'available') return true;
  if (property.landlordId === actor.id) return true;
  if (email(property.tenantId ?? '') === email(actor.email)) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, property.platformId)) return true;
  return isPropertyManager(actor, property.id);
}

export async function canManageProperty(
  actor: Actor,
  property: { id: string; landlordId: string; platformId: string | null },
): Promise<boolean> {
  if (property.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, property.platformId)) return true;
  return isPropertyManager(actor, property.id);
}

// ---------------------------------------------------------------------------
// property_managers — NOTE the original USING vs WITH CHECK asymmetry: a manager can
// see their own membership row, but only the owning landlord/admin/super-admin can
// insert/update/delete it (a manager cannot self-modify). Preserved below.
// ---------------------------------------------------------------------------
async function propertyManagerPlatformId(propertyId: string): Promise<string | null> {
  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    columns: { platformId: true },
  });
  return property?.platformId ?? null;
}

export async function canViewPropertyManagerRow(
  actor: Actor,
  row: { landlordId: string; userId: string; propertyId: string },
): Promise<boolean> {
  if (row.landlordId === actor.id || row.userId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (!isAdmin(actor)) return false;
  return isAdminInPlatform(actor, await propertyManagerPlatformId(row.propertyId));
}

export async function canWritePropertyManagerRow(
  actor: Actor,
  row: { landlordId: string; propertyId: string },
): Promise<boolean> {
  if (row.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (!isAdmin(actor)) return false;
  return isAdminInPlatform(actor, await propertyManagerPlatformId(row.propertyId));
}

// ---------------------------------------------------------------------------
// maintenanceRequests — NOTE: the original SELECT/UPDATE policies have no
// admin-in-platform clause (unlike properties/users); only super admin, not
// "any admin of this platform", can see/update requests outside direct ownership.
// Preserved as-is.
// ---------------------------------------------------------------------------
type MaintenanceRow = typeof schema.maintenanceRequests.$inferSelect;

export async function canViewMaintenanceRequest(actor: Actor, row: MaintenanceRow): Promise<boolean> {
  if (row.tenantId === actor.id || row.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  return isPropertyManager(actor, row.propertyId);
}

/** Only the tenant filing the request (or super admin) may create it — not landlords/managers. */
export const canCreateMaintenanceRequest = (actor: Actor, tenantId: string) =>
  tenantId === actor.id || isSuperAdmin(actor);

export async function canUpdateMaintenanceRequest(
  actor: Actor,
  row: { landlordId: string; propertyId: string; platformId: string | null },
): Promise<boolean> {
  if (row.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, row.platformId)) return true;
  return isPropertyManager(actor, row.propertyId);
}

// ---------------------------------------------------------------------------
// rentPayments — tenants have NO write access at all (mutations are landlord/
// manager/admin/super-admin only); there is deliberately no canTenantUpdateRentPayment.
// ---------------------------------------------------------------------------
type RentPaymentRow = typeof schema.rentPayments.$inferSelect;

export async function canViewRentPayment(actor: Actor, row: RentPaymentRow): Promise<boolean> {
  if (row.landlordId === actor.id) return true;
  if (email(row.tenantId) === email(actor.email) || row.tenantId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, row.platformId)) return true;
  return isPropertyManager(actor, row.propertyId);
}

export async function canManageRentPayment(
  actor: Actor,
  row: { landlordId: string; propertyId: string; platformId: string | null },
): Promise<boolean> {
  if (row.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, row.platformId)) return true;
  return isPropertyManager(actor, row.propertyId);
}

// ---------------------------------------------------------------------------
// bookings — NOTE: the original schema has SELECT + INSERT policies only.
// There is NO UPDATE/DELETE policy at all, meaning under RLS only the
// service-role (server, bypassing RLS) could ever change a booking's status.
// There is deliberately no canUpdateBooking()/canDeleteBooking() here — callers
// that need to change a booking must go through an explicitly-trusted admin/
// landlord server code path and document why, rather than getting a generic
// "yes" from this module.
// ---------------------------------------------------------------------------
type BookingRow = typeof schema.bookings.$inferSelect;

export async function canViewBooking(actor: Actor, row: BookingRow): Promise<boolean> {
  if (row.hunterId === actor.id || row.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  return isPropertyManager(actor, row.propertyId);
}

export const canCreateBooking = (actor: Actor, hunterId: string) => hunterId === actor.id || isSuperAdmin(actor);

// ---------------------------------------------------------------------------
// expenses — single FOR ALL policy; property managers only count if propertyId is set.
// ---------------------------------------------------------------------------
export async function canManageExpense(
  actor: Actor,
  row: { landlordId: string; propertyId: string | null; platformId: string | null },
): Promise<boolean> {
  if (row.landlordId === actor.id) return true;
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && platformMatches(actor.platformId, row.platformId)) return true;
  return row.propertyId !== null && (await isPropertyManager(actor, row.propertyId));
}

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------
export const canViewNotification = (actor: Actor, row: { recipientEmail: string }) =>
  email(row.recipientEmail) === email(actor.email) || isSuperAdmin(actor);

export const canUpdateNotification = canViewNotification;

/**
 * "Landlords send tenant notifications" — the sender must either be a platform
 * admin/super-admin, or have an existing relationship with the recipient through
 * a property, rent payment, or booking they manage. Ported as three existence
 * checks matching the original EXISTS subqueries.
 */
export async function canSendNotification(
  actor: Actor,
  recipientEmail: string,
  notificationPlatformId: string | null,
): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && (notificationPlatformId === null || platformMatches(actor.platformId, notificationPlatformId))) {
    return true;
  }

  const recipient = email(recipientEmail);

  const viaProperty = await db
    .select({ id: schema.properties.id })
    .from(schema.properties)
    .leftJoin(schema.propertyManagers, eq(schema.propertyManagers.propertyId, schema.properties.id))
    .where(
      and(
        or(eq(schema.properties.landlordId, actor.id), eq(schema.propertyManagers.userId, actor.id)),
        sql`lower(coalesce(${schema.properties.tenantId}, '')) = ${recipient}`,
      ),
    )
    .limit(1);
  if (viaProperty.length > 0) return true;

  const viaRentPayment = await db
    .select({ id: schema.rentPayments.id })
    .from(schema.rentPayments)
    .leftJoin(schema.propertyManagers, eq(schema.propertyManagers.propertyId, schema.rentPayments.propertyId))
    .where(
      and(
        or(eq(schema.rentPayments.landlordId, actor.id), eq(schema.propertyManagers.userId, actor.id)),
        sql`lower(${schema.rentPayments.tenantId}) = ${recipient}`,
      ),
    )
    .limit(1);
  if (viaRentPayment.length > 0) return true;

  const viaBooking = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .innerJoin(schema.users, eq(schema.users.uid, schema.bookings.hunterId))
    .leftJoin(schema.propertyManagers, eq(schema.propertyManagers.propertyId, schema.bookings.propertyId))
    .where(
      and(
        or(eq(schema.bookings.landlordId, actor.id), eq(schema.propertyManagers.userId, actor.id)),
        sql`lower(${schema.users.email}) = ${recipient}`,
      ),
    )
    .limit(1);
  return viaBooking.length > 0;
}

// ---------------------------------------------------------------------------
// invitations
// ---------------------------------------------------------------------------
type InvitationRow = typeof schema.invitations.$inferSelect;

export const canViewInvitation = (actor: Actor, row: InvitationRow) =>
  email(row.email) === email(actor.email) ||
  row.landlordId === actor.id ||
  isSuperAdmin(actor) ||
  (isAdmin(actor) && platformMatches(actor.platformId, row.platformId));

export const canManageInvitation = (actor: Actor, row: { landlordId: string | null; platformId: string | null }) =>
  row.landlordId === actor.id || isSuperAdmin(actor) || (isAdmin(actor) && platformMatches(actor.platformId, row.platformId));

// ---------------------------------------------------------------------------
// audit_logs — INSERT has no admin exception (matches the original policy);
// only super admins may read the log.
// ---------------------------------------------------------------------------
export const canInsertAuditLog = (actor: Actor, userId: string) => userId === actor.id;
export const canViewAuditLogs = (actor: Actor) => isSuperAdmin(actor);

// ---------------------------------------------------------------------------
// waitlistSignups, landlordSubscriptionPayments — the original SQL grants these
// to `service_role` only (no RLS policy, no authenticated/anon grant at all).
// There is intentionally no per-actor check here: every server route touching
// these tables runs as the trusted backend, exactly as it did against Supabase's
// service-role client.
// ---------------------------------------------------------------------------

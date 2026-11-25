import {and, eq, gte, inArray, lte, sql} from 'drizzle-orm';
import {db, schema} from '../db/client.ts';
import {canViewRentPayment} from '../db/authz.ts';
import {sendPushToEmail} from './services/notify.ts';
import {toActor} from './types.ts';
import type {AuthenticatedRequest} from './types.ts';

export type NotificationDependencies = {
  sendEmail: (args: {to?: string | null; subject: string; text: string}) => Promise<void>;
  insertNotification: (payload: {
    recipientEmail: string;
    platformId?: string | null;
    type?: string | null;
    title: string;
    message?: string | null;
    propertyId?: string | null;
    read?: boolean;
    url?: string;
  }) => Promise<void>;
};

export const sendOneSignalPushNotification = async (
  email: string,
  title: string,
  message: string,
  url?: string,
) => sendPushToEmail(email, title, message, {url, data: {type: 'reminder'}});

/** Looks up a rent payment plus its property's display fields in one query. */
async function findRentPaymentWithProperty(rentPaymentId: string) {
  const [row] = await db
    .select({
      payment: schema.rentPayments,
      propertyTitle: schema.properties.title,
      propertyUnitNumber: schema.properties.unitNumber,
      propertyLocation: schema.properties.location,
    })
    .from(schema.rentPayments)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.rentPayments.propertyId))
    .where(eq(schema.rentPayments.id, rentPaymentId))
    .limit(1);
  return row;
}

async function dispatchRentReminderForPayment(
  rentPaymentId: string,
  actor: ReturnType<typeof toActor>,
  deps: NotificationDependencies,
): Promise<{ok: true; tenantEmail: string} | {ok: false; status: number; error: string}> {
  const {sendEmail, insertNotification} = deps;
  const row = await findRentPaymentWithProperty(rentPaymentId);
  if (!row) {
    return {ok: false, status: 404, error: 'Rent payment not found.'};
  }
  const payment = row.payment;

  if (!(await canViewRentPayment(actor, payment))) {
    return {ok: false, status: 403, error: 'You do not have permission to send reminders for this property.'};
  }

  if (payment.status === 'paid') {
    return {ok: false, status: 400, error: 'This rent payment is already paid.'};
  }

  // Fetch tenant info (tenantId historically holds either an email or a uid)
  const tenantId = String(payment.tenantId);
  const tenant = tenantId.includes('@')
    ? await db.query.users.findFirst({where: sql`lower(${schema.users.email}) = ${tenantId.toLowerCase()}`, columns: {email: true}})
    : await db.query.users.findFirst({where: eq(schema.users.uid, tenantId), columns: {email: true}});

  const tenantEmail = tenant?.email || payment.tenantId;
  if (!tenantEmail || !tenantEmail.includes('@')) {
    return {ok: false, status: 422, error: 'Tenant email not found or invalid.'};
  }

  const amount = Number(payment.amount).toLocaleString('en-KE');
  const propertyLabel = row.propertyTitle || row.propertyUnitNumber || 'your unit';
  const dueDateStr = new Date(payment.dueDate).toLocaleDateString('en-KE', {weekday: 'short', month: 'short', day: 'numeric'});
  const todayIso = new Date().toISOString().split('T')[0];
  const isOverdue = payment.status === 'overdue' || payment.dueDate < todayIso;
  const title = isOverdue ? 'Overdue Rent Reminder' : 'Rent Reminder';
  const message = isOverdue
    ? `Reminder: Your rent payment of KES ${amount} for ${propertyLabel} was due on ${dueDateStr} and is now overdue. Please pay promptly via MyBoma.`
    : `Friendly reminder: Your rent payment of KES ${amount} for ${propertyLabel} is due on ${dueDateStr}.`;

  // insertNotification persists the in-app alert and triggers the OneSignal push once,
  // avoiding duplicate push notifications on the tenant's device.
  await Promise.allSettled([
    insertNotification({
      recipientEmail: tenantEmail.toLowerCase(),
      platformId: payment.platformId,
      type: 'reminder',
      title,
      message,
      propertyId: payment.propertyId,
      read: false,
    }),
    sendEmail({
      to: tenantEmail,
      subject: title,
      text: message,
    }),
  ]);

  return {ok: true, tenantEmail: tenantEmail.toLowerCase()};
}

export const handleSendRentReminder = async (
  req: AuthenticatedRequest,
  res: any,
  deps: NotificationDependencies
) => {
  const {rentPaymentId} = req.validatedBody as {rentPaymentId: string};
  const actor = toActor(req.profile!);
  const result = await dispatchRentReminderForPayment(rentPaymentId, actor, deps);
  if ('error' in result) {
    return res.status(result.status).json({error: result.error});
  }
  return res.json({success: true, message: 'Reminder sent successfully.'});
};

export const handleSendBulkRentReminders = async (
  req: AuthenticatedRequest,
  res: any,
  deps: NotificationDependencies
) => {
  const {rentPaymentIds} = req.validatedBody as {rentPaymentIds: string[]};
  const actor = toActor(req.profile!);
  const uniqueIds = [...new Set(rentPaymentIds)].slice(0, 50);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const result = await dispatchRentReminderForPayment(id, actor, deps);
        if (!('error' in result)) sent += 1;
        else if (result.status === 400 || result.status === 403 || result.status === 404) skipped += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }),
  );

  return res.json({
    success: true,
    sent,
    skipped,
    failed,
    message: sent === 1 ? '1 reminder sent.' : `${sent} reminders sent.`,
  });
};

export const processAutomatedRentReminders = async (deps: NotificationDependencies) => {
  const {sendEmail, insertNotification} = deps;

  // Find pending rent payments where due date is within the next 3 days or already overdue
  const today = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(today.getDate() + 3);
  const cutoff = threeDaysFromNow.toISOString().split('T')[0];

  const rows = await db
    .select({
      payment: schema.rentPayments,
      propertyTitle: schema.properties.title,
      propertyUnitNumber: schema.properties.unitNumber,
    })
    .from(schema.rentPayments)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.rentPayments.propertyId))
    .where(
      and(
        // Overdue rows must be included: the overdue refresh flips past-due invoices from
        // 'pending' to 'overdue', which previously silenced every overdue notice.
        inArray(schema.rentPayments.status, ['pending', 'overdue']),
        lte(schema.rentPayments.dueDate, cutoff),
      ),
    );

  if (rows.length === 0) return;

  // We need to fetch all landlords and check their plans
  const landlordIds = [...new Set(rows.map((r) => r.payment.landlordId))];
  const landlords = await db
    .select({
      uid: schema.users.uid,
      subscriptionPlan: schema.users.subscriptionPlan,
      subscriptionStatus: schema.users.subscriptionStatus,
      subscriptionExpiresAt: schema.users.subscriptionExpiresAt,
    })
    .from(schema.users)
    .where(inArray(schema.users.uid, landlordIds));

  // Automations are a Pro / Pro Plus feature, and only while the plan is paid up.
  const proLandlordIds = new Set(
    landlords
      .filter((l) => {
        const tier = l.subscriptionPlan?.split(':')[0];
        const active =
          l.subscriptionStatus === 'active' && (!l.subscriptionExpiresAt || new Date(l.subscriptionExpiresAt) > today);
        return active && (tier === 'pro' || tier === 'proplus');
      })
      .map((l) => l.uid),
  );

  for (const row of rows) {
    const payment = row.payment;
    if (!proLandlordIds.has(payment.landlordId)) continue; // Skip if landlord is not on pro/proplus

    let tenantEmail = String(payment.tenantId);
    let platformId = payment.platformId;
    if (!tenantEmail.includes('@')) {
      const tenant = await db.query.users.findFirst({
        where: eq(schema.users.uid, payment.tenantId),
        columns: {email: true, platformId: true},
      });
      if (!tenant?.email) continue;
      tenantEmail = tenant.email;
      platformId = platformId || tenant.platformId;
    }

    const amount = Number(payment.amount).toLocaleString('en-KE');
    const propertyLabel = row.propertyTitle || row.propertyUnitNumber || 'your unit';
    const dueDate = new Date(payment.dueDate);
    const isOverdue = dueDate < today;

    const dueDateStr = dueDate.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});

    const title = isOverdue ? 'Rent Overdue Notice' : 'Upcoming Rent Reminder';
    const message = isOverdue
      ? `Notice: Your rent payment of KES ${amount} for ${propertyLabel} was due on ${dueDateStr} and is currently overdue.`
      : `Reminder: Your rent payment of KES ${amount} for ${propertyLabel} is due on ${dueDateStr}.`;

    // Try to avoid spamming everyday: skip if a matching notification went out in the last 24h.
    const since = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const recentNotifs = await db
      .select({id: schema.notifications.id})
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.propertyId, payment.propertyId),
          sql`lower(${schema.notifications.recipientEmail}) = ${tenantEmail.toLowerCase()}`,
          eq(schema.notifications.title, title),
          gte(schema.notifications.createdAt, since),
        ),
      )
      .limit(1);

    if (recentNotifs.length > 0) continue; // Already reminded today

    const results = await Promise.allSettled([
      insertNotification({
        recipientEmail: tenantEmail.toLowerCase(),
        platformId,
        type: 'reminder',
        title,
        message,
        propertyId: payment.propertyId,
        read: false,
      }),
      sendEmail({
        to: tenantEmail,
        subject: title,
        text: message,
      }),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') console.error(`[Reminders] Delivery failed for payment ${payment.id}:`, result.reason);
    }
  }
};

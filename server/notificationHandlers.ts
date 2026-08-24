import {and, eq, gte, ilike, inArray, lte, sql} from 'drizzle-orm';
import {db, schema} from '../db/client.ts';
import {canViewRentPayment, isAdmin} from '../db/authz.ts';
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
  }) => Promise<void>;
};

export const sendOneSignalPushNotification = async (
  email: string,
  title: string,
  message: string,
  url?: string
) => {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    console.warn('[OneSignal] Missing App ID or API Key. Push notification skipped.');
    return;
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_aliases: {
          external_id: [email.toLowerCase()],
        },
        headings: {en: title},
        contents: {en: message},
        url,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[OneSignal Error]', response.status, errorData);
    }
  } catch (err) {
    console.error('[OneSignal Request Failed]', err);
  }
};

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

export const handleSendRentReminder = async (
  req: AuthenticatedRequest,
  res: any,
  deps: NotificationDependencies
) => {
  const {rentPaymentId} = req.validatedBody as {rentPaymentId: string};
  const {sendEmail, insertNotification} = deps;
  const actor = toActor(req.profile!);

  // 1. Fetch the payment and ensure the user is the landlord, a property manager, or an admin
  const row = await findRentPaymentWithProperty(rentPaymentId);
  if (!row) {
    return res.status(404).json({error: 'Rent payment not found.'});
  }
  const payment = row.payment;

  if (!(await canViewRentPayment(actor, payment))) {
    return res.status(403).json({error: 'You do not have permission to send reminders for this property.'});
  }

  // 2. Ensure landlord has pro or proplus plan (or is admin)
  if (!isAdmin(actor)) {
    const landlord = await db.query.users.findFirst({
      where: eq(schema.users.uid, payment.landlordId),
      columns: {subscriptionPlan: true},
    });

    const plan = landlord?.subscriptionPlan || '';
    if (!plan.includes('pro') && !plan.includes('proplus')) {
      return res.status(403).json({error: 'Automated and manual reminders are only available on Pro and Pro Plus plans.'});
    }
  }

  if (payment.status === 'paid') {
    return res.status(400).json({error: 'This rent payment is already paid.'});
  }

  // 3. Fetch tenant info (tenantId historically holds either an email or a uid)
  const tenantId = String(payment.tenantId);
  const tenant = tenantId.includes('@')
    ? await db.query.users.findFirst({where: ilike(schema.users.email, tenantId), columns: {email: true}})
    : await db.query.users.findFirst({where: eq(schema.users.uid, tenantId), columns: {email: true}});

  const tenantEmail = tenant?.email || payment.tenantId;

  if (!tenantEmail || !tenantEmail.includes('@')) {
    return res.status(422).json({error: 'Tenant email not found or invalid.'});
  }

  const amount = Number(payment.amount).toLocaleString('en-KE');
  const propertyLabel = row.propertyTitle || row.propertyUnitNumber || 'your unit';
  const dueDateStr = new Date(payment.dueDate).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
  const title = 'Rent Reminder';
  const message = `Friendly reminder: Your rent payment of KES ${amount} for ${propertyLabel} is due on ${dueDateStr}.`;

  // 4. Send notifications
  const promises = [
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
    sendOneSignalPushNotification(tenantEmail, title, message),
  ];

  await Promise.allSettled(promises);

  return res.json({success: true, message: 'Reminder sent successfully.'});
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
    .where(and(eq(schema.rentPayments.status, 'pending'), lte(schema.rentPayments.dueDate, cutoff)));

  if (rows.length === 0) return;

  // We need to fetch all landlords and check their plans
  const landlordIds = [...new Set(rows.map((r) => r.payment.landlordId))];
  const landlords = await db
    .select({uid: schema.users.uid, subscriptionPlan: schema.users.subscriptionPlan})
    .from(schema.users)
    .where(inArray(schema.users.uid, landlordIds));

  const proLandlordIds = new Set(
    landlords.filter((l) => l.subscriptionPlan?.includes('pro') || l.subscriptionPlan?.includes('proplus')).map((l) => l.uid),
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

    await Promise.allSettled([
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
      sendOneSignalPushNotification(tenantEmail, title, message),
    ]);
  }
};

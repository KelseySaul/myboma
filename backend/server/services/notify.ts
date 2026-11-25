import {sql} from 'drizzle-orm';
import {db, schema} from '../../db/client.ts';
import type {RentPaymentRecord, UserProfileRecord} from '../types.ts';
import {appBaseUrl} from '../http/config.ts';
import {sendEmail} from './email.ts';

export {sendEmail};

const DEFAULT_ONESIGNAL_APP_ID = '16fe44a9-e285-4d7d-85f0-8b82014b9a71';

export type PushNotificationOptions = {
  url?: string;
  data?: Record<string, unknown>;
};

export const sendPushNotification = async (
  targetUserId: string,
  title: string,
  message: string,
  options: PushNotificationOptions = {},
) => {
  const appId = process.env.ONESIGNAL_APP_ID || DEFAULT_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[OneSignal] ONESIGNAL_REST_API_KEY is not configured; push delivery skipped (in-app alert still saved).');
    return null;
  }

  // OneSignal v2 REST API keys (os_v2_app_...) require "Key <token>"; legacy REST keys use "Basic <token>".
  const authHeader = apiKey.startsWith('os_v2_') ? `Key ${apiKey}` : `Basic ${apiKey}`;
  const targetUrl = options.url || appBaseUrl;

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      include_aliases: {
        external_id: [targetUserId],
      },
      headings: {en: title},
      contents: {en: message},
      url: targetUrl,
      web_url: targetUrl,
      priority: 10,
      ...(options.data ? {data: options.data} : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('[OneSignal] Push failed:', response.status, errorText);
    return null;
  }

  return response.json().catch(() => null);
};

export const sendPushToEmail = async (
  email: string,
  title: string,
  message: string,
  options: PushNotificationOptions = {},
) => {
  const user = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${email.trim().toLowerCase()}`,
    columns: {uid: true},
  });
  if (!user?.uid) return null;
  return sendPushNotification(user.uid, title, message, options);
};

export const insertNotification = async (payload: {
  recipientEmail: string;
  platformId?: string | null;
  type?: string | null;
  title: string;
  message?: string | null;
  propertyId?: string | null;
  read?: boolean;
  url?: string;
}) => {
  const {url, ...dbPayload} = payload;
  // Savepoint: callers often swallow notification failures; that must not abort their transaction.
  await db.transaction((tx) => tx.insert(schema.notifications).values(dbPayload));

  const title = String(payload.title || 'New Notification');
  const message = String(payload.message || 'You have a new update.');
  await sendPushToEmail(payload.recipientEmail, title, message, {
    url: url || appBaseUrl,
    data: {
      type: payload.type ?? 'notification',
      ...(payload.propertyId ? {propertyId: payload.propertyId} : {}),
    },
  }).catch((err) => {
    console.error('[OneSignal] Failed to send push:', err);
  });
};

export const notifyRentPaymentSuccess = async ({
  payment,
  tenant,
  landlord,
  property,
  providerReference,
}: {
  payment: RentPaymentRecord;
  tenant?: UserProfileRecord | null;
  landlord: UserProfileRecord;
  property?: {title?: string; unitNumber?: string; location?: string} | null;
  providerReference?: string | null;
}) => {
  const amount = Number(payment.amount).toLocaleString('en-KE');
  const propertyLabel = property?.title || property?.unitNumber || 'your unit';
  const tenantEmail = tenant?.email || payment.tenantId;
  const platformId = payment.platformId || tenant?.platformId || landlord.platformId || null;

  await Promise.all([
    insertNotification({
      recipientEmail: tenantEmail.toLowerCase(),
      platformId,
      type: 'receipt',
      title: 'Rent Cleared',
      message: `Your rent payment of KES ${amount} for ${propertyLabel} has been successfully processed.`,
      propertyId: payment.propertyId,
      read: false,
    }),
    insertNotification({
      recipientEmail: landlord.email.toLowerCase(),
      platformId,
      type: 'receipt',
      title: 'Rent Received',
      message: `${tenant?.displayName || tenantEmail} paid KES ${amount} for ${propertyLabel}.`,
      propertyId: payment.propertyId,
      read: false,
    }),
    sendEmail({
      to: tenantEmail,
      subject: `Rent receipt: KES ${amount} for ${propertyLabel}`,
      template: {
        preheader: `Payment confirmed — KES ${amount} received for ${propertyLabel}.`,
        eyebrow: 'Payment confirmed',
        tone: 'success',
        heading: 'Your rent payment is confirmed',
        paragraphs: [`Thank you! Your rent payment for ${propertyLabel} went through cleanly. Keep this email as your official receipt.`],
        callout: {
          label: 'Amount paid',
          value: `KES ${amount}`,
          sublabel: propertyLabel,
        },
        details: [
          ['Property', propertyLabel],
          ...(property?.location ? [['Location', property.location] as [string, string]] : []),
          ['Date paid', new Date().toLocaleDateString('en-KE', {day: 'numeric', month: 'long', year: 'numeric'})],
          ...(providerReference ? [['Reference', providerReference] as [string, string]] : []),
        ],
        button: {
          label: 'View receipt in MyBoma',
          url: appBaseUrl,
          hint: 'Open your tenant dashboard to view or download all past receipts:',
        },
        footerNote: 'You received this because you paid rent through MyBoma.',
      },
    }),
    sendEmail({
      to: landlord.email,
      subject: `Rent received: KES ${amount} from ${tenant?.displayName || tenantEmail}`,
      template: {
        preheader: `${tenant?.displayName || tenantEmail} paid KES ${amount} for ${propertyLabel}.`,
        eyebrow: 'Rent collected',
        tone: 'success',
        heading: 'Rent payment received',
        paragraphs: [`${tenant?.displayName || tenantEmail} paid rent for ${propertyLabel}. The invoice is automatically marked as paid in your dashboard.`],
        callout: {
          label: 'Amount received',
          value: `KES ${amount}`,
          sublabel: `Paid by ${tenant?.displayName || tenantEmail}`,
        },
        details: [
          ['Tenant', tenant?.displayName || tenantEmail],
          ['Property', propertyLabel],
          ['Date', new Date().toLocaleDateString('en-KE', {day: 'numeric', month: 'long', year: 'numeric'})],
          ...(providerReference ? [['Reference', providerReference] as [string, string]] : []),
        ],
        button: {
          label: 'Open Rent & Payments',
          url: appBaseUrl,
          hint: 'Click below to view your rent collection board:',
        },
        footerNote: 'You received this because you manage this property on MyBoma.',
      },
    }),
  ]);
};

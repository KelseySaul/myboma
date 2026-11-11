import nodemailer from 'nodemailer';
import {sql} from 'drizzle-orm';
import {db, schema} from '../../db/client.ts';
import type {RentPaymentRecord, UserProfileRecord} from '../types.ts';

export const emailTransporter =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : null;

export const sendPushNotification = async (targetUserId: string, title: string, message: string) => {
  const ONE_SIGNAL_APP_ID = "16fe44a9-e285-4d7d-85f0-8b82014b9a71";
  const ONE_SIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY; 
  if (!ONE_SIGNAL_REST_API_KEY) return null;

  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Basic ${ONE_SIGNAL_REST_API_KEY}`
    },
    body: JSON.stringify({
      app_id: ONE_SIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: {
        external_id: [targetUserId]
      },
      headings: { en: title },
      contents: { en: message }
    })
  });

  return response.json();
};

export const insertNotification = async (payload: {
  recipientEmail: string;
  platformId?: string | null;
  type?: string | null;
  title: string;
  message?: string | null;
  propertyId?: string | null;
  read?: boolean;
}) => {
  await db.insert(schema.notifications).values(payload);

  const user = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${payload.recipientEmail.toLowerCase()}`,
    columns: {uid: true},
  });

  if (user?.uid) {
    const title = String(payload.title || 'New Notification');
    const message = String(payload.message || 'You have a new update.');
    await sendPushNotification(user.uid, title, message).catch(err => {
      console.error('[OneSignal] Failed to send push:', err);
    });
  }
};

export const sendEmail = async ({to, subject, text}: {to?: string | null; subject: string; text: string}) => {
  if (!to || !emailTransporter) return;

  await emailTransporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
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
      subject: 'MyBoma rent receipt',
      text: `Your rent payment of KES ${amount} for ${propertyLabel} was successful.${
        providerReference ? ` Reference: ${providerReference}.` : ''
      }`,
    }),
    sendEmail({
      to: landlord.email,
      subject: 'MyBoma rent received',
      text: `${tenant?.displayName || tenantEmail} paid KES ${amount} for ${propertyLabel}.${
        providerReference ? ` Reference: ${providerReference}.` : ''
      }`,
    }),
  ]);
};

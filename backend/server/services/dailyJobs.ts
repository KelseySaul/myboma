import {expireLapsedSubscriptions} from '../landlordSubscriptionHandlers.ts';
import {processAutomatedRentReminders} from '../notificationHandlers.ts';
import {syncAllRentInvoices} from '../rentInvoiceSync.ts';
import {insertNotification, sendEmail} from './notify.ts';

/**
 * Daily scheduled work. On Vercel this is invoked by Vercel Cron (vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`; in-process node-cron never fires on serverless.
 * Order matters: expire plans, generate/refresh invoices, then send reminders.
 */
export const runDailyJobs = async () => {
  const expiredSubscriptions = await expireLapsedSubscriptions();
  const invoices = await syncAllRentInvoices();
  await processAutomatedRentReminders({sendEmail, insertNotification});
  return {expiredSubscriptions, invoices};
};

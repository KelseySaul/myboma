import {expireLapsedSubscriptions, processAutomatedSubscriptionReminders} from '../landlordSubscriptionHandlers.ts';
import {processAutomatedRentReminders} from '../notificationHandlers.ts';
import {syncAllRentInvoices} from '../rentInvoiceSync.ts';
import {insertNotification, sendEmail} from './notify.ts';

/**
 * Daily scheduled work. On Render / Vercel this is invoked by GitHub Actions Cron hitting
 * /api/cron/daily with `Authorization: Bearer $CRON_SECRET`; in-process node-cron runs locally.
 * Order matters: expire lapsed plans, remind landlords/PMs about renewals, refresh rent invoices,
 * then remind tenants about upcoming/overdue rent.
 */
export const runDailyJobs = async () => {
  const expiredSubscriptions = await expireLapsedSubscriptions();
  const subscriptionReminders = await processAutomatedSubscriptionReminders({sendEmail, insertNotification});
  const invoices = await syncAllRentInvoices();
  await processAutomatedRentReminders({sendEmail, insertNotification});
  return {expiredSubscriptions, subscriptionReminders, invoices};
};

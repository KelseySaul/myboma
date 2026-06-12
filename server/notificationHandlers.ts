import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedRequest, RentPaymentRecord, UserProfileRecord } from './types.js';

export type NotificationDependencies = {
  supabase: SupabaseClient;
  sendEmail: (args: { to?: string | null; subject: string; text: string }) => Promise<void>;
  insertNotification: (payload: Record<string, unknown>) => Promise<void>;
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
        // Target users by external_id (we use email as the external_id in many setups)
        // Or target by aliases: { external_id: email }
        target_channel: 'push',
        include_aliases: {
          external_id: [email.toLowerCase()],
        },
        headings: { en: title },
        contents: { en: message },
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

export const handleSendRentReminder = async (
  req: AuthenticatedRequest,
  res: any,
  deps: NotificationDependencies
) => {
  const { rentPaymentId } = req.validatedBody as { rentPaymentId: string };
  const { supabase, sendEmail, insertNotification } = deps;

  // 1. Fetch the payment and ensure the user is the landlord or an admin
  const { data: payment, error: paymentError } = await supabase
    .from('rentPayments')
    .select('*, properties(title, unitNumber, location)')
    .eq('id', rentPaymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    return res.status(404).json({ error: 'Rent payment not found.' });
  }

  const isLandlord = payment.landlordId === req.profile?.uid;
  const isAdmin = req.profile?.isSuperAdmin || req.profile?.isAdmin || req.profile?.role === 'admin';

  if (!isLandlord && !isAdmin) {
    return res.status(403).json({ error: 'You do not have permission to send reminders for this property.' });
  }

  // 2. Ensure landlord has pro or proplus plan (or is admin)
  if (!isAdmin) {
    const { data: landlordData } = await supabase
      .from('users')
      .select('subscriptionPlan')
      .eq('uid', payment.landlordId)
      .maybeSingle();
      
    const plan = landlordData?.subscriptionPlan || '';
    if (!plan.includes('pro') && !plan.includes('proplus')) {
      return res.status(403).json({ error: 'Automated and manual reminders are only available on Pro and Pro Plus plans.' });
    }
  }

  if (payment.status === 'paid') {
    return res.status(400).json({ error: 'This rent payment is already paid.' });
  }

  // 3. Fetch tenant info
  const tenantId = String(payment.tenantId);
  const { data: tenantData } = tenantId.includes('@')
    ? await supabase.from('users').select('uid,email,displayName,platformId').ilike('email', tenantId).maybeSingle()
    : await supabase.from('users').select('uid,email,displayName,platformId').eq('uid', tenantId).maybeSingle();

  const tenantEmail = tenantData?.email || payment.tenantId;

  if (!tenantEmail || !tenantEmail.includes('@')) {
    return res.status(422).json({ error: 'Tenant email not found or invalid.' });
  }

  const amount = Number(payment.amount).toLocaleString('en-KE');
  const propertyLabel = payment.properties?.title || payment.properties?.unitNumber || 'your unit';
  const dueDateStr = new Date(payment.dueDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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

  return res.json({ success: true, message: 'Reminder sent successfully.' });
};

export const processAutomatedRentReminders = async (deps: NotificationDependencies) => {
  const { supabase, sendEmail, insertNotification } = deps;
  
  // Find pending rent payments where due date is within the next 3 days or already overdue
  const today = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(today.getDate() + 3);

  const { data: payments, error } = await supabase
    .from('rentPayments')
    .select('*, properties(title, unitNumber, location)')
    .eq('status', 'pending')
    .lte('dueDate', threeDaysFromNow.toISOString().split('T')[0]);

  if (error || !payments || payments.length === 0) return;

  // We need to fetch all landlords and check their plans
  const landlordIds = [...new Set(payments.map(p => p.landlordId))];
  const { data: landlords } = await supabase
    .from('users')
    .select('uid, subscriptionPlan')
    .in('uid', landlordIds);

  const proLandlordIds = new Set(
    landlords?.filter(l => l.subscriptionPlan?.includes('pro') || l.subscriptionPlan?.includes('proplus')).map(l => l.uid)
  );

  for (const payment of payments) {
    if (!proLandlordIds.has(payment.landlordId)) continue; // Skip if landlord is not on pro/proplus

    const tenantId = String(payment.tenantId);
    if (!tenantId.includes('@')) {
      // In a real scenario we'd fetch the user's email by uid. For simplicity, if it's an email we proceed.
      // Let's quickly fetch the email if it's a uid.
      const { data: tenantData } = await supabase.from('users').select('email,platformId').eq('uid', tenantId).maybeSingle();
      if (!tenantData?.email) continue;
      payment.tenantId = tenantData.email;
      payment.platformId = payment.platformId || tenantData.platformId;
    }

    const tenantEmail = payment.tenantId;
    const amount = Number(payment.amount).toLocaleString('en-KE');
    const propertyLabel = payment.properties?.title || payment.properties?.unitNumber || 'your unit';
    const dueDate = new Date(payment.dueDate);
    const isOverdue = dueDate < today;
    
    const dueDateStr = dueDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    
    const title = isOverdue ? 'Rent Overdue Notice' : 'Upcoming Rent Reminder';
    const message = isOverdue 
      ? `Notice: Your rent payment of KES ${amount} for ${propertyLabel} was due on ${dueDateStr} and is currently overdue.`
      : `Reminder: Your rent payment of KES ${amount} for ${propertyLabel} is due on ${dueDateStr}.`;

    // Try to avoid spamming everyday: We can check if a notification was already sent recently
    const { data: recentNotifs } = await supabase
      .from('notifications')
      .select('id')
      .eq('propertyId', payment.propertyId)
      .eq('recipientEmail', tenantEmail.toLowerCase())
      .eq('title', title)
      .gte('createdAt', new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (recentNotifs && recentNotifs.length > 0) continue; // Already reminded today

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
      sendOneSignalPushNotification(tenantEmail, title, message),
    ]);
  }
};

import { Capacitor } from '@capacitor/core';
import OneSignalNative from '@onesignal/capacitor-plugin';
import OneSignalWeb from 'react-onesignal';

const APP_ID = '16fe44a9-e285-4d7d-85f0-8b82014b9a71';

let nativeInitialized = false;
let webInitialized = false;
let readySubscriptionId: string | null = null;
let hasIdentityToSync = false;
let desiredExternalId: string | null = null;
const subscriptionHandlers = new Set<(id: string) => void>();

const hasServerSubscriptionId = (id: string | null | undefined) => Boolean(id && !id.startsWith('local-'));

const notifySubscriptionReady = (id: string | null | undefined) => {
  if (!hasServerSubscriptionId(id)) return;
  readySubscriptionId = id!;
  subscriptionHandlers.forEach((handler) => handler(id!));
};

const setInAppMessageTrigger = () => {
  if (Capacitor.isNativePlatform()) {
    return OneSignalNative.InAppMessages.addTrigger('ai_implementation_campaign_email_journey', 'true');
  }
  return Promise.resolve((OneSignalWeb as any).InAppMessages?.addTrigger('ai_implementation_campaign_email_journey', 'true'));
};

const applyIdentity = async () => {
  if (Capacitor.isNativePlatform()) {
    if (!nativeInitialized) return;
    if (desiredExternalId) await OneSignalNative.login(desiredExternalId);
    else await OneSignalNative.logout();
    return;
  }
  if (!webInitialized) return;
  if (desiredExternalId) await OneSignalWeb.login(desiredExternalId);
  else await OneSignalWeb.logout();
};

/** Initialise exactly once and retain a push-subscription observer for the app lifetime. */
export async function initializeOneSignal() {
  if (Capacitor.isNativePlatform()) {
    if (nativeInitialized) return;
    await OneSignalNative.initialize(APP_ID);
    nativeInitialized = true;
    if (hasIdentityToSync) await applyIdentity();

    OneSignalNative.User.pushSubscription.addEventListener('change', (event) => {
      if (event.current.optedIn) void setInAppMessageTrigger();
      notifySubscriptionReady(event.current.id);
    });
    notifySubscriptionReady(await OneSignalNative.User.pushSubscription.getIdAsync());
    return;
  }

  if (webInitialized) return;
  try {
    await OneSignalWeb.init({appId: APP_ID, allowLocalhostAsSecureOrigin: true});
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already initialized')) throw error;
  }
  webInitialized = true;
  if (hasIdentityToSync) await applyIdentity();

  const subscription = OneSignalWeb.User.PushSubscription;
  subscription.addEventListener('change', (event) => {
    if (event.current.optedIn) void setInAppMessageTrigger();
    notifySubscriptionReady(event.current.id);
  });
  if (subscription.optedIn) void setInAppMessageTrigger();
  notifySubscriptionReady(subscription.id);
}

/** Subscribe to a real OneSignal device ID. A local placeholder is deliberately ignored. */
export function onPushSubscriptionReady(handler: (id: string) => void) {
  subscriptionHandlers.add(handler);
  if (readySubscriptionId) handler(readySubscriptionId);
  return () => subscriptionHandlers.delete(handler);
}

export async function promptForPush() {
  if (Capacitor.isNativePlatform()) {
    if (!nativeInitialized) return false;
    return OneSignalNative.Notifications.requestPermission(true);
  }
  if (!webInitialized) return false;
  await OneSignalWeb.Slidedown.promptPush();
  return true;
}

/** Keep OneSignal's external ID aligned with the backend notification target (users.uid). */
export async function syncOneSignalIdentity(uid: string | null) {
  hasIdentityToSync = true;
  desiredExternalId = uid;
  await applyIdentity();
}

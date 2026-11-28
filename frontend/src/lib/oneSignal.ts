import { Capacitor } from '@capacitor/core';
import OneSignalNative from '@onesignal/capacitor-plugin';
import OneSignalWeb from 'react-onesignal';

const APP_ID = '16fe44a9-e285-4d7d-85f0-8b82014b9a71';

let nativeInitialized = false;
let webInitialized = false;
let webInitFailed = false;
let webInitPromise: Promise<void> | null = null;
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
  if (!webInitialized || webInitFailed) return Promise.resolve();
  return Promise.resolve((OneSignalWeb as any).InAppMessages?.addTrigger('ai_implementation_campaign_email_journey', 'true'));
};

const applyIdentity = async () => {
  if (Capacitor.isNativePlatform()) {
    if (!nativeInitialized) return;
    try {
      if (desiredExternalId) await OneSignalNative.login(desiredExternalId);
      else await OneSignalNative.logout();
    } catch {
      /* never block auth flows on push SDK sync */
    }
    return;
  }
  if (!webInitialized || webInitFailed) return;
  try {
    if (desiredExternalId) await OneSignalWeb.login(desiredExternalId);
    else await OneSignalWeb.logout();
  } catch {
    /* OneSignal Web SDK can throw if origin is not yet configured; fail silently */
  }
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

  if (webInitialized || webInitFailed) return;
  if (webInitPromise) return webInitPromise;

  webInitPromise = (async () => {
    try {
      await OneSignalWeb.init({appId: APP_ID, allowLocalhostAsSecureOrigin: true});
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error ?? '');
      // Domain mismatch (e.g. OneSignal dashboard still configured for an older URL) or
      // blocked service worker: disable OneSignal Web cleanly for this session so login/logout
      // never cascade into SDK TypeErrors.
      webInitFailed = true;
      webInitialized = false;
      if (msg.includes('Can only be used on:')) {
        console.info(`[OneSignal] Web push inactive on ${window.location.origin} (${msg}). Using browser notifications instead.`);
      }
      return;
    }

    webInitialized = true;
    if (hasIdentityToSync) await applyIdentity();

    try {
      const subscription = OneSignalWeb.User?.PushSubscription;
      if (subscription) {
        subscription.addEventListener('change', (event) => {
          if (event.current.optedIn) void setInAppMessageTrigger();
          notifySubscriptionReady(event.current.id);
        });
        if (subscription.optedIn) void setInAppMessageTrigger();
        notifySubscriptionReady(subscription.id);
      }
    } catch {
      /* ignore push subscription observer errors */
    }
  })().finally(() => {
    webInitPromise = null;
  });

  return webInitPromise;
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
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => undefined);
  }
  if (!webInitialized || webInitFailed) return false;
  await OneSignalWeb.Slidedown?.promptPush().catch(() => undefined);
  return true;
}

/** Shows a real OS browser push banner when the user has granted browser notification permission. */
export function showBrowserPushNotification(title: string, body?: string | null) {
  if (Capacitor.isNativePlatform()) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body: body || undefined,
      icon: '/bomalog.webp',
      badge: '/bomalog.webp',
    });
  } catch {
    /* ignore browsers that require a ServiceWorker registration for new Notification() */
  }
}

/** Keep OneSignal's external ID aligned with the backend notification target (users.uid). */
export async function syncOneSignalIdentity(uid: string | null) {
  hasIdentityToSync = true;
  desiredExternalId = uid;
  await applyIdentity();
}

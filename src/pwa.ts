import {registerSW} from 'virtual:pwa-register';

/**
 * Service workers must not run during Vite dev — they intercept /src/*.tsx and break HMR.
 * Registration only happens in production builds.
 */
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      setInterval(() => {
        registration.update().catch((error) => {
          console.warn('PWA update check failed:', error);
        });
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.warn('PWA registration failed:', error);
    },
  });
} else if ('serviceWorker' in navigator) {
  // Clear a stale SW left over from preview/production on the same origin (e.g. localhost:5173).
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
}

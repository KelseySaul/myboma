import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './sentry';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import './index.css';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

CapacitorUpdater.notifyAppReady();

// An earlier build registered a PWA service worker (sw.ts) that keeps serving stale assets
// and logs errors. This build ships no app service worker, so remove any leftover ones —
// except OneSignal's push worker.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      registrations
        .filter((registration) => !registration.active?.scriptURL.includes('OneSignal'))
        .forEach((registration) => void registration.unregister()),
    )
    .catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);

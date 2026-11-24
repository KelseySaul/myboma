import {emailTransporter} from '../services/notify.ts';

export const PORT = Number(process.env.SERVER_PORT || 3001);
export const isProduction = process.env.NODE_ENV === 'production';
export const defaultCorsOrigins = 'http://localhost:5173,http://localhost:4173';

export const buildDeploymentOrigins = (): string[] => {
  const origins = new Set<string>();
  const add = (value?: string) => {
    if (!value?.trim()) return;
    const normalized = value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`;
    try {
      origins.add(new URL(normalized).origin);
    } catch {
      // ignore invalid URLs
    }
  };

  for (const entry of (process.env.CORS_ORIGINS || defaultCorsOrigins).split(',')) {
    add(entry);
  }
  add(process.env.APP_BASE_URL || `http://localhost:${PORT}`);
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_BRANCH_URL);

  // Capacitor WebView origins (iOS uses capacitor://localhost; Android serves from
  // https://localhost). These aren't http(s) URLs with a parseable origin, so add verbatim.
  for (const nativeOrigin of ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost']) {
    origins.add(nativeOrigin);
  }

  return [...origins];
};

export const deploymentOrigins = buildDeploymentOrigins();
export const appBaseUrl = process.env.APP_BASE_URL || deploymentOrigins[0] || `http://localhost:${PORT}`;
// Payment redirects may only return to real web origins, never the native WebView origins.
export const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost']);
export const allowedRedirectOrigins = new Set(deploymentOrigins.filter((origin) => !NATIVE_ORIGINS.has(origin)));

export const nonSecretConfigStatus = () => ({
  database: Boolean(process.env.DATABASE_URL),
  storage: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID),
  stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
  pesapal: Boolean(
    process.env.PESAPAL_CONSUMER_KEY &&
      process.env.PESAPAL_CONSUMER_SECRET &&
      (process.env.PESAPAL_NOTIFICATION_ID || process.env.PESAPAL_IPN_URL),
  ),
  mpesa: Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_BUSINESS_SHORTCODE &&
      process.env.MPESA_PASSKEY &&
      process.env.MPESA_CALLBACK_URL,
  ),
  smtp: Boolean(emailTransporter),
  sentry: Boolean(process.env.SENTRY_DSN),
});

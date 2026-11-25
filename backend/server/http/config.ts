import {isEmailConfigured} from '../services/email.ts';

// Render (and most hosts) inject PORT; SERVER_PORT is the local-dev override.
export const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3002);
export const isProduction = process.env.NODE_ENV === 'production';
export const defaultCorsOrigins = 'http://localhost:5173,http://localhost:4173';
export const officialAppUrl = 'https://myboma.kelseysaul.dev';

// The previous public Render hostname is still safe for API transport, but must not
// be used in user-facing links or stored file URLs: it is a different browser origin
// from the official site and causes its image resources to be blocked.
const isLegacyRenderUrl = (value?: string) => Boolean(value && /(^|\/\/)myboma\.onrender\.com\/?$/i.test(value.trim()));
export const appBaseUrl =
  isProduction && (!process.env.APP_BASE_URL || isLegacyRenderUrl(process.env.APP_BASE_URL))
    ? officialAppUrl
    : process.env.APP_BASE_URL || `http://localhost:${PORT}`;

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
  add(appBaseUrl);
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_BRANCH_URL);
  add(process.env.RENDER_EXTERNAL_URL);

  // Capacitor WebView origins (iOS uses capacitor://localhost; Android serves from
  // https://localhost). These aren't http(s) URLs with a parseable origin, so add verbatim.
  for (const nativeOrigin of ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost']) {
    origins.add(nativeOrigin);
  }

  return [...origins];
};

export const deploymentOrigins = buildDeploymentOrigins();
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
      !/^your[-_]/i.test(process.env.PESAPAL_CONSUMER_KEY),
  ),
  mpesa: Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_BUSINESS_SHORTCODE &&
      process.env.MPESA_PASSKEY &&
      process.env.MPESA_CALLBACK_URL,
  ),
  email: isEmailConfigured(),
  sentry: Boolean(process.env.SENTRY_DSN),
});

// Must run before any other import: several modules (db/client.ts, server/auth.ts) read
// process.env at import time, which happens before this file's own top-level code runs.
import './env.ts';
import * as Sentry from '@sentry/node';
import compression from 'compression';
import cors from 'cors';
import express, {type ErrorRequestHandler} from 'express';
import helmet from 'helmet';
import path from 'path';
import {toNodeHandler} from 'better-auth/node';
import cron from 'node-cron';
import {auth} from './server/auth.ts';
import {PORT, deploymentOrigins, isProduction, nonSecretConfigStatus} from './server/http/config.ts';
import {apiLimiter, authLimiter, credentialLimiter, webhookLimiter, writeLimiter} from './server/http/middleware.ts';
import {runDailyJobs} from './server/services/dailyJobs.ts';
import {staticCacheControl} from './server/http/cache.ts';
import {stripeWebhookHandler} from './server/services/payments.ts';
import {registerPublicRoutes} from './server/routes/public.ts';
import {registerInviteRoutes} from './server/routes/invites.ts';
import {registerUserRoutes} from './server/routes/users.ts';
import {registerTenantRoutes} from './server/routes/tenant.ts';
import {registerHunterRoutes} from './server/routes/hunter.ts';
import {registerLandlordRoutes} from './server/routes/landlord.ts';
import {registerAdminRoutes} from './server/routes/admin.ts';
import {registerPaymentRoutes} from './server/routes/payments.ts';
import {registerCaretakerRoutes} from './server/routes/caretaker.ts';
import {registerFirebaseAuthRoutes} from './server/routes/firebaseAuth.ts';

const app = express();
// gzip/brotli for text responses (HTML, JS, CSS, JSON); images are skipped by its filter.
app.use(compression());

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrub password fields from request body to prevent cleartext secrets in error reports
      if (event.request?.data && typeof event.request.data === 'object') {
        const data = event.request.data as Record<string, unknown>;
        const scrubbed = {...data};
        const sensitiveKeys = ['password', 'confirmPassword', 'newPassword', 'secret', 'token'];
        for (const key of sensitiveKeys) {
          if (key in scrubbed) scrubbed[key] = '[Filtered]';
        }
        event.request.data = scrubbed;
      }
      return event;
    },
  });
}

const allowedOrigins = deploymentOrigins;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        // cdn.onesignal.com: web push SDK; google.com / gstatic.com: Firebase Phone Auth reCAPTCHA.
        scriptSrc: [
          "'self'",
          'https://cdn.onesignal.com',
          'https://api.onesignal.com',
          'https://www.google.com',
          'https://www.gstatic.com',
          'https://www.recaptcha.net',
          'https://apis.google.com',
        ],
        frameSrc: [
          "'self'",
          'https://www.google.com',
          'https://www.recaptcha.net',
          'https://*.firebaseapp.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://onesignal.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        connectSrc: [
          "'self'",
          'https://*.sentry.io',
          'https://checkout.stripe.com',
          'https://api.stripe.com',
          'https://sandbox.safaricom.co.ke',
          'https://api.safaricom.co.ke',
          'https://cybqa.pesapal.com',
          'https://pay.pesapal.com',
          'https://onesignal.com',
          'https://cdn.onesignal.com',
          'https://api.onesignal.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://www.googleapis.com',
          'https://*.firebaseapp.com',
        ].filter(Boolean),
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Stripe-Signature', 'sentry-trace', 'baggage', 'X-Impersonate-User'],
  }),
);

// Baseline for every /api request (per session, or per IP when signed out). Provider
// webhooks are exempt here and keep their own webhookLimiter.
app.use('/api', apiLimiter);

// Firebase Phone OTP token exchange (parses JSON before Better-Auth's wildcard handler).
app.post('/api/auth/firebase-phone', express.json({limit: '32kb'}));
registerFirebaseAuthRoutes(app);

// Better-Auth parses its own request body, so it's mounted before express.json() too.
// Credential endpoints get a tight brute-force budget before anything else runs.
app.use(
  ['/api/auth/sign-in', '/api/auth/sign-up', '/api/auth/forget-password', '/api/auth/reset-password', '/api/auth/send-verification-email'],
  credentialLimiter,
);
app.all('/api/auth/*', toNodeHandler(auth));

// Stripe requires the raw body for signature verification, so this route stays before express.json().
app.post('/api/webhooks/stripe', webhookLimiter, express.raw({type: 'application/json'}), stripeWebhookHandler);

app.use(express.json({limit: '256kb'}));

// health, cron, legal, public listings, public files, waitlist, M-Pesa/Pesapal webhooks
registerPublicRoutes(app);
registerInviteRoutes(app);

const bffRouter = express.Router();
bffRouter.use(authLimiter, writeLimiter);

// BFF routes, shared by the web and mobile clients. Registration is grouped by area; no two
// routes in different groups match the same method + path, so group order is not significant.
registerUserRoutes(bffRouter);
registerTenantRoutes(bffRouter);
registerHunterRoutes(bffRouter);
registerLandlordRoutes(bffRouter);
registerAdminRoutes(bffRouter);
registerPaymentRoutes(bffRouter);
registerCaretakerRoutes(bffRouter);

app.use('/api/web', bffRouter);
app.use('/api/mobile', bffRouter);


if (process.env.VERCEL !== '1') {
  const distPath = path.join(process.cwd(), 'frontend', 'dist');
  app.use(
    express.static(distPath, {
      // Cache-Control is set per file below; express's default maxAge would override it.
      cacheControl: false,
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', isProduction ? staticCacheControl(path.relative(distPath, filePath)) : 'no-cache');
      },
    }),
  );

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({error: 'API route not found'});
    }
    // The SPA shell must always revalidate so a new deploy's asset hashes are picked up.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // On Vercel, just return 404 for unmatched API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({error: 'API route not found'});
    }
    next();
  });
}

Sentry.setupExpressErrorHandler(app);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = Number(error.statusCode || error.status || 500);
  if (status >= 500) {
    Sentry.captureException(error);
    console.error(`[Server Error] ${status}: ${error.message}`, error);
  }

  res.status(status).json({
    error: (status >= 500 && isProduction) ? 'Internal server error' : error.message,
  });
};

app.use(errorHandler);

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`
    MyBoma API Gateway active
    Port: ${PORT}
    Web BFF: /api/web
    Mobile BFF: /api/mobile
    Public endpoints and webhooks are rate limited
    Configured services: ${JSON.stringify(nonSecretConfigStatus())}
    `);
  });
}

// In-process schedule for always-on hosts. Where the host sleeps (Vercel, Render free tier) the
// same jobs are triggered externally via /api/cron/daily and EXTERNAL_CRON=true disables this.
if (process.env.VERCEL !== '1' && process.env.EXTERNAL_CRON !== 'true') {
  cron.schedule(
    '0 8 * * *',
    async () => {
      try {
        const result = await runDailyJobs();
        console.log('[Cron] Daily jobs completed', JSON.stringify(result));
      } catch (err) {
        console.error('[Cron] Daily jobs failed:', err);
        Sentry.captureException(err);
      }
    },
    {timezone: 'Africa/Nairobi'},
  );
}

export default app;

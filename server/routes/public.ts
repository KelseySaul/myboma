import {randomUUID, timingSafeEqual} from 'node:crypto';
import {desc, eq} from 'drizzle-orm';
import {type Express, type Request, type Response} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {LEGAL_DOCUMENTS} from '../../src/legalDocuments.ts';
import {verifyMpesaCallback} from '../helpers.ts';
import {appBaseUrl, isProduction, nonSecretConfigStatus} from '../http/config.ts';
import {
  asyncHandler,
  getValidatedBody,
  publicLimiter,
  validateBody,
  waitlistLimiter,
  webhookLimiter,
} from '../http/middleware.ts';
import {uuidSchema} from '../http/schemas.ts';
import {runDailyJobs} from '../services/dailyJobs.ts';
import {streamStoredObject} from '../services/files.ts';
import {sendEmail} from '../services/notify.ts';
import {handleMpesaB2cResult, handleMpesaCallback, handlePesapalCallback, handlePesapalIpn} from '../services/payments.ts';

const waitlistSignupSchema = z
  .object({
    email: z.string().email().max(320),
    source: z.string().max(80).optional().default('landing-page'),
  })
  .strict();

const waitlistUnsubscribeSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    token: uuidSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.email || value.token), {
    message: 'Email or unsubscribe token is required',
  });

const healthHandler = (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MyBoma API Gateway',
    ...(isProduction ? {} : {config: nonSecretConfigStatus()}),
  });
};

/** Public (unauthenticated) routes and provider webhooks, registered after express.json(). */
export function registerPublicRoutes(app: Express) {
  app.get('/api/health', healthHandler);

  app.get(
    '/api/cron/daily',
    asyncHandler(async (req, res) => {
      const secret = process.env.CRON_SECRET;
      const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const valid =
        Boolean(secret) && provided.length === secret!.length && timingSafeEqual(Buffer.from(provided), Buffer.from(secret!));
      if (!valid) {
        res.status(401).json({error: 'Unauthorized'});
        return;
      }
      const result = await runDailyJobs();
      console.log('[Cron] Daily jobs completed', JSON.stringify(result));
      res.json({ok: true, ...result});
    }),
  );
  app.get('/api/legal', (_req, res) => res.json(LEGAL_DOCUMENTS));

  /** Public listings — matches the old "Authenticated users read available properties"
   * RLS policy's `status = 'available'` branch, which was open to anyone (see db/authz.ts
   * canViewProperty). Logged-out hunters browse this same feed. */
  app.get('/api/public/properties/available', publicLimiter, asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await db.query.properties.findMany({
      where: eq(schema.properties.status, 'available'),
      orderBy: desc(schema.properties.createdAt),
      // Public feed: never expose tenant references or internal fields.
      columns: {
        id: true, landlordId: true, platformId: true, buildingId: true, unitNumber: true, title: true,
        description: true, type: true, price: true, location: true, images: true, status: true,
        amenities: true, createdAt: true,
      },
      limit,
      offset,
    });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.json(rows.map((p) => ({...p, price: Number(p.price)})));
  }));

  /** Public file serving for marketing assets (listing photos, avatars, platform logos).
   * Private documents (receipts, IDs, expense evidence) live under `<uid>/private/` and are
   * NEVER served here — see the authenticated /files/private route on the BFF. */
  app.get('/api/files/*', publicLimiter, asyncHandler(async (req, res) => {
    const key = (req.params as unknown as string[])[0];
    if (!key || key.includes('..')) {
      res.status(400).json({error: 'Missing file key'});
      return;
    }
    if (key.split('/')[1] === 'private') {
      res.status(404).json({error: 'Not found'});
      return;
    }
    await streamStoredObject(key, res, 'public, max-age=31536000, immutable');
  }));

  app.post(
    '/api/waitlist',
    waitlistLimiter,
    validateBody(waitlistSignupSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof waitlistSignupSchema>>(req);
      const email = body.email.toLowerCase();
      const unsubscribeToken = randomUUID();
      const now = new Date();
      const values = {
        email,
        source: body.source,
        status: 'subscribed' as const,
        unsubscribeToken,
        consentAt: now,
        unsubscribedAt: null,
        updatedAt: now,
      };
      const [data] = await db
        .insert(schema.waitlistSignups)
        .values(values)
        .onConflictDoUpdate({target: schema.waitlistSignups.email, set: values})
        .returning({email: schema.waitlistSignups.email, unsubscribeToken: schema.waitlistSignups.unsubscribeToken});

      const unsubscribeUrl = `${appBaseUrl}/?unsubscribe=${data.unsubscribeToken}`;
      try {
        await sendEmail({
          to: data.email,
          subject: 'You are on the MyBoma waitlist',
          text: [
            'Thanks for joining the MyBoma waitlist.',
            '',
            'We will email you about launch updates and important product news.',
            `Unsubscribe any time: ${unsubscribeUrl}`,
          ].join('\n'),
        });
      } catch (error) {
        console.error(`[Waitlist] Confirmation email failed for ${email}:`, error);
      }

      res.status(201).json({status: 'subscribed'});
    }),
  );
  app.post(
    '/api/waitlist/unsubscribe',
    waitlistLimiter,
    validateBody(waitlistUnsubscribeSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof waitlistUnsubscribeSchema>>(req);
      const now = new Date();
      if (!body.token) {
        // Email-only requests can't prove mailbox ownership, so instead of unsubscribing we
        // email the one-click link. Same response either way (no address enumeration).
        const signup = await db.query.waitlistSignups.findFirst({
          where: eq(schema.waitlistSignups.email, body.email!.toLowerCase()),
          columns: {email: true, unsubscribeToken: true},
        });
        if (signup) {
          await sendEmail({
            to: signup.email,
            subject: 'Unsubscribe from MyBoma updates',
            text: `Open this link to unsubscribe: ${appBaseUrl}/?unsubscribe=${signup.unsubscribeToken}`,
          }).catch((error) => console.error('[Waitlist] Unsubscribe email failed:', error));
        }
        res.json({status: 'link_sent'});
        return;
      }
      const where = eq(schema.waitlistSignups.unsubscribeToken, body.token);

      await db.update(schema.waitlistSignups).set({status: 'unsubscribed', unsubscribedAt: now, updatedAt: now}).where(where);

      res.json({status: 'unsubscribed'});
    }),
  );
  app.post(
    '/api/webhooks/mpesa/stk',
    webhookLimiter,
    verifyMpesaCallback(isProduction),
    handleMpesaCallback,
  );
  app.post('/api/webhooks/mpesa/b2c-result', webhookLimiter, verifyMpesaCallback(), handleMpesaB2cResult('result'));
  app.post('/api/webhooks/mpesa/b2c-timeout', webhookLimiter, verifyMpesaCallback(), handleMpesaB2cResult('timeout'));
  app.get('/api/payments/pesapal/callback', webhookLimiter, handlePesapalCallback);
  app.get('/api/webhooks/pesapal/ipn', webhookLimiter, handlePesapalIpn);
  app.post('/api/webhooks/pesapal/ipn', webhookLimiter, handlePesapalIpn);
}

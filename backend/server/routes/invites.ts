import {type Express} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {sharedRateLimitStore} from '../rateLimitStore.ts';
import {asyncHandler, getValidatedBody, validateBody} from '../http/middleware.ts';
import {InviteError, acceptInvite, lookupInvite} from '../inviteService.ts';
import {maskEmail} from '../invitePolicy.ts';

// Tokens are 256-bit, so guessing is hopeless; this just keeps the endpoints cheap to abuse.
const inviteLimiter = rateLimit({
  store: sharedRateLimitStore('inviteLimiter'),
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many attempts. Please try again later.'},
});

const acceptInviteSchema = z
  .object({
    token: z.string().min(20).max(100),
    name: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^\+?[\d\s]*$/, 'Phone number can only contain digits')
      .optional()
      .or(z.literal('')),
    password: z.string().min(8).max(128),
  })
  .strict();

/** Public, unauthenticated invite endpoints. The token in the email link is the only credential. */
export function registerInviteRoutes(app: Express) {
  app.get(
    '/api/public/invites/:token',
    inviteLimiter,
    asyncHandler(async (req, res) => {
      const result = await lookupInvite(req.params.token);
      if (result.status === 'invalid') {
        res.status(404).json({error: 'This invitation link is invalid or has already been used.'});
        return;
      }
      if (result.status === 'expired') {
        res.status(410).json({error: 'This invitation has expired. Ask for a new one.'});
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        email: maskEmail(result.payload.email),
        role: result.payload.role,
        invitedByName: result.payload.invitedByName,
        displayName: result.payload.displayName,
      });
    }),
  );

  app.post(
    '/api/public/invites/accept',
    inviteLimiter,
    validateBody(acceptInviteSchema),
    asyncHandler(async (req, res) => {
      const body = getValidatedBody<z.infer<typeof acceptInviteSchema>>(req);
      try {
        const result = await acceptInvite({
          token: body.token,
          name: body.name,
          phone: body.phone?.replace(/\s/g, '') || null,
          password: body.password,
        });
        for (const cookie of result.setCookies) res.append('Set-Cookie', cookie);
        res.setHeader('Cache-Control', 'no-store');
        res.status(201).json({ok: true, role: result.role});
      } catch (error) {
        if (error instanceof InviteError) {
          res.status(error.status).json({error: error.message});
          return;
        }
        throw error;
      }
    }),
  );
}

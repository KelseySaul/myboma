import {createHash} from 'node:crypto';
import {type Request} from 'express';
import rateLimit, {ipKeyGenerator} from 'express-rate-limit';
import {sharedRateLimitStore} from '../rateLimitStore.ts';

/**
 * The visitor's IP. Render sits behind Cloudflare, which overwrites CF-Connecting-IP
 * with the real client address; req.ip (trust proxy 1) would otherwise be the edge.
 */
export const clientIp = (req: Request) => {
  const cf = req.headers['cf-connecting-ip'];
  const ip = (typeof cf === 'string' && cf.trim()) || req.ip || req.socket.remoteAddress || 'unknown';
  return ipKeyGenerator(ip);
};

const SESSION_COOKIES = ['__Secure-better-auth.session_token', 'better-auth.session_token'];

/** A stable, non-reversible id for the caller's session, or null when signed out. */
export const sessionKey = (req: Request): string | null => {
  const header = req.headers.authorization;
  let token = typeof header === 'string' && /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token && typeof req.headers.cookie === 'string') {
    for (const part of req.headers.cookie.split(';')) {
      const [name, ...value] = part.trim().split('=');
      if (SESSION_COOKIES.includes(name)) {
        token = value.join('=');
        break;
      }
    }
  }
  return token ? createHash('sha256').update(token).digest('hex').slice(0, 32) : null;
};

export type LimiterKey = 'ip' | 'session';

export const makeLimiter = (
  name: string,
  options: {
    windowMs: number;
    limit: number;
    error: string;
    key?: LimiterKey;
    keyGenerator?: (req: Request) => string;
    skipSuccessfulRequests?: boolean;
    skip?: (req: Request) => boolean;
  },
) =>
  rateLimit({
    store: sharedRateLimitStore(name),
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests,
    skip: options.skip,
    keyGenerator: (req) => {
      if (options.keyGenerator) return options.keyGenerator(req);
      if (options.key === 'session') {
        const session = sessionKey(req);
        if (session) return `s:${session}`;
      }
      return `ip:${clientIp(req)}`;
    },
    handler: (req, res, _next, opts) => {
      const resetTime = (req as Request & {rateLimit?: {resetTime?: Date}}).rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(opts.statusCode).json({error: options.error, retryAfterSeconds});
    },
  });


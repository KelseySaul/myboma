import {timingSafeEqual} from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';

export const buildAllowedRedirectOrigins = (appBaseUrl: string, corsOrigins: string) => {
  const origins = new Set<string>();
  for (const entry of [appBaseUrl, ...corsOrigins.split(',')]) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // ignore invalid URLs
    }
  }
  return origins;
};

export const assertAllowedRedirectUrl = (url: string | undefined, allowedOrigins: Set<string>) => {
  if (!url) return;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    const error = new Error('Redirect URL is invalid.');
    (error as any).statusCode = 400;
    throw error;
  }
  if (!allowedOrigins.has(origin)) {
    if (process.env.NODE_ENV !== 'production' && origin.includes('172.')) {
      return; // Allow local network IPs in dev
    }
    const error = new Error('Redirect URL origin is not allowed.');
    (error as any).statusCode = 400;
    throw error;
  }
};

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Fails closed in every environment: an unauthenticated STK callback lets anyone mark
 * rent paid. Safaricom cannot send custom headers, so the secret normally arrives as
 * `?secret=` on the registered CallBackURL (app.ts appends it automatically).
 */
export const verifyMpesaCallback =
  (_isProduction?: boolean) => (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.MPESA_CALLBACK_SECRET;
    if (!secret) {
      res.status(503).json({ResultCode: 1, ResultDesc: 'M-Pesa callback secret is not configured'});
      return;
    }

    const headerSecret =
      req.headers['x-mpesa-callback-secret'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    const provided = String(
      (typeof req.query?.secret === 'string' ? req.query.secret : undefined) ??
        (Array.isArray(headerSecret) ? headerSecret[0] : headerSecret) ??
        '',
    );

    if (!safeEqual(provided, secret)) {
      res.status(401).json({ResultCode: 1, ResultDesc: 'Unauthorized callback'});
      return;
    }
    next();
  };

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

export const verifyMpesaCallback =
  (isProduction: boolean) => (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.MPESA_CALLBACK_SECRET;
    if (!secret) {
      if (isProduction) {
        res.status(503).json({ResultCode: 1, ResultDesc: 'M-Pesa callback secret is not configured'});
        return;
      }
      next();
      return;
    }

    const provided =
      req.headers['x-mpesa-callback-secret'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (provided !== secret) {
      res.status(401).json({ResultCode: 1, ResultDesc: 'Unauthorized callback'});
      return;
    }
    next();
  };

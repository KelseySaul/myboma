import type {IncomingMessage, ServerResponse} from 'node:http';

/**
 * Vercel entry. If required configuration is missing, the app would throw while loading
 * (db/client.ts needs DATABASE_URL; Better Auth refuses to start without a secret in
 * production) and Vercel only reports an opaque FUNCTION_INVOCATION_FAILED for every route.
 * Instead, answer with a 503 that names the missing variables (names only, never values).
 */
const REQUIRED_ENV = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'] as const;
const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());

const misconfigured = (_req: IncomingMessage, res: ServerResponse) => {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({error: 'Server is not configured', missingEnv: missing}));
};

const handler = missing.length ? misconfigured : (await import('../app.js')).default;

export default handler;

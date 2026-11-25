import {createVerify} from 'node:crypto';

/**
 * Verifies Firebase Auth ID tokens (RS256) against Google's official public X.509
 * certificates for securetoken.google.com — no service-account JSON secret needed.
 */

export const DEFAULT_FIREBASE_PROJECT_ID = 'myboma-c1c8b';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export const getFirebaseProjectId = () =>
  (process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim();

type CertCache = {
  certs: Record<string, string>;
  expiresAt: number;
};

let certCache: CertCache | null = null;

async function fetchGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && certCache && certCache.expiresAt > now) {
    return certCache.certs;
  }

  const response = await fetch(GOOGLE_CERTS_URL, {
    headers: {Accept: 'application/json'},
  });
  if (!response.ok) {
    throw new Error(`Could not fetch Firebase signing certificates (${response.status}).`);
  }

  const certs = (await response.json()) as Record<string, string>;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  certCache = {certs, expiresAt: now + maxAgeSec * 1000};
  return certs;
}

const decodeBase64UrlJson = <T>(segment: string): T => {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const raw = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(raw) as T;
};

export type VerifiedFirebasePhoneToken = {
  uid: string;
  phoneNumber: string;
  email: string | null;
  authTime: number;
  issuedAt: number;
  expiresAt: number;
};

export class FirebaseTokenError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Normalizes Kenya / international phone numbers to E.164 (+254...) and comparable variants. */
export const normalizePhoneNumber = (raw: string): string | null => {
  const cleaned = raw.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return null;
  if (/^\+\d{9,15}$/.test(cleaned)) return cleaned;
  if (/^0(7|1)\d{8}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;
  if (/^254(7|1)\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{9,15}$/.test(cleaned)) return `+${cleaned}`;
  return null;
};

/** Returns all canonical representations a user's stored phone might have used in Postgres. */
export const phoneLookupVariants = (e164Phone: string): string[] => {
  const normalized = normalizePhoneNumber(e164Phone) ?? e164Phone.trim();
  const digits = normalized.replace(/^\+/, '');
  const variants = new Set<string>([normalized, digits]);
  if (digits.startsWith('254') && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
  }
  return [...variants];
};

/** Pure claim validator (exported separately for unit tests). */
export const validateFirebaseTokenClaims = (
  header: {alg?: string; kid?: string},
  payload: Record<string, unknown>,
  projectId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedFirebasePhoneToken => {
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new FirebaseTokenError(401, 'Invalid Firebase token header.');
  }
  const aud = String(payload.aud ?? '');
  const iss = String(payload.iss ?? '');
  const sub = String(payload.sub ?? '');
  const exp = Number(payload.exp ?? 0);
  const iat = Number(payload.iat ?? 0);
  const authTime = Number(payload.auth_time ?? iat);

  if (aud !== projectId) {
    throw new FirebaseTokenError(401, 'Firebase token project mismatch.');
  }
  if (iss !== `https://securetoken.google.com/${projectId}`) {
    throw new FirebaseTokenError(401, 'Invalid Firebase token issuer.');
  }
  if (!sub || sub.length > 128) {
    throw new FirebaseTokenError(401, 'Invalid Firebase subject.');
  }
  if (!Number.isFinite(exp) || exp <= nowSeconds - 30) {
    throw new FirebaseTokenError(401, 'Your verification code session expired. Request a new code.');
  }
  if (!Number.isFinite(iat) || iat > nowSeconds + 300) {
    throw new FirebaseTokenError(401, 'Invalid Firebase token timestamp.');
  }

  const rawPhone = typeof payload.phone_number === 'string' ? payload.phone_number : '';
  const phoneNumber = normalizePhoneNumber(rawPhone);
  if (!phoneNumber) {
    throw new FirebaseTokenError(400, 'This Firebase token does not contain a verified phone number.');
  }

  const email = typeof payload.email === 'string' && payload.email.includes('@') ? payload.email.trim().toLowerCase() : null;
  return {
    uid: sub,
    phoneNumber,
    email,
    authTime,
    issuedAt: iat,
    expiresAt: exp,
  };
};

/** Cryptographically verifies a Firebase ID token and returns the verified phone claims. */
export async function verifyFirebasePhoneIdToken(
  idToken: string,
  projectId = getFirebaseProjectId(),
): Promise<VerifiedFirebasePhoneToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new FirebaseTokenError(401, 'Malformed Firebase ID token.');
  }

  let header: {alg?: string; kid?: string};
  let payload: Record<string, unknown>;
  try {
    header = decodeBase64UrlJson<{alg?: string; kid?: string}>(parts[0]);
    payload = decodeBase64UrlJson<Record<string, unknown>>(parts[1]);
  } catch {
    throw new FirebaseTokenError(401, 'Could not decode Firebase ID token.');
  }

  const claims = validateFirebaseTokenClaims(header, payload, projectId);

  let certs = await fetchGooglePublicCerts(false);
  let cert = header.kid ? certs[header.kid] : undefined;
  if (!cert) {
    certs = await fetchGooglePublicCerts(true);
    cert = header.kid ? certs[header.kid] : undefined;
  }
  if (!cert) {
    throw new FirebaseTokenError(401, 'Unknown Firebase signing key.');
  }

  const signatureBytes = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(cert, signatureBytes)) {
    throw new FirebaseTokenError(401, 'Invalid Firebase token signature.');
  }

  return claims;
}

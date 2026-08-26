/**
 * Replaces Supabase Storage. Files are uploaded through the server (not directly from
 * the browser, since R2 credentials must never reach the client) and land in the same
 * `${uid}/...` per-user-folder layout the old Supabase bucket used, preserving the
 * write-your-own-folder-only convention its storage RLS policies enforced.
 *
 * The R2 API token in use is scoped to this bucket only (no ListBuckets permission),
 * so object reads are served through our own `/api/files/*` route rather than R2's
 * public-bucket / custom-domain feature — that also means uploads work today without
 * waiting on any Cloudflare dashboard configuration.
 */
import {GetObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET = process.env.R2_BUCKET || 'myboma';

const r2Client =
  accountId && accessKeyId && secretAccessKey
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {accessKeyId, secretAccessKey},
      })
    : null;

export const isStorageConfigured = () => Boolean(r2Client);

/** Uploads a single file under `${uid}/...`. Returns the object key — callers build the
 * public-facing URL via GET /api/files/:key (see app.ts). */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!r2Client) {
    throw new Error('Cloudflare R2 is not configured (missing R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY).');
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Streams an object back out — backs the public GET /api/files/:key route. */
export async function getObjectStream(key: string) {
  if (!r2Client) {
    throw new Error('Cloudflare R2 is not configured.');
  }
  return r2Client.send(new GetObjectCommand({Bucket: R2_BUCKET, Key: key}));
}

/** Mirrors the old bucket's `${uid}/...` (or `${uid}/platforms/${platformId}/...`) key layout. */
export const buildObjectKey = (uid: string, fileName: string, subpath?: string) => {
  const ext = fileName.split('.').pop() || 'bin';
  const prefix = subpath ? `${uid}/${subpath}` : uid;
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
};

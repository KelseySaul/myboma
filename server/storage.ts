/**
 * Replaces Supabase Storage. Files are uploaded through the server (not directly from
 * the browser, since R2 credentials must never reach the client) and land in the same
 * `${uid}/...` per-user-folder layout the old Supabase bucket used, preserving the
 * write-your-own-folder-only convention its storage RLS policies enforced.
 */
import {PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET = process.env.R2_BUCKET || 'myboma';
const publicUrlBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

const r2Client =
  accountId && accessKeyId && secretAccessKey
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {accessKeyId, secretAccessKey},
      })
    : null;

export const isStorageConfigured = () => Boolean(r2Client && publicUrlBase);

/** Uploads a single file under `${uid}/...` and returns its public URL. */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!r2Client) {
    throw new Error('Cloudflare R2 is not configured (missing R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY).');
  }
  if (!publicUrlBase) {
    throw new Error('R2_PUBLIC_URL is not configured — enable public access on the bucket and set it.');
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return `${publicUrlBase}/${key}`;
}

/** Mirrors the old bucket's `${uid}/...` (or `${uid}/platforms/${platformId}/...`) key layout. */
export const buildObjectKey = (uid: string, fileName: string, subpath?: string) => {
  const ext = fileName.split('.').pop() || 'bin';
  const prefix = subpath ? `${uid}/${subpath}` : uid;
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
};

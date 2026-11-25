/**
 * Replaces Supabase Storage. Files are uploaded through the server (not directly from
 * the browser, since R2 credentials must never reach the client) and land in the same
 * `${uid}/...` per-user-folder layout the old Supabase bucket used, preserving the
 * write-your-own-folder-only convention its storage RLS policies enforced.
 *
 * Uses Cloudflare R2 when configured; in local development (or if R2 is not configured),
 * safely falls back to local disk under `backend/.uploads/` so uploads always work cleanly.
 */
import {GetObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {createReadStream} from 'node:fs';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isProduction} from './http/config.ts';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET = process.env.R2_BUCKET || 'myboma';

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), 'backend', '.uploads');

const r2Client =
  accountId && accessKeyId && secretAccessKey
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {accessKeyId, secretAccessKey},
      })
    : null;

export const isStorageConfigured = () => Boolean(r2Client || !isProduction);

const resolveLocalPath = (key: string) => {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    throw new Error('Invalid object key');
  }
  const target = path.resolve(LOCAL_UPLOAD_ROOT, normalized);
  if (!target.startsWith(LOCAL_UPLOAD_ROOT)) {
    throw new Error('Invalid object key path');
  }
  return target;
};

const contentTypeForKey = (key: string) => {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
};

async function writeLocalObject(key: string, body: Buffer) {
  const target = resolveLocalPath(key);
  await mkdir(path.dirname(target), {recursive: true});
  await writeFile(target, body);
}

async function readLocalObject(key: string) {
  const target = resolveLocalPath(key);
  const info = await stat(target);
  return {
    ContentType: contentTypeForKey(key),
    ContentLength: info.size,
    Body: createReadStream(target),
    readBuffer: () => readFile(target),
  };
}

/** Uploads a single file under `${uid}/...`. Returns the object key — callers build the
 * public-facing URL via GET /api/files/:key (see app.ts). */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (r2Client) {
    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    } catch (err) {
      if (isProduction) throw err;
      console.warn('[Storage] R2 upload failed in development; falling back to local disk:', (err as Error)?.message);
    }
  } else if (isProduction) {
    throw new Error('Cloudflare R2 is not configured (missing R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY).');
  }

  await writeLocalObject(key, body);
}

/** Streams an object back out — backs the public GET /api/files/:key route. */
export async function getObjectStream(key: string) {
  if (r2Client) {
    try {
      return await r2Client.send(new GetObjectCommand({Bucket: R2_BUCKET, Key: key}));
    } catch (err: any) {
      if (isProduction) throw err;
      // In local development, fall back to local disk if the object was saved locally or R2 is offline.
      try {
        return await readLocalObject(key);
      } catch {
        throw err;
      }
    }
  }
  if (isProduction) {
    throw new Error('Cloudflare R2 is not configured.');
  }
  try {
    return await readLocalObject(key);
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      const notFound = new Error('Not found');
      notFound.name = 'NoSuchKey';
      throw notFound;
    }
    throw err;
  }
}

/** Mirrors the old bucket's `${uid}/...` (or `${uid}/platforms/${platformId}/...`) key layout. */
export const buildObjectKey = (uid: string, fileName: string, subpath?: string) => {
  const ext = fileName.split('.').pop() || 'bin';
  const prefix = subpath ? `${uid}/${subpath}` : uid;
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
};

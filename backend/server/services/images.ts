import sharp from 'sharp';

/** Largest file accepted before conversion. Phone photos are usually 2–8 MB. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Formats we decode. SVG is deliberately excluded (scriptable XML), as is camera RAW. */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'tiff']);

/** Guards against decompression bombs: ~50 megapixels is far above any phone camera. */
const MAX_INPUT_PIXELS = 50_000_000;

export type ImageKind = 'photo' | 'avatar' | 'logo';

const MAX_EDGE: Record<ImageKind, number> = {photo: 1600, avatar: 512, logo: 512};

export class ImageRejectedError extends Error {
  readonly status = 415;
}

/** Picks the output size from the upload subpath the client sends. */
export const imageKindForSubpath = (subpath?: string): ImageKind => {
  const first = subpath?.split('/')[0];
  if (first === 'avatar') return 'avatar';
  if (first === 'platforms' || first === 'branding') return 'logo';
  return 'photo';
};

/**
 * Validates an uploaded image by decoding it, then re-encodes it as WebP:
 * EXIF orientation applied, all metadata (GPS, camera) stripped, scaled to fit
 * within the size for its kind (never enlarged), first frame only for GIFs.
 */
export async function toWebp(input: Buffer, kind: ImageKind = 'photo'): Promise<{buffer: Buffer; width: number; height: number}> {
  let format: string | undefined;
  try {
    ({format} = await sharp(input, {limitInputPixels: MAX_INPUT_PIXELS}).metadata());
  } catch {
    throw new ImageRejectedError('This file is not a supported image. Upload a JPEG, PNG, WebP, HEIC or GIF photo.');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ImageRejectedError('This file is not a supported image. Upload a JPEG, PNG, WebP, HEIC or GIF photo.');
  }

  const edge = MAX_EDGE[kind];
  try {
    const {data, info} = await sharp(input, {limitInputPixels: MAX_INPUT_PIXELS, pages: 1})
      .rotate()
      .resize({width: edge, height: edge, fit: 'inside', withoutEnlargement: true})
      .webp({quality: 75, effort: 4})
      .toBuffer({resolveWithObject: true});
    return {buffer: data, width: info.width, height: info.height};
  } catch {
    throw new ImageRejectedError('This image could not be processed. Try a different photo.');
  }
}

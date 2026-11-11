/**
 * Re-encodes a photo through a canvas before upload. This drops ALL embedded metadata —
 * EXIF GPS coordinates (a landlord's or tenant's home location), camera serials, and
 * capture timestamps — while baking the EXIF orientation into the pixels. Large photos are
 * also downscaled, which keeps uploads under the API's 4MB limit on mobile data.
 * GIFs are passed through untouched (re-encoding would drop animation).
 */
const MAX_EDGE = 2560;

export const stripImageMetadata = async (file: File | Blob): Promise<Blob> => {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // PNG keeps transparency (logos); photos become WebP.
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
};

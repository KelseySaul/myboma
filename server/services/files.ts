import {type Response} from 'express';
import {getObjectStream} from '../storage.ts';

/** Streams a stored object as an inert image (or a forced download). */
export const streamStoredObject = async (key: string, res: Response, cacheControl: string) => {
  try {
    const object = await getObjectStream(key);
    // Only ever serve stored files as inert images; anything else downloads as bytes.
    const contentType =
      object.ContentType && /^image\/(jpeg|png|webp|gif)$/.test(object.ContentType) ? object.ContentType : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (contentType === 'application/octet-stream') res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Cache-Control', cacheControl);
    const body = object.Body as NodeJS.ReadableStream | undefined;
    if (!body) {
      res.status(404).json({error: 'Not found'});
      return;
    }
    body.pipe(res);
  } catch (err: any) {
    if (err?.name === 'NoSuchKey') {
      res.status(404).json({error: 'Not found'});
      return;
    }
    throw err;
  }
};

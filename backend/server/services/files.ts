import {type Response} from 'express';
import {Readable} from 'node:stream';
import {getObjectStream} from '../storage.ts';

/** Streams a stored object as an inert image (or a forced download). */
export const streamStoredObject = async (key: string, res: Response, cacheControl: string) => {
  try {
    const object = await getObjectStream(key);
    // Only ever serve stored files as inert images; anything else downloads as bytes.
    const contentType =
      object.ContentType && /^image\/(jpeg|png|webp|gif)$/.test(object.ContentType)
        ? object.ContentType
        : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (typeof object.ContentLength === 'number' && Number.isFinite(object.ContentLength)) {
      res.setHeader('Content-Length', String(object.ContentLength));
    }
    if (contentType === 'application/octet-stream') res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Cache-Control', cacheControl);

    const rawBody = object.Body as any;
    if (!rawBody) {
      res.status(404).json({error: 'Not found'});
      return;
    }

    // AWS SDK v3 streams can be Node Readable streams OR web ReadableStreams depending on runtime.
    if (typeof rawBody.pipe === 'function') {
      await new Promise<void>((resolve, reject) => {
        rawBody.on('error', (streamErr: unknown) => {
          if (!res.headersSent) {
            res.status(502).json({error: 'Failed to read file'});
          } else {
            res.end();
          }
          reject(streamErr);
        });
        res.on('close', resolve);
        res.on('finish', resolve);
        rawBody.pipe(res);
      }).catch((streamErr) => {
        console.error('[Files] Stream error for key', key, streamErr);
      });
      return;
    }

    if (typeof rawBody.transformToByteArray === 'function') {
      const bytes = await rawBody.transformToByteArray();
      res.send(Buffer.from(bytes));
      return;
    }

    if (typeof Readable.fromWeb === 'function' && typeof rawBody.getReader === 'function') {
      const nodeStream = Readable.fromWeb(rawBody);
      nodeStream.on('error', (streamErr) => {
        console.error('[Files] Web stream error for key', key, streamErr);
        if (!res.headersSent) res.status(502).json({error: 'Failed to read file'});
        else res.end();
      });
      nodeStream.pipe(res);
      return;
    }

    res.status(404).json({error: 'Not found'});
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404 || err?.code === 'ENOENT') {
      res.status(404).json({error: 'Not found'});
      return;
    }
    throw err;
  }
};

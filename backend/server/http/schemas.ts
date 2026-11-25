import {z} from 'zod';

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(320);
export const absoluteUrlSchema = z.string().url().max(2048);
export const phoneSchema = z
  .string()
  .max(20)
  .regex(/^\+?\d+$/)
  .or(z.literal(''))
  .nullable()
  .optional();

/** Parses a comma-separated (or repeated) query parameter of account UUIDs. Invalid entries are ignored. */
export const parseAccountIdsParam = (raw: unknown): string[] => {
  const parts = Array.isArray(raw)
    ? raw.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (uuidSchema.safeParse(trimmed).success) {
      seen.add(trimmed);
      valid.push(trimmed);
      if (valid.length >= 50) break;
    }
  }
  return valid;
};

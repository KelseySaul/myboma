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

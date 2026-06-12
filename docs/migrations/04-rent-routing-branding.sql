-- Migration: Rent Routing, Admin-Managed Landlords, and White Labeling

-- 1. Functional White-Labeling for Platforms
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS "brandLogoUrl" text;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS "brandPrimaryColor" text;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS "brandSecondaryColor" text;

-- 2. Rent Routing and Managed Subscriptions
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "managedByAdminId" uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "rentRecipientId" uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';

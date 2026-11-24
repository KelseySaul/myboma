-- Store an optional precise map pin alongside the building's display address.
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS latitude numeric(9, 6);
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS longitude numeric(9, 6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'buildings_coordinates_pair_check'
      AND conrelid = 'public.buildings'::regclass
  ) THEN
    ALTER TABLE public.buildings
      ADD CONSTRAINT buildings_coordinates_pair_check
      CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude IS NOT NULL AND longitude IS NOT NULL)
      );
  END IF;
END $$;

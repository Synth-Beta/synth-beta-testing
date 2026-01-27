-- ============================================
-- Add city column to venues table
-- ============================================
-- This migration adds the city column that was missing from
-- the address columns migration. The sync script expects this
-- column to exist for location-based venue matching.

-- Add city column (addressLocality)
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS city TEXT;

-- Add index for city queries (useful for location-based matching)
CREATE INDEX IF NOT EXISTS idx_venues_city ON public.venues(city) TABLESPACE pg_default;

-- Add comment
COMMENT ON COLUMN public.venues.city IS 'City/locality extracted from address JSONB (address.addressLocality)';

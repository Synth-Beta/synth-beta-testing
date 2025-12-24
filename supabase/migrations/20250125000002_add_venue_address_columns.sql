-- ============================================
-- Add individual address columns to venues table
-- ============================================
-- This migration adds separate columns for address components
-- extracted from the address JSONB column

-- Add street_address column
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS street_address TEXT;

-- Add state column (addressRegion)
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS state TEXT;

-- Add country column (addressCountry)
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS country TEXT;

-- Add zip column (postalCode)
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS zip TEXT;

-- Add latitude column (from geo JSONB)
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8);

-- Add longitude column (from geo JSONB)
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_venues_state ON public.venues(state) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_venues_country ON public.venues(country) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_venues_zip ON public.venues(zip) TABLESPACE pg_default;

-- Add comments
COMMENT ON COLUMN public.venues.street_address IS 'Street address extracted from address JSONB (address.streetAddress)';
COMMENT ON COLUMN public.venues.state IS 'State/region extracted from address JSONB (address.addressRegion.name or address.addressRegion)';
COMMENT ON COLUMN public.venues.country IS 'Country extracted from address JSONB (address.addressCountry.name or address.addressCountry.identifier)';
COMMENT ON COLUMN public.venues.zip IS 'Postal code extracted from address JSONB (address.postalCode)';
COMMENT ON COLUMN public.venues.latitude IS 'Latitude extracted from geo JSONB (geo.latitude)';
COMMENT ON COLUMN public.venues.longitude IS 'Longitude extracted from geo JSONB (geo.longitude)';


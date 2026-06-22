-- ============================================
-- Migrate address data from JSONB to individual columns
-- ============================================
-- This migration extracts data from address and geo JSONB columns
-- and populates the new individual columns

UPDATE public.venues
SET
  -- Extract streetAddress from address JSONB
  street_address = CASE
    WHEN address->>'streetAddress' IS NOT NULL AND address->>'streetAddress' != '' 
    THEN address->>'streetAddress'
    ELSE NULL
  END,
  
  -- Extract state/region from address JSONB
  -- Handle both string and object formats, including empty objects
  state = CASE
    WHEN address->'addressRegion' IS NOT NULL THEN
      CASE
        -- If addressRegion is a string
        WHEN jsonb_typeof(address->'addressRegion') = 'string' 
        THEN address->>'addressRegion'
        -- If addressRegion is an object with a name property
        WHEN address->'addressRegion'->>'name' IS NOT NULL 
        THEN address->'addressRegion'->>'name'
        -- If addressRegion is an empty object or has no useful data, set to NULL
        ELSE NULL
      END
    ELSE NULL
  END,
  
  -- Extract country from address JSONB
  -- Handle nested country object with name or identifier
  country = CASE
    WHEN address->'addressCountry' IS NOT NULL THEN
      CASE
        -- If addressCountry is a string
        WHEN jsonb_typeof(address->'addressCountry') = 'string' 
        THEN address->>'addressCountry'
        -- If addressCountry is an object with a name property
        WHEN address->'addressCountry'->>'name' IS NOT NULL 
        THEN address->'addressCountry'->>'name'
        -- If addressCountry is an object with an identifier property
        WHEN address->'addressCountry'->>'identifier' IS NOT NULL 
        THEN address->'addressCountry'->>'identifier'
        ELSE NULL
      END
    ELSE NULL
  END,
  
  -- Extract postalCode from address JSONB
  zip = CASE
    WHEN address->>'postalCode' IS NOT NULL AND address->>'postalCode' != '' 
    THEN address->>'postalCode'
    ELSE NULL
  END,
  
  -- Extract latitude from geo JSONB
  latitude = CASE
    WHEN geo->>'latitude' IS NOT NULL 
    THEN (geo->>'latitude')::NUMERIC(10, 8)
    ELSE NULL
  END,
  
  -- Extract longitude from geo JSONB
  longitude = CASE
    WHEN geo->>'longitude' IS NOT NULL 
    THEN (geo->>'longitude')::NUMERIC(11, 8)
    ELSE NULL
  END
WHERE 
  -- Only update rows that have address or geo JSONB data
  (address IS NOT NULL OR geo IS NOT NULL);

-- Log migration results
DO $$
DECLARE
  total_venues INTEGER;
  venues_with_address INTEGER;
  venues_with_geo INTEGER;
  venues_migrated INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_venues FROM public.venues;
  SELECT COUNT(*) INTO venues_with_address FROM public.venues WHERE address IS NOT NULL;
  SELECT COUNT(*) INTO venues_with_geo FROM public.venues WHERE geo IS NOT NULL;
  SELECT COUNT(*) INTO venues_migrated FROM public.venues 
    WHERE street_address IS NOT NULL 
       OR state IS NOT NULL 
       OR country IS NOT NULL 
       OR zip IS NOT NULL 
       OR latitude IS NOT NULL 
       OR longitude IS NOT NULL;
  
  RAISE NOTICE 'Venue address migration complete:';
  RAISE NOTICE '  Total venues: %', total_venues;
  RAISE NOTICE '  Venues with address JSONB: %', venues_with_address;
  RAISE NOTICE '  Venues with geo JSONB: %', venues_with_geo;
  RAISE NOTICE '  Venues with migrated data: %', venues_migrated;
END $$;


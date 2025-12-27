-- ============================================================
-- Disable find_or_create_venue function
-- ============================================================
-- Users can no longer directly create venues via this function
-- They must submit requests via missing_entity_requests table

-- Drop the function if it exists
DROP FUNCTION IF EXISTS public.find_or_create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL);

-- Create a replacement function that only finds venues (doesn't create)
CREATE OR REPLACE FUNCTION public.find_or_create_venue(
  venue_name TEXT,
  venue_address TEXT DEFAULT NULL,
  venue_city TEXT DEFAULT NULL,
  venue_state TEXT DEFAULT NULL,
  venue_zip TEXT DEFAULT NULL,
  latitude DECIMAL DEFAULT NULL,
  longitude DECIMAL DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  venue_uuid UUID;
  normalized_name TEXT;
BEGIN
  -- Normalize the venue name
  normalized_name := TRIM(LOWER(venue_name));
  
  -- Try to find existing venue
  SELECT id INTO venue_uuid
  FROM public.venues
  WHERE LOWER(TRIM(name)) = normalized_name
  LIMIT 1;
  
  -- If not found, return NULL instead of creating
  -- Users must submit a request via missing_entity_requests
  IF venue_uuid IS NULL THEN
    -- Log that a venue was requested but not found
    -- This helps track what venues users are looking for
    RAISE NOTICE 'Venue "%" not found. User should submit a request via missing_entity_requests table.', venue_name;
    RETURN NULL;
  END IF;
  
  RETURN venue_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke execute permission from authenticated users
REVOKE EXECUTE ON FUNCTION public.find_or_create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL) FROM authenticated;

-- Only service role can execute (for backend operations)
GRANT EXECUTE ON FUNCTION public.find_or_create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.find_or_create_venue IS 'Finds existing venues only. Does not create new venues. Users must submit requests via missing_entity_requests table.';




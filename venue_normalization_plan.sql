-- ============================================================================
-- VENUE NORMALIZATION PLAN
-- ============================================================================
-- This script provides a comprehensive plan to normalize venue data across
-- all Supabase tables to ensure consistent venue searching and data integrity.
-- ============================================================================

-- STEP 1: POPULATE THE VENUES TABLE WITH DATA FROM JAMBASE_EVENTS
-- ============================================================================

-- First, let's populate the venues table with unique venues from jambase_events
INSERT INTO public.venues (
  jambase_venue_id,
  name,
  identifier,
  address,
  city,
  state,
  zip,
  country,
  latitude,
  longitude,
  created_at,
  updated_at
)
SELECT DISTINCT
  COALESCE(je.venue_id, 'manual_' || md5(je.venue_name)) as jambase_venue_id,
  je.venue_name as name,
  LOWER(REPLACE(REPLACE(je.venue_name, ' ', '_'), '''', '')) as identifier,
  je.venue_address as address,
  je.venue_city as city,
  je.venue_state as state,
  je.venue_zip as zip,
  'US' as country, -- Default to US, can be updated later
  je.latitude,
  je.longitude,
  NOW() as created_at,
  NOW() as updated_at
FROM public.jambase_events je
WHERE je.venue_name IS NOT NULL
  AND je.venue_name != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.venues v 
    WHERE LOWER(TRIM(v.name)) = LOWER(TRIM(je.venue_name))
  );

-- STEP 2: ADD VENUE_ID FOREIGN KEY TO JAMBASE_EVENTS
-- ============================================================================

-- Add venue_id column to jambase_events table
ALTER TABLE public.jambase_events 
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_id ON public.jambase_events(venue_id);

-- Update existing records to link to venues table
UPDATE public.jambase_events je
SET venue_id = v.id
FROM public.venues v
WHERE LOWER(TRIM(je.venue_name)) = LOWER(TRIM(v.name))
  AND je.venue_id IS NULL;

-- STEP 3: CREATE VENUE NORMALIZATION FUNCTIONS
-- ============================================================================

-- Function to find or create a venue
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
  WHERE LOWER(TRIM(name)) = normalized_name;
  
  -- If not found, create new venue
  IF venue_uuid IS NULL THEN
    INSERT INTO public.venues (
      jambase_venue_id,
      name,
      identifier,
      address,
      city,
      state,
      zip,
      latitude,
      longitude,
      created_at,
      updated_at
    ) VALUES (
      'manual_' || md5(venue_name),
      venue_name,
      LOWER(REPLACE(REPLACE(venue_name, ' ', '_'), '''', '')),
      venue_address,
      venue_city,
      venue_state,
      venue_zip,
      latitude,
      longitude,
      NOW(),
      NOW()
    ) RETURNING id INTO venue_uuid;
  END IF;
  
  RETURN venue_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to normalize venue names (remove extra spaces, standardize case)
CREATE OR REPLACE FUNCTION public.normalize_venue_name(venue_name TEXT) 
RETURNS TEXT AS $$
BEGIN
  RETURN TRIM(REGEXP_REPLACE(venue_name, '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql;

-- STEP 4: CREATE VENUE SEARCH FUNCTIONS
-- ============================================================================

-- Function for fuzzy venue search
CREATE OR REPLACE FUNCTION public.search_venues(
  search_term TEXT,
  limit_count INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  similarity REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.name,
    v.address,
    v.city,
    v.state,
    similarity(LOWER(v.name), LOWER(search_term)) as similarity
  FROM public.venues v
  WHERE 
    LOWER(v.name) ILIKE '%' || LOWER(search_term) || '%'
    OR similarity(LOWER(v.name), LOWER(search_term)) > 0.3
  ORDER BY 
    CASE 
      WHEN LOWER(v.name) = LOWER(search_term) THEN 1
      WHEN LOWER(v.name) ILIKE LOWER(search_term) || '%' THEN 2
      WHEN LOWER(v.name) ILIKE '%' || LOWER(search_term) || '%' THEN 3
      ELSE 4
    END,
    similarity DESC,
    v.name
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get venue with events count
CREATE OR REPLACE FUNCTION public.get_venue_with_events(venue_uuid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  events_count BIGINT,
  upcoming_events_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.name,
    v.address,
    v.city,
    v.state,
    v.zip,
    v.latitude,
    v.longitude,
    COUNT(je.id) as events_count,
    COUNT(CASE WHEN je.event_date > NOW() THEN 1 END) as upcoming_events_count
  FROM public.venues v
  LEFT JOIN public.jambase_events je ON v.id = je.venue_id
  WHERE v.id = venue_uuid
  GROUP BY v.id, v.name, v.address, v.city, v.state, v.zip, v.latitude, v.longitude;
END;
$$ LANGUAGE plpgsql;

-- STEP 5: CREATE VENUE NORMALIZATION VIEWS
-- ============================================================================

-- View for all venues with their event counts
CREATE OR REPLACE VIEW public.venues_with_stats AS
SELECT 
  v.*,
  COUNT(je.id) as total_events,
  COUNT(CASE WHEN je.event_date > NOW() THEN 1 END) as upcoming_events,
  MAX(je.event_date) as last_event_date,
  MIN(je.event_date) as first_event_date
FROM public.venues v
LEFT JOIN public.jambase_events je ON v.id = je.venue_id
GROUP BY v.id, v.jambase_venue_id, v.name, v.identifier, v.url, v.image_url, 
         v.address, v.city, v.state, v.zip, v.country, v.latitude, v.longitude,
         v.date_published, v.date_modified, v.created_at, v.updated_at;

-- View for venue search results
CREATE OR REPLACE VIEW public.venue_search_results AS
SELECT 
  v.id,
  v.name,
  v.address,
  v.city,
  v.state,
  v.zip,
  v.latitude,
  v.longitude,
  COUNT(je.id) as events_count,
  -- Create a searchable text field
  LOWER(v.name || ' ' || COALESCE(v.address, '') || ' ' || COALESCE(v.city, '') || ' ' || COALESCE(v.state, '')) as searchable_text
FROM public.venues v
LEFT JOIN public.jambase_events je ON v.id = je.venue_id
GROUP BY v.id, v.name, v.address, v.city, v.state, v.zip, v.latitude, v.longitude;

-- STEP 6: CREATE TRIGGERS FOR VENUE NAME STANDARDIZATION
-- ============================================================================

-- Trigger function to automatically normalize venue names
CREATE OR REPLACE FUNCTION public.standardize_venue_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Normalize the venue name
  NEW.name := public.normalize_venue_name(NEW.name);
  
  -- Update the identifier
  NEW.identifier := LOWER(REPLACE(REPLACE(NEW.name, ' ', '_'), '''', ''));
  
  -- Update the updated_at timestamp
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for venues table
DROP TRIGGER IF EXISTS standardize_venue_name_trigger ON public.venues;
CREATE TRIGGER standardize_venue_name_trigger
  BEFORE INSERT OR UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.standardize_venue_name();

-- STEP 7: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for venue search performance
CREATE INDEX IF NOT EXISTS idx_venues_name_lower ON public.venues(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_venues_city_state ON public.venues(city, state);
CREATE INDEX IF NOT EXISTS idx_venues_identifier ON public.venues(identifier);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_venues_search_text ON public.venues USING gin(to_tsvector('english', name || ' ' || COALESCE(address, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '')));

-- STEP 8: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on new functions
GRANT EXECUTE ON FUNCTION public.find_or_create_venue TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_venue_name TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_venues TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_with_events TO authenticated;

-- Grant permissions on views
GRANT SELECT ON public.venues_with_stats TO authenticated;
GRANT SELECT ON public.venues_with_stats TO anon;
GRANT SELECT ON public.venue_search_results TO authenticated;
GRANT SELECT ON public.venue_search_results TO anon;

-- STEP 9: DATA CLEANUP AND VALIDATION
-- ============================================================================

-- Update any NULL or empty venue names
UPDATE public.venues 
SET name = 'Unknown Venue'
WHERE name IS NULL OR TRIM(name) = '';

-- Remove duplicate venues (keep the one with the most events)
WITH duplicate_venues AS (
  SELECT 
    name,
    COUNT(*) as venue_count,
    array_agg(id ORDER BY created_at) as venue_ids
  FROM public.venues
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
),
venues_to_keep AS (
  SELECT 
    dv.name,
    (SELECT v.id 
     FROM public.venues v 
     JOIN public.jambase_events je ON v.id = je.venue_id 
     WHERE LOWER(TRIM(v.name)) = LOWER(TRIM(dv.name))
     GROUP BY v.id 
     ORDER BY COUNT(je.id) DESC, v.created_at ASC 
     LIMIT 1) as keep_id
  FROM duplicate_venues dv
)
UPDATE public.jambase_events je
SET venue_id = vtk.keep_id
FROM venues_to_keep vtk
JOIN public.venues v ON je.venue_id = v.id
WHERE LOWER(TRIM(v.name)) = LOWER(TRIM(vtk.name))
  AND je.venue_id != vtk.keep_id;

-- Delete duplicate venues (keep only the one with most events)
WITH duplicate_venues AS (
  SELECT 
    LOWER(TRIM(name)) as normalized_name,
    COUNT(*) as venue_count
  FROM public.venues
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
),
venues_to_delete AS (
  SELECT v.id
  FROM public.venues v
  JOIN duplicate_venues dv ON LOWER(TRIM(v.name)) = dv.normalized_name
  WHERE v.id NOT IN (
    SELECT DISTINCT ON (LOWER(TRIM(v2.name))) v2.id
    FROM public.venues v2
    JOIN duplicate_venues dv2 ON LOWER(TRIM(v2.name)) = dv2.normalized_name
    LEFT JOIN public.jambase_events je ON v2.id = je.venue_id
    GROUP BY v2.id, LOWER(TRIM(v2.name))
    ORDER BY LOWER(TRIM(v2.name)), COUNT(je.id) DESC, v2.created_at ASC
  )
)
DELETE FROM public.venues 
WHERE id IN (SELECT id FROM venues_to_delete);

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- 1. ✅ Populated venues table with data from jambase_events
-- 2. ✅ Added venue_id foreign key to jambase_events
-- 3. ✅ Created venue normalization functions
-- 4. ✅ Created venue search functions with fuzzy matching
-- 5. ✅ Created helpful views for venue data
-- 6. ✅ Added triggers for automatic name standardization
-- 7. ✅ Created performance indexes
-- 8. ✅ Set up proper permissions
-- 9. ✅ Cleaned up duplicate and invalid data
-- ============================================================================

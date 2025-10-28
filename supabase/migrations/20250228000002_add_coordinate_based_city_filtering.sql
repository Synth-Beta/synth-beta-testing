-- Coordinate-based city filtering system
-- This replaces string-based city filtering with geographic radius-based filtering
-- Cities are normalized for display, but filtering uses coordinates + radius

-- ============================================================================
-- STEP 1: Ensure calculate_distance function exists
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 FLOAT, 
    lon1 FLOAT, 
    lat2 FLOAT, 
    lon2 FLOAT
) RETURNS FLOAT AS $$
BEGIN
    RETURN (
        3959 * acos(
            GREATEST(-1.0, LEAST(1.0,  -- Clamp to avoid numerical errors
                cos(radians(lat1)) * 
                cos(radians(lat2)) * 
                cos(radians(lon2) - radians(lon1)) + 
                sin(radians(lat1)) * 
                sin(radians(lat2))
            ))
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 2: Add display_city column for normalized city names (display only)
-- ============================================================================
ALTER TABLE jambase_events 
ADD COLUMN IF NOT EXISTS display_city TEXT;

-- Function to normalize city names for display
CREATE OR REPLACE FUNCTION normalize_city_for_display(city_name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF city_name IS NULL OR city_name = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN INITCAP(TRIM(REGEXP_REPLACE(LOWER(city_name), '\s+', ' ', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill display_city from venue_city
UPDATE jambase_events
SET display_city = normalize_city_for_display(venue_city)
WHERE display_city IS NULL AND venue_city IS NOT NULL;

-- Trigger to auto-normalize display_city
CREATE OR REPLACE FUNCTION set_display_city()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.venue_city IS NOT NULL AND (NEW.display_city IS NULL OR TG_OP = 'UPDATE') THEN
    NEW.display_city := normalize_city_for_display(NEW.venue_city);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_set_display_city ON jambase_events;
CREATE TRIGGER auto_set_display_city
BEFORE INSERT OR UPDATE ON jambase_events
FOR EACH ROW
EXECUTE FUNCTION set_display_city();

-- Index for display (not for filtering, just for retrieval and UI)
CREATE INDEX IF NOT EXISTS idx_jambase_events_display_city 
ON jambase_events(display_city)
WHERE display_city IS NOT NULL;

-- ============================================================================
-- STEP 3: Create city_centers table (auto-populated from event data)
-- ============================================================================
-- Drop existing table and any dependent objects if it has wrong constraints
-- Must drop functions that depend on it first (in reverse dependency order)
DROP FUNCTION IF EXISTS get_events_by_city_coordinates(TEXT[], TEXT[], FLOAT, INT) CASCADE;
DROP FUNCTION IF EXISTS get_available_cities_for_filter(INT, INT) CASCADE;
DROP FUNCTION IF EXISTS update_city_centers() CASCADE;
DROP TABLE IF EXISTS city_centers CASCADE;

-- Create table with surrogate primary key (id) and UNIQUE constraint on (city_name, state)
-- Note: PostgreSQL UNIQUE treats NULLs as distinct, so we'll use partial unique indexes
CREATE TABLE city_centers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city_name TEXT NOT NULL,
  state TEXT, -- Explicitly nullable for international cities (e.g., Abu Dhabi, London, Amsterdam)
  center_latitude DECIMAL(10, 8) NOT NULL,
  center_longitude DECIMAL(11, 8) NOT NULL,
  event_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (city_name, state) -- UNIQUE allows NULLs, but we'll add partial indexes for better control
);

-- Partial unique index for cities with states
CREATE UNIQUE INDEX idx_city_centers_city_state_unique 
ON city_centers(city_name, state) 
WHERE state IS NOT NULL;

-- Partial unique index for cities without states (prevents duplicate NULL cities)
CREATE UNIQUE INDEX idx_city_centers_city_no_state_unique 
ON city_centers(city_name) 
WHERE state IS NULL;

-- Handle NULL states: PostgreSQL treats each NULL as distinct in UNIQUE/PRIMARY KEY constraints
-- So (city_name='Abu Dhabi', state=NULL) is different from (city_name='Abu Dhabi', state='')

-- Index for coordinate queries
CREATE INDEX IF NOT EXISTS idx_city_centers_location 
ON city_centers(center_latitude, center_longitude);

-- Index for city name lookups
CREATE INDEX IF NOT EXISTS idx_city_centers_city_state 
ON city_centers(city_name, state);

COMMENT ON TABLE city_centers IS 'City center coordinates computed from actual event data. Used for coordinate-based filtering.';
COMMENT ON COLUMN city_centers.city_name IS 'Normalized city name (from display_city)';
COMMENT ON COLUMN city_centers.center_latitude IS 'Average latitude of events in this city';
COMMENT ON COLUMN city_centers.center_longitude IS 'Average longitude of events in this city';
COMMENT ON COLUMN city_centers.event_count IS 'Number of upcoming events used to compute center';

-- Function to update city centers from actual event data
CREATE OR REPLACE FUNCTION update_city_centers()
RETURNS VOID AS $$
BEGIN
  -- Step 1: Delete duplicates FIRST (before normalizing state values)
  -- This prevents conflicts when we set state = NULL
  DELETE FROM city_centers
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY city_name, COALESCE(state, 'NULL_STATE')
          ORDER BY event_count DESC, updated_at DESC
        ) as rn
      FROM city_centers
    ) sub
    WHERE rn > 1
  );
  
  -- Step 2: For cities with bad state values, if a NULL state version exists, delete the bad one
  -- If no NULL version exists, we'll update it to NULL later
  DELETE FROM city_centers cc1
  WHERE (cc1.state = '{}' OR cc1.state = '' OR TRIM(COALESCE(cc1.state, '')) = '')
    AND EXISTS (
      SELECT 1 FROM city_centers cc2
      WHERE cc2.city_name = cc1.city_name
        AND cc2.state IS NULL
    );
  
  -- Step 3: Now safely set remaining bad states to NULL (won't conflict since duplicates removed)
  UPDATE city_centers 
  SET state = NULL 
  WHERE state = '{}' OR state = '' OR TRIM(COALESCE(state, '')) = '';
  
  -- Upsert cities with states (use standard ON CONFLICT)
  INSERT INTO city_centers (city_name, state, center_latitude, center_longitude, event_count)
  SELECT 
    display_city as city_name,
    NULLIF(TRIM(venue_state::TEXT), '') as state,
    AVG(latitude)::DECIMAL(10, 8) as center_lat,
    AVG(longitude)::DECIMAL(11, 8) as center_lng,
    COUNT(*) as event_count
  FROM jambase_events
  WHERE display_city IS NOT NULL
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND event_date >= NOW()
    AND venue_state IS NOT NULL
    AND TRIM(venue_state::TEXT) != ''
    AND TRIM(venue_state::TEXT) != '{}'
  GROUP BY display_city, NULLIF(TRIM(venue_state::TEXT), '')
  ON CONFLICT (city_name, state) DO UPDATE SET
    center_latitude = EXCLUDED.center_latitude,
    center_longitude = EXCLUDED.center_longitude,
    event_count = EXCLUDED.event_count,
    updated_at = NOW();
  
  -- Handle cities WITHOUT states separately (update first, then insert new ones)
  -- Step 1: Update existing cities with NULL state
  UPDATE city_centers cc
  SET 
    center_latitude = sub.center_lat,
    center_longitude = sub.center_lng,
    event_count = sub.event_count,
    updated_at = NOW()
  FROM (
    SELECT 
      display_city as city_name,
      AVG(latitude)::DECIMAL(10, 8) as center_lat,
      AVG(longitude)::DECIMAL(11, 8) as center_lng,
      COUNT(*) as event_count
    FROM jambase_events
    WHERE display_city IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND event_date >= NOW()
      AND (venue_state IS NULL OR TRIM(venue_state::TEXT) = '' OR TRIM(venue_state::TEXT) = '{}')
    GROUP BY display_city
  ) sub
  WHERE cc.city_name = sub.city_name AND cc.state IS NULL;
  
  -- Step 2: Insert only NEW cities without states (that don't exist yet)
  INSERT INTO city_centers (city_name, state, center_latitude, center_longitude, event_count)
  SELECT 
    sub.city_name,
    NULL as state,
    sub.center_lat,
    sub.center_lng,
    sub.event_count
  FROM (
    SELECT 
      display_city as city_name,
      AVG(latitude)::DECIMAL(10, 8) as center_lat,
      AVG(longitude)::DECIMAL(11, 8) as center_lng,
      COUNT(*) as event_count
    FROM jambase_events
    WHERE display_city IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND event_date >= NOW()
      AND (venue_state IS NULL OR TRIM(venue_state::TEXT) = '' OR TRIM(venue_state::TEXT) = '{}')
    GROUP BY display_city
  ) sub
  WHERE NOT EXISTS (
    SELECT 1 FROM city_centers cc 
    WHERE cc.city_name = sub.city_name AND cc.state IS NULL
  );
  
  -- Final cleanup: remove any remaining bad values
  DELETE FROM city_centers 
  WHERE state = '{}' OR state = '' OR TRIM(COALESCE(state, '')) = '';
END;
$$ LANGUAGE plpgsql;

-- Initial population
SELECT update_city_centers();

-- ============================================================================
-- STEP 4: Coordinate-based filtering function
-- ============================================================================
CREATE OR REPLACE FUNCTION get_events_by_city_coordinates(
  city_names TEXT[], -- Array of city names selected by user
  state_codes TEXT[] DEFAULT NULL, -- Optional state codes for disambiguation
  radius_miles FLOAT DEFAULT 50, -- Metro radius (covers surrounding areas)
  event_limit INT DEFAULT 1000
) RETURNS TABLE (
  event_id UUID,
  display_city TEXT,
  venue_state TEXT,
  distance_miles FLOAT
) AS $$
DECLARE
  city_coords RECORD;
  event_ids UUID[];
BEGIN
  -- For each selected city, find its coordinates and get events in radius
  -- Use case-insensitive matching for city names
  FOR city_coords IN 
    SELECT DISTINCT
      cc.city_name,
      cc.state,
      cc.center_latitude as lat,
      cc.center_longitude as lng
    FROM city_centers cc
    WHERE LOWER(TRIM(cc.city_name)) = ANY(SELECT LOWER(TRIM(unnest(city_names))))
      AND (
        state_codes IS NULL 
        OR array_length(state_codes, 1) IS NULL 
        OR cc.state = ANY(state_codes)
        OR (cc.state IS NULL AND (state_codes IS NULL OR array_length(state_codes, 1) IS NULL))
      )
  LOOP
    -- Get events within radius of this city center
    -- Cast coordinates to FLOAT for consistent calculations
    event_ids := array_cat(
      event_ids,
      ARRAY(
        SELECT je.id
        FROM jambase_events je
        WHERE je.latitude IS NOT NULL
          AND je.longitude IS NOT NULL
          AND je.event_date >= NOW()
          -- Efficient bounding box filter first (cast to numeric for BETWEEN)
          AND je.latitude::NUMERIC BETWEEN (city_coords.lat::NUMERIC - (radius_miles / 69.0)) 
                                        AND (city_coords.lat::NUMERIC + (radius_miles / 69.0))
          AND je.longitude::NUMERIC BETWEEN (city_coords.lng::NUMERIC - (radius_miles / (69.0 * COS(RADIANS(city_coords.lat::FLOAT)))))
                                          AND (city_coords.lng::NUMERIC + (radius_miles / (69.0 * COS(RADIANS(city_coords.lat::FLOAT)))))
          -- Exact distance filter using Haversine (use FLOAT for function)
          AND calculate_distance(
            city_coords.lat::FLOAT, 
            city_coords.lng::FLOAT, 
            je.latitude::FLOAT, 
            je.longitude::FLOAT
          ) <= radius_miles
      )
    );
  END LOOP;
  
  -- Return unique events with their display info and distance
  -- If event_ids is empty, return empty result
  IF array_length(event_ids, 1) IS NULL OR array_length(event_ids, 1) = 0 THEN
    RETURN;
  END IF;
  
  -- Calculate distance for each event from the nearest matching city center
  -- We already filtered by radius in the LOOP, so just calculate distance for display/sorting
  RETURN QUERY
  SELECT DISTINCT
    je.id,
    je.display_city,
    je.venue_state,
    (
      SELECT MIN(calculate_distance(
        cc2.center_latitude::FLOAT,
        cc2.center_longitude::FLOAT,
        je.latitude::FLOAT,
        je.longitude::FLOAT
      ))
      FROM city_centers cc2
      WHERE LOWER(TRIM(cc2.city_name)) = ANY(SELECT LOWER(TRIM(unnest(city_names))))
        AND (
          state_codes IS NULL 
          OR array_length(state_codes, 1) IS NULL 
          OR cc2.state = ANY(state_codes)
          OR (cc2.state IS NULL AND (state_codes IS NULL OR array_length(state_codes, 1) IS NULL))
        )
    ) as distance_miles
  FROM jambase_events je
  WHERE je.id = ANY(event_ids)
    AND je.latitude IS NOT NULL 
    AND je.longitude IS NOT NULL
  ORDER BY distance_miles ASC NULLS LAST
  LIMIT event_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_events_by_city_coordinates IS 'Gets event IDs within radius_miles of selected cities. Uses coordinates, not string matching, so it includes metro areas.';

-- ============================================================================
-- STEP 5: Helper function to get available cities for UI
-- ============================================================================
CREATE OR REPLACE FUNCTION get_available_cities_for_filter(
  min_event_count INT DEFAULT 1,
  limit_count INT DEFAULT 500
) RETURNS TABLE (
  city_name TEXT,
  state TEXT,
  event_count BIGINT,
  center_latitude DECIMAL(10, 8),
  center_longitude DECIMAL(11, 8)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.city_name,
    cc.state,
    cc.event_count::BIGINT,
    cc.center_latitude,
    cc.center_longitude
  FROM city_centers cc
  WHERE cc.event_count >= min_event_count
  ORDER BY cc.event_count DESC, cc.city_name ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_available_cities_for_filter IS 'Returns list of cities available for filtering, sorted by event count';

-- ============================================================================
-- STEP 6: Scheduled job to refresh city centers (optional, requires pg_cron)
-- ============================================================================
-- This can be run manually or scheduled to keep city centers updated
-- SELECT cron.schedule('update-city-centers', '0 3 * * *', 'SELECT update_city_centers();');

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify the migration)
-- ============================================================================
-- Check display_city population:
-- SELECT COUNT(*) as total_events, 
--        COUNT(display_city) as events_with_display_city,
--        COUNT(*) FILTER (WHERE venue_city IS NOT NULL AND display_city IS NULL) as missing_display_city
-- FROM jambase_events;

-- Check city_centers population:
-- SELECT COUNT(*) as total_cities, 
--        SUM(event_count) as total_upcoming_events
-- FROM city_centers;

-- Test coordinate-based filtering:
-- SELECT * FROM get_events_by_city_coordinates(ARRAY['New York'], NULL, 50, 10);

-- Get available cities:
-- SELECT * FROM get_available_cities_for_filter(1, 100);


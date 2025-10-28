-- Fix update_city_centers function to properly handle partial unique indexes
-- Run this to replace the function with the correct version

-- Step 1: Clean up existing duplicates first
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

-- Step 2: Recreate the function with proper NULL state handling
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
  
  -- Upsert cities WITH states (use standard ON CONFLICT)
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
  
  -- Handle cities WITHOUT states separately (using NOT EXISTS to avoid partial index conflict)
  -- First, update existing cities with NULL state
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
  
  -- Then insert only NEW cities without states (that don't exist yet)
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

-- Step 3: Test it
SELECT update_city_centers();

-- Step 4: Verify no duplicates
SELECT city_name, COALESCE(state, 'NULL') as state, COUNT(*) as count
FROM city_centers
GROUP BY city_name, state
HAVING COUNT(*) > 1;
-- Should return 0 rows


-- Fix duplicate cities in city_centers table
-- Run this to clean up existing duplicates

-- Step 1: Remove all duplicates, keeping the one with most events
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

-- Step 2: Drop and recreate unique indexes to prevent future duplicates
DROP INDEX IF EXISTS idx_city_centers_city_state_unique;
DROP INDEX IF EXISTS idx_city_centers_city_no_state_unique;

-- Partial unique index for cities with states
CREATE UNIQUE INDEX idx_city_centers_city_state_unique 
ON city_centers(city_name, state) 
WHERE state IS NOT NULL;

-- Partial unique index for cities without states (prevents duplicate NULL cities)
CREATE UNIQUE INDEX idx_city_centers_city_no_state_unique 
ON city_centers(city_name) 
WHERE state IS NULL;

-- Step 3: Verify no duplicates remain
SELECT city_name, state, COUNT(*) as count
FROM city_centers
GROUP BY city_name, COALESCE(state, 'NULL_STATE')
HAVING COUNT(*) > 1;
-- Should return 0 rows

-- Step 4: Verify cities with NULL states
SELECT city_name, state, event_count 
FROM city_centers 
WHERE state IS NULL 
ORDER BY event_count DESC
LIMIT 20;
-- Should show each city only once


-- Clean up city_centers table: remove brackets {} and normalize to NULL
-- Run this to fix existing bad data

-- 1. Update any rows with state = '{}' or empty strings to NULL
UPDATE city_centers 
SET state = NULL 
WHERE state = '{}' 
   OR state = '' 
   OR TRIM(COALESCE(state, '')) = '';

-- 2. Delete duplicate cities (keep the one with more events)
-- For cities with same name but different NULL/state variations
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY city_name, 
                   COALESCE(state, 'NULL_STATE')
      ORDER BY event_count DESC, updated_at DESC
    ) as rn
  FROM city_centers
)
DELETE FROM city_centers
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- 3. Merge duplicates where one has NULL and another has empty/{} state
-- Keep the row with more events
WITH city_groups AS (
  SELECT 
    city_name,
    COALESCE(state, 'NULL_STATE') as state_group,
    MAX(event_count) as max_events,
    COUNT(*) as dup_count
  FROM city_centers
  WHERE state = '{}' OR state = '' OR state IS NULL
  GROUP BY city_name, COALESCE(state, 'NULL_STATE')
  HAVING COUNT(*) > 1
)
UPDATE city_centers cc
SET state = NULL
WHERE EXISTS (
  SELECT 1 FROM city_groups cg
  WHERE cg.city_name = cc.city_name
    AND (cc.state = '{}' OR cc.state = '')
    AND cc.event_count < cg.max_events
);

-- Then delete the duplicates after setting them all to NULL
DELETE FROM city_centers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY city_name, COALESCE(state, 'NULL_STATE')
        ORDER BY event_count DESC
      ) as rn
    FROM city_centers
    WHERE state IS NULL OR state = '{}' OR state = ''
  ) sub
  WHERE rn > 1
);

-- 4. Verify cleanup
SELECT 
  city_name,
  state,
  CASE WHEN state IS NULL THEN 'NULL' ELSE state END as state_display,
  event_count
FROM city_centers
WHERE city_name IN ('London', 'Amsterdam', 'Washington', 'New York')
ORDER BY city_name, event_count DESC;

-- 5. Re-run update to repopulate cleanly
SELECT update_city_centers();


-- Fix specific venue_city duplicates found in your data
-- Based on the query results you provided

-- 1. Fix Washington DC variations
-- Combine all Washington variations into "Washington DC"
UPDATE jambase_events 
SET venue_city = 'Washington DC'
WHERE venue_city IN ('Washington', 'Washington DC', 'Washington D C', 'Washington D.C.')
  AND venue_city IS NOT NULL;

-- 2. Fix "New Jersey" - this should probably be a specific city in New Jersey
-- You might want to check what the actual venue is for these events
-- For now, I'll leave this as-is since we don't know the specific city

-- 3. Fix "Unknown" entries
-- You should either delete these or update them with the correct city
-- DELETE FROM jambase_events WHERE venue_city = 'Unknown';
-- OR update with correct city if you know it:
-- UPDATE jambase_events SET venue_city = 'Correct City Name' WHERE venue_city = 'Unknown';

-- 4. Verify the fixes
SELECT 
    venue_city,
    COUNT(*) as event_count
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
GROUP BY venue_city 
ORDER BY event_count DESC, venue_city;

-- 5. Check if there are any other potential duplicates
-- Look for cities that might be the same with different formatting
WITH city_analysis AS (
    SELECT 
        venue_city,
        LOWER(TRIM(venue_city)) as normalized_city,
        COUNT(*) as event_count
    FROM jambase_events 
    WHERE venue_city IS NOT NULL 
        AND venue_city != ''
        AND event_date >= NOW()
    GROUP BY venue_city
)
SELECT 
    normalized_city,
    COUNT(*) as variation_count,
    STRING_AGG(venue_city, ' | ') as variations,
    SUM(event_count) as total_events
FROM city_analysis
GROUP BY normalized_city
HAVING COUNT(*) > 1
ORDER BY total_events DESC;

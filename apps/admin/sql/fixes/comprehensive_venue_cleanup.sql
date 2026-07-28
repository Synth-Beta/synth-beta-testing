-- Comprehensive venue_city cleanup based on your data
-- This addresses all the issues I can see in your results

-- 1. Fix Washington DC variations (main issue)
UPDATE jambase_events 
SET venue_city = 'Washington DC'
WHERE venue_city IN ('Washington', 'Washington DC', 'Washington D C', 'Washington D.C.')
  AND venue_city IS NOT NULL;

-- 2. Clean up "Unknown" entries
-- Option A: Delete events with unknown cities (recommended if you can't determine the city)
DELETE FROM jambase_events 
WHERE venue_city = 'Unknown';

-- Option B: If you know the actual cities, update them instead:
-- UPDATE jambase_events SET venue_city = 'Actual City Name' WHERE venue_city = 'Unknown';

-- 3. Fix "New Jersey" - this is likely a data entry error
-- Check what the actual venue is and update accordingly
-- You might want to run this query first to see the venue details:
-- SELECT venue_name, venue_city, venue_state FROM jambase_events WHERE venue_city = 'New Jersey';

-- 4. Standardize common city name variations
-- Los Angeles variations
UPDATE jambase_events 
SET venue_city = 'Los Angeles'
WHERE LOWER(venue_city) IN ('los angeles', 'la', 'l.a.');

-- San Francisco variations  
UPDATE jambase_events 
SET venue_city = 'San Francisco'
WHERE LOWER(venue_city) IN ('san francisco', 'sf', 's.f.');

-- New York variations (if any exist)
UPDATE jambase_events 
SET venue_city = 'New York'
WHERE LOWER(venue_city) IN ('new york city', 'nyc', 'ny', 'n.y.');

-- 5. Clean up formatting issues
-- Remove extra spaces
UPDATE jambase_events 
SET venue_city = TRIM(REGEXP_REPLACE(venue_city, '\s+', ' ', 'g'))
WHERE venue_city IS NOT NULL 
    AND venue_city != TRIM(REGEXP_REPLACE(venue_city, '\s+', ' ', 'g'));

-- 6. Fix capitalization (make it consistent)
-- This will make all city names Title Case
UPDATE jambase_events 
SET venue_city = INITCAP(LOWER(venue_city))
WHERE venue_city IS NOT NULL 
    AND venue_city != INITCAP(LOWER(venue_city));

-- 7. Handle special cases for cities that should keep their specific capitalization
UPDATE jambase_events SET venue_city = 'Washington DC' WHERE LOWER(venue_city) = 'washington dc';
UPDATE jambase_events SET venue_city = 'New York' WHERE LOWER(venue_city) = 'new york';
UPDATE jambase_events SET venue_city = 'Los Angeles' WHERE LOWER(venue_city) = 'los angeles';
UPDATE jambase_events SET venue_city = 'San Francisco' WHERE LOWER(venue_city) = 'san francisco';
UPDATE jambase_events SET venue_city = 'St. Louis' WHERE LOWER(venue_city) = 'st. louis';
UPDATE jambase_events SET venue_city = 'Salt Lake City' WHERE LOWER(venue_city) = 'salt lake city';
UPDATE jambase_events SET venue_city = 'Corpus Christi' WHERE LOWER(venue_city) = 'corpus christi';
UPDATE jambase_events SET venue_city = 'New Orleans' WHERE LOWER(venue_city) = 'new orleans';
UPDATE jambase_events SET venue_city = 'Saint Paul' WHERE LOWER(venue_city) = 'saint paul';

-- 8. Final verification query
SELECT 
    venue_city,
    COUNT(*) as event_count
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
GROUP BY venue_city 
ORDER BY event_count DESC, venue_city;

-- 9. Check for any remaining duplicates
WITH city_check AS (
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
FROM city_check
GROUP BY normalized_city
HAVING COUNT(*) > 1
ORDER BY total_events DESC;

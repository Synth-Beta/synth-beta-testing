-- One clean script to standardize all venue_city data in jambase_events
-- This consolidates all city variations into clean, consistent names

-- 1. Fix Washington DC variations (combine all into "Washington DC")
UPDATE jambase_events 
SET venue_city = 'Washington DC'
WHERE venue_city IN ('Washington', 'Washington DC', 'Washington D C', 'Washington D.C.')
  AND venue_city IS NOT NULL;

-- 2. Fix New York variations
UPDATE jambase_events 
SET venue_city = 'New York'
WHERE LOWER(venue_city) IN ('new york city', 'nyc', 'ny', 'n.y.')
  AND venue_city IS NOT NULL;

-- 3. Fix Los Angeles variations
UPDATE jambase_events 
SET venue_city = 'Los Angeles'
WHERE LOWER(venue_city) IN ('los angeles', 'la', 'l.a.')
  AND venue_city IS NOT NULL;

-- 4. Fix San Francisco variations
UPDATE jambase_events 
SET venue_city = 'San Francisco'
WHERE LOWER(venue_city) IN ('san francisco', 'sf', 's.f.')
  AND venue_city IS NOT NULL;

-- 5. Fix Chicago variations
UPDATE jambase_events 
SET venue_city = 'Chicago'
WHERE LOWER(venue_city) IN ('chicago', 'chi', 'chi.')
  AND venue_city IS NOT NULL;

-- 6. Fix Miami variations
UPDATE jambase_events 
SET venue_city = 'Miami'
WHERE LOWER(venue_city) IN ('miami', 'mia', 'mia.')
  AND venue_city IS NOT NULL;

-- 7. Fix Seattle variations
UPDATE jambase_events 
SET venue_city = 'Seattle'
WHERE LOWER(venue_city) IN ('seattle', 'sea', 'sea.')
  AND venue_city IS NOT NULL;

-- 8. Fix Phoenix variations
UPDATE jambase_events 
SET venue_city = 'Phoenix'
WHERE LOWER(venue_city) IN ('phoenix', 'phx', 'phx.')
  AND venue_city IS NOT NULL;

-- 9. Fix Denver variations
UPDATE jambase_events 
SET venue_city = 'Denver'
WHERE LOWER(venue_city) IN ('denver', 'den', 'den.')
  AND venue_city IS NOT NULL;

-- 10. Fix Las Vegas variations
UPDATE jambase_events 
SET venue_city = 'Las Vegas'
WHERE LOWER(venue_city) IN ('las vegas', 'vegas', 'lv', 'l.v.')
  AND venue_city IS NOT NULL;

-- 11. Clean up formatting issues
-- Remove extra spaces and normalize whitespace
UPDATE jambase_events 
SET venue_city = TRIM(REGEXP_REPLACE(venue_city, '\s+', ' ', 'g'))
WHERE venue_city IS NOT NULL 
    AND venue_city != TRIM(REGEXP_REPLACE(venue_city, '\s+', ' ', 'g'));

-- 12. Standardize capitalization to Title Case
UPDATE jambase_events 
SET venue_city = INITCAP(LOWER(venue_city))
WHERE venue_city IS NOT NULL 
    AND venue_city != INITCAP(LOWER(venue_city));

-- 13. Fix special cases that need specific capitalization
UPDATE jambase_events SET venue_city = 'Washington DC' WHERE LOWER(venue_city) = 'washington dc';
UPDATE jambase_events SET venue_city = 'New York' WHERE LOWER(venue_city) = 'new york';
UPDATE jambase_events SET venue_city = 'Los Angeles' WHERE LOWER(venue_city) = 'los angeles';
UPDATE jambase_events SET venue_city = 'San Francisco' WHERE LOWER(venue_city) = 'san francisco';
UPDATE jambase_events SET venue_city = 'St. Louis' WHERE LOWER(venue_city) = 'st. louis';
UPDATE jambase_events SET venue_city = 'Salt Lake City' WHERE LOWER(venue_city) = 'salt lake city';
UPDATE jambase_events SET venue_city = 'Corpus Christi' WHERE LOWER(venue_city) = 'corpus christi';
UPDATE jambase_events SET venue_city = 'New Orleans' WHERE LOWER(venue_city) = 'new orleans';
UPDATE jambase_events SET venue_city = 'Saint Paul' WHERE LOWER(venue_city) = 'saint paul';
UPDATE jambase_events SET venue_city = 'New Brunswick' WHERE LOWER(venue_city) = 'new brunswick';
UPDATE jambase_events SET venue_city = 'North Bethesda' WHERE LOWER(venue_city) = 'north bethesda';
UPDATE jambase_events SET venue_city = 'Silver Spring' WHERE LOWER(venue_city) = 'silver spring';
UPDATE jambase_events SET venue_city = 'Oxon Hill' WHERE LOWER(venue_city) = 'oxon hill';
UPDATE jambase_events SET venue_city = 'Port Chester' WHERE LOWER(venue_city) = 'port chester';
UPDATE jambase_events SET venue_city = 'White Plains' WHERE LOWER(venue_city) = 'white plains';
UPDATE jambase_events SET venue_city = 'Red Bank' WHERE LOWER(venue_city) = 'red bank';
UPDATE jambase_events SET venue_city = 'Sayreville' WHERE LOWER(venue_city) = 'sayreville';
UPDATE jambase_events SET venue_city = 'Westbury' WHERE LOWER(venue_city) = 'westbury';
UPDATE jambase_events SET venue_city = 'Mamaroneck' WHERE LOWER(venue_city) = 'mamaroneck';
UPDATE jambase_events SET venue_city = 'Tarrytown' WHERE LOWER(venue_city) = 'tarrytown';
UPDATE jambase_events SET venue_city = 'Falls Church' WHERE LOWER(venue_city) = 'falls church';
UPDATE jambase_events SET venue_city = 'Staten Island' WHERE LOWER(venue_city) = 'staten island';

-- 14. Remove or fix invalid entries
DELETE FROM jambase_events WHERE venue_city = 'Unknown';
-- Fix "New Jersey" - you may want to check what the actual venue is first
-- DELETE FROM jambase_events WHERE venue_city = 'New Jersey';

-- 15. Final verification - show the cleaned results
SELECT 
    venue_city,
    COUNT(*) as event_count
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
GROUP BY venue_city 
ORDER BY event_count DESC, venue_city;

-- SQL queries to analyze and standardize venue_city data in jambase_events table

-- 1. Find all unique venue_city values with their counts
SELECT 
    venue_city,
    COUNT(*) as event_count,
    COUNT(DISTINCT venue_state) as state_variations,
    STRING_AGG(DISTINCT venue_state, ', ') as states
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
GROUP BY venue_city 
ORDER BY event_count DESC, venue_city;

-- 2. Find potential duplicates (cities that might be the same with different formatting)
-- This looks for cities with similar names that might be variations
WITH city_variations AS (
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
FROM city_variations
GROUP BY normalized_city
HAVING COUNT(*) > 1
ORDER BY total_events DESC;

-- 3. Find cities with common abbreviations that need standardization
SELECT 
    venue_city,
    COUNT(*) as event_count,
    venue_state
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
    AND (
        LOWER(venue_city) LIKE '% dc' 
        OR LOWER(venue_city) LIKE '% d.c.%'
        OR LOWER(venue_city) LIKE '% d c%'
        OR LOWER(venue_city) LIKE '% ny %'
        OR LOWER(venue_city) LIKE '% n.y.%'
        OR LOWER(venue_city) LIKE '% nyc%'
        OR LOWER(venue_city) LIKE '% la %'
        OR LOWER(venue_city) LIKE '% l.a.%'
        OR LOWER(venue_city) LIKE '% sf %'
        OR LOWER(venue_city) LIKE '% s.f.%'
    )
GROUP BY venue_city, venue_state
ORDER BY event_count DESC;

-- 4. Find cities with extra spaces or punctuation issues
SELECT 
    venue_city,
    COUNT(*) as event_count,
    LENGTH(venue_city) as city_length,
    LENGTH(TRIM(venue_city)) as trimmed_length
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
    AND (
        LENGTH(venue_city) != LENGTH(TRIM(venue_city))
        OR venue_city LIKE '%  %'  -- double spaces
        OR venue_city LIKE '%.%'   -- contains periods
        OR venue_city LIKE '%  %'  -- multiple spaces
    )
GROUP BY venue_city
ORDER BY event_count DESC;

-- 5. Get a sample of the most common city variations to understand the patterns
SELECT 
    venue_city,
    venue_state,
    COUNT(*) as event_count,
    MIN(event_date) as earliest_event,
    MAX(event_date) as latest_event
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
GROUP BY venue_city, venue_state
HAVING COUNT(*) >= 5  -- Only show cities with 5+ events
ORDER BY event_count DESC
LIMIT 50;

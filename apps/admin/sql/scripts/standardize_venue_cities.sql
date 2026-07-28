-- SQL to standardize venue_city data in jambase_events table
-- Run the analyze_venue_cities.sql first to see what needs to be standardized

-- 1. First, let's create a backup of the current data (optional but recommended)
-- CREATE TABLE jambase_events_backup AS SELECT * FROM jambase_events;

-- 2. Standardize common city name variations
-- This will update the venue_city column to use consistent naming

-- Washington DC variations
UPDATE jambase_events 
SET venue_city = 'Washington DC'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'washington dc',
        'washington d.c.',
        'washington d c',
        'washington, dc',
        'washington, d.c.',
        'washington, d c'
    );

-- New York variations
UPDATE jambase_events 
SET venue_city = 'New York'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'new york',
        'new york city',
        'ny',
        'n.y.',
        'nyc'
    );

-- Los Angeles variations
UPDATE jambase_events 
SET venue_city = 'Los Angeles'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'los angeles',
        'la',
        'l.a.',
        'los angeles ca'
    );

-- San Francisco variations
UPDATE jambase_events 
SET venue_city = 'San Francisco'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'san francisco',
        'sf',
        's.f.',
        'san francisco ca'
    );

-- Chicago variations
UPDATE jambase_events 
SET venue_city = 'Chicago'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'chicago',
        'chi',
        'chi.'
    );

-- Miami variations
UPDATE jambase_events 
SET venue_city = 'Miami'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'miami',
        'mia',
        'mia.'
    );

-- Seattle variations
UPDATE jambase_events 
SET venue_city = 'Seattle'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'seattle',
        'sea',
        'sea.'
    );

-- Phoenix variations
UPDATE jambase_events 
SET venue_city = 'Phoenix'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'phoenix',
        'phx',
        'phx.'
    );

-- Denver variations
UPDATE jambase_events 
SET venue_city = 'Denver'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'denver',
        'den',
        'den.'
    );

-- Las Vegas variations
UPDATE jambase_events 
SET venue_city = 'Las Vegas'
WHERE venue_city IS NOT NULL 
    AND LOWER(TRIM(venue_city)) IN (
        'las vegas',
        'vegas',
        'lv',
        'l.v.'
    );

-- 3. Clean up common formatting issues
-- Remove extra spaces
UPDATE jambase_events 
SET venue_city = TRIM(REGEXP_REPLACE(venue_city, '\s+', ' ', 'g'))
WHERE venue_city IS NOT NULL 
    AND venue_city != TRIM(REGEXP_REPLACE(venue_city, '\s+', ' ', 'g'));

-- 4. Standardize capitalization (Title Case)
-- This is more complex and might need to be done carefully
-- You might want to review the results first

-- 5. Remove trailing/leading whitespace
UPDATE jambase_events 
SET venue_city = TRIM(venue_city)
WHERE venue_city IS NOT NULL 
    AND venue_city != TRIM(venue_city);

-- 6. After running the updates, verify the results
-- Run this to see the standardized cities:
SELECT 
    venue_city,
    COUNT(*) as event_count,
    venue_state
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()
GROUP BY venue_city, venue_state
ORDER BY event_count DESC
LIMIT 50;

-- 7. Check for any remaining duplicates or variations
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

-- Simple query to get all unique venue_city values from jambase_events
-- This is what you asked for specifically

SELECT DISTINCT 
    venue_city,
    COUNT(*) as event_count
FROM jambase_events 
WHERE venue_city IS NOT NULL 
    AND venue_city != ''
    AND event_date >= NOW()  -- Only future events
GROUP BY venue_city 
ORDER BY event_count DESC, venue_city;

-- Alternative: Just the unique city names without counts
-- SELECT DISTINCT venue_city
-- FROM jambase_events 
-- WHERE venue_city IS NOT NULL 
--     AND venue_city != ''
--     AND event_date >= NOW()
-- ORDER BY venue_city;

-- Debug: Check how many events exist and what the diversity function returns

-- 1. Total events in database
SELECT 
  'Total events in jambase_events' as description,
  COUNT(*) as count
FROM jambase_events 
WHERE event_date > NOW();

-- 2. Events by artist (to see diversity)
SELECT 
  'Events by artist (limited to first 20)' as description,
  artist_name,
  COUNT(*) as event_count
FROM jambase_events 
WHERE event_date > NOW()
  AND artist_name IS NOT NULL
GROUP BY artist_name
ORDER BY event_count DESC
LIMIT 20;

-- 3. Test the diversity function directly for your user
SELECT 
  'Diversity function results' as description,
  COUNT(*) as total_returned,
  COUNT(DISTINCT artist_name) as unique_artists,
  MAX(artist_frequency_rank) as max_artist_rank
FROM get_personalized_events_feed_with_diversity(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  50,  -- limit
  0,   -- offset
  2,   -- max per artist
  false -- include past
);

-- 4. Test with higher limits
SELECT 
  'Diversity function with higher limits' as description,
  COUNT(*) as total_returned,
  COUNT(DISTINCT artist_name) as unique_artists,
  MAX(artist_frequency_rank) as max_artist_rank
FROM get_personalized_events_feed_with_diversity(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  100, -- limit
  0,   -- offset
  3,   -- max per artist (increased)
  false -- include past
);

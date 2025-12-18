-- Diagnostic queries to check why get_personalized_feed_v3 returns no rows
-- Run these in Supabase SQL Editor to debug
-- User ID: 349bda34-7878-4c10-9f86-ec5888e55571

-- 1. Check if user has friends
SELECT COUNT(*) as friend_count
FROM friends f
WHERE f.user1_id = '349bda34-7878-4c10-9f86-ec5888e55571'::UUID OR f.user2_id = '349bda34-7878-4c10-9f86-ec5888e55571'::UUID;

-- 2. Check events in date range
SELECT COUNT(*) as event_count
FROM events e
WHERE e.event_date >= NOW() - INTERVAL '30 days'
  AND e.event_date <= NOW() + INTERVAL '365 days';

-- 3. Check recent events (sample)
SELECT id, title, artist_name, venue_name, event_date
FROM events
WHERE event_date >= NOW() - INTERVAL '30 days'
  AND event_date <= NOW() + INTERVAL '365 days'
ORDER BY event_date ASC
LIMIT 10;

-- 4. Check reviews
SELECT COUNT(*) as review_count
FROM reviews r
WHERE r.is_public = true
  AND r.is_draft = false
  AND r.review_text IS NOT NULL
  AND r.review_text != ''
  AND r.review_text != 'ATTENDANCE_ONLY';

-- 5. Test the v3 function directly
SELECT * FROM get_personalized_feed_v3(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  20,  -- limit
  0,   -- offset
  NULL, -- city_lat (no location filter)
  NULL, -- city_lng (no location filter)
  50   -- radius_miles
);

-- 6. Check social graph
SELECT 
  '1st degree' as degree,
  COUNT(*) as count
FROM get_first_degree_connections('349bda34-7878-4c10-9f86-ec5888e55571'::UUID)
UNION ALL
SELECT 
  '2nd degree' as degree,
  COUNT(*) as count
FROM get_second_degree_connections('349bda34-7878-4c10-9f86-ec5888e55571'::UUID)
UNION ALL
SELECT 
  '3rd degree' as degree,
  COUNT(*) as count
FROM get_third_degree_connections('349bda34-7878-4c10-9f86-ec5888e55571'::UUID);

-- 7. Check event candidates (simplified version of what the function does)
WITH event_candidates AS (
  SELECT
    e.id AS event_id,
    e.title,
    e.artist_name,
    e.event_date
  FROM events e
  WHERE e.event_date >= NOW() - INTERVAL '30 days'
    AND e.event_date <= NOW() + INTERVAL '365 days'
  LIMIT 10
)
SELECT * FROM event_candidates;

-- Query personalized feed for user: 8863e8c2-5fc9-487b-aa3c-3bc8210bf885
-- This returns events, reviews, friend suggestions, and group chats

-- Basic query with default parameters (50 items, offset 0, no location filter)
SELECT * FROM public.get_personalized_feed_v3(
  '8863e8c2-5fc9-487b-aa3c-3bc8210bf885'::UUID,
  50,  -- limit
  0,   -- offset
  NULL, -- city_lat (no location filter)
  NULL, -- city_lng (no location filter)
  50   -- radius_miles (default)
)
ORDER BY score DESC, created_at DESC;

-- Query with location filter (example: Washington DC)
-- Uncomment and adjust coordinates as needed
/*
SELECT * FROM public.get_personalized_feed_v3(
  '8863e8c2-5fc9-487b-aa3c-3bc8210bf885'::UUID,
  50,   -- limit
  0,    -- offset
  38.9072,  -- city_lat (Washington DC)
  -77.0369, -- city_lng (Washington DC)
  50    -- radius_miles
)
ORDER BY score DESC, created_at DESC;
*/

-- Query to see just events (filter by type)
SELECT 
  id,
  type,
  score,
  payload->>'title' AS event_title,
  payload->>'artist_name' AS artist_name,
  payload->>'venue_name' AS venue_name,
  payload->>'event_date' AS event_date,
  payload->>'poster_image_url' AS poster_image_url,
  context->>'relevance_score' AS relevance_score,
  context->>'friend_interest_count' AS friend_interest_count,
  created_at
FROM public.get_personalized_feed_v3(
  '8863e8c2-5fc9-487b-aa3c-3bc8210bf885'::UUID,
  50,
  0,
  NULL,
  NULL,
  50
)
WHERE type = 'event'
ORDER BY score DESC;

-- Query to see feed item counts by type
SELECT 
  type,
  COUNT(*) AS count,
  AVG(score) AS avg_score,
  MAX(score) AS max_score
FROM public.get_personalized_feed_v3(
  '8863e8c2-5fc9-487b-aa3c-3bc8210bf885'::UUID,
  100,  -- Get more items for better stats
  0,
  NULL,
  NULL,
  50
)
GROUP BY type
ORDER BY count DESC;
















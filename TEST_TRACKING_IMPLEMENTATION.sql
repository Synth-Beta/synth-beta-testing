-- 🧪 Testing Script for Tracking Implementation
-- Run these queries in Supabase SQL Editor

-- STEP 1: Clean up old NULL data
DELETE FROM user_interactions 
WHERE event_type IS NULL OR entity_type IS NULL;

-- Verify cleanup
SELECT 'Old NULL data cleared' as status, COUNT(*) as remaining_records
FROM user_interactions;

-- STEP 2: Verify table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'user_interactions'
ORDER BY ordinal_position;

-- STEP 3: Check RLS policies
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd
FROM pg_policies
WHERE tablename = 'user_interactions';

-- STEP 4: Test manual insert
INSERT INTO user_interactions (
  user_id,
  session_id,
  event_type,
  entity_type,
  entity_id,
  metadata
) VALUES (
  auth.uid(),
  gen_random_uuid(),
  'test',
  'test_entity',
  'test-123',
  '{"test": true}'::jsonb
);

-- Verify manual insert worked
SELECT * FROM user_interactions 
WHERE event_type = 'test'
ORDER BY created_at DESC 
LIMIT 1;

-- Clean up test data
DELETE FROM user_interactions WHERE event_type = 'test';

-- STEP 5: Wait for new tracking data...
-- After testing in the app, run these queries:

-- Check new tracking data
SELECT 
  event_type,
  entity_type,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM user_interactions
WHERE event_type IS NOT NULL
AND DATE(occurred_at) = CURRENT_DATE
GROUP BY event_type, entity_type
ORDER BY count DESC;

-- Check ticket clicks (MOST IMPORTANT!)
SELECT 
  entity_id as event_id,
  metadata->>'artist_name' as artist,
  metadata->>'venue_name' as venue,
  metadata->>'ticket_provider' as provider,
  metadata->>'price_range' as price,
  COUNT(*) as clicks,
  occurred_at
FROM user_interactions
WHERE event_type = 'click_ticket'
GROUP BY entity_id, artist, venue, provider, price, occurred_at
ORDER BY occurred_at DESC
LIMIT 10;

-- Check event clicks
SELECT 
  entity_id as event_id,
  metadata->>'source' as source,
  metadata->>'position' as position,
  metadata->>'artist_name' as artist,
  metadata->>'venue_name' as venue,
  COUNT(*) as clicks
FROM user_interactions
WHERE event_type = 'click'
AND entity_type = 'event'
AND DATE(occurred_at) = CURRENT_DATE
GROUP BY entity_id, source, position, artist, venue
ORDER BY clicks DESC
LIMIT 20;

-- Check event impressions (IntersectionObserver)
SELECT 
  entity_id as event_id,
  metadata->>'source' as source,
  metadata->>'position' as position,
  metadata->>'feed_tab' as tab,
  COUNT(*) as impressions,
  COUNT(DISTINCT user_id) as unique_viewers
FROM user_interactions
WHERE event_type = 'view'
AND entity_type = 'event'
AND metadata->>'source' = 'feed'
AND DATE(occurred_at) = CURRENT_DATE
GROUP BY entity_id, source, position, tab
ORDER BY impressions DESC
LIMIT 20;

-- Check searches
SELECT 
  metadata->>'query' as search_query,
  COUNT(*) as search_count,
  AVG((metadata->>'result_count')::INT) as avg_results
FROM user_interactions
WHERE event_type = 'search'
AND DATE(occurred_at) = CURRENT_DATE
GROUP BY metadata->>'query'
ORDER BY search_count DESC
LIMIT 20;

-- Full summary
SELECT 
  'Today' as period,
  COUNT(*) as total_interactions,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as sessions,
  COUNT(*) FILTER (WHERE event_type = 'view' AND entity_type = 'event') as event_views,
  COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'event') as event_clicks,
  COUNT(*) FILTER (WHERE event_type = 'click_ticket') as ticket_clicks,
  COUNT(*) FILTER (WHERE event_type = 'search') as searches,
  COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'artist') as artist_clicks,
  COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'venue') as venue_clicks
FROM user_interactions
WHERE DATE(occurred_at) = CURRENT_DATE;


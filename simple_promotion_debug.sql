-- Simple debug to check promotion count discrepancy

-- 1. Count actual promotions in database
SELECT 'Step 1: Actual promotions in event_promotions table' as step;
SELECT 
  promotion_status,
  COUNT(*) as count
FROM event_promotions 
GROUP BY promotion_status;

-- 2. Count events marked as promoted in jambase_events
SELECT 'Step 2: Events marked as promoted in jambase_events' as step;
SELECT 
  is_promoted,
  COUNT(*) as count
FROM jambase_events 
GROUP BY is_promoted;

-- 3. Show the specific promoted events
SELECT 'Step 3: Specific promoted events' as step;
SELECT 
  id,
  title,
  artist_name,
  is_promoted,
  promotion_tier,
  active_promotion_id
FROM jambase_events 
WHERE is_promoted = true;

-- 4. Test feed function with limit 5 to see first few results
SELECT 'Step 4: First 5 events in feed' as step;
SELECT 
  event_id,
  title,
  artist_name,
  is_promoted,
  promotion_tier,
  relevance_score
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,
  5,
  0,
  false
)
ORDER BY relevance_score DESC;

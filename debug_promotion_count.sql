-- ============================================
-- DEBUG PROMOTION COUNT DISCREPANCY
-- ============================================
-- This script helps debug why we're seeing 4 promoted events when there are only 2

-- Check actual promotions in event_promotions table
SELECT 
  'Actual promotions in event_promotions table:' as info,
  COUNT(*) as total_promotions,
  COUNT(CASE WHEN promotion_status = 'active' THEN 1 END) as active_promotions
FROM event_promotions;

-- Show all active promotions with details
SELECT 
  'Active promotions details:' as info,
  ep.id,
  ep.event_id,
  ep.promotion_tier,
  ep.promotion_status,
  je.title,
  je.artist_name
FROM event_promotions ep
JOIN jambase_events je ON ep.event_id = je.id
WHERE ep.promotion_status = 'active'
ORDER BY ep.created_at;

-- Check jambase_events with is_promoted = true
SELECT 
  'Events marked as promoted in jambase_events:' as info,
  COUNT(*) as promoted_events_count
FROM jambase_events 
WHERE is_promoted = true;

-- Show which events are marked as promoted
SELECT 
  'Events marked as promoted:' as info,
  id,
  title,
  artist_name,
  is_promoted,
  promotion_tier,
  active_promotion_id
FROM jambase_events 
WHERE is_promoted = true
ORDER BY updated_at DESC;

-- Test the feed function and show promoted events
SELECT 
  'Promoted events in feed:' as info,
  event_id,
  title,
  artist_name,
  is_promoted,
  promotion_tier,
  active_promotion_id,
  relevance_score
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,
  20,
  0,
  false
)
WHERE is_promoted = true
ORDER BY relevance_score DESC;

-- Check if there are duplicate events
SELECT 
  'Duplicate events in feed:' as info,
  title,
  artist_name,
  COUNT(*) as count
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,
  20,
  0,
  false
)
GROUP BY title, artist_name
HAVING COUNT(*) > 1
ORDER BY count DESC;

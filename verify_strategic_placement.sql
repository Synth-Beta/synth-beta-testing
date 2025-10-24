-- Verify strategic placement of promoted events

-- Show the first 20 events in the feed with their positions
SELECT 
  ROW_NUMBER() OVER (ORDER BY relevance_score DESC) as position,
  title,
  artist_name,
  is_promoted,
  promotion_tier,
  relevance_score
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,
  20,
  0,
  false
)
ORDER BY relevance_score DESC;

-- Count promoted events at strategic positions (1, 6, 11, 16, 21...)
WITH feed_with_positions AS (
  SELECT 
    ROW_NUMBER() OVER (ORDER BY relevance_score DESC) as position,
    title,
    artist_name,
    is_promoted,
    promotion_tier
  FROM get_personalized_events_feed(
    (SELECT id FROM auth.users LIMIT 1)::UUID,
    20,
    0,
    false
  )
)
SELECT 
  'Strategic placement check:' as info,
  COUNT(CASE WHEN is_promoted = true AND position IN (1, 6, 11, 16, 21) THEN 1 END) as promoted_at_strategic_positions,
  COUNT(CASE WHEN is_promoted = true THEN 1 END) as total_promoted_in_feed
FROM feed_with_positions;

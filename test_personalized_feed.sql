-- ============================================
-- TEST PERSONALIZED FEED WITH PROMOTIONS
-- ============================================
-- This tests the personalized feed function to see if promoted events are detected

-- Test the personalized feed function
SELECT 
  'Testing Personalized Feed...' as status;

-- Test with a sample user ID (replace with your actual user ID)
-- You can get your user ID from the auth.users table
SELECT 
  'Sample user ID for testing:' as info,
  id as user_id
FROM auth.users 
LIMIT 1;

-- Test the personalized feed function
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID
SELECT 
  event_id,
  title,
  artist_name,
  relevance_score,
  is_promoted,
  promotion_tier,
  active_promotion_id
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,  -- Use first user as test
  20,  -- limit to 20 events
  0,   -- offset 0
  false -- don't include past events
)
ORDER BY relevance_score DESC
LIMIT 10;

-- Show promoted events specifically
SELECT 
  'Promoted Events in Feed:' as info,
  COUNT(*) as promoted_count
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,
  20,
  0,
  false
)
WHERE is_promoted = true;

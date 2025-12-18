-- Quick diagnostic for get_personalized_feed_v3 returning no rows
-- Replace the UUID below with your actual user ID

DO $$
DECLARE
  user_id UUID := '349bda34-7878-4c10-9f86-ec5888e55571';
  event_count INT;
  function_count INT;
  friend_suggestion_count INT;
BEGIN
  -- 1. Check if we have events
  SELECT COUNT(*) INTO event_count
  FROM events
  WHERE event_date >= NOW() - INTERVAL '30 days'
    AND event_date <= NOW() + INTERVAL '365 days';
  
  RAISE NOTICE 'Available events: %', event_count;
  
  -- 2. Check what the function returns
  SELECT COUNT(*) INTO function_count
  FROM get_personalized_feed_v3(user_id, 5, 0, NULL, NULL, 50);
  
  RAISE NOTICE 'Function returns: % rows', function_count;
  
  -- 3. Check friend suggestions
  SELECT COUNT(*) INTO friend_suggestion_count
  FROM (
    SELECT DISTINCT sdc.connected_user_id
    FROM get_second_degree_connections(user_id) sdc
    WHERE sdc.mutual_friends_count >= 1
    UNION ALL
    SELECT DISTINCT tdc.connected_user_id
    FROM get_third_degree_connections(user_id) tdc
    WHERE tdc.mutual_friends_count >= 1
  ) fs;
  
  RAISE NOTICE 'Friend suggestions available: %', friend_suggestion_count;
END $$;

-- Also run these queries separately to see detailed results:

-- Check events
SELECT 'Available events' as check_name, COUNT(*) as count
FROM events
WHERE event_date >= NOW() - INTERVAL '30 days'
  AND event_date <= NOW() + INTERVAL '365 days';

-- Check what the function returns by type
SELECT type, COUNT(*) as count
FROM get_personalized_feed_v3('349bda34-7878-4c10-9f86-ec5888e55571'::UUID, 10, 0, NULL, NULL, 50)
GROUP BY type;

-- Check sample events
SELECT id, title, event_date
FROM events
WHERE event_date >= NOW() - INTERVAL '30 days'
  AND event_date <= NOW() + INTERVAL '365 days'
LIMIT 5;


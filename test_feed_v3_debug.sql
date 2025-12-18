-- Diagnostic query to check why get_personalized_feed_v3 returns no rows
-- Replace USER_ID_HERE with your actual user ID

-- Set your user ID here
\set user_id '349bda34-7878-4c10-9f86-ec5888e55571'

-- 1. Check if user exists
SELECT 'User exists' as check_type, COUNT(*) as count 
FROM users WHERE user_id = :'user_id'::UUID;

-- 2. Check friend connections
SELECT '1st degree friends' as check_type, COUNT(*) as count
FROM get_first_degree_connections(:'user_id'::UUID);

SELECT '2nd degree connections' as check_type, COUNT(*) as count
FROM get_second_degree_connections(:'user_id'::UUID);

SELECT '3rd degree connections' as check_type, COUNT(*) as count
FROM get_third_degree_connections(:'user_id'::UUID);

-- 3. Check events available (wide date range)
SELECT 'Events (30 days past to 365 days future)' as check_type, COUNT(*) as count
FROM events
WHERE event_date >= NOW() - INTERVAL '30 days'
  AND event_date <= NOW() + INTERVAL '365 days';

-- 4. Check reviews from connections
WITH social_graph AS (
  SELECT fdc.connected_user_id, 1 AS connection_depth
  FROM get_first_degree_connections(:'user_id'::UUID) fdc
  UNION ALL
  SELECT sdc.connected_user_id, 2 AS connection_depth
  FROM get_second_degree_connections(:'user_id'::UUID) sdc
  UNION ALL
  SELECT tdc.connected_user_id, 3 AS connection_depth
  FROM get_third_degree_connections(:'user_id'::UUID) tdc
)
SELECT 'Reviews from connections' as check_type, COUNT(*) as count
FROM reviews r
JOIN events e ON e.id = r.event_id
WHERE r.is_public = true 
  AND r.is_draft = false
  AND r.review_text IS NOT NULL
  AND r.review_text != ''
  AND r.review_text != 'ATTENDANCE_ONLY'
  AND e.event_date >= NOW() - INTERVAL '90 days'
  AND r.user_id != :'user_id'::UUID
  AND EXISTS (
    SELECT 1 FROM social_graph sg WHERE sg.connected_user_id = r.user_id
  );

-- 5. Check group chats
SELECT 'Group chats (not member, last 14 days)' as check_type, COUNT(*) as count
FROM chats c
WHERE c.is_group_chat = true
  AND NOT (:user_id::UUID = ANY(c.users))
  AND c.created_at >= NOW() - INTERVAL '14 days';

-- 6. Check friend suggestions (2nd/3rd degree)
SELECT '2nd degree friend suggestions' as check_type, COUNT(*) as count
FROM get_second_degree_connections(:'user_id'::UUID) sdc
WHERE sdc.mutual_friends_count >= 1;

SELECT '3rd degree friend suggestions' as check_type, COUNT(*) as count
FROM get_third_degree_connections(:'user_id'::UUID) tdc
WHERE tdc.mutual_friends_count >= 1;

-- 7. Test the function directly with a small limit
SELECT 'Function result count' as check_type, COUNT(*) as count
FROM get_personalized_feed_v3(:'user_id'::UUID, 10, 0, NULL, NULL, 50);

-- 8. Show sample items from function
SELECT 
  type,
  score,
  created_at,
  payload->>'title' as title_or_name,
  payload->>'chat_name' as chat_name
FROM get_personalized_feed_v3(:'user_id'::UUID, 20, 0, NULL, NULL, 50)
ORDER BY 
  CASE type
    WHEN 'friend_suggestion' THEN 0
    WHEN 'group_chat' THEN 1
    WHEN 'event' THEN 2
    WHEN 'review' THEN 3
  END,
  score DESC
LIMIT 20;

-- Debug script to check why get_personalized_feed_v3 returns no rows
-- Replace USER_ID with your actual user ID

DO $$
DECLARE
  v_user_id UUID := '349bda34-7878-4c10-9f86-ec5888e55571'::UUID;
  event_count INT;
  review_count INT;
  friend_count INT;
  social_graph_count INT;
  event_record RECORD;
BEGIN
  -- Check events
  SELECT COUNT(*) INTO event_count
  FROM events e
  WHERE e.event_date >= NOW() - INTERVAL '30 days'
    AND e.event_date <= NOW() + INTERVAL '180 days';
  
  RAISE NOTICE 'Events in date range: %', event_count;
  
  -- Check reviews
  SELECT COUNT(*) INTO review_count
  FROM reviews r
  JOIN events e ON e.id = r.event_id
  WHERE r.is_public = true
    AND r.is_draft = false
    AND r.review_text IS NOT NULL
    AND r.review_text != ''
    AND r.review_text != 'ATTENDANCE_ONLY'
    AND e.event_date >= NOW() - INTERVAL '60 days'
    AND r.user_id != v_user_id;
  
  RAISE NOTICE 'Reviews in date range: %', review_count;
  
  -- Check social graph
  SELECT COUNT(*) INTO social_graph_count
  FROM (
    SELECT connected_user_id FROM get_first_degree_connections(v_user_id)
    UNION
    SELECT connected_user_id FROM get_second_degree_connections(v_user_id)
    UNION
    SELECT connected_user_id FROM get_third_degree_connections(v_user_id)
  ) sg;
  
  RAISE NOTICE 'Social graph connections: %', social_graph_count;
  
  -- Check friend event interests
  SELECT COUNT(*) INTO friend_count
  FROM relationships r
  WHERE r.user_id IN (
    SELECT connected_user_id FROM get_first_degree_connections(v_user_id)
  )
  AND r.related_entity_type = 'event'
  AND r.relationship_type IN ('going', 'maybe');
  
  RAISE NOTICE 'Friend event interests: %', friend_count;
  
  -- Show sample events
  RAISE NOTICE 'Sample events:';
  FOR event_record IN
    SELECT id, title, event_date, promoted
    FROM events
    WHERE event_date >= NOW() - INTERVAL '30 days'
      AND event_date <= NOW() + INTERVAL '180 days'
    ORDER BY event_date ASC
    LIMIT 5
  LOOP
    RAISE NOTICE '  Event: % - % - % (promoted: %)', event_record.id, event_record.title, event_record.event_date, event_record.promoted;
  END LOOP;
  
END $$;

-- Direct test of the function
SELECT type, COUNT(*) as count_per_type
FROM get_personalized_feed_v3(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  50,  -- p_limit
  0,   -- p_offset
  NULL, -- p_city_lat
  NULL, -- p_city_lng
  50    -- p_radius_miles
)
GROUP BY type;

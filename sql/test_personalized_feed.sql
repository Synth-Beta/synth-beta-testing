-- Test get_personalized_feed_v3 function for user
-- User ID: 349bda34-7878-4c10-9f86-ec5888e55571

-- Call the function with default parameters
SELECT * FROM get_personalized_feed_v3(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  20,  -- limit
  0,   -- offset
  NULL, -- city_lat (no location filter)
  NULL, -- city_lng (no location filter)
  50   -- radius_miles
);

-- Or with location (Washington DC coordinates)
-- SELECT * FROM get_personalized_feed_v3(
--   '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
--   20,  -- limit
--   0,   -- offset
--   38.9072,  -- city_lat (Washington DC)
--   -77.0369, -- city_lng (Washington DC)
--   50   -- radius_miles
-- );

-- To see just event items with photo URLs:
-- SELECT 
--   id,
--   type,
--   score,
--   payload->>'title' as title,
--   payload->>'artist_name' as artist_name,
--   payload->>'poster_image_url' as poster_image_url,
--   payload->'images' as images,
--   context->>'relevance_score' as relevance_score
-- FROM get_personalized_feed_v3(
--   '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
--   20,
--   0,
--   NULL,
--   NULL,
--   50
-- )
-- WHERE type = 'event'
-- ORDER BY score DESC;


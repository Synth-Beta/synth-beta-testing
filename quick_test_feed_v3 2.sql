-- Quick test of get_personalized_feed_v3 for user 349bda34-7878-4c10-9f86-ec5888e55571
-- Run this in Supabase SQL Editor

-- Test with your user ID, no location filter
SELECT * FROM get_personalized_feed_v3(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  20,  -- limit
  0,   -- offset
  NULL, -- city_lat (no location filter - should return all events)
  NULL, -- city_lng (no location filter)
  50   -- radius_miles (ignored when lat/lng are NULL)
);

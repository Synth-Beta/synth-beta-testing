-- ============================================================
-- Test Query: Get Recommended Chats for User
-- ============================================================
-- This query tests the get_recommended_chats function
-- User ID: 349bda34-7878-4c10-9f86-ec5888e55571
-- ============================================================

-- Test 1: Get recommended chats with default parameters
SELECT 
  chat_id,
  chat_name,
  entity_type,
  entity_id,
  entity_uuid,
  entity_name,
  entity_image_url,
  member_count,
  last_activity_at,
  relevance_score,
  distance_miles
FROM get_recommended_chats(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  20,  -- limit
  0,   -- offset
  50   -- radius_miles
)
ORDER BY relevance_score DESC, member_count DESC;

-- ============================================================
-- Test 2: Check user's current location and preferences
-- ============================================================
SELECT 
  'User Location' as check_type,
  u.latitude,
  u.longitude,
  u.location_city,
  u.location_state
FROM public.users u
WHERE u.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::UUID;

-- ============================================================
-- Test 3: Check user's genre preferences
-- ============================================================
SELECT 
  'User Preferences' as check_type,
  up.top_genres,
  up.genre_preference_scores,
  up.top_artists,
  up.top_venues
FROM public.user_preferences up
WHERE up.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::UUID;

-- ============================================================
-- Test 4: Check how many chats user is already in
-- ============================================================
SELECT 
  'User Chat Participation' as check_type,
  COUNT(*) as chats_user_is_in
FROM public.chat_participants cp
WHERE cp.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::UUID;

-- ============================================================
-- Test 5: Check total group chats available
-- ============================================================
SELECT 
  'Available Group Chats' as check_type,
  COUNT(*) as total_group_chats,
  COUNT(*) FILTER (WHERE is_verified = true) as verified_chats,
  COUNT(*) FILTER (WHERE is_group_chat = true AND member_count > 0) as active_group_chats
FROM public.chats;

-- ============================================================
-- Test 6: Check verified venues near user (if location exists)
-- ============================================================
SELECT 
  'Nearby Verified Venues' as check_type,
  v.id,
  v.name,
  v.latitude,
  v.longitude,
  CASE 
    WHEN u.latitude IS NOT NULL AND u.longitude IS NOT NULL 
         AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
      calculate_distance(
        u.latitude::FLOAT, 
        u.longitude::FLOAT, 
        v.latitude::FLOAT, 
        v.longitude::FLOAT
      )
    ELSE NULL
  END as distance_miles
FROM public.venues v
CROSS JOIN public.users u
WHERE v.verified = true
  AND u.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::UUID
  AND u.latitude IS NOT NULL 
  AND u.longitude IS NOT NULL
  AND v.latitude IS NOT NULL 
  AND v.longitude IS NOT NULL
ORDER BY distance_miles ASC
LIMIT 10;

-- ============================================================
-- Test 7: Check verified artists matching user genres
-- ============================================================
SELECT 
  'Matching Verified Artists' as check_type,
  a.id,
  a.name,
  a.genres,
  up.top_genres as user_top_genres
FROM public.artists a
CROSS JOIN public.user_preferences up
WHERE a.verified = true
  AND up.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::UUID
  AND (
    up.top_genres = ARRAY[]::TEXT[]
    OR a.genres IS NULL
    OR array_length(a.genres, 1) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(a.genres) g
      WHERE lower(trim(g)) = ANY(SELECT lower(trim(unnest(up.top_genres))))
    )
  )
LIMIT 10;


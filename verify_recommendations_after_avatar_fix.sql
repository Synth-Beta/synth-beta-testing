-- Verify recommendations are now visible after adding avatars
-- Run this with your user ID to test

-- Test 1: Check if recommendations are in cache
SELECT 
  urc.*,
  p.name as recommended_user_name,
  p.avatar_url,
  p.is_public_profile
FROM public.user_recommendations_cache urc
INNER JOIN public.profiles p ON p.user_id = urc.recommended_user_id
WHERE urc.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid  -- Replace with your user ID
ORDER BY urc.recommendation_score DESC;

-- Test 2: Call the get_user_recommendations function
-- This should now return all recommendations since profiles have avatars
SELECT * FROM public.get_user_recommendations(
  '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,  -- Replace with your user ID
  10
);

-- Test 3: Verify RLS visibility for recommended users
-- All recommended users should now be visible
SELECT 
  p.user_id,
  p.name,
  p.avatar_url IS NOT NULL 
    AND p.avatar_url != '' 
    AND TRIM(p.avatar_url) != '' as has_avatar,
  p.is_public_profile,
  -- Check if they meet visibility criteria
  (
    EXISTS (
      SELECT 1 FROM public.friends f
      WHERE (f.user1_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid AND f.user2_id = p.user_id)
         OR (f.user2_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid AND f.user1_id = p.user_id)
    )
    OR (
      p.avatar_url IS NOT NULL 
      AND p.avatar_url != '' 
      AND TRIM(p.avatar_url) != ''
      AND p.is_public_profile = true
    )
  ) as should_be_visible
FROM public.profiles p
WHERE p.user_id IN (
  SELECT recommended_user_id 
  FROM public.user_recommendations_cache 
  WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid
)
ORDER BY p.name;


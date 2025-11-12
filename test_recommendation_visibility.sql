-- Test if profiles without avatars are being filtered out by RLS
-- This helps diagnose the recommendation visibility issue

-- Test 1: Check current user's recommendations cache
-- Replace with your actual user ID
SELECT 
  urc.*,
  p.name as profile_name,
  p.avatar_url,
  p.is_public_profile,
  CASE 
    WHEN p.avatar_url IS NULL OR p.avatar_url = '' OR TRIM(p.avatar_url) = '' THEN 'NO_AVATAR'
    ELSE 'HAS_AVATAR'
  END as avatar_status
FROM public.user_recommendations_cache urc
LEFT JOIN public.profiles p ON p.user_id = urc.recommended_user_id
WHERE urc.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid  -- Replace with your user ID
ORDER BY urc.recommendation_score DESC;

-- Test 2: Check if the get_user_recommendations function can see these profiles
-- This should return rows if SECURITY DEFINER bypasses RLS
SELECT * FROM public.get_user_recommendations(
  '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,  -- Replace with your user ID
  10
);

-- Test 3: Direct query to profiles table (this will be subject to RLS)
-- This shows what the current user can see
SELECT 
  user_id,
  name,
  avatar_url,
  is_public_profile,
  CASE 
    WHEN avatar_url IS NULL OR avatar_url = '' OR TRIM(avatar_url) = '' THEN 'NO_AVATAR'
    ELSE 'HAS_AVATAR'
  END as avatar_status
FROM public.profiles
WHERE user_id != auth.uid()
ORDER BY name;

-- Test 4: Check RLS policy conditions for specific profiles
-- Replace with user IDs from your recommendations
SELECT 
  p.user_id,
  p.name,
  p.avatar_url IS NOT NULL 
    AND p.avatar_url != '' 
    AND TRIM(p.avatar_url) != '' as has_avatar,
  p.is_public_profile,
  -- Check if they're friends
  EXISTS (
    SELECT 1 FROM public.friends f
    WHERE (f.user1_id = auth.uid() AND f.user2_id = p.user_id)
       OR (f.user2_id = auth.uid() AND f.user1_id = p.user_id)
  ) as is_friend,
  -- Check if they meet visibility criteria
  (
    EXISTS (
      SELECT 1 FROM public.friends f
      WHERE (f.user1_id = auth.uid() AND f.user2_id = p.user_id)
         OR (f.user2_id = auth.uid() AND f.user1_id = p.user_id)
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
  'af447747-34b7-4478-b730-ca2976e1885d'::uuid,  -- TestBiz
  '42ad9aa0-99a6-4ec9-9cab-988e5de969e8'::uuid,  -- TestCreator
  '7d727ff6-fb7f-4e86-b272-f5ac31bd08d4'::uuid,  -- Lauren Pesce
  '25cc21f9-861d-4ff7-a3d0-10805d8f2f73'::uuid   -- Mara
);


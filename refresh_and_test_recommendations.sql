-- Refresh recommendations and verify they're working after avatar fix
-- Run this with your user ID

-- Step 1: Recalculate recommendations (this will use the updated profiles with avatars)
SELECT public.calculate_user_recommendations('349bda34-7878-4c10-9f86-ec5888e55571'::uuid);

-- Step 2: Verify recommendations are in cache
SELECT 
  urc.recommended_user_id,
  p.name,
  p.avatar_url,
  urc.connection_label,
  urc.recommendation_score,
  urc.recommendation_reasons
FROM public.user_recommendations_cache urc
INNER JOIN public.profiles p ON p.user_id = urc.recommended_user_id
WHERE urc.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid
ORDER BY urc.recommendation_score DESC;

-- Step 3: Test the get_user_recommendations function
-- This should now return all recommendations since profiles have avatars
SELECT * FROM public.get_user_recommendations(
  '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,
  10
);

-- Step 4: Verify all recommended profiles are visible (meet RLS criteria)
SELECT 
  p.user_id,
  p.name,
  p.avatar_url IS NOT NULL 
    AND p.avatar_url != '' 
    AND TRIM(p.avatar_url) != '' as has_avatar,
  p.is_public_profile,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.friends f
      WHERE (f.user1_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid AND f.user2_id = p.user_id)
         OR (f.user2_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid AND f.user1_id = p.user_id)
    ) THEN 'FRIEND'
    WHEN (
      p.avatar_url IS NOT NULL 
      AND p.avatar_url != '' 
      AND TRIM(p.avatar_url) != ''
      AND p.is_public_profile = true
    ) THEN 'VISIBLE_TO_ALL'
    ELSE 'HIDDEN'
  END as visibility_status
FROM public.profiles p
WHERE p.user_id IN (
  SELECT recommended_user_id 
  FROM public.user_recommendations_cache 
  WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid
)
ORDER BY visibility_status, p.name;


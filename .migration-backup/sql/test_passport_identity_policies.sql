-- ============================================
-- TEST PASSPORT IDENTITY POLICIES
-- ============================================
-- Run this to verify the RLS policies are working correctly
-- Replace 'TARGET_USER_ID' with the UUID of the user whose identity you want to test
-- ============================================

-- 1. Check if target user exists and their profile settings
SELECT 
  user_id,
  name,
  is_public_profile,
  avatar_url
FROM public.users
WHERE user_id = 'TARGET_USER_ID'::uuid;

-- 2. Check if passport_identity exists for target user
SELECT 
  user_id,
  fan_type,
  join_year,
  home_scene_id
FROM public.passport_identity
WHERE user_id = 'TARGET_USER_ID'::uuid;

-- 3. Check current user's friendship with target user
SELECT 
  id,
  user_id,
  related_user_id,
  relationship_type,
  status
FROM public.user_relationships
WHERE relationship_type = 'friend'
  AND status = 'accepted'
  AND (
    (user_id = auth.uid() AND related_user_id = 'TARGET_USER_ID'::uuid)
    OR
    (user_id = 'TARGET_USER_ID'::uuid AND related_user_id = auth.uid())
  );

-- 4. Test the policy directly (this should work if policies are correct)
-- This simulates what the app does
SELECT 
  pi.user_id,
  pi.fan_type,
  pi.join_year,
  u.name,
  u.is_public_profile
FROM public.passport_identity pi
LEFT JOIN public.users u ON u.user_id = pi.user_id
WHERE pi.user_id = 'TARGET_USER_ID'::uuid;

-- 5. List all RLS policies on passport_identity table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'passport_identity'
ORDER BY policyname;

-- 6. Check if anon role has SELECT permission
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'passport_identity'
  AND grantee IN ('authenticated', 'anon');

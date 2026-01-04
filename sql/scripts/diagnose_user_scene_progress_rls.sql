-- ============================================================
-- DIAGNOSE USER_SCENE_PROGRESS RLS ISSUES
-- Run this to check why RLS might be blocking queries
-- ============================================================

-- 1. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'user_scene_progress';

-- 2. List all RLS policies on the table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'user_scene_progress'
ORDER BY policyname;

-- 3. Check current auth context (run this as the user experiencing the issue)
SELECT 
  'Current auth context' as info,
  auth.uid() as current_user_id,
  auth.role() as current_role,
  auth.jwt() ->> 'sub' as jwt_sub;

-- 4. Check if there are any records for the user experiencing issues
-- Replace '349bda34-7878-4c10-9f86-ec5888e55571' with the actual user_id
SELECT 
  'User progress records' as info,
  COUNT(*) as total_records,
  COUNT(DISTINCT scene_id) as unique_scenes
FROM public.user_scene_progress
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- 5. Test if the policy works by trying to select (this will show if RLS blocks it)
-- Replace '349bda34-7878-4c10-9f86-ec5888e55571' with the actual user_id
-- This should work if auth.uid() matches the user_id
SELECT 
  'Policy test' as info,
  COUNT(*) as accessible_records
FROM public.user_scene_progress
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
  AND scene_id = '74e0858f-8ed5-47af-8711-4a5f38c403ad';

-- 6. Check grants on the table
SELECT 
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'user_scene_progress'
ORDER BY grantee, privilege_type;

-- 7. Verify the user exists in auth.users
SELECT 
  'User exists in auth' as info,
  id,
  email,
  created_at
FROM auth.users
WHERE id = '349bda34-7878-4c10-9f86-ec5888e55571';


















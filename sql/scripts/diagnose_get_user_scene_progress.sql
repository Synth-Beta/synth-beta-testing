-- ============================================================
-- DIAGNOSTIC: Check get_user_scene_progress function
-- Run this to see what's wrong
-- ============================================================

-- 1. Check if function exists
SELECT 
  'Function Exists Check' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND p.proname = 'get_user_scene_progress'
    ) THEN '✅ Function EXISTS'
    ELSE '❌ Function DOES NOT EXIST'
  END as result;

-- 2. Check function signature
SELECT 
  'Function Signature' as check_type,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as is_security_definer,
  p.provolatile as volatility
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_user_scene_progress';

-- 3. Check function permissions
SELECT 
  'Function Permissions' as check_type,
  p.proname as function_name,
  r.rolname as role,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
AND p.proname = 'get_user_scene_progress'
AND r.rolname IN ('authenticated', 'anon', 'service_role', 'postgres')
ORDER BY r.rolname;

-- 4. Check if table exists and has data
SELECT 
  'Table Status' as check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_scene_progress')
    THEN '✅ Table EXISTS'
    ELSE '❌ Table DOES NOT EXIST'
  END as table_exists,
  (SELECT COUNT(*) FROM public.user_scene_progress) as row_count,
  (SELECT COUNT(DISTINCT user_id) FROM public.user_scene_progress) as unique_users,
  (SELECT COUNT(DISTINCT scene_id) FROM public.user_scene_progress) as unique_scenes;

-- 5. Check RLS status
SELECT 
  'RLS Status' as check_type,
  tablename,
  rowsecurity as rls_enabled,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'user_scene_progress' AND schemaname = 'public') as policy_count
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'user_scene_progress';

-- 6. List all policies
SELECT 
  'RLS Policies' as check_type,
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

-- 7. Check for function overloads (multiple functions with same name)
SELECT 
  'Function Overloads' as check_type,
  COUNT(*) as overload_count,
  string_agg(pg_get_function_arguments(p.oid), ' | ') as all_signatures
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_user_scene_progress';

-- 8. Test function directly (if you have a test user/scene)
-- Uncomment and replace with actual IDs to test:
/*
SELECT 
  'Function Test' as check_type,
  * 
FROM public.get_user_scene_progress(
  'YOUR_USER_ID_HERE'::UUID,
  'YOUR_SCENE_ID_HERE'::UUID
);
*/

-- 9. Check PostgREST schema exposure
-- PostgREST only exposes functions in schemas listed in db.schemas config
-- This checks if public schema is accessible
SELECT 
  'Schema Access' as check_type,
  nspname as schema_name,
  nspowner::regrole as owner
FROM pg_namespace
WHERE nspname = 'public';

-- 10. Check if function is callable by current user
SELECT 
  'Current User Test' as check_type,
  current_user as current_role,
  session_user as session_role,
  has_function_privilege(current_user, 'public.get_user_scene_progress(uuid, uuid)', 'EXECUTE') as can_execute_as_current_user;


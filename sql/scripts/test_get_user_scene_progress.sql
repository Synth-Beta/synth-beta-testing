-- ============================================================
-- SIMPLE TEST: Test get_user_scene_progress function
-- Run this to verify the function works
-- ============================================================

-- Test 1: Call function with dummy UUIDs (should return empty, not error)
SELECT 'Test 1: Function call with dummy UUIDs' as test_name;
SELECT * FROM public.get_user_scene_progress(
  '00000000-0000-0000-0000-000000000000'::UUID,
  '00000000-0000-0000-0000-000000000000'::UUID
);
-- Expected: Empty result set (0 rows) - NOT an error

-- Test 2: Check if we have any actual data
SELECT 'Test 2: Check for existing data' as test_name;
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT scene_id) as unique_scenes
FROM public.user_scene_progress;

-- Test 3: If we have data, test with real IDs
-- Uncomment and replace with actual IDs from your database:
/*
SELECT 'Test 3: Function call with real IDs' as test_name;
SELECT * FROM public.get_user_scene_progress(
  (SELECT user_id FROM public.user_scene_progress LIMIT 1),
  (SELECT scene_id FROM public.user_scene_progress LIMIT 1)
);
*/

-- Test 4: Verify function signature matches what frontend expects
SELECT 'Test 4: Function signature check' as test_name;
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  CASE 
    WHEN p.provolatile = 's' THEN 'STABLE ✅'
    WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
    WHEN p.provolatile = 'v' THEN 'VOLATILE ⚠️'
  END as volatility,
  CASE 
    WHEN p.prosecdef THEN 'SECURITY DEFINER ✅'
    ELSE 'SECURITY INVOKER'
  END as security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_user_scene_progress';

-- Test 5: Check permissions
SELECT 'Test 5: Permission check' as test_name;
SELECT 
  r.rolname as role,
  has_function_privilege(r.rolname, 'public.get_user_scene_progress(uuid, uuid)', 'EXECUTE') as can_execute
FROM pg_roles r
WHERE r.rolname IN ('authenticated', 'anon', 'service_role', 'postgres')
ORDER BY r.rolname;


-- ============================================================
-- CHECK WHAT POSTGREST SEES
-- This helps diagnose why PostgREST isn't exposing the function
-- ============================================================

-- 1. Check if function exists and is in public schema
SELECT 
  'Function Check' as check_type,
  p.proname as function_name,
  n.nspname as schema_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security,
  CASE 
    WHEN p.provolatile = 's' THEN 'STABLE'
    WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
    ELSE 'VOLATILE'
  END as volatility
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_user_scene_progress';

-- 2. Check function permissions
SELECT 
  'Permissions' as check_type,
  r.rolname as role,
  has_function_privilege(r.rolname, 'public.get_user_scene_progress(uuid, uuid)', 'EXECUTE') as can_execute
FROM pg_roles r
WHERE r.rolname IN ('authenticated', 'anon', 'service_role', 'postgres', 'supabase_admin')
ORDER BY r.rolname;

-- 3. Check if there are any PostgREST-specific issues
-- PostgREST requires functions to be in exposed schemas
SELECT 
  'Schema Exposure' as check_type,
  nspname as schema_name,
  nspowner::regrole as owner
FROM pg_namespace
WHERE nspname IN ('public', 'extensions');

-- 4. Check for function overloads that might confuse PostgREST
SELECT 
  'Overloads' as check_type,
  COUNT(*) as count,
  string_agg(pg_get_function_arguments(p.oid), ' | ') as all_signatures
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_user_scene_progress';

-- 5. Try to see what PostgREST metadata shows
-- PostgREST uses information_schema for function discovery
SELECT 
  'Information Schema' as check_type,
  routine_name,
  routine_schema,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_user_scene_progress';


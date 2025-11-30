-- ============================================
-- DIAGNOSE: get_connection_degree_reviews RPC Function
-- ============================================
-- Run this to check if the function exists and verify its signature

-- 1. Check if function exists
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosrc as source_code
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_connection_degree_reviews';

-- 2. Check if view exists
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'reviews_with_connection_degree';

-- 3. Check view columns and types
SELECT 
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reviews_with_connection_degree'
ORDER BY ordinal_position;

-- 4. Test the function directly (replace with your user_id)
-- SELECT * FROM public.get_connection_degree_reviews(
--   'YOUR_USER_ID_HERE'::uuid, 
--   20, 
--   0
-- );

-- 5. Check function permissions
SELECT 
  p.proname as function_name,
  r.rolname as grantee,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public' 
  AND p.proname = 'get_connection_degree_reviews'
  AND r.rolname IN ('authenticated', 'anon', 'public')
ORDER BY r.rolname;


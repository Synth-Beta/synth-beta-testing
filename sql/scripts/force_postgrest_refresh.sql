-- ============================================================
-- FORCE POSTGREST SCHEMA CACHE REFRESH
-- Run this after creating/modifying functions to force PostgREST
-- to recognize them via the REST API
-- ============================================================

-- Method 1: Notify PostgREST to reload schema (most reliable)
NOTIFY pgrst, 'reload schema';

-- Method 2: Alternative notification format (if above doesn't work)
SELECT pg_notify('pgrst', 'reload schema');

-- Method 3: Force a schema query (helps refresh cache)
SELECT 1;

-- Method 4: Query the function directly to "warm up" the cache
-- This helps PostgREST discover the function
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_user_scene_progress';

-- After running this, wait 10-30 seconds and try the REST API call again
-- The function should now be accessible via: POST /rest/v1/rpc/get_user_scene_progress


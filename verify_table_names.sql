-- Verification script to check current table names
-- Run this BEFORE running CREATE_CONNECTION_DEGREE_REVIEWS_SYSTEM.sql

-- 1. Check review table name
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') 
      THEN '✅ Using: public.reviews (post-consolidation)'
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_reviews')
      THEN '⚠️ Using: public.user_reviews (pre-consolidation) - NEEDS UPDATE'
    ELSE '❌ Neither reviews nor user_reviews table found!'
  END as review_table_status;

-- 2. Check user/profile table name
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') 
      THEN '✅ Using: public.users (post-consolidation)'
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')
      THEN '⚠️ Using: public.profiles (pre-consolidation) - NEEDS UPDATE'
    ELSE '❌ Neither users nor profiles table found!'
  END as user_table_status;

-- 3. Check events table name
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') 
      THEN '✅ Using: public.events (post-consolidation)'
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events')
      THEN '⚠️ Using: public.jambase_events (pre-consolidation) - NEEDS UPDATE'
    ELSE '❌ Neither events nor jambase_events table found!'
  END as events_table_status;

-- 4. Check if required functions exist
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'get_connection_degree'
        AND pg_get_function_arguments(p.oid) = 'user1_id uuid, user2_id uuid'
    ) THEN '✅ get_connection_degree function exists'
    ELSE '❌ get_connection_degree function NOT found - REQUIRED'
  END as connection_degree_function_status;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'get_connection_info'
    ) THEN '✅ get_connection_info function exists'
    ELSE '⚠️ get_connection_info function NOT found - may cause issues'
  END as connection_info_function_status;

-- 5. Check if account_type column exists and its type
SELECT 
  table_name,
  column_name,
  data_type,
  udt_name as enum_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND column_name = 'account_type'
  AND table_name IN ('users', 'profiles', 'reviews', 'user_reviews')
ORDER BY table_name;

-- 6. Summary recommendation
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews')
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events')
    THEN '✅ SAFE TO RUN: All table names match the SQL file'
    ELSE '⚠️ NEEDS UPDATE: Table names do not match - update SQL file before running'
  END as final_recommendation;


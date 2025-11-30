-- ============================================
-- TEST: get_connection_degree_reviews Function
-- ============================================
-- Run this to test the function and see what error occurs

-- Step 1: Check if view exists and is accessible
SELECT 
  'View exists' as check_type,
  COUNT(*) as row_count
FROM public.reviews_with_connection_degree
LIMIT 1;

-- Step 2: Check if required functions exist
SELECT 
  'get_connection_degree exists' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'get_connection_degree'
    ) THEN 'YES'
    ELSE 'NO - REQUIRED'
  END as status;

SELECT 
  'get_connection_info exists' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'get_connection_info'
    ) THEN 'YES'
    ELSE 'NO - OPTIONAL'
  END as status;

SELECT 
  'is_event_relevant_to_user exists' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'is_event_relevant_to_user'
    ) THEN 'YES'
    ELSE 'NO - REQUIRED'
  END as status;

-- Step 3: Test the function with a real user_id
-- Replace 'YOUR_USER_ID_HERE' with an actual user_id from your database
-- First, get a user_id to test with:
SELECT 
  'Test user_id' as info,
  user_id,
  name
FROM public.users
LIMIT 1;

-- Step 4: Test the function (uncomment and replace user_id)
/*
DO $$
DECLARE
  test_user_id UUID;
  test_result RECORD;
BEGIN
  -- Get a test user_id
  SELECT user_id INTO test_user_id FROM public.users LIMIT 1;
  
  IF test_user_id IS NULL THEN
    RAISE NOTICE 'No users found in database';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing with user_id: %', test_user_id;
  
  -- Try to call the function
  BEGIN
    SELECT * INTO test_result
    FROM public.get_connection_degree_reviews(test_user_id, 5, 0)
    LIMIT 1;
    
    RAISE NOTICE '✅ Function executed successfully!';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ Function error: %', SQLERRM;
      RAISE NOTICE 'Error details: %', SQLSTATE;
  END;
END $$;
*/

-- Step 5: Check view columns match function return type
SELECT 
  'Column check' as check_type,
  column_name,
  data_type,
  CASE 
    WHEN column_name = 'reviewer_account_type' AND data_type = 'text' THEN '✅ Correct'
    WHEN column_name = 'photos' AND data_type = 'text[]' THEN '✅ Correct (will be converted to JSONB)'
    ELSE 'Check'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reviews_with_connection_degree'
  AND column_name IN ('reviewer_account_type', 'photos')
ORDER BY column_name;


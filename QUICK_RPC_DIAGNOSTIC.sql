-- ============================================
-- QUICK DIAGNOSTIC: Find the exact error
-- ============================================
-- This will help identify what's failing

-- 1. Check if view exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'reviews_with_connection_degree'
    ) THEN '✅ View exists'
    ELSE '❌ View MISSING - Run FIX_ACCOUNT_TYPE_TYPE_MISMATCH.sql first'
  END as view_status;

-- 2. Check if all required functions exist
SELECT 
  proname as function_name,
  CASE 
    WHEN proname = 'get_connection_degree' THEN 'REQUIRED'
    WHEN proname = 'get_connection_info' THEN 'REQUIRED (for labels)'
    WHEN proname = 'is_event_relevant_to_user' THEN 'REQUIRED (for 3rd degree)'
    ELSE 'OTHER'
  END as importance
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND proname IN ('get_connection_degree', 'get_connection_info', 'is_event_relevant_to_user')
ORDER BY proname;

-- 3. Try to query the view directly (this will show if view works)
SELECT 
  'View query test' as test,
  COUNT(*) as review_count
FROM public.reviews_with_connection_degree
LIMIT 1;

-- 4. Check if there are any reviews in the view
SELECT 
  'Reviews in view' as info,
  COUNT(*) as total_reviews,
  COUNT(DISTINCT reviewer_id) as unique_reviewers
FROM public.reviews_with_connection_degree;

-- 5. Test the function with error handling
-- Replace 'YOUR_USER_ID' with an actual user_id
DO $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  -- Get first user_id
  SELECT user_id INTO v_user_id FROM public.users LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No users found';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing function with user_id: %', v_user_id;
  
  -- Try to call function
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.get_connection_degree_reviews(v_user_id, 1, 0);
    
    RAISE NOTICE '✅ Function works! Returned % rows', v_count;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ Function error: %', SQLERRM;
      RAISE NOTICE 'Error code: %', SQLSTATE;
  END;
END $$;


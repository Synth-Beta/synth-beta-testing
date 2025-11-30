-- ============================================
-- SIMPLE TEST: Isolate the 400 error
-- ============================================
-- This will help identify exactly what's failing

-- Test 1: Can we query the view directly?
SELECT 
  'View query test' as test_name,
  COUNT(*) as result
FROM public.reviews_with_connection_degree;

-- Test 2: Does the view return photos correctly?
SELECT 
  'Photos type test' as test_name,
  review_id,
  pg_typeof(photos) as photos_type,
  array_length(photos, 1) as photos_count,
  photos IS NULL as is_null
FROM public.reviews_with_connection_degree
LIMIT 1;

-- Test 3: Test the conversion function
SELECT 
  'Conversion test' as test_name,
  CASE 
    WHEN photos IS NULL THEN NULL::JSONB
    WHEN array_length(photos, 1) IS NULL THEN '[]'::JSONB
    ELSE to_jsonb(photos)::JSONB
  END as converted_photos,
  pg_typeof(
    CASE 
      WHEN photos IS NULL THEN NULL::JSONB
      WHEN array_length(photos, 1) IS NULL THEN '[]'::JSONB
      ELSE to_jsonb(photos)::JSONB
    END
  ) as converted_type
FROM public.reviews_with_connection_degree
WHERE photos IS NOT NULL
LIMIT 1;

-- Test 4: Try calling the function with error details
-- Replace with your actual user_id
DO $$
DECLARE
  v_user_id UUID;
  v_error_text TEXT;
BEGIN
  -- Get a test user_id
  SELECT user_id INTO v_user_id FROM public.users LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No users found';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing function with user_id: %', v_user_id;
  
  BEGIN
    -- Try to execute the function
    PERFORM * FROM public.get_connection_degree_reviews(v_user_id, 1, 0);
    RAISE NOTICE '✅ Function executed successfully';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_text = MESSAGE_TEXT;
      RAISE NOTICE '❌ Function error: %', v_error_text;
      RAISE NOTICE 'SQLSTATE: %', SQLSTATE;
      RAISE NOTICE 'SQLERRM: %', SQLERRM;
  END;
END $$;


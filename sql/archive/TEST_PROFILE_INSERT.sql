-- Test if we can manually insert a profile with the same structure the trigger uses
-- This will help us see the actual error message

-- First, let's try to insert a test profile manually
-- Replace 'test-user-id' with a real UUID if you want to test with an existing user

DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_email TEXT := 'test@example.com';
  test_name TEXT := 'Test User';
BEGIN
  -- Try to insert a profile with the same fields as the trigger
  INSERT INTO public.profiles (
    user_id, 
    name, 
    bio,
    onboarding_completed,
    onboarding_skipped,
    tour_completed,
    moderation_status
  )
  VALUES (
    test_user_id,
    test_name,
    'Music lover looking to connect at events!',
    false,
    false,
    false,
    'good_standing'
  );
  
  RAISE NOTICE 'Successfully inserted test profile for user %', test_user_id;
  
  -- Clean up the test profile
  DELETE FROM public.profiles WHERE user_id = test_user_id;
  RAISE NOTICE 'Cleaned up test profile';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error inserting profile: % - %', SQLERRM, SQLSTATE;
    ROLLBACK;
END $$;


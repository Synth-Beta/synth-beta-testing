-- Fix the handle_new_user() trigger to include onboarding fields
-- This function runs automatically when a new user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    'Music lover looking to connect at events!',
    false,
    false,
    false,
    'good_standing'
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user signup
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Verify the function was updated
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'handle_new_user';


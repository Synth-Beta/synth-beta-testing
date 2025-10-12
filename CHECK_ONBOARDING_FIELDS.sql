-- Check if onboarding fields exist in profiles table
-- Run this in Supabase SQL Editor to verify if migrations have been applied

SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('onboarding_completed', 'onboarding_skipped', 'tour_completed', 'location_city')
ORDER BY column_name;

-- If this returns 0 rows, the migrations haven't been applied yet
-- If it returns 4 rows, the migrations have been applied


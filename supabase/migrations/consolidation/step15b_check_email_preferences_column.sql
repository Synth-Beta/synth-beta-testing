-- ============================================
-- STEP 15B: CHECK email_preferences COLUMN
-- ============================================
-- Check if user_preferences.email_preferences JSONB column exists

SELECT 
  'Column Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'email_preferences'
      AND data_type = 'jsonb'
  ) as email_preferences_column_exists,
  (SELECT COUNT(*) FROM public.email_preferences) as email_preferences_table_count,
  (SELECT COUNT(*) FROM public.user_preferences) as user_preferences_count;

-- Show structure of email_preferences table
SELECT 
  'email_preferences Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'email_preferences'
ORDER BY ordinal_position;


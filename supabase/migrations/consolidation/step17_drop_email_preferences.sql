-- ============================================
-- STEP 17: DROP email_preferences TABLE
-- ============================================
-- Drop email_preferences table after migration to user_preferences.email_preferences

DO $$
DECLARE
  email_prefs_count BIGINT;
  migrated_count BIGINT;
BEGIN
  RAISE NOTICE '=== DROP email_preferences TABLE ===';
  RAISE NOTICE '';
  
  SELECT COUNT(*) INTO email_prefs_count FROM public.email_preferences;
  SELECT COUNT(*) INTO migrated_count 
  FROM public.user_preferences 
  WHERE email_preferences IS NOT NULL 
    AND (email_preferences ? 'enable_event_reminders' 
         OR email_preferences->>'migrated_from_table' = 'true');
  
  RAISE NOTICE 'Before dropping:';
  RAISE NOTICE '  email_preferences rows: %', email_prefs_count;
  RAISE NOTICE '  migrated to user_preferences.email_preferences: %', migrated_count;
  RAISE NOTICE '';
  
  IF migrated_count >= email_prefs_count THEN
    RAISE NOTICE '✅ All % preferences migrated - Dropping email_preferences...', email_prefs_count;
    DROP TABLE IF EXISTS public.email_preferences CASCADE;
    RAISE NOTICE '✅ email_preferences dropped';
  ELSE
    RAISE NOTICE '⚠️ WARNING: Only %/% preferences migrated - NOT dropping', 
      migrated_count, email_prefs_count;
  END IF;
END $$;

-- Verification
SELECT 
  'Dropped Table Verification' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'email_preferences'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as email_preferences_status;


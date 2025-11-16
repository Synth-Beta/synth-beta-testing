-- ============================================
-- STEP 16: MIGRATE email_preferences
-- ============================================
-- Migrate email_preferences to user_preferences.email_preferences JSONB

-- First, ensure the column exists
DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'email_preferences'
  ) THEN
    RAISE NOTICE 'Creating user_preferences.email_preferences JSONB column...';
    ALTER TABLE public.user_preferences 
    ADD COLUMN IF NOT EXISTS email_preferences JSONB DEFAULT '{}';
    
    RAISE NOTICE '✅ Column created';
  ELSE
    RAISE NOTICE '✅ Column already exists';
  END IF;
END $$;

-- Migrate data
DO $$
DECLARE
  email_prefs_count BIGINT;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO email_prefs_count FROM public.email_preferences;
  
  RAISE NOTICE '=== MIGRATE email_preferences ===';
  RAISE NOTICE 'Source rows: %', email_prefs_count;
  RAISE NOTICE '';
  
  -- Migrate email_preferences to user_preferences.email_preferences JSONB
  UPDATE public.user_preferences up
  SET 
    email_preferences = COALESCE(up.email_preferences, '{}'::JSONB) || jsonb_build_object(
      'enable_auth_emails', ep.enable_auth_emails,
      'enable_event_reminders', ep.enable_event_reminders,
      'enable_match_notifications', ep.enable_match_notifications,
      'enable_review_notifications', ep.enable_review_notifications,
      'enable_weekly_digest', ep.enable_weekly_digest,
      'weekly_digest_day', ep.weekly_digest_day,
      'event_reminder_days', ep.event_reminder_days,
      'migrated_from_table', true,
      'migrated_at', NOW()
    )
  FROM public.email_preferences ep
  WHERE up.user_id = ep.user_id
    AND (up.email_preferences IS NULL 
         OR NOT (up.email_preferences ? 'enable_event_reminders'));
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  
  RAISE NOTICE 'Migrated % email preferences to user_preferences.email_preferences', migrated_count;
  
  IF migrated_count >= email_prefs_count THEN
    RAISE NOTICE '✅ All preferences migrated - Safe to drop email_preferences table';
  ELSE
    RAISE NOTICE '⚠️ Only %/% preferences migrated', migrated_count, email_prefs_count;
  END IF;
END $$;

-- Verification
SELECT 
  'Migration Verification' as check_type,
  (SELECT COUNT(*) FROM public.email_preferences) as source_count,
  (SELECT COUNT(*) FROM public.user_preferences 
   WHERE email_preferences IS NOT NULL 
     AND (email_preferences ? 'enable_event_reminders' 
          OR email_preferences->>'migrated_from_table' = 'true')) as migrated_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.email_preferences) = 0 THEN 'READY TO DROP ✅'
    WHEN (SELECT COUNT(*) FROM public.user_preferences 
          WHERE email_preferences IS NOT NULL 
            AND (email_preferences ? 'enable_event_reminders' 
                 OR email_preferences->>'migrated_from_table' = 'true')) >= 
         (SELECT COUNT(*) FROM public.email_preferences) THEN 'READY TO DROP ✅'
    ELSE 'NEEDS MIGRATION ⚠️'
  END as status;


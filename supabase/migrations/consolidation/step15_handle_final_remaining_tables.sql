-- ============================================
-- STEP 15: HANDLE FINAL REMAINING TABLES
-- ============================================
-- Handle the last 3 remaining tables:
-- 1. email_preferences (8 rows) - Migrate to user_preferences.email_preferences
-- 2. email_gate_entries (5 rows) - Review purpose
-- 3. consolidation_data_stash (120 rows) - Temporary migration table

DO $$
DECLARE
  email_preferences_count BIGINT;
  email_gate_entries_count BIGINT;
  consolidation_stash_count BIGINT;
  user_prefs_has_email_prefs BOOLEAN;
  migrated_count INTEGER;
BEGIN
  RAISE NOTICE '=== HANDLE FINAL REMAINING TABLES ===';
  RAISE NOTICE '';
  
  -- Get counts
  SELECT COUNT(*) INTO email_preferences_count FROM public.email_preferences;
  SELECT COUNT(*) INTO email_gate_entries_count FROM public.email_gate_entries;
  SELECT COUNT(*) INTO consolidation_stash_count FROM public.consolidation_data_stash;
  
  RAISE NOTICE 'Current table row counts:';
  RAISE NOTICE '  email_preferences: % rows', email_preferences_count;
  RAISE NOTICE '  email_gate_entries: % rows', email_gate_entries_count;
  RAISE NOTICE '  consolidation_data_stash: % rows', consolidation_stash_count;
  RAISE NOTICE '';
  
  -- ============================================
  -- 1. CHECK email_preferences → user_preferences.email_preferences
  -- ============================================
  RAISE NOTICE 'Step 1: Check email_preferences migration...';
  
  -- Check if user_preferences has email_preferences JSONB column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'email_preferences'
      AND data_type = 'jsonb'
  ) INTO user_prefs_has_email_prefs;
  
  IF user_prefs_has_email_prefs THEN
    RAISE NOTICE '  ✅ user_preferences.email_preferences JSONB column exists';
    RAISE NOTICE '  Action: Migrate email_preferences data to user_preferences.email_preferences';
    
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
      AND (up.email_preferences IS NULL OR NOT (up.email_preferences ? 'enable_event_reminders'));
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    RAISE NOTICE '  Migrated % email preferences to user_preferences.email_preferences', migrated_count;
  ELSE
    RAISE NOTICE '  ⚠️ user_preferences.email_preferences JSONB column does NOT exist';
    RAISE NOTICE '  Action: Need to add email_preferences JSONB column first';
    RAISE NOTICE '  Recommendation: Keep email_preferences table for now or add column';
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================
  -- 2. REVIEW email_gate_entries
  -- ============================================
  RAISE NOTICE 'Step 2: Review email_gate_entries...';
  RAISE NOTICE '  Purpose: Track email gate entries (users entering email to access content)';
  RAISE NOTICE '  Recommendation: Could be migrated to interactions table or kept as feature table';
  RAISE NOTICE '  Action: Review purpose - if tracking user interaction, migrate to interactions';
  RAISE NOTICE '          If feature-specific (email gate workflow), keep as separate table';
  
  RAISE NOTICE '';
  
  -- ============================================
  -- 3. REVIEW consolidation_data_stash
  -- ============================================
  RAISE NOTICE 'Step 3: Review consolidation_data_stash...';
  RAISE NOTICE '  Purpose: Temporary migration table to stash orphaned data during consolidation';
  RAISE NOTICE '  Row count: %', consolidation_stash_count;
  RAISE NOTICE '  Recommendation: Review stashed data, then drop if no longer needed';
  RAISE NOTICE '  Action: This is safe to drop after reviewing stashed data';
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'email_preferences: %', 
    CASE 
      WHEN user_prefs_has_email_prefs AND migrated_count > 0 THEN 'Migrated - Safe to drop ✅'
      WHEN user_prefs_has_email_prefs THEN 'Can be dropped (column exists)'
      ELSE 'Review needed - column missing ⚠️'
    END;
  RAISE NOTICE 'email_gate_entries: Needs review - Could go to interactions or stay as feature table';
  RAISE NOTICE 'consolidation_data_stash: Safe to drop after reviewing stashed data ✅';
END $$;

-- Show sample data from each table
SELECT 
  'email_preferences Sample' as check_type,
  ep.user_id,
  ep.enable_event_reminders,
  ep.enable_match_notifications,
  ep.enable_weekly_digest
FROM public.email_preferences ep
LIMIT 5;

SELECT 
  'email_gate_entries Sample' as check_type,
  ege.*
FROM public.email_gate_entries ege
LIMIT 5;

SELECT 
  'consolidation_data_stash Sample' as check_type,
  cds.stash_type,
  cds.source_table,
  cds.reason
FROM public.consolidation_data_stash cds
LIMIT 5;


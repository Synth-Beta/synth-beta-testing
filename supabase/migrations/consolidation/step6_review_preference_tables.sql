-- ============================================
-- STEP 6: REVIEW PREFERENCE-RELATED TABLES
-- ============================================
-- This script checks preference tables and determines if they should be
-- consolidated into user_preferences

-- ============================================
-- PART A: CHECK email_preferences
-- ============================================
-- Check if user_preferences has email_preferences JSONB column

DO $$
DECLARE
  email_preferences_count INTEGER := 0;
  user_preferences_with_email INTEGER := 0;
  has_email_prefs_column BOOLEAN := false;
BEGIN
  -- Check if email_preferences table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'email_preferences'
  ) THEN
    SELECT COUNT(*) INTO email_preferences_count FROM public.email_preferences;
  END IF;
  
  -- Check if user_preferences has email_preferences JSONB column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'email_preferences'
      AND data_type = 'jsonb'
  ) INTO has_email_prefs_column;
  
  IF has_email_prefs_column THEN
    SELECT COUNT(*) INTO user_preferences_with_email 
    FROM public.user_preferences 
    WHERE email_preferences IS NOT NULL AND email_preferences != '{}'::jsonb;
  END IF;
  
  RAISE NOTICE '=== Email Preferences Check ===';
  RAISE NOTICE 'email_preferences table: % rows', email_preferences_count;
  RAISE NOTICE 'user_preferences.email_preferences column exists: %', has_email_prefs_column;
  RAISE NOTICE 'user_preferences with email_preferences: % rows', user_preferences_with_email;
  
  IF email_preferences_count = 0 AND has_email_prefs_column AND user_preferences_with_email > 0 THEN
    RAISE NOTICE '✅ email_preferences is redundant (user_preferences table has email_preferences column), safe to drop.';
  ELSIF email_preferences_count > 0 THEN
    RAISE NOTICE '⚠️  email_preferences has data. Check if it should be migrated to user_preferences.email_preferences JSONB.';
  END IF;
END $$;

-- ============================================
-- PART B: CHECK user_music_tags
-- ============================================
-- Check if user_genre_preferences or user_preferences covers this

DO $$
DECLARE
  user_music_tags_count INTEGER := 0;
  user_genre_prefs_count INTEGER := 0;
  user_prefs_music_count INTEGER := 0;
  has_music_prefs_column BOOLEAN := false;
BEGIN
  -- Check if user_music_tags table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_music_tags'
  ) THEN
    SELECT COUNT(*) INTO user_music_tags_count FROM public.user_music_tags;
  END IF;
  
  -- Check user_genre_preferences count
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_genre_preferences'
  ) THEN
    SELECT COUNT(*) INTO user_genre_prefs_count FROM public.user_genre_preferences;
  END IF;
  
  -- Check if user_preferences has music_preference_signals JSONB column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'music_preference_signals'
      AND data_type = 'jsonb'
  ) INTO has_music_prefs_column;
  
  IF has_music_prefs_column THEN
    SELECT COUNT(*) INTO user_prefs_music_count 
    FROM public.user_preferences 
    WHERE music_preference_signals IS NOT NULL AND music_preference_signals != '{}'::jsonb;
  END IF;
  
  RAISE NOTICE '=== User Music Tags Check ===';
  RAISE NOTICE 'user_music_tags table: % rows', user_music_tags_count;
  RAISE NOTICE 'user_genre_preferences table: % rows', user_genre_prefs_count;
  RAISE NOTICE 'user_preferences.music_preference_signals column exists: %', has_music_prefs_column;
  RAISE NOTICE 'user_preferences with music_preference_signals: % rows', user_prefs_music_count;
  
  IF user_music_tags_count > 0 THEN
    RAISE NOTICE '⚠️  user_music_tags has data. Check if it overlaps with user_genre_preferences or user_preferences.music_preference_signals.';
    RAISE NOTICE '   Consider consolidating if there is overlap.';
  ELSE
    RAISE NOTICE '✅ user_music_tags is empty, safe to drop.';
  END IF;
END $$;

-- ============================================
-- SUMMARY QUERY
-- ============================================
SELECT 
  'Preference Tables Check' as check_type,
  table_name,
  CASE 
    WHEN table_name = 'email_preferences' THEN 
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_preferences' 
            AND column_name = 'email_preferences' AND data_type = 'jsonb'
        ) THEN 'May be redundant with user_preferences.email_preferences JSONB'
        ELSE 'Review structure'
      END
    WHEN table_name = 'user_music_tags' THEN 'Check overlap with user_genre_preferences or user_preferences.music_preference_signals'
    ELSE 'Review needed'
  END as recommendation,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = table_name
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END as status
FROM (
  SELECT 'email_preferences' as table_name
  UNION ALL SELECT 'user_music_tags'
) t;


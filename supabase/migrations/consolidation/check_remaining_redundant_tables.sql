-- ============================================
-- CHECK REMAINING REDUNDANT TABLES
-- ============================================
-- Check genre and preference tables that still need to be handled

-- ============================================
-- PART A: CHECK GENRE TABLES
-- ============================================

-- Check event_genres
SELECT 
  'Genre Tables Check' as check_type,
  'event_genres' as table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_genres'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.event_genres
    )
    ELSE 'DOES NOT EXIST'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'genres'
  ) as events_has_genres_column,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_genres'
    ) THEN 'DOES NOT EXIST'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_genres'
    ) AND (
      SELECT COUNT(*) FROM public.event_genres
    ) = 0 THEN 'EMPTY - Safe to drop'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'events' 
        AND column_name = 'genres'
    ) THEN 'HAS DATA - Needs migration to events.genres array'
    ELSE 'REVIEW - events.genres column does not exist'
  END as recommendation;

-- Check artist_genre_mapping
SELECT 
  'Genre Tables Check' as check_type,
  'artist_genre_mapping' as table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.artist_genre_mapping
    )
    ELSE 'DOES NOT EXIST'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'artists' 
      AND column_name = 'genres'
  ) as artists_has_genres_column,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
    ) THEN 'DOES NOT EXIST'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
    ) AND (
      SELECT COUNT(*) FROM public.artist_genre_mapping
    ) = 0 THEN 'EMPTY - Safe to drop'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'artists' 
        AND column_name = 'genres'
    ) THEN 'HAS DATA - Needs migration to artists.genres array'
    ELSE 'REVIEW - artists.genres column does not exist'
  END as recommendation;

-- Check artist_genres
SELECT 
  'Genre Tables Check' as check_type,
  'artist_genres' as table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genres'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.artist_genres
    )
    ELSE 'DOES NOT EXIST'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'artist_genres' 
      AND column_name = 'artist_id'
  ) as has_artist_id,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genres'
    ) THEN 'DOES NOT EXIST'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genres'
    ) AND (
      SELECT COUNT(*) FROM public.artist_genres
    ) = 0 THEN 'EMPTY - Safe to drop'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'artist_genres' 
        AND column_name = 'artist_id'
    ) THEN 'HAS DATA - Mapping table, needs migration'
    ELSE 'REVIEW - Might be reference table'
  END as recommendation;

-- ============================================
-- PART B: CHECK PREFERENCE TABLES
-- ============================================

-- Check email_preferences
SELECT 
  'Preference Tables Check' as check_type,
  'email_preferences' as table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'email_preferences'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.email_preferences
    )
    ELSE 'DOES NOT EXIST'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'user_preferences' 
      AND column_name = 'email_preferences'
      AND data_type = 'jsonb'
  ) as user_prefs_has_email_column,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'email_preferences'
    ) THEN 'DOES NOT EXIST'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'email_preferences'
    ) AND (
      SELECT COUNT(*) FROM public.email_preferences
    ) = 0 THEN 'EMPTY - Safe to drop'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'user_preferences' 
        AND column_name = 'email_preferences'
        AND data_type = 'jsonb'
    ) THEN 'HAS DATA - Needs migration to user_preferences.email_preferences JSONB'
    ELSE 'REVIEW - user_preferences.email_preferences column does not exist'
  END as recommendation;

-- Check user_music_tags
DO $$
DECLARE
  table_exists BOOLEAN;
  row_count_var BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_music_tags'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.user_music_tags' INTO row_count_var;
  ELSE
    row_count_var := 0;
  END IF;
  
  RAISE NOTICE '=== user_music_tags Check ===';
  RAISE NOTICE 'Table exists: %', table_exists;
  IF table_exists THEN
    RAISE NOTICE 'Row count: %', row_count_var;
  END IF;
  IF NOT table_exists THEN
    RAISE NOTICE 'Status: DOES NOT EXIST - Already dropped ✅';
  ELSIF row_count_var = 0 THEN
    RAISE NOTICE 'Status: EMPTY - Safe to drop';
  ELSE
    RAISE NOTICE 'Status: HAS DATA - Review overlap with user_genre_preferences';
  END IF;
END $$;

SELECT 
  'Preference Tables Check' as check_type,
  'user_music_tags' as table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_music_tags'
    ) THEN 'EXISTS'
    ELSE 'DOES NOT EXIST'
  END as table_status,
  (
    SELECT COUNT(*)::TEXT 
    FROM public.user_genre_preferences
  ) as user_genre_prefs_count,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_music_tags'
    ) THEN 'DOES NOT EXIST - Already dropped ✅'
    ELSE 'Review needed'
  END as recommendation;


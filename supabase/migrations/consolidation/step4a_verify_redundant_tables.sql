-- ============================================
-- STEP 4A: VERIFY REDUNDANT TABLES
-- ============================================
-- This script checks each potentially redundant table to determine:
-- 1. Does it exist?
-- 2. Does it have data?
-- 3. Does the target location exist?
-- 4. Can it be safely dropped or does it need migration?

-- ============================================
-- PART A: CHECK GENRE TABLES
-- ============================================

-- Check event_genres
SELECT 
  'event_genres Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_genres'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_genres'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.event_genres
    )
    ELSE '0'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'genres'
  ) as events_has_genres_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'events' 
        AND column_name = 'genres'
    ) THEN (
      SELECT COUNT(*)::TEXT 
      FROM public.events 
      WHERE genres IS NOT NULL AND array_length(genres, 1) > 0
    )
    ELSE '0'
  END as events_with_genres,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_genres'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_genres'
    ) AND (
      SELECT COUNT(*) FROM public.event_genres
    ) = 0 THEN 'DROP - Empty, redundant with events.genres'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'events' 
        AND column_name = 'genres'
    ) THEN 'MIGRATE - Has data, migrate to events.genres array'
    ELSE 'REVIEW - events.genres column does not exist'
  END as action;

-- Check artist_genre_mapping
SELECT 
  'artist_genre_mapping Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.artist_genre_mapping
    )
    ELSE '0'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'artists' 
      AND column_name = 'genres'
  ) as artists_has_genres_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'artists' 
        AND column_name = 'genres'
    ) THEN (
      SELECT COUNT(*)::TEXT 
      FROM public.artists 
      WHERE genres IS NOT NULL AND array_length(genres, 1) > 0
    )
    ELSE '0'
  END as artists_with_genres,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
    ) AND (
      SELECT COUNT(*) FROM public.artist_genre_mapping
    ) = 0 THEN 'DROP - Empty, redundant with artists.genres'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'artists' 
        AND column_name = 'genres'
    ) THEN 'MIGRATE - Has data, migrate to artists.genres array'
    ELSE 'REVIEW - artists.genres column does not exist'
  END as action;

-- Check artist_genres (might be reference table)
SELECT 
  'artist_genres Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genres'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genres'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.artist_genres
    )
    ELSE '0'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'artist_genres' 
      AND column_name = 'artist_id'
  ) as has_artist_id_column,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genres'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'artist_genres' 
        AND column_name = 'artist_id'
    ) THEN 'MIGRATE - Mapping table, migrate to artists.genres'
    ELSE 'REVIEW - Might be reference/lookup table, check structure'
  END as action;

-- ============================================
-- PART B: CHECK REVIEW MEDIA/TAGS TABLES
-- ============================================

-- Check review_photos
SELECT 
  'review_photos Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_photos'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_photos'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.review_photos
    )
    ELSE '0'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'photos'
  ) as reviews_has_photos_column,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_photos'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_photos'
    ) AND (
      SELECT COUNT(*) FROM public.review_photos
    ) = 0 THEN 'DROP - Empty, redundant with reviews.photos'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'reviews' 
        AND column_name = 'photos'
    ) THEN 'MIGRATE - Has data, migrate to reviews.photos array'
    ELSE 'REVIEW - reviews.photos column does not exist'
  END as action;

-- Check review_videos
SELECT 
  'review_videos Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_videos'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_videos'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.review_videos
    )
    ELSE '0'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'videos'
  ) as reviews_has_videos_column,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_videos'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_videos'
    ) AND (
      SELECT COUNT(*) FROM public.review_videos
    ) = 0 THEN 'DROP - Empty, redundant with reviews.videos'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'reviews' 
        AND column_name = 'videos'
    ) THEN 'MIGRATE - Has data, migrate to reviews.videos array'
    ELSE 'REVIEW - reviews.videos column does not exist'
  END as action;

-- Check review_tags
SELECT 
  'review_tags Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_tags'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_tags'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.review_tags
    )
    ELSE '0'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND (column_name = 'mood_tags' OR column_name = 'genre_tags' OR column_name = 'context_tags')
  ) as reviews_has_tag_columns,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_tags'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_tags'
    ) AND (
      SELECT COUNT(*) FROM public.review_tags
    ) = 0 THEN 'DROP - Empty, redundant with reviews tag arrays'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'reviews' 
        AND (column_name = 'mood_tags' OR column_name = 'genre_tags' OR column_name = 'context_tags')
    ) THEN 'MIGRATE - Has data, migrate to reviews tag arrays'
    ELSE 'REVIEW - reviews tag columns do not exist'
  END as action;

-- ============================================
-- PART C: CHECK RELATIONSHIP/TRACKING TABLES
-- ============================================

-- Check event_interests
SELECT 
  'event_interests Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_interests'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_interests'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.event_interests
    )
    ELSE '0'
  END as row_count,
  (
    SELECT COUNT(*)::TEXT 
    FROM public.relationships 
    WHERE related_entity_type = 'event'
  ) as relationships_event_count,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_interests'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_interests'
    ) AND (
      SELECT COUNT(*) FROM public.event_interests
    ) = 0 THEN 'DROP - Empty, should be in relationships table'
    ELSE 'MIGRATE - Has data, migrate to relationships table'
  END as action;

-- Check event_promotions
SELECT 
  'event_promotions Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_promotions'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_promotions'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.event_promotions
    )
    ELSE '0'
  END as row_count,
  (
    SELECT COUNT(*)::TEXT 
    FROM public.monetization_tracking 
    WHERE transaction_type = 'event_promotion'
  ) as monetization_promotion_count,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_promotions'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_promotions'
    ) AND (
      SELECT COUNT(*) FROM public.event_promotions
    ) = 0 THEN 'DROP - Empty, should be in monetization_tracking'
    ELSE 'MIGRATE - Has data, migrate to monetization_tracking'
  END as action;

-- ============================================
-- PART D: CHECK PREFERENCE TABLES
-- ============================================

-- Check email_preferences
SELECT 
  'email_preferences Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'email_preferences'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'email_preferences'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.email_preferences
    )
    ELSE '0'
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
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'email_preferences'
    ) AND (
      SELECT COUNT(*) FROM public.email_preferences
    ) = 0 THEN 'DROP - Empty, should be in user_preferences'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'user_preferences' 
        AND column_name = 'email_preferences'
        AND data_type = 'jsonb'
    ) THEN 'MIGRATE - Has data, migrate to user_preferences.email_preferences JSONB'
    ELSE 'REVIEW - user_preferences.email_preferences column does not exist'
  END as action;

-- Check user_music_tags
SELECT 
  'user_music_tags Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_music_tags'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_music_tags'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.user_music_tags
    )
    ELSE '0'
  END as row_count,
  (
    SELECT COUNT(*)::TEXT 
    FROM public.user_genre_preferences
  ) as user_genre_prefs_count,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_music_tags'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_music_tags'
    ) AND (
      SELECT COUNT(*) FROM public.user_music_tags
    ) = 0 THEN 'DROP - Empty, may overlap with user_genre_preferences'
    ELSE 'REVIEW - Has data, check if overlaps with user_genre_preferences or user_preferences.music_preference_signals'
  END as action;

-- ============================================
-- PART E: CHECK MISCELLANEOUS TABLES
-- ============================================

-- Check event_ticket_urls
SELECT 
  'event_ticket_urls Check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
  ) as table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
    ) THEN (
      SELECT COUNT(*)::TEXT FROM public.event_ticket_urls
    )
    ELSE '0'
  END as row_count,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_tickets'
  ) as event_tickets_exists,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
    ) THEN 'DROP - Does not exist'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
    ) AND (
      SELECT COUNT(*) FROM public.event_ticket_urls
    ) = 0 THEN 'DROP - Empty'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_tickets'
    ) THEN 'REVIEW - May overlap with event_tickets table, check structure'
    ELSE 'REVIEW - Check structure and purpose'
  END as action;


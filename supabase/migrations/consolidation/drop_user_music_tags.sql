-- ============================================
-- DROP user_music_tags TABLE
-- ============================================
-- Only run this AFTER verifying the migration was successful
-- All data has been migrated to user_genre_preferences

-- ============================================
-- VERIFICATION BEFORE DROP
-- ============================================
-- Check if all tags were migrated
SELECT 
  'Pre-Drop Verification' as check_type,
  (SELECT COUNT(*) FROM public.user_music_tags) as remaining_tags,
  (
    SELECT COUNT(*) 
    FROM public.user_music_tags umt
    WHERE umt.tag_type = 'genre'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_genre_preferences ugp
        WHERE ugp.user_id = umt.user_id
          AND ugp.genre = umt.tag_value
          AND ugp.interaction_type = CASE 
            WHEN umt.tag_source = 'manual' THEN 'manual_preference'
            ELSE 'genre_exposure'
          END
          AND ugp.metadata->>'source_table' = 'user_music_tags'
      )
  ) as unmigrated_genre_tags,
  (
    SELECT COUNT(*) 
    FROM public.user_music_tags umt
    WHERE umt.tag_type = 'artist'
      AND EXISTS (
        SELECT 1 FROM public.artists a 
        WHERE LOWER(a.name) = LOWER(umt.tag_value)
          AND a.genres IS NOT NULL
          AND array_length(a.genres, 1) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_genre_preferences ugp
        WHERE ugp.user_id = umt.user_id
          AND ugp.source_entity_type = 'artist'
          AND ugp.metadata->>'source_table' = 'user_music_tags'
          AND ugp.metadata->>'tag_id' = umt.id::TEXT
      )
  ) as unmigrated_artist_tags,
  CASE 
    WHEN (
      SELECT COUNT(*) 
      FROM public.user_music_tags umt
      WHERE umt.tag_type = 'genre'
        AND NOT EXISTS (
          SELECT 1 FROM public.user_genre_preferences ugp
          WHERE ugp.user_id = umt.user_id
            AND ugp.genre = umt.tag_value
            AND ugp.interaction_type = CASE 
              WHEN umt.tag_source = 'manual' THEN 'manual_preference'
              ELSE 'genre_exposure'
            END
            AND ugp.metadata->>'source_table' = 'user_music_tags'
        )
    ) = 0 
    AND (
      SELECT COUNT(*) 
      FROM public.user_music_tags umt
      WHERE umt.tag_type = 'artist'
        AND EXISTS (
          SELECT 1 FROM public.artists a 
          WHERE LOWER(a.name) = LOWER(umt.tag_value)
            AND a.genres IS NOT NULL
            AND array_length(a.genres, 1) > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.user_genre_preferences ugp
          WHERE ugp.user_id = umt.user_id
            AND ugp.source_entity_type = 'artist'
            AND ugp.metadata->>'source_table' = 'user_music_tags'
            AND ugp.metadata->>'tag_id' = umt.id::TEXT
        )
    ) = 0
    THEN 'SAFE TO DROP - All tags migrated'
    ELSE 'WARNING - Some tags not migrated, review before dropping'
  END as status;

-- ============================================
-- DROP TABLE
-- ============================================
-- Only run if verification shows all tags migrated
DROP TABLE IF EXISTS public.user_music_tags CASCADE;

-- ============================================
-- POST-DROP VERIFICATION
-- ============================================
SELECT 
  'Post-Drop Verification' as check_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_music_tags'
    ) THEN '✅ user_music_tags DROPPED SUCCESSFULLY'
    ELSE '⚠️  user_music_tags STILL EXISTS'
  END as status;


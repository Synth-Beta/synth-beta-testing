-- ============================================
-- CONSOLIDATE user_music_tags INTO user_genre_preferences
-- ============================================
-- This script migrates data from user_music_tags to user_genre_preferences
-- user_music_tags: Manual and Spotify-synced preferences (genres and artists)
-- user_genre_preferences: Unified genre preferences from all interaction types

-- ============================================
-- PART A: MIGRATE GENRE TAGS (tag_type='genre')
-- ============================================
DO $$
DECLARE
  genre_tags_count INTEGER;
  migrated_count INTEGER;
BEGIN
  -- Get source count
  SELECT COUNT(*) INTO genre_tags_count 
  FROM public.user_music_tags 
  WHERE tag_type = 'genre';
  
  RAISE NOTICE 'Starting migration of % genre tags from user_music_tags to user_genre_preferences', genre_tags_count;
  
  -- Migrate genre tags
  INSERT INTO public.user_genre_preferences (
    user_id,
    genre,
    subgenre,
    interaction_type,
    source_entity_type,
    source_entity_id,
    source_entity_name,
    preference_score,
    context,
    occurred_at,
    created_at,
    updated_at,
    metadata
  )
  SELECT 
    umt.user_id,
    umt.tag_value as genre,
    NULL as subgenre,
    CASE 
      WHEN umt.tag_source = 'manual' THEN 'manual_preference'
      WHEN umt.tag_source = 'spotify' THEN 'genre_exposure'  -- Spotify-synced genres as exposure
      ELSE 'manual_preference'
    END as interaction_type,
    'manual' as source_entity_type,  -- Tag came from user manual input or Spotify sync
    NULL as source_entity_id,
    umt.tag_value as source_entity_name,
    -- Map weight (1-10) to preference_score, scale to match preference_score range
    (umt.weight::NUMERIC / 1.0) as preference_score,  -- 1-10 weight maps to 1-10 preference_score
    jsonb_build_object(
      'original_table', 'user_music_tags',
      'tag_id', umt.id,
      'tag_source', umt.tag_source,
      'original_weight', umt.weight
    ) as context,
    umt.created_at as occurred_at,
    umt.created_at,
    COALESCE(umt.updated_at, umt.created_at) as updated_at,
    jsonb_build_object(
      'source_table', 'user_music_tags',
      'tag_id', umt.id,
      'tag_source', umt.tag_source
    ) as metadata
  FROM public.user_music_tags umt
  WHERE umt.tag_type = 'genre'
    AND NOT EXISTS (
      -- Skip if already exists (same user, genre, and manual preference)
      SELECT 1 FROM public.user_genre_preferences ugp
      WHERE ugp.user_id = umt.user_id
        AND ugp.genre = umt.tag_value
        AND ugp.interaction_type = CASE 
          WHEN umt.tag_source = 'manual' THEN 'manual_preference'
          WHEN umt.tag_source = 'spotify' THEN 'genre_exposure'
          ELSE 'manual_preference'
        END
        AND ugp.source_entity_type = 'manual'
        AND ugp.metadata->>'source_table' = 'user_music_tags'
        AND ugp.metadata->>'tag_id' = umt.id::TEXT
    )
  ON CONFLICT DO NOTHING;  -- Additional safety (though unique constraint may differ)
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  
  RAISE NOTICE 'Migrated % genre tags to user_genre_preferences', migrated_count;
END $$;

-- ============================================
-- PART B: HANDLE ARTIST TAGS (tag_type='artist')
-- ============================================
-- For artist tags, we should extract genres from the artists table
-- This creates genre preferences based on the artist's genres
DO $$
DECLARE
  artist_tags_count INTEGER;
  migrated_count INTEGER;
BEGIN
  -- Get source count
  SELECT COUNT(*) INTO artist_tags_count 
  FROM public.user_music_tags 
  WHERE tag_type = 'artist';
  
  RAISE NOTICE 'Starting migration of % artist tags from user_music_tags', artist_tags_count;
  RAISE NOTICE 'Extracting genres from artists to create genre preferences';
  
  -- Migrate artist tags by extracting genres from artists
  INSERT INTO public.user_genre_preferences (
    user_id,
    genre,
    subgenre,
    interaction_type,
    source_entity_type,
    source_entity_id,
    source_entity_name,
    preference_score,
    context,
    occurred_at,
    created_at,
    updated_at,
    metadata
  )
  SELECT DISTINCT ON (umt.user_id, genre_value, umt.id)
    umt.user_id,
    genre_value as genre,
    NULL as subgenre,
    CASE 
      WHEN umt.tag_source = 'manual' THEN 'artist_follow'  -- Manual artist preference
      WHEN umt.tag_source = 'spotify' THEN 'artist_follow'  -- Spotify artist follows
      ELSE 'artist_follow'
    END as interaction_type,
    'artist' as source_entity_type,
    a.id as source_entity_id,
    a.name as source_entity_name,
    -- Map weight to preference_score, slightly reduced since it's inferred from artist
    (umt.weight::NUMERIC * 0.8) as preference_score,  -- Reduce by 20% since it's inferred
    jsonb_build_object(
      'original_table', 'user_music_tags',
      'tag_id', umt.id,
      'tag_source', umt.tag_source,
      'original_weight', umt.weight,
      'original_artist_name', umt.tag_value,
      'extracted_from_artist', true
    ) as context,
    umt.created_at as occurred_at,
    umt.created_at,
    COALESCE(umt.updated_at, umt.created_at) as updated_at,
    jsonb_build_object(
      'source_table', 'user_music_tags',
      'tag_id', umt.id,
      'tag_source', umt.tag_source,
      'original_artist_name', umt.tag_value
    ) as metadata
  FROM public.user_music_tags umt
  LEFT JOIN public.artists a ON LOWER(a.name) = LOWER(umt.tag_value)
  CROSS JOIN LATERAL unnest(
    COALESCE(a.genres, ARRAY[]::TEXT[])
  ) AS genre_value
  WHERE umt.tag_type = 'artist'
    AND a.genres IS NOT NULL
    AND array_length(a.genres, 1) > 0
    AND NOT EXISTS (
      -- Skip if already exists
      SELECT 1 FROM public.user_genre_preferences ugp
      WHERE ugp.user_id = umt.user_id
        AND ugp.genre = genre_value
        AND ugp.source_entity_type = 'artist'
        AND ugp.metadata->>'source_table' = 'user_music_tags'
        AND ugp.metadata->>'tag_id' = umt.id::TEXT
        AND ugp.source_entity_name = a.name
    )
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  
  RAISE NOTICE 'Migrated % genre preferences from artist tags', migrated_count;
  
  -- Handle artist tags where artist not found or has no genres
  IF EXISTS (
    SELECT 1 FROM public.user_music_tags umt
    WHERE umt.tag_type = 'artist'
      AND NOT EXISTS (
        SELECT 1 FROM public.artists a 
        WHERE LOWER(a.name) = LOWER(umt.tag_value)
          AND a.genres IS NOT NULL
          AND array_length(a.genres, 1) > 0
      )
  ) THEN
    RAISE NOTICE '⚠️  Some artist tags could not be migrated (artist not found or no genres)';
  END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Migration Verification' as verification_type,
  'user_music_tags (genre) → user_genre_preferences' as consolidation,
  (
    SELECT COUNT(*) 
    FROM public.user_genre_preferences 
    WHERE metadata->>'source_table' = 'user_music_tags'
      AND interaction_type IN ('manual_preference', 'genre_exposure')
  ) as migrated_genre_tags,
  (
    SELECT COUNT(*) 
    FROM public.user_music_tags 
    WHERE tag_type = 'genre'
  ) as source_genre_tags_count,
  (
    SELECT COUNT(*) 
    FROM public.user_genre_preferences 
    WHERE metadata->>'source_table' = 'user_music_tags'
      AND source_entity_type = 'artist'
  ) as migrated_artist_tags_as_genres,
  (
    SELECT COUNT(*) 
    FROM public.user_music_tags 
    WHERE tag_type = 'artist'
  ) as source_artist_tags_count,
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
    ) = 0 THEN '✅ All genre tags migrated'
    ELSE '⚠️  Some genre tags not migrated'
  END as genre_migration_status,
  CASE 
    WHEN (
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
    ) = 0 THEN '✅ All artist tags migrated (where artist genres available)'
    ELSE '⚠️  Some artist tags not migrated (artist may not exist or have no genres)'
  END as artist_migration_status;


-- ============================================
-- STEP 6: CONSOLIDATE GENRE TABLES
-- ============================================
-- Migrate genre data to events.genres and artists.genres arrays
-- Then drop the old genre mapping tables

DO $$
DECLARE
  event_genres_count BIGINT;
  artist_genre_mapping_count BIGINT;
  artist_genres_count BIGINT;
  events_updated_count BIGINT := 0;
  artists_updated_from_mapping BIGINT := 0;
  artists_updated_from_genres BIGINT := 0;
  event_id_type TEXT;
BEGIN
  RAISE NOTICE '=== GENRE TABLES CONSOLIDATION ===';
  RAISE NOTICE '';
  
  -- Get counts
  SELECT COUNT(*) INTO event_genres_count FROM public.event_genres;
  SELECT COUNT(*) INTO artist_genre_mapping_count FROM public.artist_genre_mapping;
  SELECT COUNT(*) INTO artist_genres_count FROM public.artist_genres;
  
  RAISE NOTICE 'Source table row counts:';
  RAISE NOTICE '  event_genres: %', event_genres_count;
  RAISE NOTICE '  artist_genre_mapping: %', artist_genre_mapping_count;
  RAISE NOTICE '  artist_genres: %', artist_genres_count;
  RAISE NOTICE '';
  
  -- ============================================
  -- 1. MIGRATE event_genres → events.genres
  -- ============================================
  RAISE NOTICE 'Step 1: Migrating event_genres to events.genres...';
  
  -- Check event_id type in event_genres first
  SELECT data_type INTO event_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'event_genres' 
    AND column_name = 'event_id';
  
  RAISE NOTICE '  event_genres.event_id type: %', event_id_type;
    
    -- Update events with genres from event_genres
    -- Group genres by event_id and create arrays
    -- Handle different event_id types
    IF event_id_type = 'uuid' THEN
      -- UUID type - direct match
      WITH event_genres_aggregated AS (
        SELECT 
          eg.event_id::UUID as event_id,
          COALESCE(array_agg(DISTINCT eg.genre ORDER BY eg.genre) FILTER (WHERE eg.genre IS NOT NULL), ARRAY[]::TEXT[]) as genres_array
        FROM public.event_genres eg
        WHERE eg.event_id IS NOT NULL
        GROUP BY eg.event_id
      )
      UPDATE public.events e
      SET 
        genres = CASE 
          WHEN e.genres IS NULL OR array_length(e.genres, 1) IS NULL 
          THEN ega.genres_array
          ELSE (
            SELECT array_agg(DISTINCT genre ORDER BY genre)
            FROM (
              SELECT unnest(e.genres) as genre
              UNION
              SELECT unnest(ega.genres_array) as genre
            ) combined
          )
        END
      FROM event_genres_aggregated ega
      WHERE e.id = ega.event_id
        AND ega.genres_array != ARRAY[]::TEXT[];
        
    ELSE
      -- BIGINT or TEXT type - convert to TEXT for matching
      WITH event_genres_aggregated AS (
        SELECT 
          eg.event_id::TEXT as event_id_text,
          COALESCE(array_agg(DISTINCT eg.genre ORDER BY eg.genre) FILTER (WHERE eg.genre IS NOT NULL), ARRAY[]::TEXT[]) as genres_array
        FROM public.event_genres eg
        WHERE eg.event_id IS NOT NULL
        GROUP BY eg.event_id
      )
      UPDATE public.events e
      SET 
        genres = CASE 
          WHEN e.genres IS NULL OR array_length(e.genres, 1) IS NULL 
          THEN ega.genres_array
          ELSE (
            SELECT array_agg(DISTINCT genre ORDER BY genre)
            FROM (
              SELECT unnest(e.genres) as genre
              UNION
              SELECT unnest(ega.genres_array) as genre
            ) combined
          )
        END
      FROM event_genres_aggregated ega
      WHERE e.id::TEXT = ega.event_id_text
        AND ega.genres_array != ARRAY[]::TEXT[];
    END IF;
  
  GET DIAGNOSTICS events_updated_count = ROW_COUNT;
  RAISE NOTICE '  Updated % events with genres from event_genres', events_updated_count;
  
  -- ============================================
  -- 2. MIGRATE artist_genre_mapping → artists.genres
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Migrating artist_genre_mapping to artists.genres...';
  
  IF artist_genre_mapping_count > 0 THEN
    -- Update artists with genres from artist_genre_mapping
    UPDATE public.artists a
    SET 
      genres = CASE 
        WHEN a.genres IS NULL OR array_length(a.genres, 1) IS NULL 
        THEN agm.genres
        ELSE (
          SELECT array_agg(DISTINCT genre ORDER BY genre)
          FROM (
            SELECT unnest(a.genres) as genre
            UNION
            SELECT unnest(agm.genres) as genre
          ) combined
        )
      END
    FROM public.artist_genre_mapping agm
    WHERE a.id = agm.artist_id
      AND agm.genres IS NOT NULL
      AND array_length(agm.genres, 1) > 0;
    
    GET DIAGNOSTICS artists_updated_from_mapping = ROW_COUNT;
    RAISE NOTICE '  Updated % artists with genres from artist_genre_mapping', artists_updated_from_mapping;
  ELSE
    RAISE NOTICE '  artist_genre_mapping is empty, skipping migration';
  END IF;
  
  -- ============================================
  -- 3. MIGRATE artist_genres → artists.genres
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE 'Step 3: Migrating artist_genres to artists.genres...';
  RAISE NOTICE '  artist_genres is a mapping table (has artist_id, genre)';
  
  -- Group genres by artist_id and create arrays
  WITH artist_genres_aggregated AS (
    SELECT 
      ag.artist_id,
      COALESCE(array_agg(DISTINCT ag.genre ORDER BY ag.genre) FILTER (WHERE ag.genre IS NOT NULL), ARRAY[]::TEXT[]) as genres_array
    FROM public.artist_genres ag
    WHERE ag.artist_id IS NOT NULL
      AND ag.genre IS NOT NULL
    GROUP BY ag.artist_id
  )
  UPDATE public.artists a
  SET 
    genres = CASE 
      WHEN a.genres IS NULL OR array_length(a.genres, 1) IS NULL 
      THEN aga.genres_array
      ELSE (
        SELECT array_agg(DISTINCT genre ORDER BY genre)
        FROM (
          SELECT unnest(a.genres) as genre
          UNION
          SELECT unnest(aga.genres_array) as genre
        ) combined
      )
    END
  FROM artist_genres_aggregated aga
  WHERE a.id = aga.artist_id
    AND aga.genres_array != ARRAY[]::TEXT[];
  
  GET DIAGNOSTICS artists_updated_from_genres = ROW_COUNT;
  RAISE NOTICE '  Updated % artists with genres from artist_genres', artists_updated_from_genres;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Events updated: %', events_updated_count;
  RAISE NOTICE 'Artists updated from artist_genre_mapping: %', artists_updated_from_mapping;
  RAISE NOTICE 'Artists updated from artist_genres: %', artists_updated_from_genres;
  RAISE NOTICE 'Total unique artists with genres after migration: (check verification query below)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify data migrated correctly';
  RAISE NOTICE '2. Drop event_genres table';
  RAISE NOTICE '3. Drop artist_genre_mapping table (if empty)';
  RAISE NOTICE '4. Review artist_genres - drop if mapping table, keep if reference table';
END $$;

-- Verification queries
SELECT 
  'Migration Verification' as check_type,
  'event_genres migration' as migration_type,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as events_with_genres,
  COUNT(*) as total_events
FROM public.events;

SELECT 
  'Migration Verification' as check_type,
  'artists genres migration' as migration_type,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as artists_with_genres,
  COUNT(*) as total_artists
FROM public.artists;


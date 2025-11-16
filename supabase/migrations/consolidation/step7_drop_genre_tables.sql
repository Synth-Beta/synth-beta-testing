-- ============================================
-- STEP 7: DROP GENRE TABLES AFTER CONSOLIDATION
-- ============================================
-- Drop the genre mapping tables after data has been migrated to events.genres and artists.genres

DO $$
DECLARE
  event_genres_count BIGINT;
  artist_genre_mapping_count BIGINT;
  artist_genres_count BIGINT;
  events_with_genres BIGINT;
  artists_with_genres BIGINT;
BEGIN
  RAISE NOTICE '=== GENRE TABLES CLEANUP ===';
  RAISE NOTICE '';
  
  -- Get final counts before dropping
  SELECT COUNT(*) INTO event_genres_count FROM public.event_genres;
  SELECT COUNT(*) INTO artist_genre_mapping_count FROM public.artist_genre_mapping;
  SELECT COUNT(*) INTO artist_genres_count FROM public.artist_genres;
  
  -- Get counts of events/artists with genres after migration
  SELECT COUNT(*) INTO events_with_genres 
  FROM public.events 
  WHERE genres IS NOT NULL AND array_length(genres, 1) > 0;
  
  SELECT COUNT(*) INTO artists_with_genres 
  FROM public.artists 
  WHERE genres IS NOT NULL AND array_length(genres, 1) > 0;
  
  RAISE NOTICE 'Before dropping:';
  RAISE NOTICE '  event_genres rows: %', event_genres_count;
  RAISE NOTICE '  artist_genre_mapping rows: %', artist_genre_mapping_count;
  RAISE NOTICE '  artist_genres rows: %', artist_genres_count;
  RAISE NOTICE '';
  RAISE NOTICE 'After migration:';
  RAISE NOTICE '  events with genres: %', events_with_genres;
  RAISE NOTICE '  artists with genres: %', artists_with_genres;
  RAISE NOTICE '';
  
  -- Drop event_genres
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_genres'
  ) THEN
    RAISE NOTICE 'Dropping event_genres table...';
    DROP TABLE IF EXISTS public.event_genres CASCADE;
    RAISE NOTICE '  ✅ event_genres dropped';
  ELSE
    RAISE NOTICE '  ⚠️ event_genres does not exist';
  END IF;
  
  -- Drop artist_genre_mapping
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
  ) THEN
    RAISE NOTICE 'Dropping artist_genre_mapping table...';
    DROP TABLE IF EXISTS public.artist_genre_mapping CASCADE;
    RAISE NOTICE '  ✅ artist_genre_mapping dropped';
  ELSE
    RAISE NOTICE '  ⚠️ artist_genre_mapping does not exist';
  END IF;
  
  -- Drop artist_genres (mapping table, not reference)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genres'
  ) THEN
    RAISE NOTICE 'Dropping artist_genres table...';
    DROP TABLE IF EXISTS public.artist_genres CASCADE;
    RAISE NOTICE '  ✅ artist_genres dropped';
  ELSE
    RAISE NOTICE '  ⚠️ artist_genres does not exist';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'All genre mapping tables have been dropped ✅';
  RAISE NOTICE 'Genre data is now stored in:';
  RAISE NOTICE '  - events.genres (TEXT[])';
  RAISE NOTICE '  - artists.genres (TEXT[])';
END $$;

-- Verification
SELECT 
  'Final Verification' as check_type,
  'Genre Tables Status' as verification_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_genres'
    ) THEN 'EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as event_genres_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
    ) THEN 'EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as artist_genre_mapping_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'artist_genres'
    ) THEN 'EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as artist_genres_status;


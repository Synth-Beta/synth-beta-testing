-- ============================================
-- STEP 5: REVIEW GENRE TABLES
-- ============================================
-- Check if genre tables exist, their data, and whether they should be consolidated

DO $$
DECLARE
  event_genres_exists BOOLEAN;
  event_genres_count BIGINT;
  artist_genre_mapping_exists BOOLEAN;
  artist_genre_mapping_count BIGINT;
  artist_genres_exists BOOLEAN;
  artist_genres_count BIGINT;
  events_has_genres BOOLEAN;
  artists_has_genres BOOLEAN;
BEGIN
  -- Check event_genres
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_genres'
  ) INTO event_genres_exists;
  
  IF event_genres_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.event_genres' INTO event_genres_count;
  END IF;
  
  -- Check artist_genre_mapping
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
  ) INTO artist_genre_mapping_exists;
  
  IF artist_genre_mapping_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.artist_genre_mapping' INTO artist_genre_mapping_count;
  END IF;
  
  -- Check artist_genres
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genres'
  ) INTO artist_genres_exists;
  
  IF artist_genres_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.artist_genres' INTO artist_genres_count;
  END IF;
  
  -- Check if target columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'genres'
  ) INTO events_has_genres;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'artists' 
      AND column_name = 'genres'
  ) INTO artists_has_genres;
  
  -- Output results
  RAISE NOTICE '=== GENRE TABLES ANALYSIS ===';
  RAISE NOTICE '';
  
  -- event_genres
  RAISE NOTICE '1. event_genres:';
  IF event_genres_exists THEN
    RAISE NOTICE '   Status: EXISTS';
    RAISE NOTICE '   Row count: %', event_genres_count;
    IF events_has_genres THEN
      RAISE NOTICE '   events.genres column: EXISTS ✅';
      RAISE NOTICE '   Action: Migrate data to events.genres array';
    ELSE
      RAISE NOTICE '   events.genres column: MISSING ❌';
      RAISE NOTICE '   Action: Need to create events.genres column first';
    END IF;
  ELSE
    RAISE NOTICE '   Status: DOES NOT EXIST ✅';
  END IF;
  
  RAISE NOTICE '';
  
  -- artist_genre_mapping
  RAISE NOTICE '2. artist_genre_mapping:';
  IF artist_genre_mapping_exists THEN
    RAISE NOTICE '   Status: EXISTS';
    RAISE NOTICE '   Row count: %', artist_genre_mapping_count;
    IF artists_has_genres THEN
      RAISE NOTICE '   artists.genres column: EXISTS ✅';
      RAISE NOTICE '   Action: Migrate data to artists.genres array';
    ELSE
      RAISE NOTICE '   artists.genres column: MISSING ❌';
      RAISE NOTICE '   Action: Need to create artists.genres column first';
    END IF;
  ELSE
    RAISE NOTICE '   Status: DOES NOT EXIST ✅';
  END IF;
  
  RAISE NOTICE '';
  
  -- artist_genres
  RAISE NOTICE '3. artist_genres:';
  IF artist_genres_exists THEN
    RAISE NOTICE '   Status: EXISTS';
    RAISE NOTICE '   Row count: %', artist_genres_count;
    RAISE NOTICE '   Action: REVIEW - Check if this is a mapping table or reference table';
  ELSE
    RAISE NOTICE '   Status: DOES NOT EXIST ✅';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  IF NOT event_genres_exists AND NOT artist_genre_mapping_exists AND NOT artist_genres_exists THEN
    RAISE NOTICE 'All genre tables already dropped ✅';
  ELSIF events_has_genres AND artists_has_genres THEN
    RAISE NOTICE 'Target columns exist. Ready to migrate genre data.';
  ELSE
    RAISE NOTICE 'Target columns missing. Need to create columns first.';
  END IF;
END $$;

-- Show sample data if tables exist
DO $$
DECLARE
  event_genres_exists BOOLEAN;
  artist_genre_mapping_exists BOOLEAN;
  artist_genres_exists BOOLEAN;
  rec RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_genres'
  ) INTO event_genres_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
  ) INTO artist_genre_mapping_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genres'
  ) INTO artist_genres_exists;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SAMPLE DATA ===';
  
  IF event_genres_exists THEN
    RAISE NOTICE '';
    RAISE NOTICE 'event_genres sample (first 5 rows):';
    -- Check if genre column exists (singular) or genres (plural/array)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'event_genres' AND column_name = 'genre'
    ) THEN
      FOR rec IN EXECUTE 'SELECT event_id, genre FROM public.event_genres LIMIT 5' LOOP
        RAISE NOTICE '  event_id: %, genre: %', rec.event_id, rec.genre;
      END LOOP;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'event_genres' AND column_name = 'genres'
    ) THEN
      FOR rec IN EXECUTE 'SELECT event_id, genres FROM public.event_genres LIMIT 5' LOOP
        IF rec.genres IS NULL THEN
          RAISE NOTICE '  event_id: %, genres: NULL', rec.event_id;
        ELSE
          BEGIN
            RAISE NOTICE '  event_id: %, genres: %', rec.event_id, array_to_string(rec.genres::TEXT[], ', ');
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '  event_id: %, genres: %', rec.event_id, rec.genres;
          END;
        END IF;
      END LOOP;
    ELSE
      RAISE NOTICE '  Cannot determine column structure';
    END IF;
  END IF;
  
  IF artist_genre_mapping_exists THEN
    RAISE NOTICE '';
    RAISE NOTICE 'artist_genre_mapping sample (first 5 rows):';
    FOR rec IN EXECUTE 'SELECT artist_id, genres FROM public.artist_genre_mapping LIMIT 5' LOOP
      IF rec.genres IS NULL THEN
        RAISE NOTICE '  artist_id: %, genres: NULL', rec.artist_id;
      ELSE
        BEGIN
          RAISE NOTICE '  artist_id: %, genres: %', rec.artist_id, array_to_string(rec.genres::TEXT[], ', ');
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE '  artist_id: %, genres: %', rec.artist_id, rec.genres;
        END;
      END IF;
    END LOOP;
  END IF;
  
  IF artist_genres_exists THEN
    RAISE NOTICE '';
    RAISE NOTICE 'artist_genres sample (first 5 rows):';
    -- Check if this is a reference table (id, name) or mapping table (artist_id, genre)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'artist_genres' AND column_name = 'name'
    ) THEN
      -- Reference table
      FOR rec IN EXECUTE 'SELECT id, name, description FROM public.artist_genres LIMIT 5' LOOP
        RAISE NOTICE '  id: %, name: %, description: %', rec.id, rec.name, COALESCE(rec.description, 'NULL');
      END LOOP;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'artist_genres' AND column_name = 'artist_id'
    ) THEN
      -- Mapping table
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'artist_genres' AND column_name = 'genre'
      ) THEN
        FOR rec IN EXECUTE 'SELECT artist_id, genre FROM public.artist_genres LIMIT 5' LOOP
          RAISE NOTICE '  artist_id: %, genre: %', rec.artist_id, rec.genre;
        END LOOP;
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'artist_genres' AND column_name = 'genres'
      ) THEN
        FOR rec IN EXECUTE 'SELECT artist_id, genres FROM public.artist_genres LIMIT 5' LOOP
          IF rec.genres IS NULL THEN
            RAISE NOTICE '  artist_id: %, genres: NULL', rec.artist_id;
          ELSE
            BEGIN
              RAISE NOTICE '  artist_id: %, genres: %', rec.artist_id, array_to_string(rec.genres::TEXT[], ', ');
            EXCEPTION WHEN OTHERS THEN
              RAISE NOTICE '  artist_id: %, genres: %', rec.artist_id, rec.genres;
            END;
          END IF;
        END LOOP;
      END IF;
    ELSE
      RAISE NOTICE '  Cannot determine column structure';
    END IF;
  END IF;
END $$;

-- ============================================
-- OUTPUT SUMMARY AS TABLE RESULTS
-- ============================================

-- Create temp table for results
CREATE TEMP TABLE IF NOT EXISTS genre_tables_summary (
  analysis_type TEXT,
  table_name TEXT,
  status TEXT,
  row_count TEXT,
  target_column_status TEXT,
  recommendation TEXT
);

TRUNCATE TABLE genre_tables_summary;

-- Populate summary using DO block
DO $$
DECLARE
  event_genres_exists BOOLEAN;
  event_genres_count BIGINT := 0;
  artist_genre_mapping_exists BOOLEAN;
  artist_genre_mapping_count BIGINT := 0;
  artist_genres_exists BOOLEAN;
  artist_genres_count BIGINT := 0;
  events_has_genres BOOLEAN;
  artists_has_genres BOOLEAN;
BEGIN
  -- Check if tables exist and get counts
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_genres'
  ) INTO event_genres_exists;
  
  IF event_genres_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.event_genres' INTO event_genres_count;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping'
  ) INTO artist_genre_mapping_exists;
  
  IF artist_genre_mapping_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.artist_genre_mapping' INTO artist_genre_mapping_count;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_genres'
  ) INTO artist_genres_exists;
  
  IF artist_genres_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.artist_genres' INTO artist_genres_count;
  END IF;
  
  -- Check target columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'genres'
  ) INTO events_has_genres;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'artists' 
      AND column_name = 'genres'
  ) INTO artists_has_genres;
  
  -- Insert event_genres summary
  INSERT INTO genre_tables_summary VALUES (
    'Genre Tables Summary',
    'event_genres',
    CASE WHEN event_genres_exists THEN 'EXISTS' ELSE 'DOES NOT EXIST' END,
    event_genres_count::TEXT,
    CASE WHEN events_has_genres THEN 'EXISTS' ELSE 'MISSING' END,
    CASE 
      WHEN NOT event_genres_exists THEN 'Already dropped ✅'
      WHEN events_has_genres THEN 'Ready to migrate to events.genres'
      ELSE 'Need to create events.genres column first'
    END
  );
  
  -- Insert artist_genre_mapping summary
  INSERT INTO genre_tables_summary VALUES (
    'Genre Tables Summary',
    'artist_genre_mapping',
    CASE WHEN artist_genre_mapping_exists THEN 'EXISTS' ELSE 'DOES NOT EXIST' END,
    artist_genre_mapping_count::TEXT,
    CASE WHEN artists_has_genres THEN 'EXISTS' ELSE 'MISSING' END,
    CASE 
      WHEN NOT artist_genre_mapping_exists THEN 'Already dropped ✅'
      WHEN artists_has_genres THEN 'Ready to migrate to artists.genres'
      ELSE 'Need to create artists.genres column first'
    END
  );
  
  -- Insert artist_genres summary
  INSERT INTO genre_tables_summary VALUES (
    'Genre Tables Summary',
    'artist_genres',
    CASE WHEN artist_genres_exists THEN 'EXISTS' ELSE 'DOES NOT EXIST' END,
    artist_genres_count::TEXT,
    CASE WHEN artists_has_genres THEN 'EXISTS' ELSE 'MISSING' END,
    CASE 
      WHEN NOT artist_genres_exists THEN 'Already dropped ✅'
      ELSE 'REVIEW - Check if reference table or mapping table'
    END
  );
END $$;

-- Output summary
SELECT * FROM genre_tables_summary ORDER BY table_name;

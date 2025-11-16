-- ============================================
-- VERIFY AND DROP OLD INTERACTION TABLES
-- ============================================
-- Verifies data migration from old interaction tables to user_genre_preferences
-- Then safely drops the old tables

-- ============================================
-- STEP 1: VERIFY MIGRATION STATUS
-- ============================================

-- Check if user_genre_preferences exists
DO $$
DECLARE
  has_table BOOLEAN;
  migration_count BIGINT;
  source_count BIGINT;
  result_text TEXT := '';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_genre_preferences'
  ) INTO has_table;
  
  IF NOT has_table THEN
    RAISE NOTICE 'WARNING: user_genre_preferences table does not exist. Migration may not be complete.';
    RETURN;
  END IF;
  
  RAISE NOTICE '=== Migration Verification ===';
  
  -- Check user_artist_interactions migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_artist_interactions'
  ) THEN
    SELECT COUNT(*) INTO migration_count
    FROM public.user_genre_preferences
    WHERE source_entity_type = 'artist'
      AND metadata->>'original_table' = 'user_artist_interactions';
    
    SELECT COUNT(*) INTO source_count
    FROM public.user_artist_interactions;
    
    result_text := result_text || format(E'user_artist_interactions: %s migrated, %s total source rows\n', migration_count, source_count);
  END IF;
  
  -- Check user_genre_interactions migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_genre_interactions'
  ) THEN
    SELECT COUNT(*) INTO migration_count
    FROM public.user_genre_preferences
    WHERE source_entity_type = 'event' OR source_entity_type = 'artist'
      AND metadata->>'original_table' = 'user_genre_interactions';
    
    SELECT COUNT(*) INTO source_count
    FROM public.user_genre_interactions;
    
    result_text := result_text || format(E'user_genre_interactions: %s migrated, %s total source rows\n', migration_count, source_count);
  END IF;
  
  -- Check user_song_interactions migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_song_interactions'
  ) THEN
    SELECT COUNT(*) INTO migration_count
    FROM public.user_genre_preferences
    WHERE source_entity_type = 'song'
      AND metadata->>'original_table' = 'user_song_interactions';
    
    SELECT COUNT(*) INTO source_count
    FROM public.user_song_interactions;
    
    result_text := result_text || format(E'user_song_interactions: %s migrated, %s total source rows\n', migration_count, source_count);
  END IF;
  
  -- Check user_venue_interactions migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_venue_interactions'
  ) THEN
    SELECT COUNT(*) INTO migration_count
    FROM public.user_genre_preferences
    WHERE source_entity_type = 'venue'
      AND metadata->>'original_table' = 'user_venue_interactions';
    
    SELECT COUNT(*) INTO source_count
    FROM public.user_venue_interactions;
    
    result_text := result_text || format(E'user_venue_interactions: %s migrated, %s total source rows\n', migration_count, source_count);
  END IF;
  
  RAISE NOTICE '%', result_text;
END $$;

-- ============================================
-- STEP 2: STASH ANY REMAINING DATA
-- ============================================
-- Ensure consolidation_data_stash exists
CREATE TABLE IF NOT EXISTS public.consolidation_data_stash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stash_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT,
  source_data JSONB NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stash any user_artist_interactions not migrated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_artist_interactions'
  ) THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_id, source_data, reason)
    SELECT 
      'orphan_artist_interaction',
      'user_artist_interactions',
      uai.id::TEXT,
      row_to_json(uai.*)::JSONB,
      'Artist interaction exists but may not have been migrated to user_genre_preferences'
    FROM public.user_artist_interactions uai
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_genre_preferences ugp
      WHERE ugp.user_id = uai.user_id
        AND ugp.source_entity_type = 'artist'
        AND ugp.source_entity_id::TEXT = uai.artist_id::TEXT
        AND ugp.metadata->>'original_table' = 'user_artist_interactions'
        AND ugp.metadata->>'original_id' = uai.id::TEXT
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Stash any user_genre_interactions not migrated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_genre_interactions'
  ) THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_id, source_data, reason)
    SELECT 
      'orphan_genre_interaction',
      'user_genre_interactions',
      ugi.id::TEXT,
      row_to_json(ugi.*)::JSONB,
      'Genre interaction exists but may not have been migrated to user_genre_preferences'
    FROM public.user_genre_interactions ugi
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_genre_preferences ugp
      WHERE ugp.user_id = ugi.user_id
        AND ugp.genre = ugi.genre
        AND ugp.metadata->>'original_table' = 'user_genre_interactions'
        AND ugp.metadata->>'original_id' = ugi.id::TEXT
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Stash any user_song_interactions not migrated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_song_interactions'
  ) THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_id, source_data, reason)
    SELECT 
      'orphan_song_interaction',
      'user_song_interactions',
      usi.id::TEXT,
      row_to_json(usi.*)::JSONB,
      'Song interaction exists but may not have been migrated to user_genre_preferences'
    FROM public.user_song_interactions usi
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_genre_preferences ugp
      WHERE ugp.user_id = usi.user_id
        AND ugp.source_entity_type = 'song'
        AND ugp.source_entity_id::TEXT = usi.song_id
        AND ugp.metadata->>'original_table' = 'user_song_interactions'
        AND ugp.metadata->>'original_id' = usi.id::TEXT
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Stash any user_venue_interactions not migrated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_venue_interactions'
  ) THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_id, source_data, reason)
    SELECT 
      'orphan_venue_interaction',
      'user_venue_interactions',
      uvi.id::TEXT,
      row_to_json(uvi.*)::JSONB,
      'Venue interaction exists but may not have been migrated to user_genre_preferences'
    FROM public.user_venue_interactions uvi
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_genre_preferences ugp
      WHERE ugp.user_id = uvi.user_id
        AND ugp.source_entity_type = 'venue'
        AND ugp.source_entity_id::TEXT = uvi.venue_id::TEXT
        AND ugp.metadata->>'original_table' = 'user_venue_interactions'
        AND ugp.metadata->>'original_id' = uvi.id::TEXT
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================
-- STEP 3: SHOW STASHED DATA SUMMARY
-- ============================================
SELECT 
  'Stashed Data Summary' as summary_type,
  stash_type,
  source_table,
  COUNT(*) as stash_count
FROM public.consolidation_data_stash
WHERE stash_type LIKE '%_interaction'
GROUP BY stash_type, source_table
ORDER BY stash_type, source_table;

-- ============================================
-- STEP 4: DROP OLD INTERACTION TABLES
-- ============================================
-- Only drop if user_genre_preferences exists and has data

DO $$
DECLARE
  has_target_table BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_genre_preferences'
  ) INTO has_target_table;
  
  IF has_target_table THEN
    -- Drop old interaction tables
    DROP TABLE IF EXISTS public.user_artist_interactions CASCADE;
    DROP TABLE IF EXISTS public.user_genre_interactions CASCADE;
    DROP TABLE IF EXISTS public.user_song_interactions CASCADE;
    DROP TABLE IF EXISTS public.user_venue_interactions CASCADE;
    
    RAISE NOTICE 'Dropped old interaction tables: user_artist_interactions, user_genre_interactions, user_song_interactions, user_venue_interactions';
  ELSE
    RAISE WARNING 'user_genre_preferences table does not exist. NOT dropping old tables to prevent data loss.';
  END IF;
END $$;

-- ============================================
-- STEP 5: VERIFICATION
-- ============================================
SELECT 
  'Verification: Old Interaction Tables' as check_type,
  COUNT(*) FILTER (WHERE table_name IN (
    'user_artist_interactions', 'user_genre_interactions',
    'user_song_interactions', 'user_venue_interactions'
  )) as old_tables_remaining,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_genre_preferences'
    ) THEN 'user_genre_preferences EXISTS'
    ELSE 'user_genre_preferences MISSING'
  END as target_table_status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';


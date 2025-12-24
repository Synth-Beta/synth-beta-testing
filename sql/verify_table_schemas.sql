-- ============================================
-- PHASE 1.1: Verify Table Schemas
-- This script verifies that events, artists, and venues tables
-- match the required schema for Jambase sync
-- ============================================

-- Check events table structure
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  missing_indexes TEXT[] := ARRAY[]::TEXT[];
  missing_constraints TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Verify events table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') THEN
    RAISE EXCEPTION 'events table does not exist';
  END IF;

  -- Check required columns in events table
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'jambase_event_id') THEN
    missing_columns := array_append(missing_columns, 'jambase_event_id');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'artist_jambase_id') THEN
    missing_columns := array_append(missing_columns, 'artist_jambase_id');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'venue_jambase_id') THEN
    missing_columns := array_append(missing_columns, 'venue_jambase_id');
  END IF;

  -- Check for last_modified_at column (NEW - for incremental sync)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'last_modified_at') THEN
    missing_columns := array_append(missing_columns, 'last_modified_at');
  END IF;

  -- Check required indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'events' AND indexname = 'idx_events_jambase_event_id') THEN
    missing_indexes := array_append(missing_indexes, 'idx_events_jambase_event_id');
  END IF;

  -- Check for last_modified_at index (NEW - for efficient incremental sync queries)
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'events' AND indexname = 'idx_events_last_modified_at') THEN
    missing_indexes := array_append(missing_indexes, 'idx_events_last_modified_at');
  END IF;

  -- Check foreign key constraints
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'events' 
    AND constraint_name = 'events_artist_jambase_id_fkey'
  ) THEN
    missing_constraints := array_append(missing_constraints, 'events_artist_jambase_id_fkey');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'events' 
    AND constraint_name = 'events_venue_jambase_id_fkey'
  ) THEN
    missing_constraints := array_append(missing_constraints, 'events_venue_jambase_id_fkey');
  END IF;

  -- Report results
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'EVENTS TABLE - Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE 'EVENTS TABLE - All required columns exist';
  END IF;

  IF array_length(missing_indexes, 1) > 0 THEN
    RAISE NOTICE 'EVENTS TABLE - Missing indexes: %', array_to_string(missing_indexes, ', ');
  ELSE
    RAISE NOTICE 'EVENTS TABLE - All required indexes exist';
  END IF;

  IF array_length(missing_constraints, 1) > 0 THEN
    RAISE NOTICE 'EVENTS TABLE - Missing constraints: %', array_to_string(missing_constraints, ', ');
  ELSE
    RAISE NOTICE 'EVENTS TABLE - All required constraints exist';
  END IF;
END $$;

-- Check artists table structure
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  missing_indexes TEXT[] := ARRAY[]::TEXT[];
  missing_constraints TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Verify artists table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'artists') THEN
    RAISE EXCEPTION 'artists table does not exist';
  END IF;

  -- Check required columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'artists' AND column_name = 'jambase_artist_id') THEN
    missing_columns := array_append(missing_columns, 'jambase_artist_id');
  END IF;

  -- Check unique constraint on jambase_artist_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'artists' 
    AND constraint_name = 'artists_new_jambase_artist_id_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'artists' 
    AND constraint_type = 'UNIQUE'
    AND EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage 
      WHERE constraint_name = information_schema.table_constraints.constraint_name
      AND column_name = 'jambase_artist_id'
    )
  ) THEN
    missing_constraints := array_append(missing_constraints, 'artists.jambase_artist_id UNIQUE');
  END IF;

  -- Check required indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'artists' AND indexname = 'idx_artists_jambase_id') THEN
    missing_indexes := array_append(missing_indexes, 'idx_artists_jambase_id');
  END IF;

  -- Report results
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'ARTISTS TABLE - Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE 'ARTISTS TABLE - All required columns exist';
  END IF;

  IF array_length(missing_indexes, 1) > 0 THEN
    RAISE NOTICE 'ARTISTS TABLE - Missing indexes: %', array_to_string(missing_indexes, ', ');
  ELSE
    RAISE NOTICE 'ARTISTS TABLE - All required indexes exist';
  END IF;

  IF array_length(missing_constraints, 1) > 0 THEN
    RAISE NOTICE 'ARTISTS TABLE - Missing constraints: %', array_to_string(missing_constraints, ', ');
  ELSE
    RAISE NOTICE 'ARTISTS TABLE - All required constraints exist';
  END IF;
END $$;

-- Check venues table structure
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  missing_indexes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Verify venues table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'venues') THEN
    RAISE EXCEPTION 'venues table does not exist';
  END IF;

  -- Check required columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'jambase_venue_id') THEN
    missing_columns := array_append(missing_columns, 'jambase_venue_id');
  END IF;

  -- Check required indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'venues' AND indexname = 'idx_venues_jambase_id') THEN
    missing_indexes := array_append(missing_indexes, 'idx_venues_jambase_id');
  END IF;

  -- Report results
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'VENUES TABLE - Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE 'VENUES TABLE - All required columns exist';
  END IF;

  IF array_length(missing_indexes, 1) > 0 THEN
    RAISE NOTICE 'VENUES TABLE - Missing indexes: %', array_to_string(missing_indexes, ', ');
  ELSE
    RAISE NOTICE 'VENUES TABLE - All required indexes exist';
  END IF;
END $$;

-- Display current table structures for verification
SELECT 
  'EVENTS TABLE COLUMNS' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
ORDER BY ordinal_position;

SELECT 
  'ARTISTS TABLE COLUMNS' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'artists'
ORDER BY ordinal_position;

SELECT 
  'VENUES TABLE COLUMNS' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'venues'
ORDER BY ordinal_position;

-- Display foreign key relationships
SELECT 
  'FOREIGN KEYS' as check_type,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('events', 'artists', 'venues')
ORDER BY tc.table_name, tc.constraint_name;


-- ============================================
-- MIGRATION: OLD user_preferences TO BCNF SCHEMA
-- ============================================
-- This script migrates data from the old user_preferences table
-- to the new BCNF-normalized schema

-- Step 1: Create the new tables (run create_user_preferences_bcnf.sql first)
-- Step 2: Migrate existing data
-- Step 3: Drop old table (optional, after verification)

DO $$
BEGIN
  RAISE NOTICE '=== MIGRATING USER PREFERENCES TO BCNF ===';
  RAISE NOTICE '';
END $$;

-- ============================================
-- MIGRATE EXISTING PREFERENCE DATA
-- ============================================

-- Migrate preferred_genres to signals
INSERT INTO public.user_preference_signals (
  user_id,
  signal_type,
  entity_type,
  entity_id,
  entity_name,
  signal_weight,
  genre,
  occurred_at,
  created_at
)
SELECT 
  user_id,
  'genre_manual_preference'::preference_signal_type,
  'genre'::preference_entity_type,
  NULL,
  genre,
  9.0,  -- High weight for manual preferences
  genre,
  created_at,
  created_at
FROM public.user_preferences old
CROSS JOIN LATERAL unnest(old.preferred_genres) AS genre
WHERE old.preferred_genres IS NOT NULL
  AND array_length(old.preferred_genres, 1) > 0
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE '✅ Migrated preferred_genres to signals'; END $$;

-- Migrate preferred_artists to signals
INSERT INTO public.user_preference_signals (
  user_id,
  signal_type,
  entity_type,
  entity_id,
  entity_name,
  signal_weight,
  occurred_at,
  created_at
)
SELECT 
  user_id,
  'artist_manual_preference'::preference_signal_type,
  'artist'::preference_entity_type,
  artist_id,
  NULL,  -- Will need to look up artist name if needed
  9.0,  -- High weight for manual preferences
  created_at,
  created_at
FROM public.user_preferences old
CROSS JOIN LATERAL unnest(old.preferred_artists) AS artist_id
WHERE old.preferred_artists IS NOT NULL
  AND array_length(old.preferred_artists, 1) > 0
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE '✅ Migrated preferred_artists to signals'; END $$;

-- Migrate preferred_venues to signals
INSERT INTO public.user_preference_signals (
  user_id,
  signal_type,
  entity_type,
  entity_id,
  entity_name,
  signal_weight,
  genre,
  occurred_at,
  created_at
)
SELECT 
  user_id,
  'venue_manual_preference'::preference_signal_type,
  'venue'::preference_entity_type,
  NULL,  -- Venues stored as text, not UUID
  venue_name,
  9.0,  -- High weight for manual preferences
  NULL,  -- No genre for venue preference
  created_at,
  created_at
FROM public.user_preferences old
CROSS JOIN LATERAL unnest(old.preferred_venues) AS venue_name
WHERE old.preferred_venues IS NOT NULL
  AND array_length(old.preferred_venues, 1) > 0
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE '✅ Migrated preferred_venues to signals'; END $$;

-- Migrate music_preference_signals JSONB to actual signals
-- This assumes the old JSONB had signal data
INSERT INTO public.user_preference_signals (
  user_id,
  signal_type,
  entity_type,
  entity_id,
  entity_name,
  signal_weight,
  genre,
  context,
  occurred_at,
  created_at
)
SELECT 
  user_id,
  (signal_data->>'signal_type')::preference_signal_type,
  (signal_data->>'entity_type')::preference_entity_type,
  (signal_data->>'entity_id')::UUID,
  signal_data->>'entity_name',
  COALESCE((signal_data->>'signal_weight')::NUMERIC, 1.0),
  signal_data->>'genre',
  signal_data->'context',
  COALESCE((signal_data->>'occurred_at')::TIMESTAMPTZ, created_at),
  created_at
FROM public.user_preferences old
CROSS JOIN LATERAL jsonb_array_elements(old.music_preference_signals) AS signal_data
WHERE old.music_preference_signals IS NOT NULL
  AND jsonb_typeof(old.music_preference_signals) = 'array'
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE '✅ Migrated music_preference_signals JSONB to signals'; END $$;

-- Migrate genre_preferences JSONB to signals
INSERT INTO public.user_preference_signals (
  user_id,
  signal_type,
  entity_type,
  entity_id,
  entity_name,
  signal_weight,
  genre,
  context,
  occurred_at,
  created_at
)
SELECT 
  user_id,
  'genre_manual_preference'::preference_signal_type,
  'genre'::preference_entity_type,
  NULL,
  genre_key,
  COALESCE((genre_value->>'score')::NUMERIC, (genre_value::text)::NUMERIC, 5.0),
  genre_key,
  genre_value,
  created_at,
  created_at
FROM public.user_preferences old
CROSS JOIN LATERAL jsonb_each_text(old.genre_preferences) AS genre_data(genre_key, genre_value)
WHERE old.genre_preferences IS NOT NULL
  AND jsonb_typeof(old.genre_preferences) = 'object'
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE '✅ Migrated genre_preferences JSONB to signals'; END $$;

-- Migrate settings to user_settings table
INSERT INTO public.user_settings (
  user_id,
  notification_preferences,
  email_preferences,
  privacy_settings,
  created_at,
  updated_at
)
SELECT 
  user_id,
  COALESCE(notification_preferences, '{}'),
  COALESCE(email_preferences, '{}'),
  COALESCE(privacy_settings, '{}'),
  created_at,
  updated_at
FROM public.user_preferences old
WHERE old.notification_preferences IS NOT NULL
   OR old.email_preferences IS NOT NULL
   OR old.privacy_settings IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  notification_preferences = EXCLUDED.notification_preferences,
  email_preferences = EXCLUDED.email_preferences,
  privacy_settings = EXCLUDED.privacy_settings,
  updated_at = EXCLUDED.updated_at;

DO $$ BEGIN RAISE NOTICE '✅ Migrated settings to user_settings table'; END $$;

-- Compute preferences for all users
DO $$
DECLARE
  user_record RECORD;
  user_count INTEGER := 0;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.user_preference_signals
  LOOP
    PERFORM compute_user_preferences(user_record.user_id);
    user_count := user_count + 1;
    
    IF user_count % 100 = 0 THEN
      RAISE NOTICE 'Computed preferences for % users...', user_count;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Computed preferences for % total users', user_count;
END $$;

DO $$ BEGIN 
  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify data in new tables';
  RAISE NOTICE '2. Update application code to use new schema';
  RAISE NOTICE '3. (Optional) Drop old user_preferences table after verification';
END $$;


-- ============================================
-- MIGRATION: EXISTING user_preferences DATA TO BCNF SCHEMA
-- ============================================
-- This script migrates data from the old user_preferences table
-- to the new BCNF-normalized schema (user_preference_signals, user_preferences, user_settings)
--
-- Run this AFTER:
-- 1. create_user_preferences_bcnf.sql (creates new schema)
-- 2. helper_functions_user_preferences.sql (creates helper functions)
--
-- This script handles:
-- - preferred_genres[] -> signals
-- - preferred_artists[] -> signals
-- - preferred_venues[] -> signals
-- - streaming_stats JSONB -> signals
-- - music_preference_signals JSONB -> signals
-- - genre_preferences JSONB -> signals
-- - Settings -> user_settings table

DO $$
BEGIN
  RAISE NOTICE '=== MIGRATING EXISTING user_preferences DATA TO BCNF ===';
  RAISE NOTICE '';
END $$;

-- ============================================
-- STEP 1: Migrate preferred_genres[] to signals
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 1: Migrating preferred_genres arrays...';
END $$;

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
  COALESCE(created_at, now()),
  COALESCE(created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL unnest(old.preferred_genres) AS genre
WHERE old.preferred_genres IS NOT NULL
  AND array_length(old.preferred_genres, 1) > 0
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

DO $$ BEGIN 
  RAISE NOTICE '✅ Migrated % preferred_genres to signals', 
    (SELECT COUNT(*) FROM public.user_preferences WHERE preferred_genres IS NOT NULL AND array_length(preferred_genres, 1) > 0);
END $$;

-- ============================================
-- STEP 2: Migrate preferred_artists[] to signals
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 2: Migrating preferred_artists arrays...';
END $$;

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
  old.user_id,
  'artist_manual_preference'::preference_signal_type,
  'artist'::preference_entity_type,
  artist_id,
  COALESCE(a.name, 'Unknown Artist'),
  9.0,  -- High weight for manual preferences
  COALESCE(old.created_at, now()),
  COALESCE(old.created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL unnest(old.preferred_artists) AS artist_id
LEFT JOIN public.artists a ON a.id = artist_id
WHERE old.preferred_artists IS NOT NULL
  AND array_length(old.preferred_artists, 1) > 0
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

-- Also create genre signals for each artist's genres
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
SELECT DISTINCT
  old.user_id,
  'artist_manual_preference'::preference_signal_type,
  'artist'::preference_entity_type,
  artist_id,
  COALESCE(a.name, 'Unknown Artist'),
  9.0,
  genre,
  COALESCE(old.created_at, now()),
  COALESCE(old.created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL unnest(old.preferred_artists) AS artist_id
LEFT JOIN public.artists a ON a.id = artist_id
CROSS JOIN LATERAL unnest(COALESCE(a.genres, ARRAY[]::TEXT[])) AS genre
WHERE old.preferred_artists IS NOT NULL
  AND array_length(old.preferred_artists, 1) > 0
  AND a.genres IS NOT NULL
  AND array_length(a.genres, 1) > 0
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

DO $$ BEGIN 
  RAISE NOTICE '✅ Migrated % preferred_artists to signals', 
    (SELECT COUNT(*) FROM public.user_preferences WHERE preferred_artists IS NOT NULL AND array_length(preferred_artists, 1) > 0);
END $$;

-- ============================================
-- STEP 3: Migrate preferred_venues[] to signals
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 3: Migrating preferred_venues arrays...';
END $$;

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
  'venue_manual_preference'::preference_signal_type,
  'venue'::preference_entity_type,
  NULL,  -- Venues stored as text, not UUID
  venue_name,
  9.0,  -- High weight for manual preferences
  COALESCE(created_at, now()),
  COALESCE(created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL unnest(old.preferred_venues) AS venue_name
WHERE old.preferred_venues IS NOT NULL
  AND array_length(old.preferred_venues, 1) > 0
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

DO $$ BEGIN 
  RAISE NOTICE '✅ Migrated % preferred_venues to signals', 
    (SELECT COUNT(*) FROM public.user_preferences WHERE preferred_venues IS NOT NULL AND array_length(preferred_venues, 1) > 0);
END $$;

-- ============================================
-- STEP 4: Migrate streaming_stats JSONB to signals
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 4: Migrating streaming_stats JSONB...';
END $$;

-- Migrate Spotify top genres
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
  'streaming_profile_synced'::preference_signal_type,
  'genre'::preference_entity_type,
  NULL,
  genre_data->>'genre',
  LEAST((genre_data->>'count')::INTEGER / 10.0, 6.0),  -- Scale by count, max 6.0
  genre_data->>'genre',
  jsonb_build_object(
    'source', 'spotify',
    'count', (genre_data->>'count')::INTEGER,
    'service', 'spotify'
  ),
  COALESCE(updated_at, created_at, now()),
  COALESCE(created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL jsonb_array_elements(
  CASE 
    WHEN old.streaming_stats->'spotify'->'top_genres' IS NOT NULL 
    THEN old.streaming_stats->'spotify'->'top_genres'
    ELSE '[]'::jsonb
  END
) AS genre_data
WHERE old.streaming_stats IS NOT NULL
  AND old.streaming_stats->'spotify'->'top_genres' IS NOT NULL
  AND jsonb_typeof(old.streaming_stats->'spotify'->'top_genres') = 'array'
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

-- Migrate Spotify top artists
INSERT INTO public.user_preference_signals (
  user_id,
  signal_type,
  entity_type,
  entity_id,
  entity_name,
  signal_weight,
  context,
  occurred_at,
  created_at
)
SELECT 
  old.user_id,
  'streaming_top_artist_long'::preference_signal_type,
  'artist'::preference_entity_type,
  NULL,  -- Spotify ID, not our UUID
  artist_data->>'name',
  6.0,  -- Long-term top artists get high weight
  jsonb_build_object(
    'source', 'spotify',
    'spotify_id', artist_data->>'id',
    'popularity', (artist_data->>'popularity')::INTEGER,
    'service', 'spotify',
    'time_range', 'long_term'
  ),
  COALESCE(old.updated_at, old.created_at, now()),
  COALESCE(old.created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL jsonb_array_elements(
  CASE 
    WHEN old.streaming_stats->'spotify'->'top_artists' IS NOT NULL 
    THEN old.streaming_stats->'spotify'->'top_artists'
    ELSE '[]'::jsonb
  END
) AS artist_data
WHERE old.streaming_stats IS NOT NULL
  AND old.streaming_stats->'spotify'->'top_artists' IS NOT NULL
  AND jsonb_typeof(old.streaming_stats->'spotify'->'top_artists') = 'array'
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

-- Also create genre signals from Spotify top artists' genres
-- (This would require looking up artist genres, but we'll skip for now as it's complex)

DO $$ BEGIN 
  RAISE NOTICE '✅ Migrated streaming_stats to signals';
END $$;

-- ============================================
-- STEP 5: Migrate music_preference_signals JSONB array
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 5: Migrating music_preference_signals JSONB array...';
END $$;

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
  old.user_id,
  CASE 
    WHEN signal_data->>'preference_type' = 'artist' THEN
      CASE 
        WHEN signal_data->'interaction_types'->>'follow' IS NOT NULL THEN 'artist_follow'::preference_signal_type
        WHEN signal_data->'interaction_types'->>'review' IS NOT NULL THEN 'artist_review'::preference_signal_type
        WHEN signal_data->'interaction_types'->>'interest' IS NOT NULL THEN 'event_interest'::preference_signal_type
        ELSE 'artist_manual_preference'::preference_signal_type
      END
    WHEN signal_data->>'preference_type' = 'genre' THEN
      CASE 
        WHEN signal_data->'interaction_types'->>'review' IS NOT NULL THEN 'event_review_created'::preference_signal_type
        WHEN signal_data->'interaction_types'->>'interest' IS NOT NULL THEN 'event_interest'::preference_signal_type
        ELSE 'genre_manual_preference'::preference_signal_type
      END
    WHEN signal_data->>'preference_type' = 'venue' THEN 'venue_manual_preference'::preference_signal_type
    ELSE 'genre_manual_preference'::preference_signal_type
  END,
  CASE 
    WHEN signal_data->>'preference_type' = 'artist' THEN 'artist'::preference_entity_type
    WHEN signal_data->>'preference_type' = 'genre' THEN 'genre'::preference_entity_type
    WHEN signal_data->>'preference_type' = 'venue' THEN 'venue'::preference_entity_type
    ELSE 'genre'::preference_entity_type
  END,
  NULL,  -- Entity ID not in this format
  signal_data->>'preference_value',
  LEAST(COALESCE((signal_data->>'preference_score')::NUMERIC, 1.0), 10.0),
  CASE 
    WHEN signal_data->>'preference_type' = 'genre' THEN signal_data->>'preference_value'
    ELSE NULL
  END,
  COALESCE(
    (signal_data->'context')::jsonb,
    jsonb_build_object(
      'interaction_count', (signal_data->>'interaction_count')::INTEGER,
      'confidence', (signal_data->>'confidence')::NUMERIC
    )
  ),
  COALESCE(
    (signal_data->>'last_interaction')::TIMESTAMPTZ,
    (signal_data->>'first_interaction')::TIMESTAMPTZ,
    old.created_at,
    now()
  ),
  COALESCE(old.created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL jsonb_array_elements(old.music_preference_signals) AS signal_data
WHERE old.music_preference_signals IS NOT NULL
  AND jsonb_typeof(old.music_preference_signals) = 'array'
  AND jsonb_array_length(old.music_preference_signals) > 0
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

DO $$ BEGIN 
  RAISE NOTICE '✅ Migrated music_preference_signals JSONB array to signals';
END $$;

-- ============================================
-- STEP 6: Migrate genre_preferences JSONB
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 6: Migrating genre_preferences JSONB...';
END $$;

-- Migrate genre_preferences.preferences array
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
  old.user_id,
  CASE 
    WHEN pref_data->>'interaction_type' = 'manual_preference' THEN 'genre_manual_preference'::preference_signal_type
    WHEN pref_data->>'interaction_type' = 'genre_exposure' THEN 'event_interest'::preference_signal_type
    WHEN pref_data->>'interaction_type' = 'artist_view' THEN 'artist_search'::preference_signal_type
    ELSE 'genre_manual_preference'::preference_signal_type
  END,
  'genre'::preference_entity_type,
  NULL,
  pref_data->>'genre',
  LEAST(COALESCE((pref_data->>'preference_score')::NUMERIC, 1.0), 10.0),
  pref_data->>'genre',
  COALESCE(
    (pref_data->'context')::jsonb,
    (pref_data->'metadata')::jsonb,
    '{}'::jsonb
  ),
  COALESCE(
    (pref_data->>'occurred_at')::TIMESTAMPTZ,
    (pref_data->>'created_at')::TIMESTAMPTZ,
    old.created_at,
    now()
  ),
  COALESCE(
    (pref_data->>'created_at')::TIMESTAMPTZ,
    old.created_at,
    now()
  )
FROM public.user_preferences old
CROSS JOIN LATERAL jsonb_array_elements(
  CASE 
    WHEN old.genre_preferences->'preferences' IS NOT NULL 
    THEN old.genre_preferences->'preferences'
    ELSE '[]'::jsonb
  END
) AS pref_data
WHERE old.genre_preferences IS NOT NULL
  AND old.genre_preferences->'preferences' IS NOT NULL
  AND jsonb_typeof(old.genre_preferences->'preferences') = 'array'
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

-- Migrate genre_preferences top-level keys (manual preferences like "Pop", "Rock", etc.)
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
  old.user_id,
  'genre_manual_preference'::preference_signal_type,
  'genre'::preference_entity_type,
  NULL,
  genre_key,
  LEAST(
    COALESCE((genre_value->>'weight')::NUMERIC, 9.0),
    10.0
  ),
  genre_key,
  genre_value,
  COALESCE(
    (genre_value->>'created_at')::TIMESTAMPTZ,
    old.created_at,
    now()
  ),
  COALESCE(old.created_at, now())
FROM public.user_preferences old
CROSS JOIN LATERAL jsonb_each(old.genre_preferences) AS genre_data(genre_key, genre_value)
WHERE old.genre_preferences IS NOT NULL
  AND jsonb_typeof(old.genre_preferences) = 'object'
  AND genre_key != 'preferences'  -- Skip the preferences array, already handled
  AND genre_value IS NOT NULL
  AND jsonb_typeof(genre_value) = 'object'
ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

DO $$ BEGIN 
  RAISE NOTICE '✅ Migrated genre_preferences JSONB to signals';
END $$;

-- ============================================
-- STEP 7: Migrate settings to user_settings table
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 7: Migrating settings to user_settings table...';
END $$;

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
  COALESCE(notification_preferences, '{}'::jsonb),
  COALESCE(email_preferences, '{}'::jsonb),
  COALESCE(privacy_settings, '{}'::jsonb),
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

DO $$ BEGIN 
  RAISE NOTICE '✅ Migrated settings to user_settings table';
END $$;

-- ============================================
-- STEP 8: Compute preferences for all users
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 8: Computing preferences for all users...';
END $$;

DO $$
DECLARE
  user_record RECORD;
  user_count INTEGER := 0;
  total_users INTEGER;
BEGIN
  -- Get total count
  SELECT COUNT(DISTINCT user_id) INTO total_users
  FROM public.user_preference_signals;
  
  RAISE NOTICE 'Computing preferences for % users...', total_users;
  
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.user_preference_signals
    ORDER BY user_id
  LOOP
    BEGIN
      PERFORM compute_user_preferences(user_record.user_id);
      user_count := user_count + 1;
      
      IF user_count % 10 = 0 THEN
        RAISE NOTICE '  Computed preferences for %/% users...', user_count, total_users;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error computing preferences for user %: %', user_record.user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ Computed preferences for % total users', user_count;
END $$;

-- ============================================
-- STEP 9: Summary
-- ============================================
DO $$
DECLARE
  signal_count INTEGER;
  preference_count INTEGER;
  settings_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO signal_count FROM public.user_preference_signals;
  SELECT COUNT(*) INTO preference_count FROM public.user_preferences;
  SELECT COUNT(*) INTO settings_count FROM public.user_settings;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE 'Total signals created: %', signal_count;
  RAISE NOTICE 'Total preferences computed: %', preference_count;
  RAISE NOTICE 'Total settings migrated: %', settings_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify data in new tables';
  RAISE NOTICE '2. Update application code to use new schema';
  RAISE NOTICE '3. (Optional) Drop old user_preferences table after verification';
END $$;


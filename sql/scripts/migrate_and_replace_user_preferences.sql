-- ============================================
-- COMPLETE MIGRATION: Replace old user_preferences with BCNF schema
-- ============================================
-- This script:
-- 1. Creates backup of old table
-- 2. Creates new BCNF schema (if not exists)
-- 3. Migrates all data from old table to new schema
-- 4. Drops old table
-- 5. Verifies migration

DO $$
BEGIN
  RAISE NOTICE '=== STARTING COMPLETE USER_PREFERENCES MIGRATION ===';
  RAISE NOTICE '';
END $$;

-- ============================================
-- STEP 1: Backup old table
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 1: Creating backup of old user_preferences table...';
END $$;

-- Create backup table
CREATE TABLE IF NOT EXISTS public.user_preferences_backup AS 
SELECT * FROM public.user_preferences;

-- Get backup count
DO $$
DECLARE
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM public.user_preferences_backup;
  RAISE NOTICE '✅ Backed up % rows to user_preferences_backup', backup_count;
END $$;

-- ============================================
-- STEP 2: Create new BCNF schema
-- ============================================
-- (This should already be run, but we'll ensure it exists)

-- Ensure new tables exist by running the creation script logic inline
-- First, create enums if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_signal_type') THEN
    CREATE TYPE preference_signal_type AS ENUM (
      -- Artist signals
      'artist_follow',
      'artist_unfollow',
      'artist_search',
      'artist_review',
      
      -- Event signals
      'event_interest',
      'event_interest_removed',
      'event_attendance',
      'event_attendance_removed',
      'event_review_created',
      'event_review_updated',
      'event_review_deleted',
      'event_search',
      'event_ticket_click',
      
      -- Venue signals
      'venue_follow',
      'venue_unfollow',
      'venue_review',
      'venue_search',
      
      -- Streaming signals
      'streaming_spotify_connected',
      'streaming_apple_music_connected',
      'streaming_profile_synced',
      'streaming_top_track_short',
      'streaming_top_track_medium',
      'streaming_top_track_long',
      'streaming_top_artist_short',
      'streaming_top_artist_medium',
      'streaming_top_artist_long',
      'streaming_recent_play',
      'streaming_setlist_add',
      
      -- Genre signals
      'genre_search',
      'genre_manual_preference',
      'artist_manual_preference',
      'venue_manual_preference',
      
      -- Review content signals
      'review_rating_overall',
      'review_rating_artist_performance',
      'review_rating_production',
      'review_rating_venue',
      'review_rating_location',
      'review_rating_value',
      'review_reaction_emoji',
      'review_genre_tags',
      'review_mood_tags',
      'review_context_tags',
      'review_photos',
      'review_videos'
    );
    RAISE NOTICE 'Created preference_signal_type enum';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_entity_type') THEN
    CREATE TYPE preference_entity_type AS ENUM (
      'artist',
      'event',
      'venue',
      'song',
      'genre',
      'review'
    );
    RAISE NOTICE 'Created preference_entity_type enum';
  END IF;
END $$;

-- Create user_preference_signals table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_preference_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  signal_type preference_signal_type NOT NULL,
  entity_type preference_entity_type NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  signal_weight NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (signal_weight >= 0),
  genre TEXT,
  context JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_preference_signals_user_signal_entity_unique 
    UNIQUE(user_id, signal_type, entity_type, entity_id, occurred_at)
);

-- Create indexes for user_preference_signals
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_id 
  ON public.user_preference_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_type 
  ON public.user_preference_signals(user_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_entity 
  ON public.user_preference_signals(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_genre 
  ON public.user_preference_signals(user_id, genre) WHERE genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_weight 
  ON public.user_preference_signals(user_id, signal_weight DESC, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_occurred 
  ON public.user_preference_signals(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_entity 
  ON public.user_preference_signals(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_context 
  ON public.user_preference_signals USING GIN(context);

-- Create new user_preferences table (will replace old one)
CREATE TABLE IF NOT EXISTS public.user_preferences_new (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- COMPUTED PREFERENCE SCORES
  genre_preference_scores JSONB DEFAULT '{}',
  artist_preference_scores JSONB DEFAULT '{}',
  venue_preference_scores JSONB DEFAULT '{}',
  
  -- Top lists
  top_genres TEXT[] DEFAULT '{}',
  top_artists UUID[] DEFAULT '{}',
  top_venues UUID[] DEFAULT '{}',
  
  -- METADATA
  last_signal_at TIMESTAMPTZ,
  signal_count INTEGER DEFAULT 0,
  last_computed_at TIMESTAMPTZ,
  
  -- TIMESTAMPS
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for new user_preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_user_id 
  ON public.user_preferences_new(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_genre_scores 
  ON public.user_preferences_new USING GIN(genre_preference_scores);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_artist_scores 
  ON public.user_preferences_new USING GIN(artist_preference_scores);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_venue_scores 
  ON public.user_preferences_new USING GIN(venue_preference_scores);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_top_genres 
  ON public.user_preferences_new USING GIN(top_genres);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_top_artists 
  ON public.user_preferences_new USING GIN(top_artists);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_top_venues 
  ON public.user_preferences_new USING GIN(top_venues);

-- Create user_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  notification_preferences JSONB DEFAULT '{}',
  email_preferences JSONB DEFAULT '{}',
  privacy_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_notifications ON public.user_settings USING GIN(notification_preferences);
CREATE INDEX IF NOT EXISTS idx_user_settings_email ON public.user_settings USING GIN(email_preferences);
CREATE INDEX IF NOT EXISTS idx_user_settings_privacy ON public.user_settings USING GIN(privacy_settings);

DO $$ BEGIN RAISE NOTICE '✅ New BCNF schema tables created'; END $$;

-- ============================================
-- STEP 3: Migrate data from backup to new schema
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 3: Migrating data from backup to new schema...';
END $$;

-- Migrate preferred_genres
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, occurred_at, created_at
)
SELECT 
  user_id, 'genre_manual_preference'::preference_signal_type, 'genre'::preference_entity_type,
  NULL, genre, 9.0, genre, COALESCE(created_at, now()), COALESCE(created_at, now())
FROM public.user_preferences_backup
CROSS JOIN LATERAL unnest(preferred_genres) AS genre
WHERE preferred_genres IS NOT NULL AND array_length(preferred_genres, 1) > 0
ON CONFLICT DO NOTHING;

-- Migrate preferred_artists
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, occurred_at, created_at
)
SELECT 
  old.user_id, 'artist_manual_preference'::preference_signal_type, 'artist'::preference_entity_type,
  artist_id, COALESCE(a.name, 'Unknown Artist'), 9.0, COALESCE(old.created_at, now()), COALESCE(old.created_at, now())
FROM public.user_preferences_backup old
CROSS JOIN LATERAL unnest(preferred_artists) AS artist_id
LEFT JOIN public.artists a ON a.id = artist_id
WHERE preferred_artists IS NOT NULL AND array_length(preferred_artists, 1) > 0
ON CONFLICT DO NOTHING;

-- Migrate preferred_venues
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, occurred_at, created_at
)
SELECT 
  user_id, 'venue_manual_preference'::preference_signal_type, 'venue'::preference_entity_type,
  NULL, venue_name, 9.0, COALESCE(created_at, now()), COALESCE(created_at, now())
FROM public.user_preferences_backup
CROSS JOIN LATERAL unnest(preferred_venues) AS venue_name
WHERE preferred_venues IS NOT NULL AND array_length(preferred_venues, 1) > 0
ON CONFLICT DO NOTHING;

-- Migrate streaming_stats (Spotify top genres)
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at
)
SELECT 
  user_id, 'streaming_profile_synced'::preference_signal_type, 'genre'::preference_entity_type,
  NULL, genre_data->>'genre', LEAST((genre_data->>'count')::INTEGER / 10.0, 6.0),
  genre_data->>'genre',
  jsonb_build_object('source', 'spotify', 'count', (genre_data->>'count')::INTEGER, 'service', 'spotify'),
  COALESCE(updated_at, created_at, now()), COALESCE(created_at, now())
FROM public.user_preferences_backup
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN streaming_stats->'spotify'->'top_genres' IS NOT NULL 
    THEN streaming_stats->'spotify'->'top_genres' ELSE '[]'::jsonb END
) AS genre_data
WHERE streaming_stats IS NOT NULL 
  AND streaming_stats->'spotify'->'top_genres' IS NOT NULL
  AND jsonb_typeof(streaming_stats->'spotify'->'top_genres') = 'array'
ON CONFLICT DO NOTHING;

-- Migrate streaming_stats (Spotify top artists)
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, context, occurred_at, created_at
)
SELECT 
  user_id, 'streaming_top_artist_long'::preference_signal_type, 'artist'::preference_entity_type,
  NULL, artist_data->>'name', 6.0,
  jsonb_build_object('source', 'spotify', 'spotify_id', artist_data->>'id', 
    'popularity', (artist_data->>'popularity')::INTEGER, 'service', 'spotify', 'time_range', 'long_term'),
  COALESCE(updated_at, created_at, now()), COALESCE(created_at, now())
FROM public.user_preferences_backup
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN streaming_stats->'spotify'->'top_artists' IS NOT NULL 
    THEN streaming_stats->'spotify'->'top_artists' ELSE '[]'::jsonb END
) AS artist_data
WHERE streaming_stats IS NOT NULL 
  AND streaming_stats->'spotify'->'top_artists' IS NOT NULL
  AND jsonb_typeof(streaming_stats->'spotify'->'top_artists') = 'array'
ON CONFLICT DO NOTHING;

-- Migrate music_preference_signals JSONB array
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at
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
  NULL, signal_data->>'preference_value',
  LEAST(COALESCE((signal_data->>'preference_score')::NUMERIC, 1.0), 10.0),
  CASE WHEN signal_data->>'preference_type' = 'genre' THEN signal_data->>'preference_value' ELSE NULL END,
  COALESCE((signal_data->'context')::jsonb, 
    jsonb_build_object('interaction_count', (signal_data->>'interaction_count')::INTEGER,
      'confidence', (signal_data->>'confidence')::NUMERIC)),
  COALESCE((signal_data->>'last_interaction')::TIMESTAMPTZ,
    (signal_data->>'first_interaction')::TIMESTAMPTZ, old.created_at, now()),
  COALESCE(old.created_at, now())
FROM public.user_preferences_backup old
CROSS JOIN LATERAL jsonb_array_elements(music_preference_signals) AS signal_data
WHERE music_preference_signals IS NOT NULL
  AND jsonb_typeof(music_preference_signals) = 'array'
  AND jsonb_array_length(music_preference_signals) > 0
ON CONFLICT DO NOTHING;

-- Migrate genre_preferences JSONB (preferences array)
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at
)
SELECT 
  old.user_id,
  CASE 
    WHEN pref_data->>'interaction_type' = 'manual_preference' THEN 'genre_manual_preference'::preference_signal_type
    WHEN pref_data->>'interaction_type' = 'genre_exposure' THEN 'event_interest'::preference_signal_type
    WHEN pref_data->>'interaction_type' = 'artist_view' THEN 'artist_search'::preference_signal_type
    ELSE 'genre_manual_preference'::preference_signal_type
  END,
  'genre'::preference_entity_type, NULL, pref_data->>'genre',
  LEAST(COALESCE((pref_data->>'preference_score')::NUMERIC, 1.0), 10.0),
  pref_data->>'genre',
  COALESCE((pref_data->'context')::jsonb, (pref_data->'metadata')::jsonb, '{}'::jsonb),
  COALESCE((pref_data->>'occurred_at')::TIMESTAMPTZ, (pref_data->>'created_at')::TIMESTAMPTZ, old.created_at, now()),
  COALESCE((pref_data->>'created_at')::TIMESTAMPTZ, old.created_at, now())
FROM public.user_preferences_backup old
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN genre_preferences->'preferences' IS NOT NULL 
    THEN genre_preferences->'preferences' ELSE '[]'::jsonb END
) AS pref_data
WHERE genre_preferences IS NOT NULL
  AND genre_preferences->'preferences' IS NOT NULL
  AND jsonb_typeof(genre_preferences->'preferences') = 'array'
ON CONFLICT DO NOTHING;

-- Migrate genre_preferences top-level keys
INSERT INTO public.user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at
)
SELECT 
  old.user_id, 'genre_manual_preference'::preference_signal_type, 'genre'::preference_entity_type,
  NULL, genre_key, LEAST(COALESCE((genre_value->>'weight')::NUMERIC, 9.0), 10.0),
  genre_key, genre_value,
  COALESCE((genre_value->>'created_at')::TIMESTAMPTZ, old.created_at, now()),
  COALESCE(old.created_at, now())
FROM public.user_preferences_backup old
CROSS JOIN LATERAL jsonb_each(genre_preferences) AS genre_data(genre_key, genre_value)
WHERE genre_preferences IS NOT NULL
  AND jsonb_typeof(genre_preferences) = 'object'
  AND genre_key != 'preferences'
  AND genre_value IS NOT NULL
  AND jsonb_typeof(genre_value) = 'object'
ON CONFLICT DO NOTHING;

-- Migrate settings
INSERT INTO public.user_settings (user_id, notification_preferences, email_preferences, privacy_settings, created_at, updated_at)
SELECT 
  user_id, COALESCE(notification_preferences, '{}'), COALESCE(email_preferences, '{}'),
  COALESCE(privacy_settings, '{}'), created_at, updated_at
FROM public.user_preferences_backup
WHERE notification_preferences IS NOT NULL OR email_preferences IS NOT NULL OR privacy_settings IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  notification_preferences = EXCLUDED.notification_preferences,
  email_preferences = EXCLUDED.email_preferences,
  privacy_settings = EXCLUDED.privacy_settings,
  updated_at = EXCLUDED.updated_at;

DO $$ BEGIN RAISE NOTICE '✅ Data migrated to new schema'; END $$;

-- ============================================
-- STEP 4: Create compute function and compute preferences
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 4: Creating compute function and computing preferences...';
END $$;

-- Create compute function (simplified version)
CREATE OR REPLACE FUNCTION compute_user_preferences(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genre_scores JSONB := '{}';
  v_artist_scores JSONB := '{}';
  v_venue_scores JSONB := '{}';
  v_top_genres TEXT[] := '{}';
  v_top_artists UUID[] := '{}';
  v_top_venues UUID[] := '{}';
  v_signal_count INTEGER;
  v_last_signal_at TIMESTAMPTZ;
BEGIN
  -- Aggregate genre preference scores
  SELECT jsonb_object_agg(genre, total_score) INTO v_genre_scores
  FROM (
    SELECT genre, SUM(signal_weight) as total_score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id AND genre IS NOT NULL
    GROUP BY genre ORDER BY total_score DESC
  ) genre_agg;

  -- Aggregate artist preference scores
  SELECT jsonb_object_agg(entity_id::text, total_score) INTO v_artist_scores
  FROM (
    SELECT entity_id, SUM(signal_weight) as total_score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id AND entity_type = 'artist' AND entity_id IS NOT NULL
    GROUP BY entity_id ORDER BY total_score DESC LIMIT 100
  ) artist_agg;

  -- Aggregate venue preference scores
  SELECT jsonb_object_agg(entity_id::text, total_score) INTO v_venue_scores
  FROM (
    SELECT entity_id, SUM(signal_weight) as total_score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id AND entity_type = 'venue' AND entity_id IS NOT NULL
    GROUP BY entity_id ORDER BY total_score DESC LIMIT 50
  ) venue_agg;

  -- Get top genres
  SELECT ARRAY_AGG(genre ORDER BY score DESC) INTO v_top_genres
  FROM (
    SELECT genre, SUM(signal_weight) as score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id AND genre IS NOT NULL
    GROUP BY genre ORDER BY score DESC LIMIT 20
  ) top_genres;

  -- Get top artists
  SELECT ARRAY_AGG(entity_id ORDER BY score DESC) INTO v_top_artists
  FROM (
    SELECT entity_id, SUM(signal_weight) as score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id AND entity_type = 'artist' AND entity_id IS NOT NULL
    GROUP BY entity_id ORDER BY score DESC LIMIT 50
  ) top_artists;

  -- Get top venues
  SELECT ARRAY_AGG(entity_id ORDER BY score DESC) INTO v_top_venues
  FROM (
    SELECT entity_id, SUM(signal_weight) as score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id AND entity_type = 'venue' AND entity_id IS NOT NULL
    GROUP BY entity_id ORDER BY score DESC LIMIT 30
  ) top_venues;

  -- Get signal count and last signal time
  SELECT COUNT(*), MAX(occurred_at) INTO v_signal_count, v_last_signal_at
  FROM public.user_preference_signals WHERE user_id = p_user_id;

  -- Insert or update user preferences
  INSERT INTO public.user_preferences_new (
    user_id, genre_preference_scores, artist_preference_scores, venue_preference_scores,
    top_genres, top_artists, top_venues, last_signal_at, signal_count, last_computed_at
  ) VALUES (
    p_user_id, COALESCE(v_genre_scores, '{}'), COALESCE(v_artist_scores, '{}'),
    COALESCE(v_venue_scores, '{}'), COALESCE(v_top_genres, '{}'), COALESCE(v_top_artists, '{}'),
    COALESCE(v_top_venues, '{}'), v_last_signal_at, COALESCE(v_signal_count, 0), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    genre_preference_scores = EXCLUDED.genre_preference_scores,
    artist_preference_scores = EXCLUDED.artist_preference_scores,
    venue_preference_scores = EXCLUDED.venue_preference_scores,
    top_genres = EXCLUDED.top_genres,
    top_artists = EXCLUDED.top_artists,
    top_venues = EXCLUDED.top_venues,
    last_signal_at = EXCLUDED.last_signal_at,
    signal_count = EXCLUDED.signal_count,
    last_computed_at = EXCLUDED.last_computed_at,
    updated_at = now();
END;
$$;

-- Compute preferences for all users
DO $$
DECLARE
  user_record RECORD;
  user_count INTEGER := 0;
  total_users INTEGER;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO total_users FROM public.user_preference_signals;
  RAISE NOTICE 'Computing preferences for % users...', total_users;
  
  FOR user_record IN SELECT DISTINCT user_id FROM public.user_preference_signals ORDER BY user_id
  LOOP
    BEGIN
      PERFORM compute_user_preferences(user_record.user_id);
      user_count := user_count + 1;
      IF user_count % 10 = 0 THEN
        RAISE NOTICE '  Computed for %/% users...', user_count, total_users;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error computing preferences for user %: %', user_record.user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ Computed preferences for % users', user_count;
END $$;

-- ============================================
-- STEP 5: Replace old table with new one
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Step 5: Replacing old table with new schema...';
END $$;

-- Drop old table
DROP TABLE IF EXISTS public.user_preferences CASCADE;

-- Rename new table to user_preferences
ALTER TABLE public.user_preferences_new RENAME TO user_preferences;

-- Rename indexes
ALTER INDEX IF EXISTS idx_user_preferences_new_user_id RENAME TO idx_user_preferences_user_id;
ALTER INDEX IF EXISTS idx_user_preferences_new_genre_scores RENAME TO idx_user_preferences_genre_scores;
ALTER INDEX IF EXISTS idx_user_preferences_new_artist_scores RENAME TO idx_user_preferences_artist_scores;
ALTER INDEX IF EXISTS idx_user_preferences_new_venue_scores RENAME TO idx_user_preferences_venue_scores;
ALTER INDEX IF EXISTS idx_user_preferences_new_top_genres RENAME TO idx_user_preferences_top_genres;
ALTER INDEX IF EXISTS idx_user_preferences_new_top_artists RENAME TO idx_user_preferences_top_artists;
ALTER INDEX IF EXISTS idx_user_preferences_new_top_venues RENAME TO idx_user_preferences_top_venues;

-- Add trigger for updated_at (ensure function exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trigger_update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Setup RLS on new tables
ALTER TABLE public.user_preference_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preference_signals
DROP POLICY IF EXISTS "Users can view their own signals" ON public.user_preference_signals;
CREATE POLICY "Users can view their own signals"
ON public.user_preference_signals FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own signals" ON public.user_preference_signals;
CREATE POLICY "Users can create their own signals"
ON public.user_preference_signals FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_preferences
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences"
ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_settings
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings"
ON public.user_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
CREATE POLICY "Users can update their own settings"
ON public.user_settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings"
ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DO $$ BEGIN RAISE NOTICE '✅ Old table replaced with new schema and RLS configured'; END $$;

-- ============================================
-- STEP 6: Verification and Summary
-- ============================================
DO $$
DECLARE
  backup_count INTEGER;
  signal_count INTEGER;
  preference_count INTEGER;
  settings_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM public.user_preferences_backup;
  SELECT COUNT(*) INTO signal_count FROM public.user_preference_signals;
  SELECT COUNT(*) INTO preference_count FROM public.user_preferences;
  SELECT COUNT(*) INTO settings_count FROM public.user_settings;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE 'Backup rows: %', backup_count;
  RAISE NOTICE 'Signals created: %', signal_count;
  RAISE NOTICE 'Preferences computed: %', preference_count;
  RAISE NOTICE 'Settings migrated: %', settings_count;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Old user_preferences table has been replaced with new BCNF schema';
  RAISE NOTICE '✅ Backup table user_preferences_backup contains original data';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify data looks correct';
  RAISE NOTICE '2. Test feed building queries';
  RAISE NOTICE '3. (Optional) Drop user_preferences_backup after verification';
END $$;


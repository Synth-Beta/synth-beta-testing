-- ============================================================
-- FIX: Streaming Profiles & Preference Signals Wiring
-- ============================================================
-- This script is meant to be run in the Supabase SQL editor
-- against your production project.
--
-- Pipeline (3NF; v5 personalization):
--   spotify_user_tokens (refresh_token per user)
--   → app/script writes to streaming_profiles (raw profile_data JSONB)
--   → trigger process_spotify_genres_to_signals → user_preference_signals (spotify_genre)
--   → refresh_user_preferences_v5 → user_preferences (genre_preference_scores, top_genres)
--   → get_personalized_feed_v5 reads user_preferences for weighted recommendations
--
-- It:
-- 1) Verifies / fixes RLS and policy on public.streaming_profiles
-- 2) Ensures the Spotify → user_preference_signals trigger is wired
-- 3) Backfills spotify_genre signals from existing streaming_profiles
-- 4) Optional: seed one test row to verify the pipeline (if table is empty)
-- 5) Ensures every user has a row in user_preferences
--
-- Data flow: User taps "Link Spotify account" in Edit Profile → OAuth → callback
-- saves token to spotify_user_tokens and runs sync → upsert streaming_profiles
-- → trigger fills user_preference_signals → refresh_user_preferences_v5 updates
-- user_preferences → feed v5 uses genre_preference_scores for recommendations.
--
-- IMPORTANT:
-- - Review carefully before running.
-- - Run step-by-step if you prefer (each section is independent).
-- ============================================================

-- ============================================================
-- 0. Diagnostics (safe to run anytime)
-- ============================================================

-- How many users currently have any raw preference signals?
SELECT COUNT(DISTINCT user_id) AS users_with_signals
FROM public.user_preference_signals;

-- Which signal types exist?
SELECT signal_type, COUNT(*) AS cnt
FROM public.user_preference_signals
GROUP BY signal_type
ORDER BY cnt DESC;

-- Does streaming_profiles have any rows yet?
SELECT service_type, COUNT(*) AS rows, COUNT(DISTINCT user_id) AS users
FROM public.streaming_profiles
GROUP BY service_type;

-- Spotify link vs actual data: who has connected vs who has data in DB?
-- Users with a Spotify profile URL (connected at some point)
SELECT COUNT(*) AS users_with_spotify_link
FROM public.users
WHERE music_streaming_profile IS NOT NULL
  AND (music_streaming_profile ILIKE '%spotify%' OR music_streaming_profile ILIKE '%open.spotify.com%');

-- Users who have a streaming_profiles row for Spotify (sync reached the DB)
SELECT COUNT(DISTINCT user_id) AS users_with_spotify_data_in_db
FROM public.streaming_profiles
WHERE service_type = 'spotify';

-- Users who have Spotify link but NO streaming_profiles row (they need to open app and "Refresh Stats")
SELECT u.user_id, u.username, u.music_streaming_profile
FROM public.users u
WHERE u.music_streaming_profile IS NOT NULL
  AND (u.music_streaming_profile ILIKE '%spotify%' OR u.music_streaming_profile ILIKE '%open.spotify.com%')
  AND NOT EXISTS (
    SELECT 1 FROM public.streaming_profiles sp
    WHERE sp.user_id = u.user_id AND sp.service_type = 'spotify'
  )
ORDER BY u.username NULLS LAST;

-- HOW TO FILL EVERY USER WHO HAS A SPOTIFY LINK?
-- The app now saves refresh_token to public.spotify_user_tokens when users connect Spotify.
-- Run: node scripts/sync-spotify-from-stored-tokens.mjs
-- (Uses SUPABASE_SERVICE_ROLE_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET from .env.local.)
-- Users who connected before this change have no stored token: they must open the app and
-- "Refresh Stats" or reconnect Spotify once so the token is saved; then run the script again.
-- The queries above show who has link vs who has data; anyone in the last list should refresh once.

-- Confirm spotify_genre exists in the enum
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'preference_signal_type'
ORDER BY enumlabel;

-- ============================================================
-- 1. Ensure streaming_profiles RLS & policies are correct
-- ============================================================

-- Enable RLS (expected by migration) and recreate a clear policy
ALTER TABLE public.streaming_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own streaming profiles" ON public.streaming_profiles;

CREATE POLICY "Users can manage own streaming profiles"
ON public.streaming_profiles
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Optional: allow service_role full access (already implied by role)
GRANT ALL ON public.streaming_profiles TO service_role;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'streaming_profiles';

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'streaming_profiles';

-- ============================================================
-- 2. Ensure Spotify trigger → user_preference_signals is wired
-- ============================================================

-- Recreate the process_spotify_genres_to_signals function and trigger
-- (idempotent; safe to re-run).

DO $$
BEGIN
  -- Add spotify_genre to preference_signal_type enum if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'preference_signal_type' AND e.enumlabel = 'spotify_genre'
  ) THEN
    ALTER TYPE public.preference_signal_type ADD VALUE 'spotify_genre';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_spotify_genres_to_signals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist JSONB;
  v_genre TEXT;
  v_canonical TEXT;
  v_time_range TEXT;
  v_time_mult NUMERIC;
  v_genre_agg RECORD;
  v_occurred_at TIMESTAMPTZ;
  v_idx INT := 0;
  genre_counts JSONB := '{}'::JSONB;
  genre_time_mult JSONB := '{}'::JSONB;
  v_count INT;
  v_best_mult NUMERIC;
  v_weight NUMERIC;
  v_base_weight NUMERIC := 1.0;
  v_mult_med NUMERIC := 1.0;
BEGIN
  IF NEW.service_type != 'spotify' THEN
    RETURN NEW;
  END IF;

  -- Delete existing spotify_genre signals for this user (idempotent refresh)
  DELETE FROM public.user_preference_signals
  WHERE user_id = NEW.user_id AND signal_type = 'spotify_genre';

  -- Aggregate genres from topArtistsByTimeRange
  IF NEW.profile_data ? 'topArtistsByTimeRange'
     AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange') = 'object' THEN
    FOR v_time_range, v_time_mult IN
      SELECT 'short_term'::TEXT, 1.5::NUMERIC
      UNION ALL SELECT 'medium_term', 1.0::NUMERIC
      UNION ALL SELECT 'long_term', 0.7::NUMERIC
    LOOP
      IF NEW.profile_data->'topArtistsByTimeRange' ? v_time_range
         AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange'->v_time_range) = 'array' THEN
        FOR v_artist IN
          SELECT jsonb_array_elements(NEW.profile_data->'topArtistsByTimeRange'->v_time_range)
        LOOP
          IF v_artist ? 'genres'
             AND jsonb_typeof(v_artist->'genres') = 'array' THEN
            FOR v_genre IN
              SELECT jsonb_array_elements_text(v_artist->'genres')
            LOOP
              -- Use canonical name when in public.genres; otherwise keep raw (trimmed) so we still create signals
              v_canonical := COALESCE(NULLIF(trim(public.resolve_genre_to_canonical(v_genre)), ''), trim(v_genre));
              IF v_canonical IS NOT NULL AND v_canonical <> '' THEN
                v_count := COALESCE((genre_counts->>v_canonical)::INT, 0) + 1;
                genre_counts := genre_counts || jsonb_build_object(v_canonical, v_count);
                v_best_mult := COALESCE((genre_time_mult->>v_canonical)::NUMERIC, 0);
                IF v_time_mult > v_best_mult THEN
                  genre_time_mult := genre_time_mult || jsonb_build_object(v_canonical, v_time_mult);
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Fallback: flat topArtists with medium-term multiplier
  IF genre_counts = '{}'::JSONB
     AND NEW.profile_data ? 'topArtists'
     AND jsonb_typeof(NEW.profile_data->'topArtists') = 'array' THEN
    FOR v_artist IN
      SELECT jsonb_array_elements(NEW.profile_data->'topArtists')
    LOOP
      IF v_artist ? 'genres'
         AND jsonb_typeof(v_artist->'genres') = 'array' THEN
        FOR v_genre IN
          SELECT jsonb_array_elements_text(v_artist->'genres')
        LOOP
          v_canonical := COALESCE(NULLIF(trim(public.resolve_genre_to_canonical(v_genre)), ''), trim(v_genre));
          IF v_canonical IS NOT NULL AND v_canonical <> '' THEN
            v_count := COALESCE((genre_counts->>v_canonical)::INT, 0) + 1;
            genre_counts := genre_counts || jsonb_build_object(v_canonical, v_count);
            genre_time_mult := genre_time_mult || jsonb_build_object(v_canonical, v_mult_med);
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Insert signals per aggregated canonical genre
  v_occurred_at := COALESCE(NEW.last_updated::TIMESTAMPTZ, NOW());
  FOR v_genre_agg IN
    SELECT key AS canonical_genre,
           (genre_counts->>key)::INT AS cnt,
           COALESCE((genre_time_mult->>key)::NUMERIC, v_mult_med) AS mult
    FROM jsonb_object_keys(genre_counts) AS key
  LOOP
    v_weight := ROUND((v_base_weight * LN(v_genre_agg.cnt + 1) * v_genre_agg.mult)::NUMERIC, 2);
    v_weight := LEAST(v_weight, 99.99);
    v_occurred_at := v_occurred_at + (v_idx * interval '1 millisecond');
    v_idx := v_idx + 1;

    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name,
      signal_weight, genre, context, occurred_at, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      'spotify_genre'::public.preference_signal_type,
      'genre'::public.preference_entity_type,
      NULL,
      v_genre_agg.canonical_genre,
      v_weight,
      v_genre_agg.canonical_genre,
      jsonb_build_object('source', 'spotify', 'raw_genre', v_genre_agg.canonical_genre),
      v_occurred_at,
      NOW(),
      NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_spotify_genres_to_signals IS
  'Extracts genres from streaming_profiles, normalizes to canonical, weights by frequency and time range, inserts into user_preference_signals.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streaming_profiles'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_process_spotify_genres_to_signals ON public.streaming_profiles;
    CREATE TRIGGER trigger_process_spotify_genres_to_signals
      AFTER INSERT OR UPDATE ON public.streaming_profiles
      FOR EACH ROW
      WHEN (NEW.service_type = 'spotify')
      EXECUTE FUNCTION public.process_spotify_genres_to_signals();
  END IF;
END $$;

-- ============================================================
-- 3. Backfill spotify_genre signals from existing Spotify profiles
-- ============================================================

-- Run this AFTER you confirm streaming_profiles has non-zero spotify rows.
-- It will re-run the trigger for each Spotify profile.
UPDATE public.streaming_profiles
SET last_updated = last_updated
WHERE service_type = 'spotify';

-- Check spotify_genre coverage after backfill
SELECT COUNT(*) AS spotify_genre_signals
FROM public.user_preference_signals
WHERE signal_type = 'spotify_genre';

SELECT COUNT(DISTINCT user_id) AS users_with_spotify_genre
FROM public.user_preference_signals
WHERE signal_type = 'spotify_genre';

-- ============================================================
-- 4. Optional: Seed one test row (if streaming_profiles is empty)
-- ============================================================
-- Use this to verify the trigger and pipeline without the app.
-- Run as service_role or postgres so RLS allows the insert.
-- Pick one real user from auth.users; minimal profile_data will
-- fire the trigger. Signals only appear for genres that exist
-- in public.genres (resolve_genre_to_canonical). If you see 0
-- signals, either add matching genres or sync real data from the app.

INSERT INTO public.streaming_profiles (
  user_id,
  service_type,
  profile_data,
  sync_status,
  last_updated
)
SELECT
  u.id,
  'spotify',
  jsonb_build_object(
    'topArtistsByTimeRange',
    jsonb_build_object(
      'short_term', '[]'::jsonb,
      'medium_term', jsonb_build_array(
        jsonb_build_object('genres', jsonb_build_array('pop', 'rock')),
        jsonb_build_object('genres', jsonb_build_array('indie', 'pop'))
      ),
      'long_term', jsonb_build_array(
        jsonb_build_object('genres', jsonb_build_array('rock'))
      )
    )
  ),
  'completed',
  now()
FROM (SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM public.streaming_profiles WHERE service_type = 'spotify')
ON CONFLICT (user_id, service_type) DO NOTHING;

-- After running the insert above, check:
-- SELECT * FROM public.streaming_profiles;
-- SELECT * FROM public.user_preference_signals WHERE signal_type = 'spotify_genre';

-- If you had 0 users_with_spotify_genre before: the trigger now falls back to raw genre
-- when a genre is not in public.genres, so signals are created either way. Re-run the
-- trigger for existing streaming_profiles by running the UPDATE below (section 3).

-- ============================================================
-- 5. Ensure every user has a row in user_preferences
-- ============================================================
-- refresh_user_preferences_v5 only updates users who have signals. Insert default
-- rows for any user in public.users that does not yet have a user_preferences row.

INSERT INTO public.user_preferences (
  user_id,
  genre_preference_scores,
  artist_preference_scores,
  venue_preference_scores,
  top_genres,
  top_artists,
  top_venues,
  last_signal_at,
  signal_count,
  last_computed_at,
  updated_at
)
SELECT
  u.user_id,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::text[],
  '{}'::uuid[],
  '{}'::uuid[],
  NULL::timestamptz,
  0,
  now(),
  now()
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_preferences up WHERE up.user_id = u.user_id
)
ON CONFLICT (user_id) DO NOTHING;

